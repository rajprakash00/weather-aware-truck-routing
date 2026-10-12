from django.contrib import admin
from django.urls import path

from routing import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.home, name='home'),
    path('api/health/', views.health, name='health'),
    path('api/routes', views.solve_routes, name='routes'),
    path('api/heatmap', views.solve_heatmap, name='heatmap'),
]
