"""TomTom truck routing client.

Lessons baked in from the Day 1 spike:
- truck routing needs ``travelMode=truck`` + ``vehicleCommercial=true`` and
  ``vehicleWeight`` in kilograms;
- ``maxAlternatives=5`` returns up to six total candidates;
- per-step times live in ``guidance.instructions`` as cumulative
  ``routeOffsetInMeters`` + ``travelTimeInSeconds``;
- raw responses are several megabytes, so only the fields the planner needs
  are cached (thinned geometry, step times, summary).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from django.conf import settings

from .cache import cache_key, cached_json
from .errors import ProviderError
from .geo import Point, cumulative_mi, downsample
from .net import request_json

logger = logging.getLogger(__name__)

ROUTES_URL = "https://api.tomtom.com/routing/1/calculateRoute"
CURB_WEIGHT_KG = 7711
LB_PER_KG = 2.2046226218
MAX_CACHE_POINTS = 6000
ROUTES_TTL_PLANNED_SECONDS = 60 * 60
ROUTES_TTL_LIVE_SECONDS = 15 * 60
LIVE_WINDOW = timedelta(minutes=15)
ROUTES_VERSION = "tomtom-v1"

# TomTom cancels very long multi-alternative requests with a 5xx compute-time
# error (observed on Boston to Los Angeles at alternatives=5). Beyond this
# great-circle distance, ask for one route and let the planner synthesize.
LONG_TRIP_MI = 1800


def alternatives_for_distance(distance_mi: float) -> int:
    return 1 if distance_mi > LONG_TRIP_MI else 5


def vehicle_weight_kg(load_lb: float) -> int:
    return CURB_WEIGHT_KG + round(load_lb / LB_PER_KG)


def fetch_candidate_routes(
    *,
    origin: Point,
    destination: Point,
    weight_kg: int,
    departure_utc: datetime,
    via: Point | None = None,
    alternatives: int = 5,
) -> list[dict]:
    """Return cached, planner-ready route records (up to ``alternatives + 1``)."""
    depart_at = _depart_at_param(departure_utc)
    key = cache_key(
        ROUTES_VERSION,
        [round(origin[0], 5), round(origin[1], 5)],
        [round(destination[0], 5), round(destination[1], 5)],
        [round(via[0], 5), round(via[1], 5)] if via else None,
        weight_kg,
        depart_at or "live",
        alternatives,
    )
    ttl = ROUTES_TTL_PLANNED_SECONDS if depart_at else ROUTES_TTL_LIVE_SECONDS
    routes, hit = cached_json(
        "routes",
        key,
        ttl,
        lambda: _fetch(
            origin=origin,
            destination=destination,
            weight_kg=weight_kg,
            depart_at=depart_at,
            via=via,
            alternatives=alternatives,
        ),
    )
    logger.debug("tomtom routes cache_hit=%s key=%s", hit, key)
    return routes


def _depart_at_param(departure_utc: datetime) -> str | None:
    """Future departures use TomTom's historical traffic model; near-now is live."""
    if departure_utc - datetime.now(timezone.utc) <= LIVE_WINDOW:
        return None
    return departure_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def _fetch(
    *,
    origin: Point,
    destination: Point,
    weight_kg: int,
    depart_at: str | None,
    via: Point | None,
    alternatives: int,
) -> list[dict]:
    key = settings.TOMTOM_API_KEY
    if not key:
        raise ProviderError("tomtom", "TOMTOM_API_KEY is not configured", status=503)

    waypoints = [origin, via, destination] if via else [origin, destination]
    path = ":".join(f"{lat},{lon}" for lat, lon in waypoints)
    params: dict[str, str] = {
        "key": key,
        "travelMode": "truck",
        "vehicleCommercial": "true",
        "vehicleWeight": str(weight_kg),
        "vehicleMaxSpeed": "65",
        "traffic": "true",
        "routeType": "fastest",
        "computeTravelTimeFor": "all",
        "instructionsType": "text",
        "maxAlternatives": str(alternatives),
    }
    if depart_at:
        params["departAt"] = depart_at

    try:
        payload = request_json(
            "tomtom", "GET", f"{ROUTES_URL}/{path}/json", params=params, timeout=90
        )
    except ProviderError as exc:
        if alternatives > 1 and _is_compute_limit(exc):
            logger.warning(
                "tomtom maxAlternatives=%d hit its compute limit; retrying with 1", alternatives
            )
            return _fetch(
                origin=origin,
                destination=destination,
                weight_kg=weight_kg,
                depart_at=depart_at,
                via=via,
                alternatives=1,
            )
        raise
    records = [_parse_route(raw) for raw in payload.get("routes", [])]
    records = [record for record in records if record]
    if not records:
        raise ProviderError("tomtom", "No truck routes returned for this pair", status=502)
    return records


def _is_compute_limit(exc: ProviderError) -> bool:
    """True for TomTom's 5xx compute-time error, where fewer alternatives can succeed."""
    return exc.status == 502 and "HTTP 5" in str(exc)


def _parse_route(raw: dict) -> dict | None:
    try:
        leg = raw["legs"][0]
        points = [(float(p["latitude"]), float(p["longitude"])) for p in leg["points"]]
        summary = raw["summary"]
        length_m = float(summary["lengthInMeters"])
        duration_s = float(summary["travelTimeInSeconds"])
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    if length_m <= 0 or len(points) < 2:
        return None

    points = downsample(points, cumulative_mi(points), MAX_CACHE_POINTS)
    instructions = raw.get("guidance", {}).get("instructions", [])
    steps = [
        [float(i.get("routeOffsetInMeters") or 0.0), float(i.get("travelTimeInSeconds") or 0.0)]
        for i in instructions
    ]
    return {
        "points": [[round(lat, 6), round(lon, 6)] for lat, lon in points],
        "length_m": length_m,
        "duration_s": duration_s,
        "traffic_delay_s": float(summary.get("trafficDelayInSeconds") or 0.0),
        "steps_m_s": steps,
        "synthesized": False,
    }
