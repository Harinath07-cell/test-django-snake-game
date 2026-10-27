import json
from django.test import TestCase, Client
from django.urls import reverse
from .models import GameScore


class SnakeGameTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_index_page_renders(self):
        """Verify the main game page returns 200 and uses the expected template."""
        response = self.client.get(reverse('website:index'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'website/index.html')

    def test_game_score_model(self):
        """Verify model creation, string representation, and dictionary formatting."""
        score_record = GameScore.objects.create(
            player_name="Alice",
            score=150,
            difficulty="medium",
        )
        self.assertIn("Alice", str(score_record))
        self.assertIn("150", str(score_record))

        data = score_record.to_dict()
        self.assertEqual(data['player_name'], "Alice")
        self.assertEqual(data['score'], 150)
        self.assertEqual(data['difficulty'], "medium")
        self.assertIn('created_at', data)

    def test_game_score_ordering(self):
        """Verify higher scores appear first in ordering."""
        s1 = GameScore.objects.create(player_name="Low", score=10, difficulty="easy")
        s2 = GameScore.objects.create(player_name="High", score=100, difficulty="easy")
        s3 = GameScore.objects.create(player_name="Mid", score=50, difficulty="easy")

        scores = list(GameScore.objects.filter(difficulty="easy"))
        self.assertEqual(scores[0], s2)
        self.assertEqual(scores[1], s3)
        self.assertEqual(scores[2], s1)

    def test_submit_valid_score(self):
        """Submit a valid score and verify status 201 and DB persistence."""
        payload = {
            'player_name': 'Champion',
            'score': 240,
            'difficulty': 'hard',
        }
        response = self.client.post(
            reverse('website:submit_score'),
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        res_data = response.json()
        self.assertEqual(res_data['status'], 'success')
        self.assertEqual(res_data['score']['player_name'], 'Champion')
        self.assertEqual(res_data['score']['score'], 240)

        # Verify in database
        saved = GameScore.objects.filter(player_name='Champion', difficulty='hard').first()
        self.assertIsNotNone(saved)
        self.assertEqual(saved.score, 240)

    def test_submit_invalid_difficulty(self):
        """Submitting an invalid difficulty should return 400 Bad Request."""
        payload = {
            'player_name': 'Tester',
            'score': 50,
            'difficulty': 'insane',
        }
        response = self.client.post(
            reverse('website:submit_score'),
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json()['status'])

    def test_submit_empty_or_long_name(self):
        """Submitting empty name or name > 30 chars should return 400."""
        # Empty name
        res1 = self.client.post(
            reverse('website:submit_score'),
            data=json.dumps({'player_name': '   ', 'score': 30, 'difficulty': 'easy'}),
            content_type='application/json',
        )
        self.assertEqual(res1.status_code, 400)

        # Excessively long name
        res2 = self.client.post(
            reverse('website:submit_score'),
            data=json.dumps({'player_name': 'A' * 35, 'score': 30, 'difficulty': 'easy'}),
            content_type='application/json',
        )
        self.assertEqual(res2.status_code, 400)

    def test_submit_invalid_score_values(self):
        """Submitting negative or non-numeric score should return 400."""
        # Negative
        res1 = self.client.post(
            reverse('website:submit_score'),
            data=json.dumps({'player_name': 'Bob', 'score': -10, 'difficulty': 'medium'}),
            content_type='application/json',
        )
        self.assertEqual(res1.status_code, 400)

        # Non-numeric
        res2 = self.client.post(
            reverse('website:submit_score'),
            data=json.dumps({'player_name': 'Bob', 'score': 'not_a_number', 'difficulty': 'medium'}),
            content_type='application/json',
        )
        self.assertEqual(res2.status_code, 400)

    def test_submit_malformed_json(self):
        """Malformed JSON payload should return 400."""
        response = self.client.post(
            reverse('website:submit_score'),
            data="{invalid_json",
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_submit_method_not_allowed(self):
        """GET request on submit endpoint should return 405."""
        response = self.client.get(reverse('website:submit_score'))
        self.assertEqual(response.status_code, 405)

    def test_leaderboard_retrieval(self):
        """Verify leaderboard retrieves top 10 scores for the difficulty."""
        # Create 15 scores
        for i in range(15):
            GameScore.objects.create(
                player_name=f"Player_{i}",
                score=i * 10,
                difficulty="medium",
            )
        # Create score in another difficulty
        GameScore.objects.create(
            player_name="OtherDiff",
            score=999,
            difficulty="hard",
        )

        response = self.client.get(reverse('website:get_leaderboard') + '?difficulty=medium')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['difficulty'], 'medium')
        self.assertEqual(len(data['leaderboard']), 10)
        # Top score should be Player_14 with 140
        self.assertEqual(data['leaderboard'][0]['player_name'], 'Player_14')
        self.assertEqual(data['leaderboard'][0]['score'], 140)

    def test_leaderboard_invalid_difficulty(self):
        """Requesting an invalid difficulty should return 400."""
        response = self.client.get(reverse('website:get_leaderboard') + '?difficulty=impossible')
        self.assertEqual(response.status_code, 400)

    def test_leaderboard_method_not_allowed(self):
        """POST request on leaderboard endpoint should return 405."""
        response = self.client.post(reverse('website:get_leaderboard'))
        self.assertEqual(response.status_code, 405)

    def test_csrf_protection_on_score_submission(self):
        """Verify CSRF token is required and enforced when CSRF checking is enabled."""
        csrf_client = Client(enforce_csrf_checks=True)
        # 1. Fetch index to obtain CSRF cookie
        get_res = csrf_client.get(reverse('website:index'))
        csrf_token = get_res.cookies['csrftoken'].value

        payload = {'player_name': 'ProtectedPlayer', 'score': 80, 'difficulty': 'medium'}

        # 2. POST without CSRF token should be rejected with 403 Forbidden
        bad_post = csrf_client.post(
            reverse('website:submit_score'),
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(bad_post.status_code, 403)

        # 3. POST with X-CSRFToken header should succeed with 201 Created
        good_post = csrf_client.post(
            reverse('website:submit_score'),
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(good_post.status_code, 201)

