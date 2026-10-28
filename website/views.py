import json
from django.http import JsonResponse, HttpResponseNotAllowed
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from .models import GameScore


@ensure_csrf_cookie
def index(request):
    """
    Renders the Snake game interface with initial settings and CSRF token.
    """
    return render(request, 'website/index.html')


@require_POST
def submit_score(request):
    """
    Endpoint for submitting a new player score.
    Validates player name, score integer, and difficulty.
    Returns JSON response with the saved score or error details.
    """
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {'status': 'error', 'message': 'Invalid JSON in request body.'},
            status=400
        )

    # Validate player name
    player_name = data.get('player_name')
    if not isinstance(player_name, str):
        return JsonResponse(
            {'status': 'error', 'message': 'Player name must be a string.'},
            status=400
        )

    player_name = player_name.strip()
    if not player_name or len(player_name) > 30:
        return JsonResponse(
            {'status': 'error', 'message': 'Player name must be between 1 and 30 characters.'},
            status=400
        )

    # Validate score
    raw_score = data.get('score')
    if raw_score is None:
        return JsonResponse(
            {'status': 'error', 'message': 'Score is required.'},
            status=400
        )

    try:
        score = int(raw_score)
        if score < 0 or score > 100000:
            raise ValueError()
    except (ValueError, TypeError):
        return JsonResponse(
            {'status': 'error', 'message': 'Score must be a positive integer between 0 and 100,000.'},
            status=400
        )

    # Validate difficulty
    difficulty = data.get('difficulty')
    valid_difficulties = [choice[0] for choice in GameScore.DIFFICULTY_CHOICES]
    if difficulty not in valid_difficulties:
        return JsonResponse(
            {'status': 'error', 'message': f'Difficulty must be one of: {", ".join(valid_difficulties)}.'},
            status=400
        )

    # Save to database
    try:
        new_score = GameScore.objects.create(
            player_name=player_name,
            score=score,
            difficulty=difficulty,
        )
        return JsonResponse(
            {
                'status': 'success',
                'message': 'Score submitted successfully!',
                'score': new_score.to_dict(),
            },
            status=201
        )
    except Exception as e:
        return JsonResponse(
            {'status': 'error', 'message': f'Failed to save score to database: {str(e)}'},
            status=500
        )


@require_GET
def get_leaderboard(request):
    """
    Retrieves the top 10 scores for the requested difficulty level.
    """
    difficulty = request.GET.get('difficulty', 'medium').lower()
    valid_difficulties = [choice[0] for choice in GameScore.DIFFICULTY_CHOICES]

    if difficulty not in valid_difficulties:
        return JsonResponse(
            {'status': 'error', 'message': f'Invalid difficulty. Allowed: {", ".join(valid_difficulties)}.'},
            status=400
        )

    try:
        top_scores = GameScore.objects.filter(difficulty=difficulty).order_by('-score', 'created_at')[:10]
        leaderboard_data = [score.to_dict() for score in top_scores]
    except Exception:
        leaderboard_data = []

    return JsonResponse({
        'status': 'success',
        'difficulty': difficulty,
        'leaderboard': leaderboard_data,
    })
