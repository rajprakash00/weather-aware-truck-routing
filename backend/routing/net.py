"""Thin requests wrapper that maps failures to ProviderError."""

from __future__ import annotations

from typing import Any

import requests

from .errors import ProviderError


def request_json(
    provider: str,
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    data: Any = None,
    timeout: float = 60.0,
) -> Any:
    try:
        resp = requests.request(method, url, params=params, data=data, timeout=timeout)
    except requests.Timeout as exc:
        raise ProviderError(provider, f"{provider} request timed out", status=504) from exc
    except requests.RequestException as exc:
        raise ProviderError(provider, f"{provider} request failed: {exc}") from exc

    if resp.status_code == 429:
        raise ProviderError(provider, f"{provider} rate limit reached, retry shortly", status=503)
    if resp.status_code != 200:
        raise ProviderError(provider, f"{provider} returned HTTP {resp.status_code}", status=502)
    try:
        return resp.json()
    except ValueError as exc:
        raise ProviderError(provider, f"{provider} returned invalid JSON", status=502) from exc
