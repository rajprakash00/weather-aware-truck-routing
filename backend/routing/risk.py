"""Pure risk engine.

No network, no database, no Django. Every function is deterministic and
side-effect free so the scoring rules can be unit tested in isolation.
"""

from __future__ import annotations

from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5


def wind_risk(wind_mph: float) -> RiskLevel:
    """Risk from sustained wind speed, before load escalation."""
    if wind_mph < 25:
        return RiskLevel.LOW
    if wind_mph < 35:
        return RiskLevel.MODERATE
    if wind_mph < 45:
        return RiskLevel.HIGH
    if wind_mph < 55:
        return RiskLevel.SEVERE
    return RiskLevel.NO_TRAVEL


def rain_risk(rain_in: float) -> RiskLevel:
    """Risk from rain rate in inches per hour (rain + showers combined)."""
    if rain_in < 0.10:
        return RiskLevel.LOW
    if rain_in < 0.25:
        return RiskLevel.MODERATE
    if rain_in < 0.50:
        return RiskLevel.HIGH
    if rain_in <= 1.00:
        return RiskLevel.SEVERE
    return RiskLevel.NO_TRAVEL


def snow_risk(snow_in: float) -> RiskLevel:
    """Risk from snowfall rate in inches per hour (water equivalent)."""
    if snow_in < 0.5:
        return RiskLevel.LOW
    if snow_in < 1.0:
        return RiskLevel.MODERATE
    if snow_in < 2.0:
        return RiskLevel.HIGH
    if snow_in <= 3.0:
        return RiskLevel.SEVERE
    return RiskLevel.NO_TRAVEL


def apply_load(wind: RiskLevel, load_lb: float) -> RiskLevel:
    """Escalate wind risk for heavy loads.

    Wind >= 55 mph is already NO_TRAVEL for any load. Below that:
    - 45-54 mph with load > 30,000 lb -> NO_TRAVEL
    - 35-44 mph with load > 40,000 lb -> SEVERE
    Thresholds are strict: exactly 30,000 / 40,000 lb does not escalate.
    """
    if wind == RiskLevel.SEVERE and load_lb > 30_000:
        return RiskLevel.NO_TRAVEL
    if wind == RiskLevel.HIGH and load_lb > 40_000:
        return RiskLevel.SEVERE
    return wind


def checkpoint_risk(
    *,
    wind_mph: float,
    rain_in: float,
    showers_in: float,
    snowfall_in: float,
    load_lb: float,
) -> RiskLevel:
    """Combined risk at a single checkpoint.

    Wind risk is escalated for load first, then the checkpoint takes the
    maximum of wind, rain (rain + showers), and snow risk.
    """
    wind = apply_load(wind_risk(wind_mph), load_lb)
    rain = rain_risk(rain_in + showers_in)
    snow = snow_risk(snowfall_in)
    return max(wind, rain, snow)
