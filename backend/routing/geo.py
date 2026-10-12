"""Pure geodesic helpers and route sampling.

No network, no database, no Django. Deterministic and unit-testable.
"""

from __future__ import annotations

import math
from bisect import bisect_right

EARTH_RADIUS_MI = 3958.7613

Point = tuple[float, float]


def haversine_mi(a: Point, b: Point) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def cumulative_mi(points: list[Point]) -> list[float]:
    """Running geodesic distance along a polyline, starting at 0."""
    cum = [0.0]
    for a, b in zip(points, points[1:]):
        cum.append(cum[-1] + haversine_mi(a, b))
    return cum


def interpolate_point(points: list[Point], cum: list[float], target_mi: float) -> Point:
    """Point at ``target_mi`` along the polyline (linear between vertices)."""
    if target_mi <= 0.0 or len(points) == 1:
        return points[0]
    if target_mi >= cum[-1]:
        return points[-1]
    i = bisect_right(cum, target_mi) - 1
    span = cum[i + 1] - cum[i]
    t = 0.0 if span <= 0 else (target_mi - cum[i]) / span
    return (
        points[i][0] + t * (points[i + 1][0] - points[i][0]),
        points[i][1] + t * (points[i + 1][1] - points[i][1]),
    )


def bearing_deg(a: Point, b: Point) -> float:
    """Initial bearing from a to b, degrees clockwise from north."""
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlon = math.radians(b[1] - a[1])
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def destination_point(start: Point, bearing: float, distance_mi: float) -> Point:
    """Point ``distance_mi`` from ``start`` along ``bearing`` degrees."""
    angular = distance_mi / EARTH_RADIUS_MI
    brg = math.radians(bearing)
    lat1, lon1 = math.radians(start[0]), math.radians(start[1])
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular) + math.cos(lat1) * math.sin(angular) * math.cos(brg)
    )
    lon2 = lon1 + math.atan2(
        math.sin(brg) * math.sin(angular) * math.cos(lat1),
        math.cos(angular) - math.sin(lat1) * math.sin(lat2),
    )
    return (math.degrees(lat2), (math.degrees(lon2) + 540.0) % 360.0 - 180.0)


def point_and_bearing(points: list[Point], cum: list[float], target_mi: float) -> tuple[Point, float]:
    """Return the point at ``target_mi`` plus the route bearing there."""
    point = interpolate_point(points, cum, target_mi)
    if len(points) < 2:
        return point, 0.0
    i = max(0, min(bisect_right(cum, target_mi) - 1, len(points) - 2))
    return point, bearing_deg(points[i], points[i + 1])


def downsample(points: list[Point], cum: list[float], max_points: int) -> list[Point]:
    """Thin a polyline to roughly ``max_points`` vertices, keeping the ends."""
    if len(points) <= max_points or max_points < 2:
        return list(points)
    step = cum[-1] / (max_points - 1)
    kept = [points[0]]
    target = step
    for point, dist in zip(points[1:], cum[1:]):
        if dist >= target:
            kept.append(point)
            target = dist + step
    if kept[-1] != points[-1]:
        kept.append(points[-1])
    return kept


def checkpoint_targets(total_mi: float, interval_mi: float, min_tail_mi: float = 0.05) -> list[float]:
    """Cumulative distances for checkpoints: 0, interval, 2*interval, ..., total.

    The destination is always included; a final interval shorter than
    ``min_tail_mi`` is merged into it.
    """
    targets: list[float] = []
    distance = 0.0
    while distance < total_mi - min_tail_mi:
        targets.append(distance)
        distance += interval_mi
    targets.append(total_mi)
    return targets


def prepare_eta_steps(
    steps: list[tuple[float, float]],
    total_m: float,
    total_seconds: float,
) -> tuple[list[float], list[float]]:
    """Build monotonic (offset_m, time_s) arrays for ETA interpolation.

    Keeps only strictly advancing steps, anchors the start at (0, 0) and, when
    needed, the end at (route length, total time) so the destination ETA is
    exactly the routing API's travel time.
    """
    offsets, times = [0.0], [0.0]
    for offset, seconds in steps:
        if offset > offsets[-1] and seconds >= times[-1]:
            offsets.append(float(offset))
            times.append(float(seconds))
    if total_m > offsets[-1]:
        offsets.append(float(total_m))
        times.append(float(total_seconds))
    return offsets, times


def interpolate_eta_seconds(offsets: list[float], times: list[float], distance_m: float) -> float:
    """Seconds from route start at ``distance_m`` along the route."""
    if len(offsets) < 2:
        return 0.0
    x = max(0.0, min(distance_m, offsets[-1]))
    i = bisect_right(offsets, x) - 1
    if i >= len(offsets) - 1:
        return times[-1]
    span = offsets[i + 1] - offsets[i]
    if span <= 0:
        return times[i + 1]
    t = (x - offsets[i]) / span
    return times[i] + t * (times[i + 1] - times[i])
