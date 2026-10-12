"""File-based JSON cache for provider responses.

Solves are expensive (TomTom responses run several megabytes, Open-Meteo is
rate limited), so each provider response is cached on disk under a key derived
from the request. Files are written atomically and carry an expiry timestamp.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Callable

from django.conf import settings

logger = logging.getLogger(__name__)


def cache_key(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:40]


def _cache_root() -> Path:
    root = Path(settings.ROUTING_CACHE_DIR)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _path_for(namespace: str, key: str) -> Path:
    return _cache_root() / namespace / f"{key}.json"


def get_json(namespace: str, key: str) -> Any | None:
    path = _path_for(namespace, key)
    try:
        payload = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    if payload.get("expires_at", 0) < time.time():
        path.unlink(missing_ok=True)
        return None
    return payload.get("value")


def set_json(namespace: str, key: str, value: Any, ttl_seconds: float) -> None:
    path = _path_for(namespace, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps({"expires_at": time.time() + ttl_seconds, "value": value}))
    os.replace(tmp, path)


def cached_json(
    namespace: str,
    key: str,
    ttl_seconds: float,
    producer: Callable[[], Any],
) -> tuple[Any, bool]:
    """Return (value, cache_hit). Produces and stores the value on a miss."""
    hit = get_json(namespace, key)
    if hit is not None:
        return hit, True
    value = producer()
    set_json(namespace, key, value, ttl_seconds)
    return value, False
