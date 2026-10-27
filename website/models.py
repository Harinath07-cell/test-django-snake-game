from django.db import models


class GameScore(models.Model):
    """
    Stores player scores for the Snake game.
    Includes player name, score value, difficulty level, and creation timestamp.
    """
    DIFFICULTY_CHOICES = [
        ('easy', 'Easy'),
        ('medium', 'Medium'),
        ('hard', 'Hard'),
    ]

    player_name = models.CharField(max_length=50)
    score = models.PositiveIntegerField()
    difficulty = models.CharField(
        max_length=10,
        choices=DIFFICULTY_CHOICES,
        default='medium',
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-score', 'created_at']
        indexes = [
            models.Index(fields=['difficulty', '-score', 'created_at']),
        ]

    def __str__(self):
        return f"{self.player_name} - {self.score} ({self.get_difficulty_display()})"

    def to_dict(self):
        return {
            'id': self.id,
            'player_name': self.player_name,
            'score': self.score,
            'difficulty': self.difficulty,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M'),
        }
