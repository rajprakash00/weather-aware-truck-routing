"""Spike: verify TomTom truck routing against the live API.

Run from backend/: .venv/bin/python spikes/tomtom_spike.py

Checks the assumptions locked in the handoff:
- travelMode=truck + vehicleCommercial=true + vehicleWeight in kg
- maxAlternatives=5 returns alternative routes
- per-step travel times for ETA interpolation (computeTravelTimeFor=all)
"""

from __future__ import annotations

import os

import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_URL = "https://api.tomtom.com/routing/1/calculateRoute"
ORIGIN = (34.05223, -118.24368)  # Los Angeles
DEST = (39.73915, -104.9847)  # Denver
CURB_WEIGHT_KG = 7711  # ~17,000 lb
LOAD_KG = 10000  # arbitrary test load


def main() -> None:
    key = os.environ.get("TOMTOM_API_KEY")
    if not key:
        raise SystemExit("TOMTOM_API_KEY missing from backend/.env")

    url = f"{BASE_URL}/{ORIGIN[0]},{ORIGIN[1]}:{DEST[0]},{DEST[1]}/json"
    params = {
        "key": key,
        "travelMode": "truck",
        "vehicleCommercial": "true",
        "vehicleWeight": str(CURB_WEIGHT_KG + LOAD_KG),
        "vehicleMaxSpeed": "65",
        "traffic": "true",
        "maxAlternatives": "5",
        "computeTravelTimeFor": "all",
        "instructionsType": "text",
        "routeType": "fastest",
    }

    resp = requests.get(url, params=params, timeout=60)
    print(f"GET routing status={resp.status_code} bytes={len(resp.content)}")
    resp.raise_for_status()
    payload = resp.json()

    routes = payload.get("routes", [])
    print(f"top-level keys: {sorted(payload.keys())}")
    print(f"routes returned: {len(routes)} (asked maxAlternatives=5, so up to 6)")

    for i, route in enumerate(routes[:2]):
        summary = route["summary"]
        leg = route["legs"][0]
        points = leg["points"]
        first_point_keys = sorted(points[0].keys())
        has_step_times = "travelTimeInSeconds" in points[0]
        instructions = route.get("guidance", {}).get("instructions", [])
        first_instruction = instructions[0] if instructions else {}
        print(
            f"\nroute {i}: length={summary['lengthInMeters'] / 1609.344:.1f} mi "
            f"travelTime={summary['travelTimeInSeconds'] / 3600:.1f} h "
            f"trafficDelay={summary.get('trafficDelayInSeconds', 0) / 60:.1f} min\n"
            f"  legs={len(route['legs'])} points={len(points)} "
            f"step_times={has_step_times} point_keys={first_point_keys}\n"
            f"  instructions={len(instructions)} "
            f"instruction_keys={sorted(first_instruction.keys())}\n"
            f"  sample instruction: offset={first_instruction.get('routeOffsetInMeters')}m "
            f"time={first_instruction.get('travelTimeInSeconds')}s "
            f"msg={first_instruction.get('message')!r}"
        )

    if len(routes) > 1:
        lengths = [r["summary"]["lengthInMeters"] for r in routes]
        print(f"\nalternatives distinct lengths: {len(set(lengths))} of {len(routes)}")

    print("\nquota headers:", {k: v for k, v in resp.headers.items() if "quota" in k.lower() or "ratelimit" in k.lower()})


if __name__ == "__main__":
    main()
