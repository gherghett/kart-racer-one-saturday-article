import * as THREE from "three";
import { getGroundHeight, getGroundNormal, getTerrainType } from "./track.js";

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
  turnRate: 0.65,         // rad/s — direct turn speed
  driftTurnMult: 1.4,     // extra turn during drift
  driftFrictionMult: 0.4,
  driftSlide: 0.3,
  radius: 1.0,
};

const _tmpVec = new THREE.Vector3();

// Check if a point is occluded from camera by terrain
function isOccludedByTerrain(camera, targetX, targetY, targetZ) {
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  for (let i = 1; i <= 5; i++) {
    const f = i / 6;
    const sampleY = getGroundHeight(cx + (targetX - cx) * f, cz + (targetZ - cz) * f);
    const lineY = cy + (targetY - cy) * f;
    if (sampleY > lineY + 0.5) return true;
  }
  return false;
}

export class KartPhysics {
  constructor(trackGroup) {
    this.obstacles = [];
    trackGroup.traverse((child) => {
      if (child.isMesh && child.userData.isObstacle) {
        this.obstacles.push(child);
      }
    });

    this.groundNormal = new THREE.Vector3(0, 1, 0);
  }

  update(kart, input, dt, camera) {
    input.poll();

    const ud = kart.userData;
    const vel = ud.velocity;
    const s = ud.stats;

    // --- Steering (direct) ---
    // Input immediately controls turn rate. No accumulated steer angle.
    // Speed factor: reaches full turn rate at ~1/3 max speed, so low-speed
    // maneuvering works but you can't spin in place.
    ud.steerAngle = input.steer; // track for sprite animation
    if (Math.abs(ud.speed) > 0.5) {
      const driftMult = input.drift ? s.driftTurnMult : 1;
      const speedFactor = Math.min(1, (Math.abs(ud.speed) / s.maxSpeed) * 3);
      kart.rotation.y += input.steer * s.turnRate * driftMult * speedFactor * dt;
    }

    // --- Forward direction ---
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(kart.quaternion);
    forward.y = 0;
    forward.normalize();

    // --- Slope effect on speed ---
    if (ud.grounded) {
      const normalXZ = _tmpVec.set(this.groundNormal.x, 0, this.groundNormal.z);
      const slopeDot = normalXZ.dot(forward);
      const steepness = 1 - this.groundNormal.y;
      ud.speed -= slopeDot * steepness * SLOPE_SPEED_FACTOR * dt;
    }

    // --- Terrain slowdown ---
    const terrain = ud.grounded ? getTerrainType(kart.position.x, kart.position.z) : 0;
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
    const frictionMult = input.drift ? s.driftFrictionMult : 1;
    if (Math.abs(input.accel) < 0.1) {
      ud.speed -= Math.sign(ud.speed) * s.friction * frictionMult * dt;
      if (Math.abs(ud.speed) < 0.3) ud.speed = 0;
    }
    // Offroad extra drag (always applied when on offroad)
    if (offroad && Math.abs(ud.speed) > 0.1) {
      ud.speed -= Math.sign(ud.speed) * offroadFriction * dt;
    }

    const maxSpd = s.maxSpeed * offroadSpeedMult;
    ud.speed = THREE.MathUtils.clamp(ud.speed, -maxSpd * 0.4, maxSpd);

    // --- Drift lateral slide ---
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    let lateralSlide = 0;
    if (input.drift && Math.abs(ud.speed) > 3) {
      lateralSlide = -input.steer * ud.speed * s.driftSlide;
    }

    // Compose horizontal velocity, preserve vertical
    const prevYVel = vel.y;
    vel.copy(forward).multiplyScalar(ud.speed);
    _tmpVec.copy(right).multiplyScalar(lateralSlide);
    vel.add(_tmpVec);
    vel.y = prevYVel;

    // --- Gravity ---
    if (!ud.grounded) {
      vel.y += GRAVITY * dt;
    } else {
      vel.y = 0;
    }

    // Move position
    kart.position.addScaledVector(vel, dt);

    // --- Ground check (analytical) ---
    const groundY = getGroundHeight(kart.position.x, kart.position.z);
    const gn = getGroundNormal(kart.position.x, kart.position.z);

    // Shadow
    const shadow = kart.userData.shadow;
    if (shadow) {
      shadow.position.set(kart.position.x, groundY + 0.15, kart.position.z);
      const airHeight = Math.max(0, kart.position.y - groundY);
      const t = Math.max(0.3, 1 - airHeight * 0.03);
      shadow.scale.set(3 * t, 1 * t, 1);

      const shadowOcc = camera && isOccludedByTerrain(camera, shadow.position.x, shadow.position.y, shadow.position.z);
      shadow.visible = !shadowOcc;
      shadow.material.opacity = shadowOcc ? 0 : Math.max(0.05, 1 - airHeight * 0.04);
    }

    // Kart visibility — hide when terrain blocks camera line of sight
    if (camera) {
      const kartOcc = isOccludedByTerrain(camera, kart.position.x, kart.position.y + 1.5, kart.position.z);
      kart.visible = !kartOcc;
    }

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
        kart.position.y = groundY + 0.02;
        if (vel.y < 0) vel.y = 0;
        ud.grounded = true;
        this.groundNormal.set(gn.x, gn.y, gn.z);
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
    }
  }

  _resolveObstacleCollisions(kart, s) {
    const ud = kart.userData;
    const kartPos = kart.position;

    for (const obs of this.obstacles) {
      const center = obs.position;
      const he = obs.userData.halfExtents;

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
