"""Spike: verify Open-Meteo geocoding + batched forecast against the live API.

Run from backend/: .venv/bin/python spikes/openmeteo_spike.py

Prints the response shapes and quota-relevant facts we need for Day 2.
"""

from __future__ import annotations

import sys

import requests

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

CITIES = ["Los Angeles", "Denver"]


def geocode(name: str) -> dict:
    resp = requests.get(
        GEOCODE_URL,
        params={"name": name, "count": 1, "language": "en", "format": "json"},
        timeout=20,
    )
    resp.raise_for_status()
    results = resp.json().get("results") or []
    if not results:
        raise SystemExit(f"no geocoding result for {name!r}")
    return results[0]


def main() -> None:
    points = []
    for city in CITIES:
        hit = geocode(city)
        print(
            f"geocode {city!r}: {hit['name']}, {hit.get('admin1')}, {hit['country_code']} "
            f"lat={hit['latitude']} lon={hit['longitude']} tz={hit['timezone']}"
        )
        points.append(hit)

    params = {
        "latitude": [p["latitude"] for p in points],
        "longitude": [p["longitude"] for p in points],
        "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,temperature_2m",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "forecast_days": 3,
        "timeformat": "unixtime",
        "timezone": "auto",
    }
    resp = requests.post(FORECAST_URL, data=params, timeout=30)
    print(f"\nforecast POST status={resp.status_code} bytes={len(resp.content)}")
    resp.raise_for_status()
    payload = resp.json()
    if isinstance(payload, dict):
        payload = [payload]

    print(f"payload type=list len={len(payload)} (one entry per requested point)")
    for point, entry in zip(points, payload):
        hourly = entry["hourly"]
        keys = sorted(hourly.keys())
        print(
            f"\n{point['name']}: tz={entry['timezone']} "
            f"utc_offset={entry['utc_offset_seconds']} elevation={entry.get('elevation')}\n"
            f"  hourly keys: {keys}\n"
            f"  hours: {len(hourly['time'])}\n"
            f"  first ts={hourly['time'][0]} last ts={hourly['time'][-1]}\n"
            f"  first values: wind={hourly['wind_speed_10m'][0]} "
            f"gust={hourly['wind_gusts_10m'][0]} rain={hourly['rain'][0]} "
            f"showers={hourly['showers'][0]} snow={hourly['snowfall'][0]} "
            f"temp={hourly['temperature_2m'][0]}"
        )

    print("\nquota headers:", {k: v for k, v in resp.headers.items() if "ratelimit" in k.lower()})


if __name__ == "__main__":
    sys.exit(main())
