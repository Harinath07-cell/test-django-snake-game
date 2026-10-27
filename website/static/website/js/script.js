/**
 * Retro Snake Arena
 * Vanilla JavaScript Implementation
 * 
 * Features:
 * - Deterministic logical 20x20 grid with canvas rendering.
 * - Single-tick buffered direction changes to prevent self-collision on rapid keypresses.
 * - Self-collision check accounts for moving tail segment.
 * - Start / Pause / Resume / Restart controls with spacebar and touch support.
 * - Auto-pauses on document visibility loss.
 * - Handles board-fill victory condition.
 * - LocalStorage personal best tracking per difficulty.
 * - CSRF-protected score submission with duplicate prevention and safe DOM text rendering.
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Configuration & Constants
    // -------------------------------------------------------------------------
    const GRID_SIZE = 20; // 20x20 grid
    const CANVAS_SIZE = 400; // 400x400 px
    const CELL_SIZE = CANVAS_SIZE / GRID_SIZE; // 20px per cell

    const SPEEDS = {
        easy: 160,    // ms per movement tick
        medium: 110,
        hard: 70,
    };

    const GAME_STATES = {
        IDLE: 'IDLE',
        RUNNING: 'RUNNING',
        PAUSED: 'PAUSED',
        GAME_OVER: 'GAME_OVER',
        VICTORY: 'VICTORY',
    };

    const OPPOSITES = {
        UP: 'DOWN',
        DOWN: 'UP',
        LEFT: 'RIGHT',
        RIGHT: 'LEFT',
    };

    const DIRECTIONS = {
        UP: { x: 0, y: -1, name: 'UP' },
        DOWN: { x: 0, y: 1, name: 'DOWN' },
        LEFT: { x: -1, y: 0, name: 'LEFT' },
        RIGHT: { x: 1, y: 0, name: 'RIGHT' },
    };

    // -------------------------------------------------------------------------
    // Game State Object
    // -------------------------------------------------------------------------
    const state = {
        status: GAME_STATES.IDLE,
        difficulty: 'medium',
        score: 0,
        personalBest: 0,
        snake: [],
        direction: DIRECTIONS.RIGHT,
        nextDirection: DIRECTIONS.RIGHT,
        food: { x: 15, y: 10 },
        loopTimer: null,
        hasSubmittedScore: false,
    };

    // -------------------------------------------------------------------------
    // DOM Element References
    // -------------------------------------------------------------------------
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const canvasWrapper = document.querySelector('.canvas-wrapper');

    // Stats
    const currentScoreEl = document.getElementById('current-score');
    const personalBestEl = document.getElementById('personal-best');
    const bestDifficultyLabel = document.getElementById('best-difficulty-label');

    // Controls
    const diffButtons = document.querySelectorAll('.diff-btn');
    const startOverlay = document.getElementById('start-overlay');
    const startGameBtn = document.getElementById('start-game-btn');
    const pauseOverlay = document.getElementById('pause-overlay');
    const resumeBtn = document.getElementById('resume-btn');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverIcon = document.getElementById('game-over-icon');
    const finalScoreVal = document.getElementById('final-score-val');
    const finalDifficultyBadge = document.getElementById('final-difficulty-badge');
    const playAgainBtn = document.getElementById('play-again-btn');

    const togglePauseBtn = document.getElementById('toggle-pause-btn');
    const togglePauseText = document.getElementById('toggle-pause-text');
    const restartBtn = document.getElementById('restart-btn');

    // Score Submission
    const playerNameInput = document.getElementById('player-name-input');
    const submitScoreBtn = document.getElementById('submit-score-btn');
    const submissionMessage = document.getElementById('submission-message');

    // Mobile D-Pad
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');

    // Leaderboard
    const leaderboardTabs = document.querySelectorAll('.tab-btn');
    const leaderboardList = document.getElementById('leaderboard-list');
    const leaderboardLoader = document.getElementById('leaderboard-loader');
    const leaderboardEmpty = document.getElementById('leaderboard-empty');
    const refreshLeaderboardBtn = document.getElementById('refresh-leaderboard-btn');

    // -------------------------------------------------------------------------
    // Helper: CSRF Token
    // -------------------------------------------------------------------------
    function getCsrfToken() {
        const input = document.querySelector('#csrf-token-form [name=csrfmiddlewaretoken]');
        if (input && input.value) {
            return input.value;
        }
        // Fallback to cookie
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, val] = cookie.trim().split('=');
            if (name === 'csrftoken') {
                return decodeURIComponent(val);
            }
        }
        return '';
    }

    // -------------------------------------------------------------------------
    // Helper: Local Storage Personal Best & Player Name
    // -------------------------------------------------------------------------
    function loadPersonalBest(diff) {
        const key = `snake_best_${diff}`;
        const val = localStorage.getItem(key);
        return val ? parseInt(val, 10) : 0;
    }

    function savePersonalBest(diff, score) {
        const key = `snake_best_${diff}`;
        localStorage.setItem(key, score.toString());
    }

    function loadSavedPlayerName() {
        return localStorage.getItem('snake_player_name') || '';
    }

    function savePlayerName(name) {
        if (name) {
            localStorage.setItem('snake_player_name', name);
        }
    }

    // -------------------------------------------------------------------------
    // Initialization & Reset
    // -------------------------------------------------------------------------
    function init() {
        // Set canvas internal resolution for crisp rendering
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;

        // Restore player name into submission input if present
        const savedName = loadSavedPlayerName();
        if (savedName && playerNameInput) {
            playerNameInput.value = savedName;
        }

        // Setup difficulty and best score
        updateDifficultyUI(state.difficulty);
        state.personalBest = loadPersonalBest(state.difficulty);
        updateScoreDisplays();

        // Initial render of empty/starting board
        resetGameState();
        draw();

        // Fetch leaderboard for current difficulty
        fetchLeaderboard(state.difficulty);

        // Bind all event listeners
        bindEvents();
    }

    function resetGameState() {
        stopLoop();
        state.score = 0;
        state.direction = DIRECTIONS.RIGHT;
        state.nextDirection = DIRECTIONS.RIGHT;
        state.hasSubmittedScore = false;

        // Initial 3-segment snake centered horizontally
        state.snake = [
            { x: 10, y: 10 },
            { x: 9, y: 10 },
            { x: 8, y: 10 },
        ];

        spawnFood();
        updateScoreDisplays();
    }

    // -------------------------------------------------------------------------
    // Food Spawning (Guaranteed never to spawn inside snake)
    // -------------------------------------------------------------------------
    function spawnFood() {
        // Create lookup set of current snake cells
        const occupied = new Set();
        for (const segment of state.snake) {
            occupied.add(`${segment.x},${segment.y}`);
        }

        // Collect all unoccupied grid coordinates
        const available = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                if (!occupied.has(`${x},${y}`)) {
                    available.push({ x, y });
                }
            }
        }

        // If no cells are available, player has filled the board!
        if (available.length === 0) {
            triggerWin();
            return;
        }

        // Select a random empty cell
        const randomIndex = Math.floor(Math.random() * available.length);
        state.food = available[randomIndex];
    }

    // -------------------------------------------------------------------------
    // Game Loop Management
    // -------------------------------------------------------------------------
    function startLoop() {
        stopLoop(); // Clear any existing loop to guarantee only one loop runs
        const speed = SPEEDS[state.difficulty] || 110;

        state.loopTimer = setInterval(() => {
            gameTick();
        }, speed);
    }

    function stopLoop() {
        if (state.loopTimer !== null) {
            clearInterval(state.loopTimer);
            state.loopTimer = null;
        }
    }

    // -------------------------------------------------------------------------
    // Game State Transitions
    // -------------------------------------------------------------------------
    function startGame() {
        resetGameState();
        state.status = GAME_STATES.RUNNING;

        startOverlay.classList.add('hidden');
        pauseOverlay.classList.add('hidden');
        gameOverOverlay.classList.add('hidden');

        togglePauseBtn.disabled = false;
        togglePauseText.textContent = 'Pause';

        canvas.focus();
        startLoop();
    }

    function pauseGame() {
        if (state.status !== GAME_STATES.RUNNING) return;
        state.status = GAME_STATES.PAUSED;
        stopLoop();

        pauseOverlay.classList.remove('hidden');
        togglePauseText.textContent = 'Resume';
    }

    function resumeGame() {
        if (state.status !== GAME_STATES.PAUSED) return;
        state.status = GAME_STATES.RUNNING;

        pauseOverlay.classList.add('hidden');
        togglePauseText.textContent = 'Pause';

        canvas.focus();
        startLoop();
    }

    function togglePause() {
        if (state.status === GAME_STATES.RUNNING) {
            pauseGame();
        } else if (state.status === GAME_STATES.PAUSED) {
            resumeGame();
        }
    }

    function triggerGameOver() {
        state.status = GAME_STATES.GAME_OVER;
        stopLoop();

        togglePauseBtn.disabled = true;

        gameOverTitle.textContent = 'Game Over!';
        gameOverTitle.style.color = 'var(--text-primary)';
        gameOverIcon.textContent = '💀';
        finalScoreVal.textContent = state.score;
        finalDifficultyBadge.textContent = state.difficulty.toUpperCase();

        // Reset submission state
        state.hasSubmittedScore = false;
        submitScoreBtn.disabled = false;
        submitScoreBtn.textContent = 'Submit';
        submissionMessage.textContent = '';
        submissionMessage.className = 'submission-message';

        gameOverOverlay.classList.remove('hidden');
    }

    function triggerWin() {
        state.status = GAME_STATES.VICTORY;
        stopLoop();

        togglePauseBtn.disabled = true;

        gameOverTitle.textContent = 'Board Cleared! You Win!';
        gameOverTitle.style.color = 'var(--accent-green-bright)';
        gameOverIcon.textContent = '👑';
        finalScoreVal.textContent = state.score;
        finalDifficultyBadge.textContent = state.difficulty.toUpperCase();

        state.hasSubmittedScore = false;
        submitScoreBtn.disabled = false;
        submitScoreBtn.textContent = 'Submit';
        submissionMessage.textContent = 'Incredible! You completed the entire board!';
        submissionMessage.className = 'submission-message success';

        gameOverOverlay.classList.remove('hidden');
    }

    // -------------------------------------------------------------------------
    // Core Game Tick Logic
    // -------------------------------------------------------------------------
    function gameTick() {
        // Apply the buffered input for this tick
        state.direction = state.nextDirection;

        const head = state.snake[0];
        const newHead = {
            x: head.x + state.direction.x,
            y: head.y + state.direction.y,
        };

        // 1. Wall Collision Check
        if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
            triggerGameOver();
            return;
        }

        // Check if food will be consumed on this tick
        const willEat = (newHead.x === state.food.x && newHead.y === state.food.y);

        // 2. Self Collision Check
        // If the snake eats food, the tail does NOT move away.
        // If the snake does not eat food, the tail DOES move away on this tick.
        // Therefore, we check up to snake.length if eating, or snake.length - 1 if moving normally.
        const collisionLimit = willEat ? state.snake.length : state.snake.length - 1;
        for (let i = 0; i < collisionLimit; i++) {
            if (newHead.x === state.snake[i].x && newHead.y === state.snake[i].y) {
                triggerGameOver();
                return;
            }
        }

        // Move head forward
        state.snake.unshift(newHead);

        if (willEat) {
            // Food eaten: increase score, do not pop tail
            state.score += 10;
            if (state.score > state.personalBest) {
                state.personalBest = state.score;
                savePersonalBest(state.difficulty, state.personalBest);
            }
            updateScoreDisplays();

            // Trigger visual pulse
            canvasWrapper.classList.remove('pulse-active');
            void canvasWrapper.offsetWidth; // Trigger reflow
            canvasWrapper.classList.add('pulse-active');

            // Spawn next food item
            spawnFood();
        } else {
            // Normal movement: pop last tail segment
            state.snake.pop();
        }

        // Render updated scene
        draw();
    }

    // -------------------------------------------------------------------------
    // Input Handling
    // -------------------------------------------------------------------------
    function requestDirection(newDir) {
        // Prevent opposite direction reversal (e.g., cannot turn directly LEFT while moving RIGHT)
        if (state.direction.x + newDir.x === 0 && state.direction.y + newDir.y === 0) {
            return;
        }
        // Buffer next direction for the upcoming tick (prevents rapid double-tap bugs)
        state.nextDirection = newDir;
    }

    function handleKeyDown(e) {
        const key = e.key;

        // Prevent browser scrolling for game keys while active or canvas focused
        const handledKeys = [
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Space', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'
        ];

        if (handledKeys.includes(key)) {
            // Avoid intercepting keystrokes if the user is typing their player name!
            if (document.activeElement === playerNameInput) {
                return;
            }
            e.preventDefault();
        }

        // Spacebar to pause / resume or start
        if (key === ' ' || key === 'Space') {
            if (state.status === GAME_STATES.IDLE) {
                startGame();
            } else {
                togglePause();
            }
            return;
        }

        // Direction keys
        if (state.status !== GAME_STATES.RUNNING) return;

        switch (key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                requestDirection(DIRECTIONS.UP);
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                requestDirection(DIRECTIONS.DOWN);
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                requestDirection(DIRECTIONS.LEFT);
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                requestDirection(DIRECTIONS.RIGHT);
                break;
        }
    }

    // Touch Swipe Detection on Canvas
    let touchStartX = 0;
    let touchStartY = 0;

    function handleTouchStart(e) {
        if (e.touches.length > 0) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }

    function handleTouchEnd(e) {
        if (e.changedTouches.length === 0 || state.status !== GAME_STATES.RUNNING) return;

        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const minSwipeDistance = 25; // minimum pixels for swipe

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (Math.abs(deltaX) > minSwipeDistance) {
                requestDirection(deltaX > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT);
            }
        } else {
            if (Math.abs(deltaY) > minSwipeDistance) {
                requestDirection(deltaY > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Canvas Rendering
    // -------------------------------------------------------------------------
    function draw() {
        // Clear background
        ctx.fillStyle = '#060911';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Draw Grid Lines (Subtle)
        drawGrid();

        // Draw Food
        drawFood();

        // Draw Snake
        drawSnake();
    }

    function drawGrid() {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.lineWidth = 1;

        for (let x = 0; x <= CANVAS_SIZE; x += CELL_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, CANVAS_SIZE);
            ctx.stroke();
        }

        for (let y = 0; y <= CANVAS_SIZE; y += CELL_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(CANVAS_SIZE, y);
            ctx.stroke();
        }
    }

    function drawFood() {
        const x = state.food.x * CELL_SIZE;
        const y = state.food.y * CELL_SIZE;
        const radius = (CELL_SIZE / 2) - 2;
        const centerX = x + (CELL_SIZE / 2);
        const centerY = y + (CELL_SIZE / 2);

        // Glowing outer halo
        ctx.save();
        ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
        ctx.shadowBlur = 10;

        // Food Body (Apple-like circle)
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Highlight shine
        ctx.fillStyle = '#fca5a5';
        ctx.beginPath();
        ctx.arc(centerX - 3, centerY - 3, radius * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Small leaf
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.ellipse(centerX + 3, centerY - radius + 1, 3, 2, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawSnake() {
        const snake = state.snake;
        if (!snake || snake.length === 0) return;

        // Draw body segments
        for (let i = snake.length - 1; i >= 0; i--) {
            const segment = snake[i];
            const x = segment.x * CELL_SIZE;
            const y = segment.y * CELL_SIZE;
            const isHead = (i === 0);

            if (isHead) {
                drawSnakeHead(x, y);
            } else {
                // Gradient effect from bright near head to darker at tail
                const progress = i / snake.length; // 0 to 1
                const red = Math.round(16 + (progress * 5));
                const green = Math.round(185 - (progress * 65));
                const blue = Math.round(129 - (progress * 65));

                ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;

                // Rounded rectangle segment
                const pad = 1.5;
                drawRoundedRect(x + pad, y + pad, CELL_SIZE - (pad * 2), CELL_SIZE - (pad * 2), 5);
                ctx.fill();
            }
        }
    }

    function drawSnakeHead(x, y) {
        ctx.save();

        // Head glow
        ctx.shadowColor = 'rgba(74, 222, 128, 0.7)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#4ade80';

        // Rounded head
        const pad = 1;
        drawRoundedRect(x + pad, y + pad, CELL_SIZE - (pad * 2), CELL_SIZE - (pad * 2), 6);
        ctx.fill();
        ctx.restore();

        // Eyes based on current movement direction
        const dir = state.direction;
        let eye1X, eye1Y, eye2X, eye2Y;
        const eyeSize = 2.2;
        const pupilSize = 1.2;

        if (dir.x === 1) { // Moving Right
            eye1X = x + CELL_SIZE - 5; eye1Y = y + 5;
            eye2X = x + CELL_SIZE - 5; eye2Y = y + CELL_SIZE - 5;
        } else if (dir.x === -1) { // Moving Left
            eye1X = x + 5; eye1Y = y + 5;
            eye2X = x + 5; eye2Y = y + CELL_SIZE - 5;
        } else if (dir.y === 1) { // Moving Down
            eye1X = x + 5; eye1Y = y + CELL_SIZE - 5;
            eye2X = x + CELL_SIZE - 5; eye2Y = y + CELL_SIZE - 5;
        } else { // Moving Up
            eye1X = x + 5; eye1Y = y + 5;
            eye2X = x + CELL_SIZE - 5; eye2Y = y + 5;
        }

        // White of the eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
        ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(eye1X + (dir.x * 0.6), eye1Y + (dir.y * 0.6), pupilSize, 0, Math.PI * 2);
        ctx.arc(eye2X + (dir.x * 0.6), eye2Y + (dir.y * 0.6), pupilSize, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawRoundedRect(x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // -------------------------------------------------------------------------
    // UI Updaters
    // -------------------------------------------------------------------------
    function updateScoreDisplays() {
        if (currentScoreEl) currentScoreEl.textContent = state.score;
        if (personalBestEl) personalBestEl.textContent = state.personalBest;
    }

    function updateDifficultyUI(diff) {
        diffButtons.forEach(btn => {
            if (btn.dataset.difficulty === diff) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (bestDifficultyLabel) {
            bestDifficultyLabel.textContent = diff.slice(0, 3).toUpperCase();
        }
    }

    function setDifficulty(newDiff) {
        if (!SPEEDS[newDiff] || state.difficulty === newDiff) return;

        state.difficulty = newDiff;
        updateDifficultyUI(newDiff);
        state.personalBest = loadPersonalBest(newDiff);
        updateScoreDisplays();

        // Also switch leaderboard tab
        switchLeaderboardTab(newDiff);

        // If game is currently running, adjust loop timer speed smoothly
        if (state.status === GAME_STATES.RUNNING) {
            startLoop();
        }
    }

    // -------------------------------------------------------------------------
    // Leaderboard & API Service
    // -------------------------------------------------------------------------
    async function fetchLeaderboard(difficulty) {
        leaderboardLoader.classList.remove('hidden');
        leaderboardList.classList.add('hidden');
        leaderboardEmpty.classList.add('hidden');

        try {
            const response = await fetch(`/api/leaderboard/?difficulty=${encodeURIComponent(difficulty)}`, {
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const data = await response.json();
            renderLeaderboard(data.leaderboard || []);
        } catch (err) {
            console.error('Failed to load leaderboard:', err);
            leaderboardLoader.textContent = 'Could not load leaderboard. Click 🔄 to retry.';
        }
    }

    function renderLeaderboard(scores) {
        leaderboardLoader.classList.add('hidden');
        leaderboardList.innerHTML = '';

        if (!scores || scores.length === 0) {
            leaderboardEmpty.classList.remove('hidden');
            leaderboardList.classList.add('hidden');
            return;
        }

        leaderboardEmpty.classList.add('hidden');
        leaderboardList.classList.remove('hidden');

        // Build list items safely without raw HTML injection for player names
        scores.forEach((entry, index) => {
            const li = document.createElement('li');
            li.className = 'leaderboard-item';

            // Rank
            const rankSpan = document.createElement('span');
            rankSpan.className = `leaderboard-rank rank-${index + 1}`;
            if (index === 0) rankSpan.textContent = '🥇';
            else if (index === 1) rankSpan.textContent = '🥈';
            else if (index === 2) rankSpan.textContent = '🥉';
            else rankSpan.textContent = `#${index + 1}`;

            // Player Name (safely rendered as textContent)
            const nameSpan = document.createElement('span');
            nameSpan.className = 'leaderboard-player';
            nameSpan.textContent = entry.player_name || 'Anonymous';
            nameSpan.title = entry.player_name || 'Anonymous';

            // Score & Date Group
            const scoreGroup = document.createElement('div');
            scoreGroup.className = 'leaderboard-score-group';

            const scoreVal = document.createElement('span');
            scoreVal.className = 'leaderboard-score-val';
            scoreVal.textContent = entry.score;

            const dateSpan = document.createElement('span');
            dateSpan.className = 'leaderboard-date';
            dateSpan.textContent = entry.created_at || '';

            scoreGroup.appendChild(scoreVal);
            scoreGroup.appendChild(dateSpan);

            li.appendChild(rankSpan);
            li.appendChild(nameSpan);
            li.appendChild(scoreGroup);

            leaderboardList.appendChild(li);
        });
    }

    function switchLeaderboardTab(diff) {
        leaderboardTabs.forEach(tab => {
            if (tab.dataset.tab === diff) {
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
            } else {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
            }
        });
        fetchLeaderboard(diff);
    }

    async function handleScoreSubmission() {
        if (state.hasSubmittedScore) return;

        const name = (playerNameInput.value || '').trim();
        if (!name) {
            submissionMessage.textContent = 'Please enter your name.';
            submissionMessage.className = 'submission-message error';
            playerNameInput.focus();
            return;
        }

        if (name.length > 30) {
            submissionMessage.textContent = 'Name must be 30 characters or fewer.';
            submissionMessage.className = 'submission-message error';
            return;
        }

        // Save name for convenience in subsequent games
        savePlayerName(name);

        // Disable button to prevent duplicate submissions
        submitScoreBtn.disabled = true;
        submitScoreBtn.textContent = 'Submitting...';
        submissionMessage.textContent = '';
        submissionMessage.className = 'submission-message';

        const payload = {
            player_name: name,
            score: state.score,
            difficulty: state.difficulty,
        };

        const csrfToken = getCsrfToken();

        try {
            const response = await fetch('/api/scores/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                    'Accept': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (response.ok && data.status === 'success') {
                state.hasSubmittedScore = true;
                submitScoreBtn.textContent = 'Submitted!';
                submissionMessage.textContent = 'Score submitted successfully!';
                submissionMessage.className = 'submission-message success';

                // Automatically switch leaderboard to current difficulty and refresh
                switchLeaderboardTab(state.difficulty);
            } else {
                submitScoreBtn.disabled = false;
                submitScoreBtn.textContent = 'Submit';
                submissionMessage.textContent = data.message || 'Submission failed. Please try again.';
                submissionMessage.className = 'submission-message error';
            }
        } catch (err) {
            console.error('Score submission error:', err);
            submitScoreBtn.disabled = false;
            submitScoreBtn.textContent = 'Submit';
            submissionMessage.textContent = 'Network error while submitting. Please try again.';
            submissionMessage.className = 'submission-message error';
        }
    }

    // -------------------------------------------------------------------------
    // Event Listeners Binding
    // -------------------------------------------------------------------------
    function bindEvents() {
        // Keyboard controls
        window.addEventListener('keydown', handleKeyDown);

        // Buttons
        startGameBtn.addEventListener('click', startGame);
        playAgainBtn.addEventListener('click', startGame);
        resumeBtn.addEventListener('click', resumeGame);
        togglePauseBtn.addEventListener('click', togglePause);
        restartBtn.addEventListener('click', startGame);

        // Difficulty selector buttons
        diffButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                setDifficulty(btn.dataset.difficulty);
            });
        });

        // Mobile D-Pad
        btnUp.addEventListener('click', () => requestDirection(DIRECTIONS.UP));
        btnDown.addEventListener('click', () => requestDirection(DIRECTIONS.DOWN));
        btnLeft.addEventListener('click', () => requestDirection(DIRECTIONS.LEFT));
        btnRight.addEventListener('click', () => requestDirection(DIRECTIONS.RIGHT));

        // Touch swipe on canvas
        canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: true });

        // Score submission
        submitScoreBtn.addEventListener('click', handleScoreSubmission);
        if (playerNameInput) {
            playerNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScoreSubmission();
                }
            });
        }

        // Leaderboard tabs
        leaderboardTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchLeaderboardTab(tab.dataset.tab);
            });
        });

        // Refresh leaderboard button
        if (refreshLeaderboardBtn) {
            refreshLeaderboardBtn.addEventListener('click', () => {
                const activeTab = document.querySelector('.tab-btn.active');
                const diff = activeTab ? activeTab.dataset.tab : state.difficulty;
                fetchLeaderboard(diff);
            });
        }

        // Auto-pause when tab/window loses visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && state.status === GAME_STATES.RUNNING) {
                pauseGame();
            }
        });
    }

    // Start everything when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
