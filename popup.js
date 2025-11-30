import * as THREE from './lib/three.module.js';

// DOM references for UI feedback
const canvas = document.getElementById('gameCanvas');
const speedValue = document.getElementById('speedValue');
const distanceValue = document.getElementById('distanceValue');
const scoreValue = document.getElementById('scoreValue');
const lapValue = document.getElementById('lapValue');
const powerupValue = document.getElementById('powerupValue');
const cameraButton = document.getElementById('cameraButton');

// Renderer / Scene / Camera setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050b19);
scene.fog = new THREE.Fog(0x030915, 80, 420);

const camera = new THREE.PerspectiveCamera(
  60,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  1200
);

// --- Input handling -------------------------------------------------------
const controls = {
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
};

const KEY_BINDINGS = {
  ArrowUp: 'accelerate',
  ArrowDown: 'brake',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'accelerate',
  KeyS: 'brake',
  KeyA: 'left',
  KeyD: 'right',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  Space: 'brake',
};

window.addEventListener('keydown', (event) => {
  const action = KEY_BINDINGS[event.code];
  if (action) {
    controls[action] = true;
    event.preventDefault();
  }
  if (event.code === 'KeyR') {
    resetCarPosition();
  }
  if (event.code === 'KeyC') {
    cycleCamera();
  }
});

window.addEventListener('keyup', (event) => {
  const action = KEY_BINDINGS[event.code];
  if (action) {
    controls[action] = false;
    event.preventDefault();
  }
});

window.addEventListener('blur', () => {
  Object.keys(controls).forEach((key) => {
    controls[key] = false;
  });
});

// --- Utility textures -----------------------------------------------------
function createRoadTexture() {
  const size = 256;
  const canvasTex = document.createElement('canvas');
  canvasTex.width = size;
  canvasTex.height = size;
  const ctx = canvasTex.getContext('2d');

  ctx.fillStyle = '#2c303a';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = '#f4f1de';
  ctx.lineWidth = 6;
  ctx.setLineDash([20, 28]);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = '#11131a';
  ctx.lineWidth = 12;
  ctx.strokeRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvasTex);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

function createAsphaltTexture() {
  const size = 128;
  const canvasTex = document.createElement('canvas');
  canvasTex.width = size;
  canvasTex.height = size;
  const ctx = canvasTex.getContext('2d');

  for (let i = 0; i < 2000; i++) {
    const gray = Math.random() * 40 + 30;
    ctx.fillStyle = `rgb(${gray},${gray + 10},${gray + 20})`;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvasTex);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 20);
  return texture;
}

// --- World building -------------------------------------------------------
const world = {
  boundaries: { x: 220, z: 220 },
  obstacles: [],
  powerups: [],
  aiCars: [],
};

const asphaltTexture = createAsphaltTexture();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800),
  new THREE.MeshStandardMaterial({ map: asphaltTexture })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const roadTexture = createRoadTexture();

function buildRoadGrid() {
  const group = new THREE.Group();
  const gridSize = 4;
  const laneSpacing = 30;
  const roadLength = 500;

  for (let i = -gridSize; i <= gridSize; i++) {
    const straight = new THREE.Mesh(
      new THREE.BoxGeometry(laneSpacing * 0.8, 0.2, roadLength),
      new THREE.MeshStandardMaterial({ map: roadTexture })
    );
    straight.position.set(i * laneSpacing, 0.2, 0);
    straight.receiveShadow = true;
    group.add(straight);

    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(roadLength, 0.2, laneSpacing * 0.8),
      new THREE.MeshStandardMaterial({ map: roadTexture })
    );
    cross.position.set(0, 0.2, i * laneSpacing);
    cross.receiveShadow = true;
    group.add(cross);
  }

  scene.add(group);
}

function buildCityScenery() {
  const buildingColors = [0x0f172a, 0x1f2937, 0x111827, 0x0b132b];
  const grid = 6;
  const spacing = 25;

  for (let x = -grid; x <= grid; x++) {
    for (let z = -grid; z <= grid; z++) {
      if (Math.abs(x) <= 1 && Math.abs(z) <= 1) continue;
      if (Math.abs(x) <= 2 && Math.abs(z) <= 2 && (x + z) % 2 === 0) continue;

      const height = 4 + Math.random() * 20;
      const width = 6 + Math.random() * 4;
      const depth = 6 + Math.random() * 4;

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: buildingColors[Math.floor(Math.random() * buildingColors.length)] })
      );
      building.position.set(x * spacing, height / 2, z * spacing);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
    }
  }
}

function spawnObstacles() {
  const colors = ['#facc15', '#f97316'];
  for (let i = 0; i < 20; i++) {
    const obstacle = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.4, 5, 12),
      new THREE.MeshStandardMaterial({ color: colors[i % colors.length] })
    );
    obstacle.position.set(
      THREE.MathUtils.randFloatSpread(world.boundaries.x * 0.8),
      2.5,
      THREE.MathUtils.randFloatSpread(world.boundaries.z * 0.8)
    );
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    scene.add(obstacle);

    world.obstacles.push({ mesh: obstacle, box: new THREE.Box3().setFromObject(obstacle) });
  }
}

function createPowerUp(type, color) {
  const geometry = new THREE.DodecahedronGeometry(2.2);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    metalness: 0.1,
    roughness: 0.3,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.position.set(
    THREE.MathUtils.randFloatSpread(180),
    4,
    THREE.MathUtils.randFloatSpread(180)
  );
  scene.add(mesh);

  return {
    mesh,
    type,
    active: true,
    timer: 10,
  };
}

function spawnPowerUps() {
  const pool = [
    createPowerUp('boost', 0x00f5ff),
    createPowerUp('score', 0xff6584),
    createPowerUp('boost', 0x8ef77c),
  ];
  world.powerups.push(...pool);
}

buildRoadGrid();
buildCityScenery();
spawnObstacles();
spawnPowerUps();

// Lighting
const hemi = new THREE.HemisphereLight(0xd9fbff, 0x0a0f1c, 0.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3d6, 1.1);
sun.position.set(120, 220, 80);
sun.castShadow = true;
sun.shadow.camera.left = -200;
sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;
scene.add(sun);

// --- Car creation --------------------------------------------------------
function buildCar(color) {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.4 });
  const detailMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 8), bodyMaterial);
  body.position.y = 1.5;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 3.5), new THREE.MeshStandardMaterial({ color: 0x3c4a6b, metalness: 0.6, roughness: 0.2 }));
  cabin.position.set(0, 2.2, -0.8);
  cabin.castShadow = true;
  group.add(cabin);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 0.6), detailMaterial);
  bumper.position.set(0, 1, 4.2);
  group.add(bumper);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 1.4), detailMaterial);
  spoiler.position.set(0, 2.1, -3.8);
  group.add(spoiler);

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(1, 1, 0.8, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const offset of [
    [1.8, 0.8, 3],
    [-1.8, 0.8, 3],
    [1.8, 0.8, -3],
    [-1.8, 0.8, -3],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, detailMaterial);
    wheel.position.set(offset[0], offset[1], offset[2]);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  group.position.set(0, 1, 0);
  group.castShadow = true;
  group.receiveShadow = true;

  return { group, wheels, bodyMaterial };
}

const playerCar = buildCar(0xff6b6b);
scene.add(playerCar.group);

const playerState = {
  mesh: playerCar.group,
  wheels: playerCar.wheels,
  velocity: 0,
  steering: 0,
  stats: {
    maxSpeed: 120,
    reverseSpeed: 35,
    engineForce: 28,
    brakeForce: 40,
    turnResponse: 1.6,
  },
  boostTimer: 0,
  driftFactor: 0,
  bodyMaterial: playerCar.bodyMaterial,
};

function resetCarPosition() {
  playerState.mesh.position.set(0, 1.2, 0);
  playerState.mesh.rotation.set(0, 0, 0);
  playerState.velocity = 0;
  playerState.steering = 0;
}

// AI traffic
function spawnAICars() {
  const colors = [0x5eead4, 0x60a5fa, 0xfbbf24, 0xa5b4fc, 0x4ade80, 0xf472b6];
  for (let i = 0; i < 8; i++) {
    const car = buildCar(colors[i % colors.length]);
    car.group.position.set(
      THREE.MathUtils.randFloatSpread(200),
      1.2,
      THREE.MathUtils.randFloatSpread(200)
    );
    car.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(car.group);

    const ai = {
      mesh: car.group,
      wheels: car.wheels,
      speed: THREE.MathUtils.randFloat(25, 50),
      direction: Math.random() > 0.5 ? 1 : -1,
      axis: Math.random() > 0.5 ? 'x' : 'z',
      laneOffset: THREE.MathUtils.randFloatSpread(10),
      bounce: 0,
    };
    world.aiCars.push(ai);
  }
}

spawnAICars();

// --- Camera ----------------------------------------------------------------
const CAMERA_MODES = ['chase', 'cockpit', 'drone'];
let cameraModeIndex = 0;

function cycleCamera() {
  cameraModeIndex = (cameraModeIndex + 1) % CAMERA_MODES.length;
}

cameraButton.addEventListener('click', cycleCamera);

function updateCamera(dt) {
  const mode = CAMERA_MODES[cameraModeIndex];
  const target = new THREE.Vector3();
  playerState.mesh.getWorldPosition(target);

  if (mode === 'chase') {
    const behindOffset = new THREE.Vector3(0, 3.2, 8.5);
    behindOffset.applyQuaternion(playerState.mesh.quaternion);
    behindOffset.y = 4;
    const desired = target.clone().add(behindOffset.negate());
    camera.position.lerp(desired, 1 - Math.exp(-5 * dt));
  } else if (mode === 'cockpit') {
    const cockpit = new THREE.Vector3(0, 2.2, 1.5).applyQuaternion(playerState.mesh.quaternion);
    camera.position.copy(target.clone().add(cockpit));
  } else {
    const drone = target.clone().add(new THREE.Vector3(0, 26, 0));
    camera.position.lerp(drone, 1 - Math.exp(-2 * dt));
  }

  const lookAhead = new THREE.Vector3(0, 2, -8).applyQuaternion(playerState.mesh.quaternion);
  camera.lookAt(target.clone().add(lookAhead));
}

// --- HUD + scoring --------------------------------------------------------
const raceState = {
  distance: 0,
  score: 0,
  lastLapStart: performance.now(),
  bestLap: null,
  nextLapTarget: 500,
};

function updateHUD() {
  const speedKmh = Math.max(0, playerState.velocity) * 3.6;
  speedValue.textContent = `${speedKmh.toFixed(0)} km/h`;
  distanceValue.textContent = `${raceState.distance.toFixed(0)} m`;
  scoreValue.textContent = raceState.score.toFixed(0);
  lapValue.textContent = raceState.bestLap ? `${(raceState.bestLap / 1000).toFixed(2)} s` : '--';
  powerupValue.textContent = playerState.boostTimer > 0 ? `Boost ${playerState.boostTimer.toFixed(1)}s` : 'None';
}

function handleLapProgress(deltaDistance) {
  raceState.distance += Math.max(0, deltaDistance);
  if (raceState.distance >= raceState.nextLapTarget) {
    const now = performance.now();
    const lapTime = now - raceState.lastLapStart;
    if (!raceState.bestLap || lapTime < raceState.bestLap) {
      raceState.bestLap = lapTime;
    }
    raceState.score += 120;
    raceState.lastLapStart = now;
    raceState.nextLapTarget += 500;
  }
}

// --- Physics helpers ------------------------------------------------------
const forwardVector = new THREE.Vector3();
const scratch = new THREE.Vector3();
const playerBox = new THREE.Box3();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updatePlayerCar(dt) {
  const stats = playerState.stats;
  let acceleration = 0;
  if (controls.accelerate) acceleration += stats.engineForce;
  if (controls.brake) acceleration -= stats.brakeForce;
  if (controls.boost && playerState.boostTimer > 0) {
    acceleration += stats.engineForce * 0.5;
  }

  playerState.velocity += acceleration * dt;

  // Passive drag
  const drag = controls.accelerate || controls.brake ? 0.6 : 1.4;
  if (playerState.velocity > 0) {
    playerState.velocity = Math.max(0, playerState.velocity - drag * dt * 10);
  } else if (playerState.velocity < 0) {
    playerState.velocity = Math.min(0, playerState.velocity + drag * dt * 10);
  }

  const maxSpeed = stats.maxSpeed * (playerState.boostTimer > 0 ? 1.4 : 1);
  playerState.velocity = clamp(playerState.velocity, -stats.reverseSpeed, maxSpeed);

  const turnInput = (controls.left ? 1 : 0) - (controls.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(playerState.velocity) / stats.maxSpeed, 0, 1);
  playerState.steering = clamp(
    playerState.steering + turnInput * stats.turnResponse * dt,
    -0.9,
    0.9
  );
  playerState.steering *= 0.92;
  playerState.mesh.rotation.y += playerState.steering * speedFactor;

  forwardVector.set(0, 0, -1).applyQuaternion(playerState.mesh.quaternion);
  playerState.mesh.position.addScaledVector(forwardVector, playerState.velocity * dt);

  playerState.wheels.forEach((wheel) => {
    wheel.rotation.x -= playerState.velocity * dt * 0.8;
  });

  if (playerState.boostTimer > 0) {
    playerState.boostTimer = Math.max(0, playerState.boostTimer - dt);
    const glow = 0.6 + Math.sin(performance.now() * 0.01) * 0.2;
    playerState.bodyMaterial.emissive = new THREE.Color(glow, glow / 2, glow / 3);
  } else {
    playerState.bodyMaterial.emissive = new THREE.Color(0, 0, 0);
  }

  handleWorldBounds();
  updatePlayerCollisions();
  handlePowerUps(dt);
}

function handleWorldBounds() {
  const pos = playerState.mesh.position;
  const bounce = 0.4;
  if (Math.abs(pos.x) > world.boundaries.x) {
    pos.x = clamp(pos.x, -world.boundaries.x, world.boundaries.x);
    playerState.velocity *= -bounce;
  }
  if (Math.abs(pos.z) > world.boundaries.z) {
    pos.z = clamp(pos.z, -world.boundaries.z, world.boundaries.z);
    playerState.velocity *= -bounce;
  }
}

function updatePlayerCollisions() {
  playerBox.setFromObject(playerState.mesh);

  world.obstacles.forEach((obstacle) => {
    if (playerBox.intersectsBox(obstacle.box)) {
      scratch.subVectors(playerState.mesh.position, obstacle.mesh.position).setY(0).normalize();
      playerState.mesh.position.addScaledVector(scratch, 2.5);
      playerState.velocity *= -0.35;
      raceState.score = Math.max(0, raceState.score - 10);
    }
  });

  world.aiCars.forEach((ai) => {
    const aiBox = new THREE.Box3().setFromObject(ai.mesh);
    if (playerBox.intersectsBox(aiBox)) {
      scratch.subVectors(playerState.mesh.position, ai.mesh.position).setY(0).normalize();
      playerState.mesh.position.addScaledVector(scratch, 1.5);
      ai.mesh.position.addScaledVector(scratch.negate(), 1.5);
      playerState.velocity *= -0.3;
      ai.speed *= 0.8;
      raceState.score = Math.max(0, raceState.score - 5);
    }
  });
}

function handlePowerUps(dt) {
  world.powerups.forEach((powerup) => {
    if (!powerup.active) return;
    powerup.mesh.rotation.y += 0.8 * dt;
    const distance = powerup.mesh.position.distanceTo(playerState.mesh.position);
    if (distance < 4) {
      powerup.active = false;
      scene.remove(powerup.mesh);
      if (powerup.type === 'boost') {
        playerState.boostTimer = 6;
      } else {
        raceState.score += 80;
      }
    }
  });
}

function updateAICars(dt) {
  world.aiCars.forEach((ai) => {
    const direction = ai.direction * dt * ai.speed;
    if (ai.axis === 'x') {
      ai.mesh.position.x += direction;
      ai.mesh.position.z = Math.sin(ai.mesh.position.x * 0.01) * 10 + ai.laneOffset;
      if (Math.abs(ai.mesh.position.x) > world.boundaries.x) {
        ai.direction *= -1;
        ai.mesh.rotation.y += Math.PI;
      }
    } else {
      ai.mesh.position.z += direction;
      ai.mesh.position.x = Math.cos(ai.mesh.position.z * 0.01) * 10 + ai.laneOffset;
      if (Math.abs(ai.mesh.position.z) > world.boundaries.z) {
        ai.direction *= -1;
        ai.mesh.rotation.y += Math.PI;
      }
    }

    ai.wheels.forEach((wheel) => {
      wheel.rotation.x -= direction * 0.1;
    });

    const pulse = (Math.sin(performance.now() * 0.003 + ai.mesh.position.x) + 1) * 0.05;
    ai.mesh.position.y = 1.1 + pulse;
  });
}

// --- Main loop ------------------------------------------------------------
const clock = new THREE.Clock();

function resizeRendererToDisplaySize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  requestAnimationFrame(animate);
  resizeRendererToDisplaySize();

  const dt = Math.min(clock.getDelta(), 0.05);
  updatePlayerCar(dt);
  updateAICars(dt);
  updateCamera(dt);
  handleLapProgress(Math.abs(playerState.velocity) * dt);
  raceState.score += Math.abs(playerState.velocity) * dt * (controls.left || controls.right ? 0.4 : 0.2);
  updateHUD();

  renderer.render(scene, camera);
}

animate();
