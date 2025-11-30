const elements = {
  menu: document.getElementById('gameMenu'),
  canvas: document.getElementById('gameCanvas'),
  tag: document.getElementById('gameTag'),
  title: document.getElementById('gameTitle'),
  description: document.getElementById('gameDescription'),
  startButton: document.getElementById('startButton'),
  score: document.getElementById('scoreValue'),
  best: document.getElementById('bestValue'),
  status: document.getElementById('statusMessage'),
};

const uiBridge = {
  setScore(value) {
    elements.score.textContent = typeof value === 'number' ? value.toString() : value;
  },
  setBest(value) {
    elements.best.textContent = typeof value === 'number' ? value.toString() : value;
  },
  setStatus(message) {
    elements.status.textContent = message;
  },
};

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const games = [
  {
    id: 'runner',
    title: 'Skyline Sprint',
    tag: 'Endless Runner',
    playable: true,
    description:
      'Leap across a neon skyline. One key to jump, infinite retries. The longer you survive, the faster it gets.',
  },
  {
    id: 'orbital',
    title: 'Orbital Drop',
    tag: 'Coming Soon',
    playable: false,
    description: 'Guide a supply pod through boosters and debris without overheating. Coming soon.',
  },
  {
    id: 'stack',
    title: 'Echo Stack',
    tag: 'Coming Soon',
    playable: false,
    description: 'Line up drifting tiles to build the tallest, cleanest tower. Coming soon.',
  },
];

let activeGameId = 'runner';
let activeEngine = null;

renderGameMenu();
selectGame(activeGameId);

elements.startButton.addEventListener('click', () => {
  const game = getGame(activeGameId);
  if (!game?.playable) return;

  if (activeGameId === 'runner' && activeEngine) {
    activeEngine.start();
  }
});

function getGame(id) {
  return games.find((game) => game.id === id);
}

function renderGameMenu() {
  elements.menu.innerHTML = '';

  games.forEach((game) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `game-card${game.id === activeGameId ? ' active' : ''}${
      game.playable ? '' : ' soon'
    }`;
    button.dataset.game = game.id;
    button.innerHTML = `
      <span class="label">${game.playable ? 'Playable now' : 'Coming soon'}</span>
      <h2>${game.title}</h2>
      <p>${game.description}</p>
    `;

    button.addEventListener('click', () => {
      if (activeGameId === game.id) return;
      selectGame(game.id);
    });

    elements.menu.appendChild(button);
  });
}

function selectGame(gameId) {
  const game = getGame(gameId) ?? games[0];
  activeGameId = game.id;
  renderGameMenu();

  elements.tag.textContent = game.tag;
  elements.title.textContent = game.title;
  elements.description.textContent = game.description;

  if (game.playable) {
    elements.startButton.disabled = false;
    ensureRunnerGame();
    uiBridge.setStatus('Tap or press space to jump. Keep running as it speeds up.');
  } else {
    elements.startButton.disabled = true;
    tearDownActiveEngine();
    uiBridge.setScore('--');
    uiBridge.setBest('--');
    uiBridge.setStatus('This mini-game is landing soon. Stay tuned!');
    drawPlaceholder(elements.canvas, 'New challenge launching soon');
  }
}

function ensureRunnerGame() {
  if (activeEngine instanceof RunnerGame) {
    uiBridge.setScore(activeEngine.getDisplayScore());
    uiBridge.setBest(activeEngine.getBestScore());
    return;
  }

  tearDownActiveEngine();
  activeEngine = new RunnerGame(elements.canvas, uiBridge);
}

function tearDownActiveEngine() {
  if (!activeEngine) return;
  activeEngine.destroy();
  activeEngine = null;
}

function drawPlaceholder(canvas, message) {
  const ctx = canvas.getContext('2d');
  const pixelRatio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;

  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
  ctx.font = '600 14px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}

class RunnerGame {
  constructor(canvas, ui) {
    this.id = 'runner';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;

    this.baseSpeed = 170;
    this.maxSpeed = 520;
    this.gravity = 1300;
    this.jumpForce = 430;
    this.spawnDelayRange = [0.55, 1.2];
    this.storageKey = 'pulse_arcade_skyline_best';

    this.handleLoop = this.handleLoop.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePointer = this.handlePointer.bind(this);

    this.pixelRatio = window.devicePixelRatio || 1;
    this.lastTime = 0;
    this.bestScore = this.loadBestScore();
    this.renderedScore = -1;

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('pointerdown', this.handlePointer);

    this.reset();
    this.ui.setBest(this.getBestScore());
    this.animationFrame = requestAnimationFrame(this.handleLoop);
  }

  start() {
    this.reset();
    this.state = 'running';
    this.ui.setStatus('Run! Tap or press space to jump.');
  }

  reset() {
    this.state = 'idle';
    this.score = 0;
    this.renderedScore = -1;
    this.speed = this.baseSpeed;
    this.spawnTimer = 0.8;
    this.playerIdleTime = 0;

    const playerSize = 24;
    this.player = {
      size: playerSize,
      x: this.width ? this.width * 0.2 : 60,
      y: (this.groundY || 150) - playerSize,
      vy: 0,
      grounded: true,
    };

    this.obstacles = [];
    this.ui.setScore(0);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('pointerdown', this.handlePointer);
    this.clearCanvas();
  }

  handleResize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;

    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    this.pixelRatio = pixelRatio;
    this.width = width;
    this.height = height;
    this.groundY = height - 28;

    if (this.player) {
      this.player.x = this.width * 0.2;
      this.player.y = Math.min(this.player.y, this.groundY - this.player.size);
    }
  }

  handleLoop(timestamp) {
    if (!this.lastTime) {
      this.lastTime = timestamp;
    }

    const delta = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (this.state === 'running') {
      this.update(delta);
    } else {
      this.applyIdleAnimation(delta);
    }

    this.draw();
    this.animationFrame = requestAnimationFrame(this.handleLoop);
  }

  update(dt) {
    this.player.vy += this.gravity * dt;
    this.player.y += this.player.vy * dt;

    if (this.player.y >= this.groundY - this.player.size) {
      this.player.y = this.groundY - this.player.size;
      this.player.vy = 0;
      this.player.grounded = true;
    }

    this.obstacles.forEach((obstacle) => {
      obstacle.x -= this.speed * dt;
    });

    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -5);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnObstacle();
      this.spawnTimer = this.getNextSpawnDelay();
    }

    this.speed = Math.min(this.speed + dt * 24, this.maxSpeed);
    this.score += this.speed * dt * 0.05;
    this.publishScore();

    if (this.checkCollision()) {
      this.onCrash();
    }
  }

  applyIdleAnimation(dt) {
    this.playerIdleTime += dt;
    const bob = Math.sin(this.playerIdleTime * 3) * 2;
    this.player.y = this.groundY - this.player.size - Math.abs(bob);
  }

  spawnObstacle() {
    const width = 14 + Math.random() * 20;
    const height = 22 + Math.random() * 28;
    const hue = 250 + Math.random() * 60;

    this.obstacles.push({
      x: this.width + width,
      width,
      height,
      color: `hsl(${hue}, 80%, 65%)`,
    });
  }

  getNextSpawnDelay() {
    const speedFactor = (this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed);
    const minDelay = this.spawnDelayRange[0];
    const maxDelay = this.spawnDelayRange[1];
    return Math.max(minDelay, maxDelay - speedFactor * 0.8);
  }

  publishScore() {
    const displayed = Math.floor(this.score);
    if (displayed === this.renderedScore) return;
    this.renderedScore = displayed;
    this.ui.setScore(displayed);
  }

  checkCollision() {
    return this.obstacles.some((obstacle) => {
      const playerBottom = this.player.y + this.player.size;
      const playerRight = this.player.x + this.player.size * 0.75;
      const playerLeft = this.player.x - this.player.size * 0.15;
      const obstacleTop = this.groundY - obstacle.height;
      const obstacleRight = obstacle.x + obstacle.width;
      const obstacleLeft = obstacle.x;

      return (
        playerRight > obstacleLeft &&
        playerLeft < obstacleRight &&
        playerBottom > obstacleTop
      );
    });
  }

  onCrash() {
    this.state = 'over';
    const finalScore = Math.floor(this.score);
    if (finalScore > this.bestScore) {
      this.bestScore = finalScore;
      this.saveBestScore(finalScore);
      this.ui.setBest(finalScore);
    }
    this.ui.setStatus('Ouch! Hit Start Run or tap to try again.');
  }

  draw() {
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackground();
    this.drawGround();
    this.drawObstacles();
    this.drawPlayer();

    if (this.state === 'idle') {
      this.drawOverlay('Tap, click, or press space to begin');
    } else if (this.state === 'over') {
      this.drawOverlay('Game over • tap to restart');
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#020617');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = 'rgba(94, 234, 212, 0.08)';
    for (let i = 0; i < 6; i++) {
      const x = ((i + (this.score * 0.01)) % 6) * (this.width / 5) - 40;
      const height = 30 + (i % 2 === 0 ? 20 : 50);
      ctx.fillRect(x, this.groundY - height - 10, 60, height);
    }
  }

  drawGround() {
    const ctx = this.ctx;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, this.groundY, this.width, this.height - this.groundY);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(this.width, this.groundY);
    ctx.stroke();
  }

  drawObstacles() {
    const ctx = this.ctx;
    this.obstacles.forEach((obstacle) => {
      const top = this.groundY - obstacle.height;
      ctx.fillStyle = obstacle.color;
      ctx.fillRect(obstacle.x, top, obstacle.width, obstacle.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(obstacle.x, top, obstacle.width * 0.25, obstacle.height);
    });
  }

  drawPlayer() {
    const ctx = this.ctx;
    ctx.fillStyle = '#5de0ff';
    drawRoundedRectPath(ctx, this.player.x, this.player.y, this.player.size, this.player.size, 6);
    ctx.fill();

    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(
      this.player.x + this.player.size * 0.15,
      this.player.y + this.player.size * 0.65,
      this.player.size * 0.7,
      this.player.size * 0.2
    );
  }

  drawOverlay(text) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
    drawRoundedRectPath(ctx, 16, 16, this.width - 32, 32, 10);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 14px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.width / 2, 32);
  }

  handleKeyDown(event) {
    if (!['Space', 'ArrowUp', 'KeyW'].includes(event.code)) return;
    event.preventDefault();
    this.jump();
  }

  handlePointer(event) {
    event.preventDefault();
    this.jump();
  }

  jump() {
    if (this.state === 'idle') {
      this.start();
    }
    if (this.state !== 'running' || !this.player.grounded) return;
    this.player.vy = -this.jumpForce;
    this.player.grounded = false;
  }

  getDisplayScore() {
    return Math.max(0, Math.floor(this.score || 0));
  }

  getBestScore() {
    return Math.max(0, Math.floor(this.bestScore || 0));
  }

  loadBestScore() {
    try {
      const stored = Number(localStorage.getItem(this.storageKey));
      return Number.isFinite(stored) ? stored : 0;
    } catch (error) {
      console.warn('Unable to read stored score', error);
      return 0;
    }
  }

  saveBestScore(value) {
    try {
      localStorage.setItem(this.storageKey, String(value));
    } catch (error) {
      console.warn('Unable to store score', error);
    }
  }

  clearCanvas() {
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, this.width || this.canvas.width, this.height || this.canvas.height);
  }
}
