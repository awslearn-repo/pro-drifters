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
    actionLabel: 'Start run',
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
    tag: 'Precision Stack',
    playable: true,
    actionLabel: 'Start stacking',
    description: 'Line up drifting tiles to build the tallest, cleanest tower without losing rhythm.',
  },
];

const engineFactories = {
  runner: () => new RunnerGame(elements.canvas, uiBridge),
  stack: () => new EchoStackGame(elements.canvas, uiBridge),
};

let activeGameId = 'runner';
let activeEngine = null;

elements.startButton.addEventListener('click', () => {
  const game = getGame(activeGameId);
  if (!game?.playable || !activeEngine) return;
  activeEngine.start();
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
    elements.startButton.textContent = game.actionLabel ?? 'Start';
    ensureGameEngine(game.id);
  } else {
    elements.startButton.disabled = true;
    elements.startButton.textContent = 'Start';
    tearDownActiveEngine();
    uiBridge.setScore('--');
    uiBridge.setBest('--');
    uiBridge.setStatus('This mini-game is landing soon. Stay tuned!');
    drawPlaceholder(elements.canvas, 'New challenge launching soon');
  }
}

function ensureGameEngine(gameId) {
  const factory = engineFactories[gameId];
  if (!factory) {
    tearDownActiveEngine();
    return;
  }

  if (activeEngine?.id === gameId) {
    uiBridge.setScore(activeEngine.getDisplayScore());
    uiBridge.setBest(activeEngine.getBestScore());
    return;
  }

  tearDownActiveEngine();
  activeEngine = factory();
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
    this.ui.setStatus('Tap or press space to jump. Keep running as it speeds up.');
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

class EchoStackGame {
  constructor(canvas, ui) {
    this.id = 'stack';
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;

    this.layerHeight = 22;
    this.baseLinePadding = 34;
    this.boundaryMargin = 60;
    this.baseSpeed = 90;
    this.speedGain = 7.5;
    this.maxSpeed = 260;
    this.gravity = 1100;
    this.storageKey = 'pulse_arcade_echo_best';

    this.handleLoop = this.handleLoop.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handlePointer = this.handlePointer.bind(this);

    this.handleResize();
    this.echoes = this.buildEchoes();

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('pointerdown', this.handlePointer);

    this.bestScore = this.loadBestScore();
    this.time = 0;

    this.reset();
    this.ui.setBest(this.getBestScore());

    this.animationFrame = requestAnimationFrame(this.handleLoop);
  }

  start() {
    this.reset();
    this.state = 'running';
    this.spawnMovingBlock();
    this.ui.setStatus('Drop each drifting tile when it lines up to keep the stack alive.');
  }

  reset() {
    this.state = 'idle';
    this.score = 0;
    this.renderedScore = -1;
    this.time = 0;
    this.speed = this.baseSpeed;
    this.fallingPieces = [];
    this.currentBlock = null;
    this.stack = [];
    this.cameraOffset = 0;
    this.cameraTarget = 0;
    this.pulseTimer = 0;

    const usableWidth = this.width || this.canvas.width || 360;
    const baseWidth = Math.max(usableWidth * 0.65, 140);
    const groundLine = this.baseLine ?? (this.height || this.canvas.height || 220) - this.baseLinePadding;
    const baseY = groundLine - this.layerHeight;

    this.stack.push({
      x: (usableWidth - baseWidth) / 2,
      width: baseWidth,
      height: this.layerHeight,
      y: baseY,
      color: this.getColor(0),
      settle: 1,
      pulse: 0,
    });

    this.ui.setScore(0);
    this.ui.setStatus('Tap Start or click the canvas to begin stacking echoes.');
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
    const previousBaseLine =
      typeof this.baseLine === 'number' ? this.baseLine : height - this.baseLinePadding;

    this.canvas.width = Math.round(width * pixelRatio);
    this.canvas.height = Math.round(height * pixelRatio);
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    this.pixelRatio = pixelRatio;
    this.width = width;
    this.height = height;
    this.baseLine = height - this.baseLinePadding;

    if (this.stack) {
      const delta = this.baseLine - previousBaseLine;
      this.stack.forEach((block) => {
        block.y += delta;
      });
    }

    this.echoes = this.buildEchoes();
  }

  buildEchoes() {
    const count = 8;
    return Array.from({ length: count }, () => this.createEcho());
  }

  createEcho() {
    return {
      x: Math.random() * (this.width || 360),
      y: (this.height || 220) - Math.random() * (this.height || 220) * 1.2,
      radius: 30 + Math.random() * 70,
      speed: 12 + Math.random() * 24,
      alpha: 0.08 + Math.random() * 0.12,
      drift: (Math.random() - 0.5) * 30,
      seed: Math.random() * Math.PI * 2,
    };
  }

  handleLoop(timestamp) {
    if (!this.lastTime) {
      this.lastTime = timestamp;
    }

    const delta = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;
    this.time += delta;

    if (this.state === 'running') {
      this.update(delta);
    } else {
      this.applyIdleAnimation(delta);
    }

    this.draw();
    this.animationFrame = requestAnimationFrame(this.handleLoop);
  }

  update(dt) {
    this.updateCurrentBlock(dt);
    this.updateFallingPieces(dt);
    this.updateStackAnimations(dt);
    this.updateEchoes(dt);
    this.updateCamera(dt);
  }

  applyIdleAnimation(dt) {
    this.updateFallingPieces(dt);
    this.updateStackAnimations(dt);
    this.updateEchoes(dt);
    this.updateCamera(dt);
  }

  updateCurrentBlock(dt) {
    if (!this.currentBlock) return;
    const block = this.currentBlock;
    block.bobTime = (block.bobTime || 0) + dt;
    block.x += block.direction * block.speed * dt;

    const minX = -block.width - this.boundaryMargin;
    const maxX = this.width + this.boundaryMargin;
    if (block.x <= minX) {
      block.x = minX;
      block.direction = 1;
    } else if (block.x + block.width >= maxX) {
      block.x = maxX - block.width;
      block.direction = -1;
    }
  }

  updateFallingPieces(dt) {
    if (!this.fallingPieces) return;
    this.fallingPieces.forEach((piece) => {
      piece.vy += this.gravity * dt;
      piece.y += piece.vy * dt;
      piece.rotation += piece.spin * dt;
      piece.alpha -= dt * 0.6;
    });
    this.fallingPieces = this.fallingPieces.filter((piece) => piece.alpha > 0 && piece.y < this.height * 2);
  }

  updateStackAnimations(dt) {
    if (!this.stack) return;
    this.stack.forEach((block) => {
      if (typeof block.settle === 'number' && block.settle < 1) {
        block.settle = Math.min(1, block.settle + dt * 4);
      }
      if (block.pulse > 0) {
        block.pulse = Math.max(0, block.pulse - dt);
      }
    });
  }

  updateEchoes(dt) {
    if (!this.echoes) return;
    this.echoes.forEach((echo) => {
      echo.y -= echo.speed * dt;
      echo.x += echo.drift * dt * 0.1;
      if (echo.y + echo.radius < -40) {
        Object.assign(echo, this.createEcho(), { y: this.height + echo.radius });
      }
      if (echo.x < -40) echo.x = this.width + 40;
      if (echo.x > this.width + 40) echo.x = -40;
    });
  }

  updateCamera(dt) {
    const stackLength = this.stack ? this.stack.length : 0;
    const blocksAboveBase = Math.max(0, stackLength - 1);
    // Positive offsets push the entire scene downward so upper blocks stay on-screen.
    const desired = Math.max(0, blocksAboveBase * this.layerHeight - this.height * 0.4);
    this.cameraTarget = desired;
    const diff = this.cameraTarget - this.cameraOffset;
    this.cameraOffset += diff * Math.min(1, dt * 3);
  }

  spawnMovingBlock() {
    if (!this.stack?.length) return;
    const lastBlock = this.stack[this.stack.length - 1];
    if (!lastBlock) return;

    const direction = this.stack.length % 2 === 0 ? 1 : -1;
    const y = lastBlock.y - this.layerHeight;
    const width = Math.max(32, lastBlock.width);
    const margin = this.boundaryMargin;
    const startX = direction === 1 ? -width - margin : this.width + margin;

    this.currentBlock = {
      x: startX,
      width,
      height: this.layerHeight,
      y,
      direction,
      speed: this.speed,
      color: this.getColor(this.stack.length),
      bobTime: 0,
    };
  }

  placeBlock() {
    if (this.state === 'idle') {
      this.start();
      return;
    }
    if (this.state === 'over') {
      this.start();
      return;
    }
    if (this.state !== 'running' || !this.currentBlock) return;

    const block = this.currentBlock;
    if (!this.stack?.length) return;
    const anchor = this.stack[this.stack.length - 1];
    const left = Math.max(block.x, anchor.x);
    const right = Math.min(block.x + block.width, anchor.x + anchor.width);
    const overlap = right - left;

    if (overlap <= 2) {
      this.addFallingPiece(block.x, block.width, block.y, block.height, block.color);
      this.currentBlock = null;
      this.onFail();
      return;
    }

    const trimmedLeft = left - block.x;
    if (trimmedLeft > 1) {
      this.addFallingPiece(block.x, trimmedLeft, block.y, block.height, block.color);
    }
    const trimmedRight = block.x + block.width - right;
    if (trimmedRight > 1) {
      this.addFallingPiece(right, trimmedRight, block.y, block.height, block.color);
    }

    const newBlock = {
      x: left,
      width: overlap,
      height: this.layerHeight,
      y: anchor.y - this.layerHeight,
      color: block.color,
      settle: 0,
      pulse: 0.7,
    };

    this.stack.push(newBlock);
    this.currentBlock = null;

    this.score = this.stack.length - 1;
    this.publishScore();

    this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.score * this.speedGain);
    this.spawnMovingBlock();
  }

  addFallingPiece(x, width, y, height, color) {
    this.fallingPieces.push({
      x,
      y,
      width,
      height,
      color,
      vy: -60 - Math.random() * 40,
      rotation: 0,
      spin: (Math.random() - 0.5) * 6,
      alpha: 0.9,
    });
  }

  onFail() {
    this.state = 'over';
    const finalScore = this.getDisplayScore();
    if (finalScore > this.bestScore) {
      this.bestScore = finalScore;
      this.saveBestScore(finalScore);
      this.ui.setBest(finalScore);
    }
    this.ui.setStatus('Misaligned tile! Tap Start to rebuild the tower.');
  }

  draw() {
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackground();
    this.drawEchoes();
    this.drawStack();
    this.drawCurrentBlock();
    this.drawFallingPieces();

    if (this.state === 'idle') {
      this.drawOverlay('Tap start or the canvas to begin stacking');
    } else if (this.state === 'over') {
      this.drawOverlay('Tile slipped! Tap start to try again');
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#0b1120');
    gradient.addColorStop(1, '#030712');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    const spacing = 28;
    ctx.beginPath();
    for (let i = 0; i < this.width / spacing + 2; i++) {
      const x = (i * spacing + (this.time * 20) % spacing) - spacing;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    ctx.stroke();
  }

  drawEchoes() {
    if (!this.echoes) return;
    const ctx = this.ctx;
    this.echoes.forEach((echo) => {
      ctx.save();
      ctx.globalAlpha = echo.alpha;
      ctx.strokeStyle = 'rgba(93, 224, 255, 0.4)';
      ctx.lineWidth = 1.5;
      const radius = echo.radius + Math.sin(this.time * 1.2 + echo.seed) * 6;
      ctx.beginPath();
      ctx.arc(echo.x, echo.y + this.cameraOffset * 0.35, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  drawStack() {
    if (!this.stack) return;
    const ctx = this.ctx;
    this.stack.forEach((block) => {
      const offset = block.settle < 1 ? (1 - block.settle) * 18 : 0;
      const y = block.y + this.cameraOffset - offset;

      ctx.fillStyle = block.color;
      drawRoundedRectPath(ctx, block.x, y, block.width, block.height, 6);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(block.x + 4, y + 3, block.width - 8, block.height * 0.4);

      if (block.pulse > 0) {
        ctx.save();
        ctx.globalAlpha = block.pulse * 0.4;
        ctx.strokeStyle = 'rgba(93, 224, 255, 0.8)';
        ctx.lineWidth = 2;
        drawRoundedRectPath(ctx, block.x - 4, y - 4, block.width + 8, block.height + 8, 8);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  drawCurrentBlock() {
    if (!this.currentBlock) return;
    const block = this.currentBlock;
    const bob = Math.sin(block.bobTime * 3) * 4;
    const y = block.y + this.cameraOffset - 16 + bob;
    this.ctx.fillStyle = block.color;
    drawRoundedRectPath(this.ctx, block.x, y, block.width, block.height, 6);
    this.ctx.fill();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    this.ctx.fillRect(block.x + 4, y + 3, block.width - 8, block.height * 0.4);
  }

  drawFallingPieces() {
    if (!this.fallingPieces?.length) return;
    const ctx = this.ctx;
    this.fallingPieces.forEach((piece) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, piece.alpha);
      ctx.translate(piece.x + piece.width / 2, piece.y + this.cameraOffset + piece.height / 2);
      ctx.rotate(piece.rotation);
      ctx.fillStyle = piece.color;
      drawRoundedRectPath(ctx, -piece.width / 2, -piece.height / 2, piece.width, piece.height, 4);
      ctx.fill();
      ctx.restore();
    });
  }

  drawOverlay(text) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    drawRoundedRectPath(ctx, 18, 18, this.width - 36, 36, 12);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 14px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, this.width / 2, 36);
  }

  handleKeyDown(event) {
    if (!['Space', 'ArrowUp', 'Enter'].includes(event.code)) return;
    event.preventDefault();
    this.placeBlock();
  }

  handlePointer(event) {
    event.preventDefault();
    this.placeBlock();
  }

  publishScore() {
    if (this.renderedScore === this.score) return;
    this.renderedScore = this.score;
    this.ui.setScore(this.score);
  }

  getDisplayScore() {
    return Math.max(0, Math.floor(this.score || 0));
  }

  getBestScore() {
    return Math.max(0, Math.floor(this.bestScore || 0));
  }

  getColor(level) {
    const hue = 250 + (level * 9) % 80;
    const saturation = 75;
    const lightness = 65 - Math.min(level * 0.7, 15);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  loadBestScore() {
    try {
      const stored = Number(localStorage.getItem(this.storageKey));
      return Number.isFinite(stored) ? stored : 0;
    } catch (error) {
      console.warn('Unable to read stored Echo Stack score', error);
      return 0;
    }
  }

  saveBestScore(value) {
    try {
      localStorage.setItem(this.storageKey, String(value));
    } catch (error) {
      console.warn('Unable to persist Echo Stack score', error);
    }
  }

  clearCanvas() {
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.ctx.clearRect(0, 0, this.width || this.canvas.width, this.height || this.canvas.height);
  }
}

renderGameMenu();
selectGame(activeGameId);
