"""Provider-facing errors mapped to HTTP responses by the API views."""

from __future__ import annotations


class ProviderError(Exception):
    """A third-party provider failed in a way we can explain to the client."""

    def __init__(self, provider: str, message: str, status: int = 502):
        super().__init__(message)
        self.provider = provider
        self.status = status
