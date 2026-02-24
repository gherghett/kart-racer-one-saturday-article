import * as THREE from 'three';
import { getGroundHeight } from './track.js';

const MISSILE_SPEED = 55;
const TURN_RATE = 1.8;          // rad/s homing strength
const HIT_RADIUS = 2.5;
const LIFETIME = 6;
const FLY_HEIGHT = 1.2;         // height above ground
const EXPLODE_VEL_Y = 20;

function createMissileTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#44cc44';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#226622';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 4, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createTrailTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(200, 255, 200, 0.8)');
  grad.addColorStop(0.5, 'rgba(100, 200, 100, 0.3)');
  grad.addColorStop(1, 'rgba(50, 150, 50, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function createMissileSystem(scene) {
  const bodyGeo = new THREE.ConeGeometry(0.4, 1.6, 6);
  bodyGeo.rotateX(Math.PI / 2); // point forward along +Z
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x33aa33,
    emissive: new THREE.Color(0x33aa33),
    emissiveIntensity: 0.3,
  });

  const trailTex = createTrailTexture();

  const active = [];

  function fire(kart, allKarts) {
    const angle = kart.rotation.y;
    // Fire from front of kart
    const spawnDist = 2.5;
    const wx = kart.position.x - Math.sin(angle) * spawnDist;
    const wz = kart.position.z - Math.cos(angle) * spawnDist;
    const groundY = getGroundHeight(wx, wz);

    const mesh = new THREE.Mesh(bodyGeo, bodyMat);
    mesh.position.set(wx, groundY + FLY_HEIGHT, wz);
    mesh.rotation.y = angle;
    scene.add(mesh);

    // Trail sprite
    const trailMat = new THREE.SpriteMaterial({
      map: trailTex,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    const trail = new THREE.Sprite(trailMat);
    trail.scale.set(1.5, 1.5, 1);
    scene.add(trail);

    active.push({
      mesh,
      trail,
      trailMat,
      owner: kart,
      angle,
      lifetime: LIFETIME,
      x: wx,
      z: wz,
    });
  }

  function update(allKarts, dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      m.lifetime -= dt;

      if (m.lifetime <= 0) {
        _remove(i);
        continue;
      }

      // Find closest kart in front of missile (120° cone)
      const fwdX = -Math.sin(m.angle);
      const fwdZ = -Math.cos(m.angle);
      const CONE_COS = Math.cos(Math.PI / 3); // 60° half-angle = 120° total
      let closestDist = Infinity;
      let closestAngle = m.angle;
      for (const kart of allKarts) {
        if (kart === m.owner) continue;
        const dx = kart.position.x - m.x;
        const dz = kart.position.z - m.z;
        const dist = dx * dx + dz * dz;
        if (dist < 0.01) continue;
        // Check if kart is within forward cone
        const len = Math.sqrt(dist);
        const dot = (dx * fwdX + dz * fwdZ) / len;
        if (dot < CONE_COS) continue;
        if (dist < closestDist) {
          closestDist = dist;
          closestAngle = Math.atan2(-dx, -dz);
        }
      }

      // Steer toward target
      let angleDiff = closestAngle - m.angle;
      // Normalize to -PI..PI
      angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      m.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), TURN_RATE * dt);

      // Move forward
      m.x -= Math.sin(m.angle) * MISSILE_SPEED * dt;
      m.z -= Math.cos(m.angle) * MISSILE_SPEED * dt;

      const groundY = getGroundHeight(m.x, m.z);
      m.mesh.position.set(m.x, groundY + FLY_HEIGHT, m.z);
      m.mesh.rotation.y = m.angle;

      // Trail behind missile
      const trailDist = 1.0;
      m.trail.position.set(
        m.x + Math.sin(m.angle) * trailDist,
        groundY + FLY_HEIGHT,
        m.z + Math.cos(m.angle) * trailDist,
      );
      m.trail.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.5, 1);

      // Hit detection
      let hit = false;
      for (const kart of allKarts) {
        if (kart === m.owner) continue;
        const dx = kart.position.x - m.x;
        const dz = kart.position.z - m.z;
        if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS) {
          const ud = kart.userData;
          ud.velocity.set(0, EXPLODE_VEL_Y, 0);
          kart.position.y += 0.5;
          ud.speed = 0;
          ud.grounded = false;
          ud.slideActive = false;
          ud.slideButton = null;
          ud.slideDir = 0;
          ud.slideAngle = 0;
          ud.slideTimer = 0;
          ud.slideBoosts = 0;
          ud.boostTimer = 0;
          ud.boostSpeed = 0;
          hit = true;
          break;
        }
      }

      if (hit) {
        _remove(i);
      }
    }
  }

  function _remove(index) {
    const m = active[index];
    scene.remove(m.mesh);
    scene.remove(m.trail);
    m.trailMat.dispose();
    active.splice(index, 1);
  }

  function destroy() {
    for (let i = active.length - 1; i >= 0; i--) {
      _remove(i);
    }
    bodyGeo.dispose();
    bodyMat.dispose();
    trailTex.dispose();
  }

  return { fire, update, destroy };
}
