"""Template tags that read the Vite build manifest.

The manifest is written by `npm run build` in frontend/ and lives outside the
Django tree. Templates reference the hashed asset names through these tags so
the built app can be served by WhiteNoise with long cache lifetimes.
"""

import json
from pathlib import Path

from django import template
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.templatetags.static import static
from django.utils.html import format_html
from django.utils.safestring import mark_safe

register = template.Library()

ENTRY = "index.html"


def _entry() -> dict:
    manifest_path = Path(settings.FRONTEND_DIST) / ".vite" / "manifest.json"
    if not manifest_path.is_file():
        raise ImproperlyConfigured(
            f"Vite manifest not found at {manifest_path}. Run `npm run build` in frontend/."
        )
    with manifest_path.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    if ENTRY not in manifest:
        raise ImproperlyConfigured(f"Entry {ENTRY!r} missing from the Vite manifest.")
    return manifest[ENTRY]


def _static(path: str) -> str:
    return static(f"app/{path}")


@register.simple_tag
def vite_js() -> str:
    return format_html(
        '<script type="module" crossorigin src="{}"></script>', _static(_entry()["file"])
    )


@register.simple_tag
def vite_css() -> str:
    links = "".join(
        str(format_html('<link rel="stylesheet" crossorigin href="{}">', _static(path)))
        for path in _entry().get("css", [])
    )
    return mark_safe(links)
