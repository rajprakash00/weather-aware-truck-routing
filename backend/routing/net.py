"""Thin requests wrapper that maps failures to ProviderError.

429s get up to two jittered retries: Open-Meteo's free tier allows one
in-flight request per identity and briefly 429s instead of queueing. Non-200
errors carry a truncated snippet of the provider body so the exact limit or
error reason is visible in the API response.
"""

from __future__ import annotations

import logging
import random
import time
from typing import Any

import requests

from .errors import ProviderError

logger = logging.getLogger(__name__)

RATE_LIMIT_STATUS = 429
MAX_RATE_LIMIT_RETRIES = 2
RETRY_BASE_DELAY_SECONDS = 1.0
BODY_SNIPPET_CHARS = 200


def request_json(
    provider: str,
    method: str,
    url: str,
    *,
    params: dict[str, Any] | None = None,
    data: Any = None,
    timeout: float = 60.0,
) -> Any:
    for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
        try:
            resp = requests.request(method, url, params=params, data=data, timeout=timeout)
        except requests.Timeout as exc:
            raise ProviderError(provider, f"{provider} request timed out", status=504) from exc
        except requests.RequestException as exc:
            raise ProviderError(provider, f"{provider} request failed: {exc}") from exc

        if resp.status_code != RATE_LIMIT_STATUS or attempt == MAX_RATE_LIMIT_RETRIES:
            break
        delay = RETRY_BASE_DELAY_SECONDS * (2**attempt) + random.uniform(0, 0.5)
        logger.warning(
            "%s rate limited (attempt %d/%d), retrying in %.1fs",
            provider,
            attempt + 1,
            MAX_RATE_LIMIT_RETRIES + 1,
            delay,
        )
        time.sleep(delay)

    if resp.status_code == RATE_LIMIT_STATUS:
        raise ProviderError(
            provider,
            f"{provider} rate limit reached ({_body_snippet(resp)}), retry shortly",
            status=503,
        )
    if resp.status_code != 200:
        raise ProviderError(
            provider,
            f"{provider} returned HTTP {resp.status_code}: {_body_snippet(resp)}",
            status=502,
        )
    try:
        return resp.json()
    except ValueError as exc:
        raise ProviderError(provider, f"{provider} returned invalid JSON", status=502) from exc


def _body_snippet(resp: requests.Response) -> str:
    text = (resp.text or "").strip()
    if not text:
        return str(resp.reason or "no response body")
    return " ".join(text.split())[:BODY_SNIPPET_CHARS]
