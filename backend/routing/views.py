from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import planner
from .errors import ProviderError
from .serializers import RouteRequestSerializer


def health(request):
    return JsonResponse({'status': 'ok'})


@api_view(['POST'])
def solve_routes(request):
    """Solve a truck trip: routes, checkpoints, weather risk, recommendation."""
    serializer = RouteRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    try:
        payload = planner.plan_trip(
            origin_query=data['origin'],
            destination_query=data['destination'],
            load_lb=data['load_lb'],
            departure=data.get('departure'),
            checkpoint_mi=data['checkpoint_mi'],
        )
    except ProviderError as exc:
        return Response({'detail': str(exc), 'provider': exc.provider}, status=exc.status)
    return Response(payload)
