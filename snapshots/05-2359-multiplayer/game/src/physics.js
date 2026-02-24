import * as THREE from "three";
import { getGroundHeight as _getGroundHeight, getGroundNormal as _getGroundNormal, getTerrainType as _getTerrainType } from "./track.js";

// World constants (not per-kart)
const GRAVITY = -25;
const GROUND_SNAP = 0.4;
const SLOPE_SPEED_FACTOR = 30;
const MAX_DRIVEABLE_SLOPE = 0.55;

// Default kart stats — override any of these via kart.userData.stats
export const KART_DEFAULTS = {
  maxSpeed: 35,
  accel: 18,
  brakeForce: 25,
  friction: 8,
  turnRate: 0.65,          // rad/s — direct turn speed
  // Power slide
  slideTurnMult: 1.4,      // extra turn during slide
  slideFrictionMult: 0.4,  // reduced friction during slide
  slideSlide: 0.3,         // lateral slide amount
  hopForce: 4,             // upward velocity on hop
  slideMeterDuration: 1.5, // seconds to fill the meter
  boostSpeeds: [10, 15, 20],     // speed bonus per charge level
  boostDurations: [0.5, 0.8, 1.2], // duration per charge level
  radius: 1.0,
};

// Sweet spot windows per charge level [start, end] as fraction of meter
const SWEET_SPOTS = [
  [0.55, 0.85], // charge 1 — wide
  [0.60, 0.80], // charge 2 — tighter
  [0.65, 0.80], // charge 3 — tight
];

const _tmpVec = new THREE.Vector3();

export class KartPhysics {
  /**
   * @param {Array<{position: {x,y,z}, halfExtents: {x,y,z}}>} obstacles
   * @param {object} [trackData] - optional TrackData instance for server use
   */
  constructor(obstacles, trackData) {
    this.obstacles = obstacles;
    this.groundNormal = new THREE.Vector3(0, 1, 0);

    if (trackData) {
      this._getGroundHeight = (x, z) => trackData.getGroundHeight(x, z);
      this._getGroundNormal = (x, z) => trackData.getGroundNormal(x, z);
      this._getTerrainType = (x, z) => trackData.getTerrainType(x, z);
    } else {
      this._getGroundHeight = _getGroundHeight;
      this._getGroundNormal = _getGroundNormal;
      this._getTerrainType = _getTerrainType;
    }
  }

  update(kart, input, dt) {
    const ud = kart.userData;
    const vel = ud.velocity;
    const s = ud.stats;

    // --- Hop / Power Slide ---
    const hopHeld = input.hopZ || input.hopX; // either hop button held
    const hopTap = input.hopZTap || input.hopXTap; // either just pressed
    // Which button is the "trigger" (the OTHER one)
    const triggerTap = ud.slideButton === 'z' ? input.hopXTap
                     : ud.slideButton === 'x' ? input.hopZTap
                     : false;


    // Hop initiation: tap Z or X while grounded
    if (hopTap && ud.grounded && !ud.slideActive) {
      vel.y = s.hopForce;
      kart.position.y += GROUND_SNAP + 0.1; // escape snap zone immediately
      ud.grounded = false;
      ud.slideButton = input.hopZTap ? 'z' : 'x';
      ud.slideTimer = 0;
      ud.slideBoosts = 0;
    }

    // Slide entry: just landed while hop held + steering
    if (ud.grounded && !ud.slideActive && ud.slideButton) {
      const slideHeld = (ud.slideButton === 'z' && input.hopZ)
                     || (ud.slideButton === 'x' && input.hopX);
      if (slideHeld && Math.abs(input.steer) > 0.1) {
        ud.slideActive = true;
        ud.slideDir = Math.sign(input.steer); // +1 = left, -1 = right
        ud.slideTimer = 0;
      } else if (!slideHeld) {
        // Released before landing or not steering — cancel
        ud.slideButton = null;
      }
    }

    // Slide end: released the hop button that started the slide
    if (ud.slideActive) {
      const slideHeld = (ud.slideButton === 'z' && input.hopZ)
                     || (ud.slideButton === 'x' && input.hopX);
      if (!slideHeld) {
        ud.slideActive = false;
        ud.slideButton = null;
        ud.slideTimer = 0;
        ud.slideBoosts = 0;
      }
    }

    // During active slide: meter + boost trigger
    if (ud.slideActive && ud.slideBoosts >= 0 && ud.slideBoosts < 3) {
      ud.slideTimer += dt;
      const meterFill = ud.slideTimer / s.slideMeterDuration;

      // Boost trigger: tap the OTHER button
      if (triggerTap) {
        const [sweetStart, sweetEnd] = SWEET_SPOTS[ud.slideBoosts];
        if (meterFill >= sweetStart && meterFill <= sweetEnd) {
          // Hit! Fire boost immediately
          ud.boostTimer = s.boostDurations[ud.slideBoosts];
          ud.boostSpeed = s.boostSpeeds[ud.slideBoosts];
          ud.slideBoosts++;
          ud.slideTimer = 0;
        } else {
          // Missed! No more charges this slide
          ud.slideBoosts = -1;
        }
      }

      // Meter overflow: missed the window
      if (meterFill > 1) {
        ud.slideBoosts = -1;
      }
    }

    // Active boost: full power while timer > 0, then decay
    if (ud.boostTimer > 0) {
      ud.boostTimer -= dt;
      if (ud.boostTimer < 0) ud.boostTimer = 0;
    } else if (ud.boostSpeed > 0) {
      ud.boostSpeed -= 15 * dt;
      if (ud.boostSpeed < 0) ud.boostSpeed = 0;
    }

    // --- Steering ---
    ud.steerAngle = input.steer; // track for sprite animation
    if (!ud.grounded) {
      // Air: free rotation regardless of speed
      kart.rotation.y += input.steer * s.turnRate * 1.5 * dt;
    } else if (Math.abs(ud.speed) > 0.5) {
      if (ud.slideActive) {
        // Slide: turning into the slide is easier, against it is harder
        const intoSlide = Math.sign(input.steer) === ud.slideDir;
        const steerMult = intoSlide ? s.slideTurnMult : s.slideTurnMult * 0.5;
        const speedFactor = Math.min(1, (Math.abs(ud.speed) / s.maxSpeed) * 3);
        kart.rotation.y += input.steer * s.turnRate * steerMult * speedFactor * dt;
      } else {
        // Normal ground steering (flip when reversing so controls feel natural)
        const speedFactor = Math.min(1, (Math.abs(ud.speed) / s.maxSpeed) * 3);
        const reverseFlip = ud.speed < 0 ? -1 : 1;
        kart.rotation.y += input.steer * s.turnRate * speedFactor * reverseFlip * dt;
      }
    }

    // --- Slide rotation offset ---
    // During slide, kart visually faces ~28° into the slide direction
    const SLIDE_ANGLE = 0.5;
    const targetOffset = ud.slideActive ? ud.slideDir * SLIDE_ANGLE : 0;
    // Smooth ramp in/out
    ud.slideAngle += (targetOffset - ud.slideAngle) * Math.min(1, 8 * dt);
    if (Math.abs(ud.slideAngle) < 0.01) ud.slideAngle = 0;

    // --- Forward direction (travel direction) ---
    // Travel direction excludes the visual slide offset
    const travelAngle = kart.rotation.y - ud.slideAngle;
    const forward = new THREE.Vector3(
      -Math.sin(travelAngle),
      0,
      -Math.cos(travelAngle),
    );

    // --- Slope effect on speed ---
    if (ud.grounded) {
      const normalXZ = _tmpVec.set(this.groundNormal.x, 0, this.groundNormal.z);
      const slopeDot = normalXZ.dot(forward);
      const steepness = 1 - this.groundNormal.y;
      ud.speed -= slopeDot * steepness * SLOPE_SPEED_FACTOR * dt;
    }

    // --- Terrain slowdown ---
    const terrain = ud.grounded ? this._getTerrainType(kart.position.x, kart.position.z) : 0;
    const offroad = terrain === 1; // Offroad
    const offroadAccelMult = offroad ? 0.5 : 1;
    const offroadSpeedMult = offroad ? 0.6 : 1;
    const offroadFriction = offroad ? 3 : 0; // extra drag

    // --- Acceleration / braking ---
    if (input.accel > 0) {
      ud.speed += s.accel * offroadAccelMult * dt;
    } else if (input.accel < 0) {
      ud.speed -= s.brakeForce * dt;
    }

    // Friction
    const frictionMult = ud.slideActive ? s.slideFrictionMult : 1;
    if (Math.abs(input.accel) < 0.1) {
      ud.speed -= Math.sign(ud.speed) * s.friction * frictionMult * dt;
      if (Math.abs(ud.speed) < 0.3) ud.speed = 0;
    }
    // Offroad extra drag (always applied when on offroad)
    if (offroad && Math.abs(ud.speed) > 0.1) {
      ud.speed -= Math.sign(ud.speed) * offroadFriction * dt;
    }

    // Speed limit — boost can exceed maxSpeed
    const maxSpd = s.maxSpeed * offroadSpeedMult;
    const effectiveMax = maxSpd + ud.boostSpeed;
    ud.speed = THREE.MathUtils.clamp(ud.speed, -maxSpd * 0.4, effectiveMax);

    // --- Active boost: speed floor from current boostSpeed ---
    if (ud.boostSpeed > 0) {
      ud.speed = Math.max(ud.speed, maxSpd + ud.boostSpeed * 0.8);
    }

    // --- Slide lateral slide ---
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    let lateralSlide = 0;
    if (ud.slideActive && Math.abs(ud.speed) > 3) {
      lateralSlide = -input.steer * ud.speed * s.slideSlide;
    }

    // Compose velocity
    const prevYVel = vel.y;
    if (ud.grounded) {
      // Ground: velocity from facing direction + lateral slide
      vel.copy(forward).multiplyScalar(ud.speed);
      _tmpVec.copy(right).multiplyScalar(lateralSlide);
      vel.add(_tmpVec);
    }
    // Air: keep horizontal velocity unchanged — rotation doesn't affect momentum
    vel.y = prevYVel;

    // --- Gravity ---
    if (!ud.grounded) {
      vel.y += GRAVITY * dt;
    } else {
      vel.y = 0;
    }

    // Move position
    const prevX = kart.position.x;
    const prevZ = kart.position.z;
    kart.position.addScaledVector(vel, dt);

    // --- Inaccessible terrain collision (hard wall) ---
    if (this._getTerrainType(kart.position.x, kart.position.z) === 2) {
      // Try sliding along each axis independently
      const canSlideX = this._getTerrainType(kart.position.x, prevZ) !== 2;
      const canSlideZ = this._getTerrainType(prevX, kart.position.z) !== 2;
      if (canSlideX && !canSlideZ) {
        kart.position.z = prevZ;
        vel.z = 0;
      } else if (canSlideZ && !canSlideX) {
        kart.position.x = prevX;
        vel.x = 0;
      } else {
        kart.position.x = prevX;
        kart.position.z = prevZ;
        vel.x = 0;
        vel.z = 0;
      }
      ud.speed *= 0.7;
    }

    // --- Ground check (analytical) ---
    const groundY = this._getGroundHeight(kart.position.x, kart.position.z);
    const gn = this._getGroundNormal(kart.position.x, kart.position.z);

    if (kart.position.y <= groundY + GROUND_SNAP) {
      if (gn.y < MAX_DRIVEABLE_SLOPE) {
        // Too steep — wall
        const pushLen = Math.sqrt(gn.x * gn.x + gn.z * gn.z);
        if (pushLen > 0.001) {
          const nx = gn.x / pushLen;
          const nz = gn.z / pushLen;
          kart.position.x += nx * 0.3;
          kart.position.z += nz * 0.3;
          const vDot = vel.x * nx + vel.z * nz;
          if (vDot < 0) {
            vel.x -= nx * vDot;
            vel.z -= nz * vDot;
            ud.speed *= 0.3;
          }
        }
        ud.grounded = false;
      } else {
        const wasAirborne = !ud.grounded;
        kart.position.y = groundY + 0.02;
        if (vel.y < 0) vel.y = 0;
        ud.grounded = true;
        this.groundNormal.set(gn.x, gn.y, gn.z);
        // Landing: project air velocity onto new facing direction
        // Clamp to pre-hop speed so lateral slide energy can't leak into forward speed
        if (wasAirborne) {
          const prevSpeed = ud.speed;
          ud.speed = vel.x * forward.x + vel.z * forward.z;
          if (Math.abs(ud.speed) > Math.abs(prevSpeed)) {
            ud.speed = Math.sign(ud.speed) * Math.abs(prevSpeed);
          }
        }
      }
    } else {
      ud.grounded = false;
    }

    // --- Horizontal collision with obstacles ---
    this._resolveObstacleCollisions(kart, s);

    // Respawn if fallen off the map
    if (kart.position.y < -30) {
      const sp = ud.spawnPoint || { x: 0, y: 5, z: 0 };
      kart.position.set(sp.x, sp.y, sp.z);
      vel.set(0, 0, 0);
      ud.speed = 0;
      ud.slideActive = false;
      ud.slideButton = null;
      ud.slideDir = 0;
      ud.slideAngle = 0;
      ud.slideTimer = 0;
      ud.slideBoosts = 0;
      ud.boostTimer = 0;
      ud.boostSpeed = 0;
    }
  }

  _resolveObstacleCollisions(kart, s) {
    const ud = kart.userData;
    const kartPos = kart.position;

    for (const obs of this.obstacles) {
      const center = obs.position;
      const he = obs.halfExtents;

      const closestX = THREE.MathUtils.clamp(kartPos.x, center.x - he.x, center.x + he.x);
      const closestY = THREE.MathUtils.clamp(kartPos.y, center.y - he.y, center.y + he.y);
      const closestZ = THREE.MathUtils.clamp(kartPos.z, center.z - he.z, center.z + he.z);

      const dx = kartPos.x - closestX;
      const dy = kartPos.y - closestY;
      const dz = kartPos.z - closestZ;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < s.radius * s.radius && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const penetration = s.radius - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;

        kartPos.x += nx * penetration;
        kartPos.y += ny * penetration;
        kartPos.z += nz * penetration;

        const vel = ud.velocity;
        const dot = vel.x * nx + vel.y * ny + vel.z * nz;
        if (dot < 0) {
          vel.x -= nx * dot * 1.2;
          vel.y -= ny * dot * 1.2;
          vel.z -= nz * dot * 1.2;
          ud.speed *= 0.7;
        }
      }
    }
  }
}
