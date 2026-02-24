import * as THREE from 'three';
import { createTrackMesh, getGroundHeight, CELL_SIZE } from './track.js';
import { createKart, updateKartFrame } from './kart.js';
import { InputManager } from './input.js';
import { KartPhysics, KART_DEFAULTS } from './physics.js';
import { CameraController } from './camera.js';
import { DebugGraph } from './debug.js';
import { listMaps, loadMap } from './map-loader.js';
import { createMenu } from './menu.js';

// --- Persistent singletons ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const input = new InputManager();
const debug = new DebugGraph();

let gameCleanup = null;
let cachedMaps = [];

// --- Menu ---
const menu = createMenu(selectMap);

async function init() {
  try {
    cachedMaps = await listMaps();
    menu.showMaps(cachedMaps);
  } catch (e) {
    console.error('Failed to list maps:', e);
  }
}

async function selectMap(mapId) {
  menu.showLoading(mapId);

  if (gameCleanup) {
    gameCleanup();
    gameCleanup = null;
  }

  try {
    const mapData = await loadMap(mapId);
    menu.hide();
    startGame(mapData);
  } catch (e) {
    console.error('Failed to load map:', e);
    menu.showMaps(cachedMaps);
  }
}

function returnToMenu() {
  if (gameCleanup) {
    gameCleanup();
    gameCleanup = null;
  }
  renderer.clear();
  menu.show();
  menu.showMaps(cachedMaps);
}

// --- Game ---
function startGame(mapData) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  // No fog — let the whole map be visible

  // Lighting
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 250;
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x88aacc, 0.6));

  // Track
  const track = createTrackMesh(mapData);
  scene.add(track);

  // Player kart
  const kart = createKart();
  scene.add(kart);

  // Spawn position from map start or center
  let spawnX = 0, spawnZ = 0, spawnAngle = 0;
  if (mapData.start) {
    spawnX = (mapData.start.x - mapData.width / 2) * mapData.scale * CELL_SIZE;
    spawnZ = (mapData.start.y - mapData.height / 2) * mapData.scale * CELL_SIZE;
    spawnAngle = mapData.start.angle || 0;
  }
  const spawnY = getGroundHeight(spawnX, spawnZ) + 1;
  kart.position.set(spawnX, spawnY, spawnZ);
  kart.rotation.y = spawnAngle;

  // Shadow
  scene.add(kart.userData.shadow);

  // Camera
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
  const cameraCtrl = new CameraController(camera, kart);

  // Physics
  const physics = new KartPhysics(track);

  // Game state
  kart.userData.velocity = new THREE.Vector3();
  kart.userData.speed = 0;
  kart.userData.steerAngle = 0;
  kart.userData.grounded = false;
  kart.userData.stats = { ...KART_DEFAULTS };
  kart.userData.spawnPoint = { x: spawnX, y: spawnY, z: spawnZ };
  // Power slide state
  kart.userData.slideActive = false;
  kart.userData.slideButton = null;
  kart.userData.slideDir = 0;
  kart.userData.slideAngle = 0;
  kart.userData.slideTimer = 0;
  kart.userData.slideBoosts = 0;
  kart.userData.boostTimer = 0;
  kart.userData.boostSpeed = 0;

  // Set up checkpoint direction tracking
  if (mapData.checkpoints && mapData.checkpoints.length >= 2) {
    const worldCPs = mapData.checkpoints.map(cp => ({
      x: (cp.x - mapData.width / 2) * mapData.scale * CELL_SIZE,
      z: (cp.y - mapData.height / 2) * mapData.scale * CELL_SIZE,
    }));
    debug.setCheckpoints(worldCPs);
  } else {
    debug.setCheckpoints([]);
  }

  // Event handlers
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') returnToMenu();
  };
  window.addEventListener('keydown', onKeyDown);

  // Game loop
  let lastTime = performance.now();
  let animFrame = null;

  function gameLoop(now) {
    animFrame = requestAnimationFrame(gameLoop);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    physics.update(kart, input, dt, camera);
    cameraCtrl.update(dt, input);
    updateKartFrame(kart, camera, input);
    renderer.render(scene, camera);

    // Debug: velocity/position graph + direction + slide meter
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.quaternion);
    debug.updateDirection(kart.position.x, kart.position.z, fwd.x, fwd.z);
    debug.updateSlide(kart.userData);
    debug.push(kart.userData.velocity.y, kart.position.y, kart.userData.speed);
    debug.draw();
  }

  animFrame = requestAnimationFrame(gameLoop);

  gameCleanup = () => {
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
  };
}

init();
