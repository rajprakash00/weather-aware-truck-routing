"""Open-Meteo geocoding client (keyless).

The API has no structured city/state params, so free-text queries are scored
against the candidate list: exact name match, region qualifier match (state
name or two-letter code prefix), and a US preference.
"""

from __future__ import annotations

import logging

from .cache import cache_key, cached_json
from .errors import ProviderError
from .net import request_json

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
GEOCODE_TTL_SECONDS = 60 * 60 * 24 * 30
GEOCODE_VERSION = "geocode-v1"


def geocode_city(query: str) -> dict:
    query = " ".join(query.split())
    if not query:
        raise ProviderError("geocoding", "Location must not be empty", status=400)
    key = cache_key(GEOCODE_VERSION, query.lower())
    result, hit = cached_json(
        "geocode", key, GEOCODE_TTL_SECONDS, lambda: _best_match(query, _search(query))
    )
    logger.debug("geocode %r cache_hit=%s", query, hit)
    return result


def _search(query: str) -> list[dict]:
    payload = request_json(
        "geocoding",
        "GET",
        GEOCODE_URL,
        params={"name": query, "count": 10, "language": "en", "format": "json"},
        timeout=20,
    )
    results = payload.get("results") or []
    if not results:
        raise ProviderError("geocoding", f"No location found for {query!r}", status=422)
    return results


def _best_match(query: str, results: list[dict]) -> dict:
    parts = [p.strip().lower() for p in query.split(",")]
    name, qualifiers = parts[0], parts[1:]

    def score(hit: dict) -> float:
        hit_name = (hit.get("name") or "").lower()
        region_words = " ".join(
            filter(None, [hit.get("admin1"), hit.get("admin2"), hit.get("country")])
        ).lower().split()
        value = 0.0
        if hit_name == name:
            value += 4
        elif name and name in hit_name:
            value += 2
        for qualifier in qualifiers:
            if qualifier and any(word.startswith(qualifier) for word in region_words):
                value += 3
        if (hit.get("country_code") or "").upper() == "US":
            value += 2
        value += min(float(hit.get("population") or 0), 10_000_000) / 10_000_000
        return value

    best = max(results, key=score)
    return {
        "name": best.get("name"),
        "admin1": best.get("admin1"),
        "country_code": best.get("country_code"),
        "latitude": float(best["latitude"]),
        "longitude": float(best["longitude"]),
        "timezone": best.get("timezone") or "UTC",
    }
