"""Trip solver: the orchestration behind POST /api/routes.

Pipeline: geocode both ends -> TomTom truck candidates -> dedupe and
via-point synthesis down to three routes -> checkpoint sampling with
step-interpolated ETAs -> one batched Open-Meteo request -> risk per
checkpoint -> mile-weighted metrics, recommendation, response payload.

No Django models are involved; route identity is just the request.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from rest_framework.exceptions import ValidationError

from . import geocoding, recommendation, tomtom, weather
from .errors import ProviderError
from .geo import (
    Point,
    checkpoint_targets,
    cumulative_mi,
    destination_point,
    downsample,
    haversine_mi,
    interpolate_eta_seconds,
    interpolate_point,
    point_and_bearing,
    prepare_eta_steps,
)
from .risk import apply_load, checkpoint_risk, rain_risk, snow_risk, wind_risk

logger = logging.getLogger(__name__)

METERS_PER_MILE = 1609.344

DISPLAY_POINTS = 2000
ROUTE_LABELS = ("Route A", "Route B", "Route C")
MAX_ROUTES = 3
MIN_TRIP_MI = 1.0

SYNTH_OFFSET_MI = 40.0
SYNTH_FRACTION = 0.45
SHARED_DISTANCE_TOLERANCE_MI = 0.25
SHARED_DISTANCE_SAMPLE_MI = 2.0
SHARED_DISTANCE_THRESHOLD = 0.80
GRID_CELL_DEG = 0.1

DEPARTURE_PAST_GRACE = timedelta(hours=1)
DEPARTURE_FUTURE_LIMIT = timedelta(days=16)
BEYOND_48H_SECONDS = 48 * 60 * 60


@dataclass
class Route:
    """Planner-ready route; a trimmed, JSON-cacheable projection of TomTom's output."""

    points: list[Point]
    cum: list[float]
    length_m: float
    duration_s: float
    traffic_delay_s: float
    steps: list[tuple[float, float]]
    synthesized: bool = False


def plan_trip(
    *,
    origin_query: str,
    destination_query: str,
    load_lb: float,
    departure: datetime | None,
    checkpoint_mi: int,
) -> dict:
    origin = geocoding.geocode_city(origin_query)
    destination = geocoding.geocode_city(destination_query)
    origin_point = (origin["latitude"], origin["longitude"])
    destination_point_ll = (destination["latitude"], destination["longitude"])
    trip_mi = haversine_mi(origin_point, destination_point_ll)
    if trip_mi < MIN_TRIP_MI:
        raise ValidationError({"destination": "Destination must differ from the origin."})

    departure_utc = _resolve_departure(departure, origin["timezone"])
    _validate_departure(departure_utc)
    departure_epoch = departure_utc.timestamp()
    weight_kg = tomtom.vehicle_weight_kg(load_lb)

    records = tomtom.fetch_candidate_routes(
        origin=origin_point,
        destination=destination_point_ll,
        weight_kg=weight_kg,
        departure_utc=departure_utc,
        alternatives=tomtom.alternatives_for_distance(trip_mi),
    )
    routes = _dedupe_routes([_to_route(record) for record in records])[:MAX_ROUTES]
    routes = _synthesize_to_three(
        routes, origin_point, destination_point_ll, weight_kg, departure_utc
    )
    routes.sort(key=lambda route: route.duration_s)

    samples = [_sample_route(route, checkpoint_mi, departure_epoch) for route in routes]
    entries = _fetch_weather(samples)
    warnings: list[str] = []
    if len(routes) < MAX_ROUTES:
        warnings.append(f"Only {len(routes)} distinct truck route(s) were found for this trip.")

    payload_routes = []
    metrics_list = []
    clamped_any = False
    for index, (route, sample, entry) in enumerate(zip(routes, samples, entries)):
        checkpoints, clamped = _build_checkpoints(sample, entry, load_lb, departure_epoch)
        clamped_any = clamped_any or clamped
        metrics = recommendation.compute_metrics(checkpoints, route.duration_s)
        metrics_list.append(metrics)
        payload_routes.append(_route_payload(index, route, checkpoints, metrics))
    if clamped_any:
        warnings.append(
            "Some checkpoints are beyond the 16-day forecast horizon and use the "
            "last available forecast hour."
        )

    verdict = recommendation.recommend(metrics_list)
    for index, payload_route in enumerate(payload_routes):
        payload_route["recommended"] = index == verdict["index"]

    return {
        "origin": origin,
        "destination": destination,
        "departure": {
            "utc": _iso_utc(departure_epoch),
            "local": datetime.fromtimestamp(
                departure_epoch, _zone(origin["timezone"])
            ).isoformat(timespec="minutes"),
            "timezone": origin["timezone"],
        },
        "load_lb": load_lb,
        "vehicle_weight_kg": weight_kg,
        "checkpoint_interval_mi": checkpoint_mi,
        "recommended_route_index": verdict["index"],
        "recommendation": {
            "summary": verdict["summary"],
            "all_unsafe": verdict["all_unsafe"],
        },
        "routes": payload_routes,
        "warnings": warnings,
        "computed_at": _iso_utc(datetime.now(timezone.utc).timestamp()),
    }


def _to_route(record: dict) -> Route:
    points = [(float(lat), float(lon)) for lat, lon in record["points"]]
    return Route(
        points=points,
        cum=cumulative_mi(points),
        length_m=float(record["length_m"]),
        duration_s=float(record["duration_s"]),
        traffic_delay_s=float(record.get("traffic_delay_s") or 0.0),
        steps=[(float(a), float(b)) for a, b in record.get("steps_m_s") or []],
        synthesized=bool(record.get("synthesized")),
    )


def _resolve_departure(departure: datetime | None, origin_timezone: str) -> datetime:
    if departure is None:
        return datetime.now(timezone.utc)
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=_zone(origin_timezone))
    return departure.astimezone(timezone.utc)


def _validate_departure(departure_utc: datetime) -> None:
    now = datetime.now(timezone.utc)
    if departure_utc < now - DEPARTURE_PAST_GRACE:
        raise ValidationError({"departure": "Departure must not be in the past."})
    if departure_utc > now + DEPARTURE_FUTURE_LIMIT:
        raise ValidationError(
            {"departure": "Departure must fall within the 16-day forecast window."}
        )


def _zone(name: str) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return timezone.utc


def _iso_utc(epoch: float) -> str:
    return (
        datetime.fromtimestamp(epoch, timezone.utc)
        .isoformat(timespec="minutes")
        .replace("+00:00", "Z")
    )


# --- Candidate filtering -----------------------------------------------------


def _dedupe_routes(candidates: list[Route]) -> list[Route]:
    """Keep only routes that are not >80% the same road as a faster one."""
    kept: list[Route] = []
    for candidate in sorted(candidates, key=lambda route: route.duration_s):
        if all(
            _shared_fraction(candidate, existing) <= SHARED_DISTANCE_THRESHOLD
            for existing in kept
        ):
            kept.append(candidate)
    return kept


def _shared_fraction(a: Route, b: Route) -> float:
    return max(_fraction_near(a, b), _fraction_near(b, a))


def _fraction_near(source: Route, target: Route) -> float:
    """Share of ``source`` samples that pass within tolerance of ``target``."""
    if source.cum[-1] <= 0 or len(source.points) < 2:
        return 1.0
    grid = _grid_index(target.points)
    samples = near = 0
    distance = 0.0
    while distance <= source.cum[-1]:
        point = interpolate_point(source.points, source.cum, distance)
        samples += 1
        if _grid_has_near(grid, point):
            near += 1
        distance += SHARED_DISTANCE_SAMPLE_MI
    return near / samples if samples else 1.0


def _grid_index(points: list[Point]) -> dict[tuple[int, int], list[Point]]:
    grid: dict[tuple[int, int], list[Point]] = {}
    for point in points:
        cell = (math.floor(point[0] / GRID_CELL_DEG), math.floor(point[1] / GRID_CELL_DEG))
        grid.setdefault(cell, []).append(point)
    return grid


def _grid_has_near(grid: dict[tuple[int, int], list[Point]], point: Point) -> bool:
    cell_lat = math.floor(point[0] / GRID_CELL_DEG)
    cell_lon = math.floor(point[1] / GRID_CELL_DEG)
    for dlat in (-1, 0, 1):
        for dlon in (-1, 0, 1):
            for other in grid.get((cell_lat + dlat, cell_lon + dlon), ()):
                if haversine_mi(point, other) <= SHARED_DISTANCE_TOLERANCE_MI:
                    return True
    return False


def _synthesize_to_three(
    routes: list[Route],
    origin: Point,
    destination: Point,
    weight_kg: int,
    departure_utc: datetime,
) -> list[Route]:
    """Create up to two extra routes via a point ~40 mi off the fastest route."""
    if len(routes) >= MAX_ROUTES:
        return routes
    base = routes[0]
    if base.cum[-1] <= 0 or len(base.points) < 2:
        return routes
    midpoint, bearing = point_and_bearing(
        base.points, base.cum, base.cum[-1] * SYNTH_FRACTION
    )
    for side in (1, -1):
        if len(routes) >= MAX_ROUTES:
            break
        via = destination_point(midpoint, bearing + side * 90.0, SYNTH_OFFSET_MI)
        try:
            records = tomtom.fetch_candidate_routes(
                origin=origin,
                destination=destination,
                weight_kg=weight_kg,
                departure_utc=departure_utc,
                via=via,
                alternatives=1,
            )
        except ProviderError as exc:
            logger.warning("via-point synthesis failed: %s", exc)
            continue
        for record in sorted(records, key=lambda r: r["duration_s"]):
            candidate = _to_route(record)
            candidate.synthesized = True
            if all(
                _shared_fraction(candidate, existing) <= SHARED_DISTANCE_THRESHOLD
                for existing in routes
            ):
                routes.append(candidate)
                break
    return routes


# --- Sampling and weather ----------------------------------------------------


def _sample_route(route: Route, interval_mi: int, departure_epoch: float) -> dict:
    targets = checkpoint_targets(route.cum[-1], interval_mi)
    offsets, times = prepare_eta_steps(route.steps, route.length_m, route.duration_s)
    scale = route.length_m / route.cum[-1] if route.cum[-1] > 0 else 1.0
    points: list[Point] = []
    etas: list[float] = []
    for miles in targets:
        points.append(interpolate_point(route.points, route.cum, miles))
        etas.append(
            departure_epoch + interpolate_eta_seconds(offsets, times, miles * scale)
        )
    return {"targets": targets, "points": points, "etas": etas}


def _fetch_weather(samples: list[dict]) -> list[dict]:
    all_points = [point for sample in samples for point in sample["points"]]
    latest_eta = max(eta for sample in samples for eta in sample["etas"])
    now_epoch = datetime.now(timezone.utc).timestamp()
    forecast_days = math.ceil((latest_eta - now_epoch) / 86400) + 1
    entries = weather.fetch_hourly(all_points, forecast_days)
    entries_by_route = []
    cursor = 0
    for sample in samples:
        size = len(sample["points"])
        entries_by_route.append(entries[cursor : cursor + size])
        cursor += size
    return entries_by_route


def _build_checkpoints(
    sample: dict, route_entries: list[dict], load_lb: float, departure_epoch: float
) -> tuple[list[dict], bool]:
    checkpoints = []
    clamped = False
    for miles, (lat, lon), eta, entry in zip(
        sample["targets"], sample["points"], sample["etas"], route_entries
    ):
        if weather.is_beyond_forecast(entry, eta):
            clamped = True
        values = weather.weather_at(entry, eta)
        wind = apply_load(wind_risk(values["wind_mph"]), load_lb)
        rain = rain_risk(values["rain_in"])
        snow = snow_risk(values["snow_in"])
        risk = checkpoint_risk(
            wind_mph=values["wind_mph"],
            rain_in=values["rain_in"],
            showers_in=0.0,  # weather_at already folds showers into rain
            snowfall_in=values["snow_in"],
            load_lb=load_lb,
        )
        timezone_name = entry.get("timezone") or "UTC"
        zone = _zone(timezone_name)
        if zone is timezone.utc and timezone_name != "UTC":
            timezone_name = "UTC"
        checkpoints.append(
            {
                "mi": round(miles, 2),
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "eta_utc": _iso_utc(eta),
                "eta_local": datetime.fromtimestamp(eta, zone).isoformat(timespec="minutes"),
                "timezone": timezone_name,
                "beyond_48h": (eta - departure_epoch) > BEYOND_48H_SECONDS,
                "wind_mph": round(values["wind_mph"], 1),
                "gust_mph": round(values["gust_mph"], 1),
                "rain_in": round(values["rain_in"], 2),
                "snow_in": round(values["snow_in"], 2),
                "temp_f": round(values["temp_f"], 1),
                "risk": int(risk),
                "risk_label": risk.name,
                "wind_risk": int(wind),
                "rain_risk": int(rain),
                "snow_risk": int(snow),
            }
        )
    return checkpoints, clamped


# --- Response ----------------------------------------------------------------


def _route_payload(index: int, route: Route, checkpoints: list[dict], metrics: dict) -> dict:
    display = downsample(route.points, route.cum, DISPLAY_POINTS)
    lats = [point[0] for point in display]
    lons = [point[1] for point in display]
    return {
        "index": index,
        "label": ROUTE_LABELS[index],
        "synthesized": route.synthesized,
        "recommended": False,
        "distance_mi": round(route.length_m / METERS_PER_MILE, 1),
        "duration_h": round(route.duration_s / 3600, 2),
        "traffic_delay_min": round(route.traffic_delay_s / 60, 1),
        "bounds": [
            round(min(lats), 5),
            round(min(lons), 5),
            round(max(lats), 5),
            round(max(lons), 5),
        ],
        "metrics": metrics,
        "geometry": [[round(lat, 5), round(lon, 5)] for lat, lon in display],
        "checkpoints": checkpoints,
    }
