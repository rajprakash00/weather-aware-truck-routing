"""Open-Meteo hourly forecast client (keyless).

One batched POST covers every checkpoint of every candidate route. Each
response entry is aligned to its own point's local midnight, but ``time`` is
UTC epoch seconds, so lookups are plain nearest-hour binary searches.
"""

from __future__ import annotations

import logging
from bisect import bisect_right

from .cache import cache_key, cached_json
from .errors import ProviderError
from .geo import Point
from .net import request_json

logger = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY_VARIABLES = "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,temperature_2m"
FORECAST_TTL_SECONDS = 60 * 60
WEATHER_VERSION = "openmeteo-v1"
MAX_FORECAST_DAYS = 16


def fetch_hourly(points: list[Point], forecast_days: int) -> list[dict]:
    forecast_days = max(2, min(int(forecast_days), MAX_FORECAST_DAYS))
    rounded = [[round(lat, 4), round(lon, 4)] for lat, lon in points]
    key = cache_key(WEATHER_VERSION, rounded, forecast_days)
    entries, hit = cached_json(
        "weather", key, FORECAST_TTL_SECONDS, lambda: _fetch(rounded, forecast_days)
    )
    logger.debug("open-meteo cache_hit=%s key=%s points=%d", hit, key, len(points))
    return entries


def _fetch(points: list[list[float]], forecast_days: int) -> list[dict]:
    params = {
        "latitude": [p[0] for p in points],
        "longitude": [p[1] for p in points],
        "hourly": HOURLY_VARIABLES,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timezone": "auto",
        "timeformat": "unixtime",
        "forecast_days": forecast_days,
    }
    payload = request_json("open-meteo", "POST", FORECAST_URL, data=params, timeout=60)
    if isinstance(payload, dict):
        payload = [payload]
    entries = []
    for entry in payload:
        hourly = entry.get("hourly") or {}
        if not hourly.get("time"):
            raise ProviderError("open-meteo", "Open-Meteo response missing hourly data", status=502)
        entries.append({"timezone": entry.get("timezone") or "UTC", "hourly": hourly})
    if len(entries) != len(points):
        logger.warning("open-meteo returned %d entries for %d points", len(entries), len(points))
    return entries


def weather_at(entry: dict, eta_epoch: float) -> dict:
    """Weather values at the hour nearest ``eta_epoch``.

    Rain is reported as rain + showers (the value the risk engine scores).
    Missing values are treated as 0.
    """
    hourly = entry["hourly"]
    times: list[int] = hourly["time"]
    index = bisect_right(times, eta_epoch) - 1
    if index < 0:
        index = 0
    elif index < len(times) - 1 and abs(times[index + 1] - eta_epoch) < abs(times[index] - eta_epoch):
        index += 1

    def value(name: str) -> float:
        series = hourly.get(name) or []
        if index >= len(series) or series[index] is None:
            return 0.0
        return float(series[index])

    return {
        "wind_mph": value("wind_speed_10m"),
        "gust_mph": value("wind_gusts_10m"),
        "rain_in": value("rain") + value("showers"),
        "snow_in": value("snowfall"),
        "temp_f": value("temperature_2m"),
    }


def is_beyond_forecast(entry: dict, eta_epoch: float) -> bool:
    return eta_epoch > entry["hourly"]["time"][-1]
