/**
 * Multiplayer game loop — parallel to singleplayer startGame()
 */
import * as THREE from 'three';
import { createTrackMesh, getGroundHeight, CELL_SIZE } from './track.js';
import { createKart, updateKartFrame } from './kart.js';
import { InputManager } from './input.js';
import { KART_DEFAULTS } from './physics.js';
import { CameraController } from './camera.js';
import { loadMap } from './map-loader.js';
import { RaceHUD } from './hud.js';
import { createBoostPads } from './boost-pad.js';
import { createItemBoxes } from './item-boxes.js';
import { createSkidMarks } from './skid-marks.js';
import { createBoostVisuals } from './boost-visual.js';
import { createTNTSystem } from './tnt.js';
import { createMissileSystem } from './missile.js';
import { createStartLine } from './start-line.js';
import { updateKartVisuals } from './kart-visuals.js';
import { GameClient } from './net/game-client.js';
import { InterpolationBuffer } from './net/interpolation.js';
import { Prediction } from './net/prediction.js';

/**
 * Start the multiplayer game loop
 */
export async function startMultiplayerGame({ renderer, input, connection, initData, onExit }) {
  const { mapId, playerId, kartAssignments, spawnPositions, spawnAngle } = initData;

  // Load map
  const mapData = await loadMap(mapId);

  // Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

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

  // Extract obstacles
  const obstacles = [];
  track.traverse((child) => {
    if (child.isMesh && child.userData.isObstacle) {
      obstacles.push({
        position: { x: child.position.x, y: child.position.y, z: child.position.z },
        halfExtents: { x: child.userData.halfExtents.x, y: child.userData.halfExtents.y, z: child.userData.halfExtents.z },
      });
    }
  });

  // Start line
  const startLine = createStartLine(mapData);
  if (startLine) scene.add(startLine);

  // Boost pads + item boxes (visual only — server handles logic)
  const boostPads = createBoostPads(mapData);
  for (const mesh of boostPads.meshes) scene.add(mesh);
  const itemBoxes = createItemBoxes(mapData);
  for (const mesh of itemBoxes.meshes) scene.add(mesh);

  // Create karts for all assignments
  const kartMap = new Map(); // id → { kart, isLocal }
  const allKarts = [];
  let localKart = null;

  for (const assignment of kartAssignments) {
    const kart = createKart(assignment.kartIndex);
    const sp = spawnPositions[assignment.slot];
    kart.position.set(sp.x, sp.y, sp.z);
    kart.rotation.y = spawnAngle;
    scene.add(kart);
    scene.add(kart.userData.shadow);

    // Init kart state
    kart.userData.velocity = new THREE.Vector3();
    kart.userData.speed = 0;
    kart.userData.steerAngle = 0;
    kart.userData.grounded = false;
    kart.userData.stats = { ...KART_DEFAULTS };
    kart.userData.spawnPoint = { x: sp.x, y: sp.y, z: sp.z };
    kart.userData.slideActive = false;
    kart.userData.slideButton = null;
    kart.userData.slideDir = 0;
    kart.userData.slideAngle = 0;
    kart.userData.slideTimer = 0;
    kart.userData.slideBoosts = 0;
    kart.userData.boostTimer = 0;
    kart.userData.boostSpeed = 0;
    kart.userData.heldItem = null;

    const isLocal = assignment.playerId === playerId;
    kartMap.set(assignment.playerId, { kart, isLocal });
    allKarts.push(kart);

    if (isLocal) {
      localKart = kart;
    }
  }

  // Visuals
  const skidMarks = createSkidMarks(allKarts);
  for (const mesh of skidMarks.meshes) scene.add(mesh);
  const boostVisuals = createBoostVisuals(allKarts);
  for (const mesh of boostVisuals.meshes) scene.add(mesh);
  const tntSystem = createTNTSystem(scene);
  const missileSystem = createMissileSystem(scene);

  // Camera
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2000);
  const cameraCtrl = new CameraController(camera, localKart);

  // Finish line for HUD
  let spawnX = 0, spawnZ = 0;
  if (mapData.start) {
    spawnX = (mapData.start.x - mapData.width / 2) * mapData.scale * CELL_SIZE;
    spawnZ = (mapData.start.y - mapData.height / 2) * mapData.scale * CELL_SIZE;
  }
  const finishLine = {
    x: spawnX,
    z: spawnZ,
    nx: -Math.sin(spawnAngle),
    nz: -Math.cos(spawnAngle),
  };

  // HUD
  const hud = new RaceHUD();
  hud.updateLap(1, 3);
  hud.updatePosition(1);
  hud.setupMinimap(mapData, finishLine);

  // Networking
  const gameClient = new GameClient(connection);
  const interpBuffer = new InterpolationBuffer();
  const prediction = new Prediction(obstacles);

  gameClient.onSnapshot = (snapshot) => {
    interpBuffer.push(snapshot);
  };

  // Events
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  let exitRequested = false;
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      exitRequested = true;
    }
  };
  window.addEventListener('keydown', onKeyDown);

  // Game loop
  let lastTime = performance.now();
  let animFrame = null;
  let finishTimer = -1;
  const FINISH_DELAY = 5;
  let latestRace = null;

  function gameLoop(now) {
    animFrame = requestAnimationFrame(gameLoop);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (exitRequested) {
      cleanup();
      onExit();
      return;
    }

    // 1. Poll input
    input.poll();

    // 2. Send input to server (rate-limited)
    gameClient.maybeSendInput(input, now);

    // 3. Prediction: apply local physics for instant feedback + blend corrections
    if (localKart) {
      prediction.applyLocal(localKart, input, dt);
    }

    // 4. Check for new server snapshot → compare with prediction
    const rawSnap = interpBuffer.getLatestForReconciliation();
    if (rawSnap && localKart) {
      const localState = rawSnap.karts.find(k => k.id === playerId);
      if (localState) {
        prediction.onServerState(localKart, localState);
      }
    }

    // 5. Get interpolated state for remote karts + events + race HUD
    const interpState = interpBuffer.getInterpolatedState();

    if (interpState) {
      // Apply interpolated positions to remote karts only
      for (const kartState of interpState.karts) {
        const entry = kartMap.get(kartState.id);
        if (!entry || entry.isLocal) continue;

        const kart = entry.kart;
        kart.position.set(kartState.x, kartState.y, kartState.z);
        kart.rotation.y = kartState.ry;
        kart.userData.speed = kartState.speed;
        kart.userData.steerAngle = kartState.steerAngle;
        kart.userData.slideActive = kartState.slideActive;
        kart.userData.slideDir = kartState.slideDir;
        kart.userData.slideAngle = kartState.slideAngle;
        kart.userData.boostSpeed = kartState.boostSpeed;
        kart.userData.boostTimer = kartState.boostTimer;
        kart.userData.grounded = kartState.grounded;
        kart.userData.heldItem = kartState.heldItem;
      }

      // Handle events (fired exactly once per event)
      for (const evt of interpState.events) {
        handleEvent(evt);
      }

      // Race state for HUD
      if (interpState.race) {
        latestRace = interpState.race;
      }
    }

    // HUD from latest race state
    if (latestRace) {
      hud.updateCountdown(latestRace.countdownValue);
      const myRacer = latestRace.racers.find(r => r.kartId === playerId);
      if (myRacer) {
        if (myRacer.finished && finishTimer < 0) {
          finishTimer = FINISH_DELAY;
        }
        hud.updateLap(myRacer.lap, 3);
        hud.updatePosition(myRacer.position);
        hud.updateWrongWay(myRacer.wrongWay);
      }
    }

    // Finish countdown
    if (finishTimer >= 0) {
      finishTimer -= dt;
      const myRacer = latestRace?.racers?.find(r => r.kartId === playerId);
      if (myRacer) {
        hud.showFinish(myRacer.position, Math.ceil(Math.max(0, finishTimer)));
      }
      cameraCtrl.update(dt, input);
      renderer.render(scene, camera);
      if (finishTimer <= 0) {
        cleanup();
        onExit();
        return;
      }
      return;
    }

    // 6. Update visual-only item systems (missiles move, TNTs tick lifetime)
    //    Pass empty array for collision so they don't modify kart state.
    tntSystem.update([], dt);
    missileSystem.update([], dt);

    // 7. Camera follows local kart
    cameraCtrl.update(dt, input);

    // 8. Sprite frame updates
    for (const [id, entry] of kartMap) {
      const inputForFrame = entry.isLocal ? input : { steer: entry.kart.userData.steerAngle };
      updateKartFrame(entry.kart, camera, inputForFrame);
    }

    // 9. Kart visuals
    for (const kart of allKarts) {
      updateKartVisuals(kart, camera);
    }

    // 10. Visual effects
    skidMarks.update(allKarts, dt);
    boostVisuals.update(allKarts, dt);

    // 11. Render
    renderer.render(scene, camera);

    // 12. HUD extras
    if (localKart) {
      hud.updateBoost(localKart.userData);
      hud.updateItem(localKart.userData.heldItem);
    }
    hud.updateMinimap(allKarts, localKart);
  }

  function handleEvent(evt) {
    switch (evt.type) {
      case 'tnt_place': {
        const entry = kartMap.get(evt.kartId);
        if (entry) tntSystem.place(entry.kart);
        break;
      }
      case 'tnt_detonate': {
        // Server handled the explosion — TNT visual will auto-despawn via lifetime
        break;
      }
      case 'missile_fire': {
        const entry = kartMap.get(evt.kartId);
        if (entry) missileSystem.fire(entry.kart, allKarts);
        break;
      }
      case 'missile_hit': {
        // Server handled the hit — missile visual will auto-despawn via lifetime
        break;
      }
    }
  }

  animFrame = requestAnimationFrame(gameLoop);

  function cleanup() {
    if (animFrame) cancelAnimationFrame(animFrame);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyDown);
    hud.destroy();
    boostVisuals.destroy();
    tntSystem.destroy();
    missileSystem.destroy();
    gameClient.destroy();
  }

  return cleanup;
}
