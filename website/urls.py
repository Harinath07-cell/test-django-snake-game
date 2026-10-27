from django.urls import path
from . import views

app_name = 'website'

urlpatterns = [
    path('', views.index, name='index'),
    path('api/scores/', views.submit_score, name='submit_score'),
    path('api/leaderboard/', views.get_leaderboard, name='get_leaderboard'),
]