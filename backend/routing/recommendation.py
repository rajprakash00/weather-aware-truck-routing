"""Route scoring and recommendation.

Pure functions over checkpoint risk levels; no network or Django models.
Selection is a strict lexicographic comparison: a route with any no-travel
checkpoint is disqualified, then severe miles, high-risk miles, average risk,
and finally duration decide. When every route hits no-travel conditions, the
least no-travel mileage wins instead.
"""

from __future__ import annotations

from .risk import RiskLevel


def compute_metrics(checkpoints: list[dict], duration_s: float) -> dict:
    """Mile-weighted risk metrics for one route.

    Each checkpoint's risk governs the interval ahead of it (distance to the
    next checkpoint); the last checkpoint has a zero-length interval.
    """
    severe_mi = high_mi = no_travel_mi = weighted_risk = 0.0
    for current, following in zip(checkpoints, checkpoints[1:]):
        interval_mi = following["mi"] - current["mi"]
        risk = current["risk"]
        if risk == RiskLevel.NO_TRAVEL:
            no_travel_mi += interval_mi
        elif risk == RiskLevel.SEVERE:
            severe_mi += interval_mi
        elif risk == RiskLevel.HIGH:
            high_mi += interval_mi
        weighted_risk += risk * interval_mi
    no_travel_checkpoints = sum(1 for cp in checkpoints if cp["risk"] == RiskLevel.NO_TRAVEL)
    covered_mi = checkpoints[-1]["mi"] - checkpoints[0]["mi"] if len(checkpoints) > 1 else 0.0
    worst = max((cp["risk"] for cp in checkpoints), default=RiskLevel.LOW)
    return {
        "severe_mi": round(severe_mi, 2),
        "high_mi": round(high_mi, 2),
        "no_travel_mi": round(no_travel_mi, 2),
        "avg_risk": round(weighted_risk / covered_mi, 3) if covered_mi > 0 else 0.0,
        "max_risk": int(worst),
        "max_risk_label": RiskLevel(worst).name,
        "no_travel_checkpoints": no_travel_checkpoints,
        "checkpoints": len(checkpoints),
        "duration_h": round(duration_s / 3600, 2),
    }


def recommend(route_metrics: list[dict]) -> dict:
    """Pick the recommended route index and explain the choice."""
    safe = [i for i, m in enumerate(route_metrics) if m["no_travel_checkpoints"] == 0]
    all_unsafe = not safe
    pool = safe or list(range(len(route_metrics)))

    def key(i: int) -> tuple:
        m = route_metrics[i]
        weather = (m["severe_mi"], m["high_mi"], m["avg_risk"])
        if all_unsafe:
            return (m["no_travel_mi"], *weather, m["duration_h"])
        return (*weather, m["duration_h"])

    winner = min(pool, key=key)
    others = [i for i in pool if i != winner]
    runner_up = min(others, key=key) if others else None
    return {
        "index": winner,
        "all_unsafe": all_unsafe,
        "summary": _summary(winner, runner_up, route_metrics, all_unsafe),
    }


def _summary(winner: int, runner_up: int | None, metrics: list[dict], all_unsafe: bool) -> str:
    winner_metrics = metrics[winner]
    if all_unsafe:
        return (
            "Every route hits no-travel conditions somewhere along the way. "
            f"The best of them still has {winner_metrics['no_travel_mi']:.0f} mi of no-travel "
            "exposure and "
            f"{winner_metrics['severe_mi']:.0f} mi of severe risk — consider delaying departure."
        )
    if runner_up is None:
        return "Only one distinct truck route was found for this trip."

    other = metrics[runner_up]

    def worse(metric: str) -> bool:
        return winner_metrics[metric] < other[metric]

    if worse("severe_mi"):
        because = (
            f"the fewest severe-risk miles ({winner_metrics['severe_mi']:.0f} mi "
            f"vs {other['severe_mi']:.0f} mi)"
        )
    elif worse("high_mi"):
        because = (
            f"the least high-risk mileage ({winner_metrics['high_mi']:.0f} mi "
            f"vs {other['high_mi']:.0f} mi)"
        )
    elif worse("avg_risk"):
        because = (
            f"the lowest average risk ({winner_metrics['avg_risk']:.2f} "
            f"vs {other['avg_risk']:.2f})"
        )
    elif worse("duration_h"):
        because = (
            f"the shortest travel time ({winner_metrics['duration_h']:.1f} h "
            f"vs {other['duration_h']:.1f} h)"
        )
    else:
        return "All routes score the same on weather exposure and travel time."
    return f"Chosen for {because}."
