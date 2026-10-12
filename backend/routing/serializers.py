"""Request validation for POST /api/routes and POST /api/heatmap."""

from __future__ import annotations

from django.utils.dateparse import parse_datetime
from rest_framework import serializers


class FlexibleDateTimeField(serializers.Field):
    """ISO 8601 date-time that preserves whether the input carried an offset.

    Naive values are read downstream as origin-local wall time; offset-aware
    values are absolute. DRF's DateTimeField normalizes to the server timezone
    and loses that distinction.
    """

    default_error_messages = {"invalid": "Enter a valid ISO 8601 date-time."}

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        value = parse_datetime(data.strip())
        if value is None:
            self.fail("invalid")
        return value

    def to_representation(self, value):
        return value.isoformat()


class RouteRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(
        max_length=200, help_text="Origin city, e.g. 'Los Angeles, CA'."
    )
    destination = serializers.CharField(
        max_length=200, help_text="Destination city, e.g. 'Denver, CO'."
    )
    load_lb = serializers.FloatField(
        min_value=0,
        max_value=80_000,
        help_text="Cargo weight in pounds (added to the truck's 17,000 lb curb weight).",
    )
    departure = FlexibleDateTimeField(
        required=False,
        allow_null=True,
        help_text=(
            "Departure time. Naive values are read as origin-local wall time; "
            "offset-aware values are used as-is. Defaults to now."
        ),
    )
    checkpoint_mi = serializers.ChoiceField(
        choices=(10, 25, 50),
        default=25,
        help_text="Checkpoint spacing in miles.",
    )


class HeatmapRequestSerializer(RouteRequestSerializer):
    """Same trip fields as /api/routes plus the route to build the corridor around.

    The trip fields must match the solve request so the backend re-resolves the
    identical route from the route cache.
    """

    route_index = serializers.IntegerField(
        min_value=0,
        max_value=2,
        help_text="Index of the selected route from the /api/routes response.",
    )
