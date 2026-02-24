import * as THREE from 'three';
import { getGroundHeight } from './track.js';

const TNT_SIZE = 1.5;
const TRIGGER_RADIUS = 2.5;
const EXPLODE_VEL_Y = 22;       // upward launch force
const LIFETIME = 30;             // seconds before auto-despawn

function createTNTTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Red background
  ctx.fillStyle = '#cc2200';
  ctx.fillRect(0, 0, size, size);

  // Dark border
  ctx.strokeStyle = '#881100';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  // "TNT" text
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.35}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TNT', size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function createTNTShadow(shadowTex, wx, wz) {
  const size = 2.5;
  const geo = new THREE.PlaneGeometry(size, size, 3, 3);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = wx + pos.array[i * 3];
    const vz = wz + pos.array[i * 3 + 2];
    pos.array[i * 3]     = vx;
    pos.array[i * 3 + 1] = getGroundHeight(vx, vz) + 0.1;
    pos.array[i * 3 + 2] = vz;
  }
  pos.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  return mesh;
}

export function createTNTSystem(scene) {
  const tex = createTNTTexture();
  const geometry = new THREE.BoxGeometry(TNT_SIZE, TNT_SIZE, TNT_SIZE);
  const material = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: new THREE.Color(0xcc2200),
    emissiveIntensity: 0.2,
  });

  // Shared shadow texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.3)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);

  const placed = []; // active TNT boxes

  function place(kart) {
    const angle = kart.rotation.y;
    // Place behind the kart
    const behindDist = 3;
    const wx = kart.position.x + Math.sin(angle) * behindDist;
    const wz = kart.position.z + Math.cos(angle) * behindDist;
    const groundY = getGroundHeight(wx, wz);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(wx, groundY + TNT_SIZE / 2 + 0.05, wz);
    scene.add(mesh);

    const shadow = createTNTShadow(shadowTex, wx, wz);
    scene.add(shadow);

    placed.push({
      mesh,
      shadow,
      x: wx,
      z: wz,
      groundY,
      owner: kart, // kart that placed it (immune briefly)
      immuneTimer: 0.8, // seconds of immunity for the placer
      lifetime: LIFETIME,
    });
  }

  function update(allKarts, dt) {
    for (let i = placed.length - 1; i >= 0; i--) {
      const tnt = placed[i];
      tnt.lifetime -= dt;
      if (tnt.immuneTimer > 0) tnt.immuneTimer -= dt;

      // Despawn check
      if (tnt.lifetime <= 0) {
        scene.remove(tnt.mesh);
        scene.remove(tnt.shadow);
        placed.splice(i, 1);
        continue;
      }

      // Collision check against all karts
      let triggered = false;
      for (const kart of allKarts) {
        // Skip owner during immunity
        if (tnt.immuneTimer > 0 && kart === tnt.owner) continue;

        const dx = kart.position.x - tnt.x;
        const dz = kart.position.z - tnt.z;
        if (dx * dx + dz * dz < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          // Explode the kart
          const ud = kart.userData;
          ud.velocity.set(0, EXPLODE_VEL_Y, 0);
          kart.position.y += 0.5; // escape ground snap zone
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

          triggered = true;
          break;
        }
      }

      if (triggered) {
        scene.remove(tnt.mesh);
        scene.remove(tnt.shadow);
        placed.splice(i, 1);
      }
    }
  }

  function destroy() {
    for (const tnt of placed) {
      scene.remove(tnt.mesh);
      scene.remove(tnt.shadow);
    }
    placed.length = 0;
    tex.dispose();
    geometry.dispose();
    material.dispose();
    shadowTex.dispose();
  }

  return { place, update, destroy };
}
