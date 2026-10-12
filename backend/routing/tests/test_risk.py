import pytest

from routing.risk import (
    RiskLevel,
    apply_load,
    checkpoint_risk,
    rain_risk,
    snow_risk,
    wind_risk,
)


@pytest.mark.parametrize(
    ("wind_mph", "expected"),
    [
        (0, RiskLevel.LOW),
        (24.9, RiskLevel.LOW),
        (25, RiskLevel.MODERATE),
        (34.9, RiskLevel.MODERATE),
        (35, RiskLevel.HIGH),
        (44.9, RiskLevel.HIGH),
        (45, RiskLevel.SEVERE),
        (54.9, RiskLevel.SEVERE),
        (55, RiskLevel.NO_TRAVEL),
        (80, RiskLevel.NO_TRAVEL),
    ],
)
def test_wind_buckets(wind_mph, expected):
    assert wind_risk(wind_mph) == expected


@pytest.mark.parametrize(
    ("rain_in", "expected"),
    [
        (0, RiskLevel.LOW),
        (0.09, RiskLevel.LOW),
        (0.10, RiskLevel.MODERATE),
        (0.24, RiskLevel.MODERATE),
        (0.25, RiskLevel.HIGH),
        (0.49, RiskLevel.HIGH),
        (0.50, RiskLevel.SEVERE),
        (1.00, RiskLevel.SEVERE),
        (1.01, RiskLevel.NO_TRAVEL),
    ],
)
def test_rain_buckets(rain_in, expected):
    assert rain_risk(rain_in) == expected


@pytest.mark.parametrize(
    ("snow_in", "expected"),
    [
        (0, RiskLevel.LOW),
        (0.4, RiskLevel.LOW),
        (0.5, RiskLevel.MODERATE),
        (0.9, RiskLevel.MODERATE),
        (1.0, RiskLevel.HIGH),
        (1.9, RiskLevel.HIGH),
        (2.0, RiskLevel.SEVERE),
        (3.0, RiskLevel.SEVERE),
        (3.1, RiskLevel.NO_TRAVEL),
    ],
)
def test_snow_buckets(snow_in, expected):
    assert snow_risk(snow_in) == expected


def test_no_load_escalation_below_high_wind():
    assert apply_load(RiskLevel.LOW, 80_000) == RiskLevel.LOW
    assert apply_load(RiskLevel.MODERATE, 80_000) == RiskLevel.MODERATE


def test_severe_wind_escalates_above_30k_load():
    assert apply_load(RiskLevel.SEVERE, 30_000) == RiskLevel.SEVERE
    assert apply_load(RiskLevel.SEVERE, 30_001) == RiskLevel.NO_TRAVEL


def test_high_wind_escalates_above_40k_load():
    assert apply_load(RiskLevel.HIGH, 40_000) == RiskLevel.HIGH
    assert apply_load(RiskLevel.HIGH, 40_001) == RiskLevel.SEVERE


def test_no_travel_wind_stays_no_travel_under_load():
    assert apply_load(RiskLevel.NO_TRAVEL, 50_000) == RiskLevel.NO_TRAVEL


def test_checkpoint_takes_max_of_components():
    assert checkpoint_risk(wind_mph=10, rain_in=0.25, showers_in=0, snowfall_in=0, load_lb=0) == RiskLevel.HIGH


def test_rain_rate_is_rain_plus_showers():
    assert checkpoint_risk(wind_mph=5, rain_in=0.08, showers_in=0.08, snowfall_in=0, load_lb=0) == RiskLevel.MODERATE


def test_checkpoint_applies_load_escalation_to_wind():
    assert checkpoint_risk(wind_mph=45, rain_in=0, showers_in=0, snowfall_in=0, load_lb=31_000) == RiskLevel.NO_TRAVEL


def test_checkpoint_load_at_threshold_does_not_escalate():
    assert checkpoint_risk(wind_mph=47, rain_in=0, showers_in=0, snowfall_in=0, load_lb=30_000) == RiskLevel.SEVERE


def test_checkpoint_wind_dominates_over_rain():
    assert checkpoint_risk(wind_mph=60, rain_in=0.6, showers_in=0, snowfall_in=0, load_lb=10_000) == RiskLevel.NO_TRAVEL


def test_checkpoint_snow_dominates_calm_wind():
    assert checkpoint_risk(wind_mph=8, rain_in=0, showers_in=0, snowfall_in=1.0, load_lb=10_000) == RiskLevel.HIGH


def test_checkpoint_all_low_is_low():
    assert checkpoint_risk(wind_mph=12, rain_in=0.02, showers_in=0.01, snowfall_in=0.1, load_lb=42_000) == RiskLevel.LOW
