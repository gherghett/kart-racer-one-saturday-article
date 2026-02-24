/**
 * GameRoom — server game loop: 60Hz tick, 20Hz snapshot broadcast
 */
import * as THREE from 'three';
import { TrackData, CELL_SIZE } from '../game/src/track.js';
import { KartPhysics, KART_DEFAULTS } from '../game/src/physics.js';
import { resolveKartCollisions } from '../game/src/kart-collision.js';
import { RaceManager } from '../game/src/race.js';
import { BotInput, BotController } from '../game/src/bot-input.js';
import { loadMap } from './server-map-loader.js';
import { createServerBoostPads } from './server-boost-pads.js';
import { createServerItemBoxes } from './server-items.js';
import { createServerTNTSystem } from './server-tnt.js';
import { createServerMissileSystem } from './server-missile.js';
const TICK_RATE = 60;
const SNAPSHOT_RATE = 20;
const TICK_DT = 1 / TICK_RATE;
const SNAPSHOT_INTERVAL = TICK_RATE / SNAPSHOT_RATE; // ticks between snapshots

export class GameRoom {
  constructor(id, name, mapId) {
    this.id = id;
    this.name = name;
    this.mapId = mapId;
    this.players = new Map(); // playerId → { ws, ready, slot }
    this.running = false;
    this.tickInterval = null;
    this.tick = 0;

    // Game state (populated on start)
    this.karts = [];
    this.allKartObjects = [];
    this.physics = [];
    this.bots = [];
    this.race = null;
    this.trackData = null;
    this.boostPads = null;
    this.itemBoxes = null;
    this.tntSystem = null;
    this.missileSystem = null;
    this.events = [];
    this.playerInputs = new Map(); // playerId → { seq, input }
    this.playerLastSeq = new Map(); // playerId → last ack seq
  }

  get playerCount() {
    return this.players.size;
  }

  addPlayer(playerId, ws) {
    const slot = this._nextSlot();
    this.players.set(playerId, { ws, ready: false, slot });
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    this.players.delete(playerId);

    if (this.running && player) {
      // Convert to bot
      const kartObj = this.karts.find(k => k.id === playerId);
      if (kartObj) {
        this._convertToBot(kartObj);
      }
    }
  }

  _nextSlot() {
    const used = new Set();
    for (const p of this.players.values()) used.add(p.slot);
    for (let i = 0; i < 4; i++) {
      if (!used.has(i)) return i;
    }
    return 0;
  }

  toggleReady(playerId) {
    const p = this.players.get(playerId);
    if (p) p.ready = !p.ready;
  }

  allReady() {
    for (const p of this.players.values()) {
      if (!p.ready) return false;
    }
    return true;
  }

  getPlayerList() {
    const list = [];
    for (const [id, p] of this.players) {
      list.push({ id, ready: p.ready, slot: p.slot });
    }
    return list;
  }

  async startGame() {
    this.running = true;

    const mapData = await loadMap(this.mapId);
    this.trackData = new TrackData(mapData);
    const obstacles = this.trackData.getObstacles();

    // Spawn positions
    let spawnX = 0, spawnZ = 0, spawnAngle = 0;
    if (mapData.start) {
      spawnX = (mapData.start.x - mapData.width / 2) * mapData.scale * CELL_SIZE;
      spawnZ = (mapData.start.y - mapData.height / 2) * mapData.scale * CELL_SIZE;
      spawnAngle = -(mapData.start.angle || 0) - Math.PI / 2;
    }

    const perpX = Math.cos(spawnAngle);
    const perpZ = -Math.sin(spawnAngle);
    const paraX = -Math.sin(spawnAngle);
    const paraZ = -Math.cos(spawnAngle);
    const LATERAL = 3;
    const FORWARD = 4;
    const gridSlots = [
      [-LATERAL, 0],
      [LATERAL, 0],
      [-LATERAL, -FORWARD],
      [LATERAL, -FORWARD],
    ];

    // World checkpoints
    const worldCPs = (mapData.checkpoints || []).map(cp => ({
      x: (cp.x - mapData.width / 2) * mapData.scale * CELL_SIZE,
      z: (cp.y - mapData.height / 2) * mapData.scale * CELL_SIZE,
    }));

    // Spawn positions for each slot
    const spawnPositions = gridSlots.map(([lat, fwd]) => {
      const sx = spawnX + perpX * lat + paraX * fwd;
      const sz = spawnZ + perpZ * lat + paraZ * fwd;
      const sy = this.trackData.getGroundHeight(sx, sz) + 1;
      return { x: sx, y: sy, z: sz };
    });

    // Create kart objects for players
    const kartAssignments = [];
    const kartIndices = [1, 0, 2, 0]; // default kart appearances

    // Assign players to their slots
    const playerEntries = [...this.players.entries()];
    for (const [playerId, pdata] of playerEntries) {
      const slot = pdata.slot;
      const sp = spawnPositions[slot];
      const kart = this._createServerKart(playerId, sp, spawnAngle, kartIndices[slot]);
      this.karts.push(kart);
      this.allKartObjects.push(kart);

      const phys = new KartPhysics(obstacles, this.trackData);
      this.physics.push({ kartId: playerId, physics: phys });

      kartAssignments.push({ playerId, slot, kartIndex: kartIndices[slot] });
    }

    // Fill remaining slots with bots
    const usedSlots = new Set(playerEntries.map(([, p]) => p.slot));
    for (let slot = 0; slot < 4; slot++) {
      if (usedSlots.has(slot)) continue;
      const botId = 'bot' + slot;
      const sp = spawnPositions[slot];
      const kart = this._createServerKart(botId, sp, spawnAngle, kartIndices[slot]);
      this.karts.push(kart);
      this.allKartObjects.push(kart);

      const phys = new KartPhysics(obstacles, this.trackData);
      this.physics.push({ kartId: botId, physics: phys });

      const botInput = new BotInput();
      const botCtrl = new BotController(kart, botInput, worldCPs);
      this.bots.push({ id: botId, kart, input: botInput, controller: botCtrl });

      kartAssignments.push({ playerId: botId, slot, kartIndex: kartIndices[slot], isBot: true });
    }

    // Finish line
    const finishLine = {
      x: spawnX,
      z: spawnZ,
      nx: -Math.sin(spawnAngle),
      nz: -Math.cos(spawnAngle),
    };

    // Race manager
    const racers = this.karts.map(k => ({
      kart: k,
      isPlayer: !k.id.startsWith('bot'),
    }));
    this.race = new RaceManager(worldCPs, racers, finishLine);

    // Item systems
    this.boostPads = createServerBoostPads(mapData, this.trackData);
    this.itemBoxes = createServerItemBoxes(mapData);
    this.tntSystem = createServerTNTSystem(this.trackData);
    this.missileSystem = createServerMissileSystem(this.trackData);

    // Send game:init to all players
    for (const [playerId, pdata] of this.players) {
      this._send(pdata.ws, {
        type: 'game:init',
        mapId: this.mapId,
        playerId,
        kartAssignments,
        spawnPositions,
        spawnAngle,
      });
    }

    // Start tick loop
    this.tick = 0;
    this.tickInterval = setInterval(() => this._tick(), 1000 / TICK_RATE);
  }

  handleInput(playerId, seq, input) {
    this.playerInputs.set(playerId, { seq, input });
    this.playerLastSeq.set(playerId, seq);
  }

  _createServerKart(id, sp, angle, kartIndex) {
    // Lightweight kart object matching the shape physics.js expects
    const kart = {
      id,
      kartIndex,
      position: new THREE.Vector3(sp.x, sp.y, sp.z),
      rotation: { y: angle },
      userData: {
        velocity: new THREE.Vector3(),
        speed: 0,
        steerAngle: 0,
        grounded: false,
        stats: { ...KART_DEFAULTS },
        spawnPoint: { x: sp.x, y: sp.y, z: sp.z },
        slideActive: false,
        slideButton: null,
        slideDir: 0,
        slideAngle: 0,
        slideTimer: 0,
        slideBoosts: 0,
        boostTimer: 0,
        boostSpeed: 0,
        heldItem: null,
      },
    };
    return kart;
  }

  _convertToBot(kart) {
    const worldCPs = this.race ? this.race.checkpoints : [];
    const botInput = new BotInput();
    const botCtrl = new BotController(kart, botInput, worldCPs);
    this.bots.push({ id: kart.id, kart, input: botInput, controller: botCtrl });
  }

  _tick() {
    const dt = TICK_DT;
    this.tick++;

    // 1. Race update
    this.race.update(dt);

    const frozen = this.race.isFrozen();

    if (!frozen) {
      // 2. Bot AI update
      for (const bot of this.bots) {
        bot.controller.update(dt);
      }

      // 3. Physics for each kart
      for (const { kartId, physics } of this.physics) {
        const kart = this.karts.find(k => k.id === kartId);
        if (!kart) continue;

        let input;
        const bot = this.bots.find(b => b.id === kartId);
        if (bot) {
          input = bot.input;
        } else {
          const stored = this.playerInputs.get(kartId);
          input = stored ? stored.input : { accel: 0, steer: 0, hopZ: false, hopX: false, hopZTap: false, hopXTap: false, itemUseTap: false };
        }

        physics.update(kart, input, dt);
      }

      // 4. Kart-to-kart collisions
      resolveKartCollisions(this.allKartObjects);

      // 5. Boost pad triggers
      const boostEvents = this.boostPads.update(this.allKartObjects, dt);
      this.events.push(...boostEvents);

      // 6. Item box pickups
      const itemEvents = this.itemBoxes.update(this.allKartObjects, dt);
      this.events.push(...itemEvents);

      // 7. Item activation
      for (const kart of this.allKartObjects) {
        let useTap = false;
        const bot = this.bots.find(b => b.id === kart.id);
        if (bot) {
          useTap = bot.input.itemUseTap;
        } else {
          const stored = this.playerInputs.get(kart.id);
          if (stored && stored.input.itemUseTap) useTap = true;
        }

        if (useTap && kart.userData.heldItem) {
          const item = kart.userData.heldItem;
          kart.userData.heldItem = null;

          switch (item) {
            case 'boost':
              kart.userData.boostSpeed = 15;
              kart.userData.boostTimer = 1.6;
              this.events.push({ type: 'item_use', kartId: kart.id, item: 'boost' });
              break;
            case 'tnt': {
              const evt = this.tntSystem.place(kart);
              this.events.push(evt);
              break;
            }
            case 'missile': {
              const evt = this.missileSystem.fire(kart, this.allKartObjects);
              this.events.push(evt);
              break;
            }
          }
        }
      }

      // 8. TNT update
      const tntEvents = this.tntSystem.update(this.allKartObjects, dt);
      this.events.push(...tntEvents);

      // 9. Missile update
      const missileEvents = this.missileSystem.update(this.allKartObjects, dt);
      this.events.push(...missileEvents);

      // 10. Clear one-frame tap flags from player inputs
      for (const [, stored] of this.playerInputs) {
        if (stored && stored.input) {
          stored.input.hopZTap = false;
          stored.input.hopXTap = false;
          stored.input.itemUseTap = false;
        }
      }
    }

    // Send snapshot at 20Hz
    if (this.tick % SNAPSHOT_INTERVAL === 0) {
      this._sendSnapshot();
    }
  }

  _sendSnapshot() {
    const kartStates = this.karts.map(k => ({
      id: k.id,
      x: k.position.x,
      y: k.position.y,
      z: k.position.z,
      ry: k.rotation.y,
      speed: k.userData.speed,
      steerAngle: k.userData.steerAngle,
      slideActive: k.userData.slideActive,
      slideDir: k.userData.slideDir,
      slideAngle: k.userData.slideAngle,
      boostSpeed: k.userData.boostSpeed,
      boostTimer: k.userData.boostTimer,
      grounded: k.userData.grounded,
      heldItem: k.userData.heldItem,
      velocityY: k.userData.velocity.y,
    }));

    // Race state
    const raceState = {
      countdownValue: this.race.countdownValue,
      frozen: this.race.isFrozen(),
      racers: this.race.racers.map(r => ({
        kartId: r.kart.id,
        lap: r.lap,
        position: r.position,
        finished: r.finished,
        wrongWay: r.wrongWay,
        checkpointsPassed: r.checkpointsPassed,
      })),
    };

    const events = this.events.splice(0);

    for (const [playerId, pdata] of this.players) {
      const lastSeq = this.playerLastSeq.get(playerId) || 0;
      this._send(pdata.ws, {
        type: 'snapshot',
        tick: this.tick,
        lastInputSeq: lastSeq,
        karts: kartStates,
        race: raceState,
        events: events.length > 0 ? events : undefined,
      });
    }
  }

  _send(ws, data) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.running = false;
  }
}
