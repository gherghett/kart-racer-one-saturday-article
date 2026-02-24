import * as THREE from 'three';
import { createTrackMesh, getGroundHeight, CELL_SIZE } from './track.js';
import { createKart, updateKartFrame } from './kart.js';
import { InputManager } from './input.js';
import { KartPhysics, KART_DEFAULTS } from './physics.js';
import { CameraController } from './camera.js';
import { DebugGraph } from './debug.js';
import { listMaps, loadMap } from './map-loader.js';
import { createMenu } from './menu.js';
import { BotInput, BotController } from './bot-input.js';
import { RaceManager } from './race.js';
import { resolveKartCollisions } from './kart-collision.js';
import { createStartLine } from './start-line.js';
import { RaceHUD } from './hud.js';
import { createBoostPads } from './boost-pad.js';
import { createItemBoxes } from './item-boxes.js';
import { createSkidMarks } from './skid-marks.js';
import { createBoostVisuals } from './boost-visual.js';
import { createTNTSystem } from './tnt.js';
import { createMissileSystem } from './missile.js';
import { updateKartVisuals } from './kart-visuals.js';
import { Connection } from './net/connection.js';
import { LobbyClient } from './net/lobby-client.js';
import { createLobbyUI } from './lobby-ui.js';
import { startMultiplayerGame } from './multiplayer-game.js';

// --- Persistent singletons ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const input = new InputManager();
const debug = new DebugGraph();
let debugVisible = false;
debug.canvas.style.display = 'none';

let gameCleanup = null;
let cachedMaps = [];

// --- Menu ---
const menu = createMenu(selectMap, enterMultiplayer);

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

// --- Helper: init kart game state ---
function initKartState(kart, sx, sy, sz) {
  kart.userData.velocity = new THREE.Vector3();
  kart.userData.speed = 0;
  kart.userData.steerAngle = 0;
  kart.userData.grounded = false;
  kart.userData.stats = { ...KART_DEFAULTS };
  kart.userData.spawnPoint = { x: sx, y: sy, z: sz };
  kart.userData.slideActive = false;
  kart.userData.slideButton = null;
  kart.userData.slideDir = 0;
  kart.userData.slideAngle = 0;
  kart.userData.slideTimer = 0;
  kart.userData.slideBoosts = 0;
  kart.userData.boostTimer = 0;
  kart.userData.boostSpeed = 0;
  kart.userData.heldItem = null;
}

function activateItem(kart, tntSystem, missileSystem, allKarts) {
  const item = kart.userData.heldItem;
  kart.userData.heldItem = null;

  switch (item) {
    case 'boost':
      kart.userData.boostSpeed = 15;
      kart.userData.boostTimer = 1.6;
      break;
    case 'tnt':
      tntSystem.place(kart);
      break;
    case 'missile':
      missileSystem.fire(kart, allKarts);
      break;
  }
}

// --- Game ---
function startGame(mapData) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

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

  // Extract obstacle data for physics (plain objects, no Three.js dependency)
  const obstacles = [];
  track.traverse((child) => {
    if (child.isMesh && child.userData.isObstacle) {
      obstacles.push({
        position: { x: child.position.x, y: child.position.y, z: child.position.z },
        halfExtents: { x: child.userData.halfExtents.x, y: child.userData.halfExtents.y, z: child.userData.halfExtents.z },
      });
    }
  });

  // Start/finish line
  const startLine = createStartLine(mapData);
  if (startLine) scene.add(startLine);

  // Boost pads
  const boostPads = createBoostPads(mapData);
  for (const mesh of boostPads.meshes) scene.add(mesh);

  // Item boxes
  const itemBoxes = createItemBoxes(mapData);
  for (const mesh of itemBoxes.meshes) scene.add(mesh);

  // World checkpoints
  let worldCPs = [];
  if (mapData.checkpoints && mapData.checkpoints.length >= 2) {
    worldCPs = mapData.checkpoints.map(cp => ({
      x: (cp.x - mapData.width / 2) * mapData.scale * CELL_SIZE,
      z: (cp.y - mapData.height / 2) * mapData.scale * CELL_SIZE,
    }));
  }
  debug.setCheckpoints(worldCPs);

  // Spawn position from map start or center
  let spawnX = 0, spawnZ = 0, spawnAngle = 0;
  if (mapData.start) {
    spawnX = (mapData.start.x - mapData.width / 2) * mapData.scale * CELL_SIZE;
    spawnZ = (mapData.start.y - mapData.height / 2) * mapData.scale * CELL_SIZE;
    // Map editor stores atan2(dy,dx) where 0=+X; convert to Three.js rotation.y where 0=-Z
    spawnAngle = -(mapData.start.angle || 0) - Math.PI / 2;
  }

  // Grid offsets: perpendicular and parallel to start angle
  const perpX = Math.cos(spawnAngle);
  const perpZ = -Math.sin(spawnAngle);
  const paraX = -Math.sin(spawnAngle);
  const paraZ = -Math.cos(spawnAngle);
  const LATERAL = 3;
  const FORWARD = 4;

  // Grid positions: [lateral offset, forward offset]
  // Player front-left, Bot1 front-right, Bot2 back-left, Bot3 back-right
  const gridSlots = [
    [-LATERAL, 0],           // player: front-left
    [LATERAL, 0],            // bot 1: front-right
    [-LATERAL, -FORWARD],    // bot 2: back-left
    [LATERAL, -FORWARD],     // bot 3: back-right
  ];

  // Player kart (kartIndex 1)
  const kart = createKart(1);
  const playerSlot = gridSlots[0];
  const psx = spawnX + perpX * playerSlot[0] + paraX * playerSlot[1];
  const psz = spawnZ + perpZ * playerSlot[0] + paraZ * playerSlot[1];
  const psy = getGroundHeight(psx, psz) + 1;
  kart.position.set(psx, psy, psz);
  kart.rotation.y = spawnAngle;
  scene.add(kart);
  scene.add(kart.userData.shadow);
  initKartState(kart, psx, psy, psz);

  // Player physics
  const playerPhysics = new KartPhysics(obstacles);

  // Bot karts
  const botKartIndices = [0, 2, 0];
  const bots = [];
  const allKarts = [kart];

  for (let i = 0; i < 3; i++) {
    const botKart = createKart(botKartIndices[i]);
    const slot = gridSlots[i + 1];
    const bx = spawnX + perpX * slot[0] + paraX * slot[1];
    const bz = spawnZ + perpZ * slot[0] + paraZ * slot[1];
    const by = getGroundHeight(bx, bz) + 1;
    botKart.position.set(bx, by, bz);
    botKart.rotation.y = spawnAngle;
    scene.add(botKart);
    scene.add(botKart.userData.shadow);
    initKartState(botKart, bx, by, bz);

    const botInput = new BotInput();
    const botPhysics = new KartPhysics(obstacles);
    const botCtrl = new BotController(botKart, botInput, worldCPs);

    bots.push({ kart: botKart, input: botInput, physics: botPhysics, controller: botCtrl });
    allKarts.push(botKart);
  }

  // Skid marks + boost visuals
  const skidMarks = createSkidMarks(allKarts);
  for (const mesh of skidMarks.meshes) scene.add(mesh);

  const boostVisuals = createBoostVisuals(allKarts);
  for (const mesh of boostVisuals.meshes) scene.add(mesh);

  // TNT + missile systems
  const tntSystem = createTNTSystem(scene);
  const missileSystem = createMissileSystem(scene);

  // Camera
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
  const cameraCtrl = new CameraController(camera, kart);

  // Finish line: perpendicular to start direction, at spawn position
  // Normal points in the race-forward direction (the way karts face at start)
  const finishLine = {
    x: spawnX,
    z: spawnZ,
    nx: -Math.sin(spawnAngle),
    nz: -Math.cos(spawnAngle),
  };

  // Race manager
  const racers = [
    { kart, isPlayer: true },
    ...bots.map(b => ({ kart: b.kart, isPlayer: false })),
  ];
  const race = new RaceManager(worldCPs, racers, finishLine);

  // HUD
  const hud = new RaceHUD();
  hud.updateLap(1, race.totalLaps);
  hud.updatePosition(1);
  hud.setupMinimap(mapData, finishLine);

  // Event handlers
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') returnToMenu();
    if (e.key === 'F3') {
      e.preventDefault();
      debugVisible = !debugVisible;
      debug.canvas.style.display = debugVisible ? 'block' : 'none';
    }
    // Debug: F4 = skip to last lap
    if (e.key === 'F4' && debugVisible) {
      e.preventDefault();
      const ps = race.getPlayerState();
      if (ps && !ps.finished) {
        ps.lap = race.totalLaps;
        ps.cpThisLap = race.checkpoints.length;
      }
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // Game loop
  let lastTime = performance.now();
  let animFrame = null;
  let finishTimer = -1; // -1 = not finished yet
  const FINISH_DELAY = 5;

  function gameLoop(now) {
    animFrame = requestAnimationFrame(gameLoop);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Finish countdown → return to menu
    if (finishTimer >= 0) {
      finishTimer -= dt;
      const playerState = race.getPlayerState();
      hud.showFinish(playerState.position, Math.ceil(Math.max(0, finishTimer)));
      cameraCtrl.update(dt, input);
      renderer.render(scene, camera);
      if (finishTimer <= 0) {
        returnToMenu();
        return;
      }
      return;
    }

    // 1. Race state (countdown, checkpoints, positions)
    race.update(dt);

    // 2. Countdown HUD
    hud.updateCountdown(race.countdownValue);

    // 3. If not frozen: update physics for all karts
    if (!race.isFrozen()) {
      // Bot AI
      for (const bot of bots) {
        bot.controller.update(dt);
      }

      // Poll input before physics
      input.poll();

      // Player physics
      playerPhysics.update(kart, input, dt);

      // Bot physics
      for (const bot of bots) {
        bot.physics.update(bot.kart, bot.input, dt);
      }

      // Kart-to-kart collisions
      resolveKartCollisions(allKarts);

      // Boost pads
      boostPads.update(allKarts, dt);

      // Item boxes
      itemBoxes.update(allKarts, dt);

      // Item activation — player
      if (input.itemUseTap && kart.userData.heldItem) {
        activateItem(kart, tntSystem, missileSystem, allKarts);
      }
      // Item activation — bots
      for (const bot of bots) {
        if (bot.input.itemUseTap && bot.kart.userData.heldItem) {
          activateItem(bot.kart, tntSystem, missileSystem, allKarts);
        }
      }

      // TNT boxes + missiles
      tntSystem.update(allKarts, dt);
      missileSystem.update(allKarts, dt);
    } else {
      // During countdown: still poll input (to consume key events) but don't move
      input.poll();
    }

    // 4. Camera follows player
    cameraCtrl.update(dt, input);

    // 5. Sprite frame updates for all karts
    updateKartFrame(kart, camera, input);
    for (const bot of bots) {
      updateKartFrame(bot.kart, camera, bot.input);
    }

    // 5b. Kart visuals (shadows, occlusion)
    for (const k of allKarts) {
      updateKartVisuals(k, camera);
    }

    // 5c. Visual effects
    skidMarks.update(allKarts, dt);
    boostVisuals.update(allKarts, dt);

    // 6. Render
    renderer.render(scene, camera);

    // 7. HUD updates
    const playerState = race.getPlayerState();
    if (playerState) {
      // Check if player just finished
      if (playerState.finished && finishTimer < 0) {
        finishTimer = FINISH_DELAY;
        return;
      }
      hud.updateLap(playerState.lap, race.totalLaps);
      hud.updatePosition(playerState.position);
      hud.updateWrongWay(playerState.wrongWay);
    }
    hud.updateBoost(kart.userData);
    hud.updateItem(kart.userData.heldItem);
    hud.updateMinimap(allKarts, kart);

    // 8. Debug overlay (if visible)
    if (debugVisible) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.quaternion);
      debug.updateDirection(kart.position.x, kart.position.z, fwd.x, fwd.z);
      debug.updateSlide(kart.userData);
      debug.push(kart.userData.velocity.y, kart.position.y, kart.userData.speed);
      debug.draw();
    }
  }

  animFrame = requestAnimationFrame(gameLoop);

  gameCleanup = () => {
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    hud.destroy();
    boostVisuals.destroy();
    tntSystem.destroy();
    missileSystem.destroy();
  };
}

// --- Multiplayer ---
let mpConnection = null;
let mpLobbyUI = null;
let mpLobbyClient = null;

async function enterMultiplayer() {
  menu.hide();

  if (gameCleanup) {
    gameCleanup();
    gameCleanup = null;
  }

  // Connect to server
  mpConnection = new Connection();
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    await mpConnection.connect(`${wsProto}//${location.host}/ws`);
  } catch (e) {
    console.error('Failed to connect to game server:', e);
    returnToMenu();
    return;
  }

  // Create lobby UI
  mpLobbyUI = createLobbyUI(cachedMaps);
  mpLobbyUI.show();

  // Create lobby client
  mpLobbyClient = new LobbyClient(mpConnection);

  mpLobbyUI.setCallbacks({
    onCreate(name, mapId) {
      mpLobbyClient.createRoom(name, mapId);
    },
    onJoin(roomId) {
      mpLobbyClient.joinRoom(roomId);
    },
    onRefresh() {
      mpLobbyClient.listRooms();
    },
    onReady() {
      mpLobbyClient.toggleReady();
    },
    onLeave() {
      mpLobbyClient.leaveRoom();
      mpLobbyClient.listRooms();
    },
    onBack() {
      exitMultiplayer();
    },
  });

  mpLobbyClient.onRooms = (rooms) => {
    mpLobbyUI.updateRoomList(rooms);
  };

  mpLobbyClient.onJoined = (roomId) => {
    mpLobbyUI.showRoom(roomId, roomId);
  };

  mpLobbyClient.onUpdate = (players) => {
    mpLobbyUI.updatePlayers(players, mpConnection.playerId);
  };

  mpLobbyClient.onGameInit = async (initData) => {
    mpLobbyUI.hide();
    await startMultiplayerGame({
      renderer,
      input,
      connection: mpConnection,
      initData,
      onExit: exitMultiplayer,
    });
  };

  // Request room list
  mpLobbyClient.listRooms();
}

function exitMultiplayer() {
  if (mpLobbyClient) {
    mpLobbyClient.destroy();
    mpLobbyClient = null;
  }
  if (mpLobbyUI) {
    mpLobbyUI.destroy();
    mpLobbyUI = null;
  }
  if (mpConnection) {
    mpConnection.close();
    mpConnection = null;
  }
  returnToMenu();
}

init();
