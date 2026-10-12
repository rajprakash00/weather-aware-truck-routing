"""Corridor weather-risk grid behind POST /api/heatmap.

The heatmap reuses the trip solver's cached pipeline: the same request as
``/api/routes`` plus ``route_index`` re-resolves the exact route the client
displayed (route cache, no geometry echo). A lattice of points within
``CORRIDOR_MI`` of that route gets one 48-hour series of composite risk scores
from a single batched Open-Meteo request, hour 0 = departure.

Scores come from the same pure engine as checkpoint scoring, so a grid point
and a checkpoint with the same weather and load score identically.
"""

from __future__ import annotations

import math
import time
from datetime import datetime

from rest_framework.exceptions import ValidationError

from . import planner, weather
from .geo import Point, interpolate_point
from .risk import checkpoint_risk

HEATMAP_HOURS = 48
CORRIDOR_MI = 25.0
GRID_SPACING_MI = 18.0
MAX_GRID_SPACING_MI = 60.0
MAX_HEATMAP_POINTS = 200
GRID_SAMPLE_MI = 4.0
MILES_PER_DEGREE_LAT = 69.05
MIN_MILES_PER_DEGREE_LON = 1.0


def plan_heatmap(
    *,
    origin_query: str,
    destination_query: str,
    load_lb: float,
    departure: datetime | None,
    route_index: int,
) -> dict:
    """Risk series for a corridor around one resolved route."""
    _origin, _destination, departure_utc, _weight_kg, routes = planner.resolve_trip_routes(
        origin_query=origin_query,
        destination_query=destination_query,
        load_lb=load_lb,
        departure=departure,
    )
    if not 0 <= route_index < len(routes):
        raise ValidationError(
            {"route_index": f"No route at index {route_index}; this trip has {len(routes)}."}
        )
    route = routes[route_index]
    grid = corridor_grid(route.points, route.cum)

    departure_epoch = departure_utc.timestamp()
    hours = [departure_epoch + 3600.0 * hour for hour in range(HEATMAP_HOURS)]
    forecast_days = math.ceil((hours[-1] - time.time()) / 86400) + 1
    entries = weather.fetch_hourly(grid, forecast_days)
    points = [
        _point_payload(point, entry, hours, load_lb) for point, entry in zip(grid, entries)
    ]

    if points:
        lats = [point["lat"] for point in points]
        lons = [point["lon"] for point in points]
        bounds = [min(lats), min(lons), max(lats), max(lons)]
    else:
        bounds = [
            round(min(point[0] for point in route.points), 5),
            round(min(point[1] for point in route.points), 5),
            round(max(point[0] for point in route.points), 5),
            round(max(point[1] for point in route.points), 5),
        ]

    return {
        "route_index": route_index,
        "hours_utc": [planner.iso_utc(hour) for hour in hours],
        "bounds": bounds,
        "points": points,
        "computed_at": planner.iso_utc(time.time()),
    }


def corridor_grid(points: list[Point], cum: list[float]) -> list[Point]:
    """Lattice of points within ``CORRIDOR_MI`` of the route polyline.

    Spacing starts at ``GRID_SPACING_MI`` and widens on long routes so the
    grid stays under ``MAX_HEATMAP_POINTS``. Distance checks run in a local
    equirectangular projection centred on the route's latitude span, which is
    amply accurate at a 25 mi scale.
    """
    length = cum[-1]
    if length <= 0 or len(points) < 2:
        return [(round(points[0][0], 4), round(points[0][1], 4))]

    samples = _route_samples(points, cum)
    lat_span = (min(p[0] for p in samples), max(p[0] for p in samples))
    mid_lat = (lat_span[0] + lat_span[1]) / 2.0
    miles_per_degree_lon = max(
        MILES_PER_DEGREE_LAT * math.cos(math.radians(mid_lat)), MIN_MILES_PER_DEGREE_LON
    )
    xs = [point[1] * miles_per_degree_lon for point in samples]
    ys = [point[0] * MILES_PER_DEGREE_LAT for point in samples]

    spacing = GRID_SPACING_MI
    corridor_area = (length + 2 * CORRIDOR_MI) * (2 * CORRIDOR_MI)
    if corridor_area / (spacing * spacing) > MAX_HEATMAP_POINTS:
        spacing = min(math.sqrt(corridor_area / MAX_HEATMAP_POINTS), MAX_GRID_SPACING_MI)

    while True:
        grid = _lattice(xs, ys, spacing, miles_per_degree_lon)
        if len(grid) <= MAX_HEATMAP_POINTS or spacing >= MAX_GRID_SPACING_MI:
            return grid
        spacing = min(spacing * 1.25, MAX_GRID_SPACING_MI)


def _route_samples(points: list[Point], cum: list[float]) -> list[Point]:
    """Polyline vertices every ``GRID_SAMPLE_MI``, for corridor membership."""
    length = cum[-1]
    samples: list[Point] = []
    distance = 0.0
    while distance < length:
        samples.append(interpolate_point(points, cum, distance))
        distance += GRID_SAMPLE_MI
    samples.append(points[-1])
    return samples


def _lattice(
    xs: list[float],
    ys: list[float],
    spacing: float,
    miles_per_degree_lon: float,
) -> list[Point]:
    min_x, max_x = min(xs) - CORRIDOR_MI, max(xs) + CORRIDOR_MI
    min_y, max_y = min(ys) - CORRIDOR_MI, max(ys) + CORRIDOR_MI
    corridor_sq = CORRIDOR_MI * CORRIDOR_MI
    grid: list[Point] = []
    y = math.floor(min_y / spacing) * spacing
    while y <= max_y:
        x = math.floor(min_x / spacing) * spacing
        while x <= max_x:
            if any((x - sx) ** 2 + (y - sy) ** 2 <= corridor_sq for sx, sy in zip(xs, ys)):
                grid.append(
                    (round(y / MILES_PER_DEGREE_LAT, 5), round(x / miles_per_degree_lon, 5))
                )
            x += spacing
        y += spacing
    return grid


def _point_payload(
    point: Point, entry: dict, hours: list[float], load_lb: float
) -> dict:
    risks = []
    for hour in hours:
        values = weather.weather_at(entry, hour)
        risks.append(
            int(
                checkpoint_risk(
                    wind_mph=values["wind_mph"],
                    rain_in=values["rain_in"],
                    showers_in=0.0,  # weather_at already folds showers into rain
                    snowfall_in=values["snow_in"],
                    load_lb=load_lb,
                )
            )
        )
    return {"lat": round(point[0], 4), "lon": round(point[1], 4), "risk": risks}
