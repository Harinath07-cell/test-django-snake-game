from django.contrib import admin
from .models import GameScore


@admin.register(GameScore)
class GameScoreAdmin(admin.ModelAdmin):
    list_display = ('player_name', 'score', 'difficulty', 'created_at')
    list_filter = ('difficulty', 'created_at')
    search_fields = ('player_name',)
    ordering = ('-score', 'created_at')
