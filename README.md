# Django Snake Game

A retro arcade Snake game built with Django, featuring responsive controls (keyboard and touch), difficulty selection (Easy, Medium, Hard), and leaderboard score tracking.

## Features
- **Arcade Gameplay**: Classic snake mechanics with food collection and collision detection.
- **Difficulty Modes**: Easy, Medium, and Hard speed presets.
- **Leaderboards**: Track top scores per difficulty mode.
- **Vercel Serverless Ready**: Configured with proper WSGI handling, static file collection, and automatic database support.

## Getting Started Locally

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Apply Migrations
```bash
python manage.py migrate
```

### 3. Start Development Server
```bash
python manage.py runserver
```

Visit `http://127.0.0.1:8000/` in your browser.

## Deployment on Vercel
This repository is configured for zero-config Vercel deployment:
- Entry point: `myproject/wsgi.py` (with `app = application`)
- Static files: Auto-collected via `STATIC_ROOT` and served via Vercel CDN and WhiteNoise
- Allowed hosts: Automatically supports Vercel preview and production domains
