import * as THREE from 'three';
import { CELL_SIZE } from './track.js';
import { createGroundDecal } from './ground-decal.js';

const PAD_SIZE = 6; // world units, square
const PAD_TRIGGER_RADIUS = 4; // how close kart center needs to be
const PAD_COOLDOWN = 1.5; // seconds before same pad can re-trigger per kart
const BOOST_SPEED = 20; // same as max slide boost (level 3)
const BOOST_DURATION = 1.2;

/**
 * Create arrow texture for boost pad
 */
function createArrowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Green background
  ctx.fillStyle = '#22aa44';
  ctx.fillRect(0, 0, size, size);

  // White arrow pointing up (in texture space = forward in world)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  // Arrow shaft
  ctx.rect(size * 0.38, size * 0.3, size * 0.24, size * 0.5);
  ctx.fill();
  // Arrow head
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.1);   // tip
  ctx.lineTo(size * 0.22, size * 0.4);   // bottom-left
  ctx.lineTo(size * 0.78, size * 0.4);   // bottom-right
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/**
 * Create boost pad meshes from map data
 * @param {object} mapData
 * @returns {{ meshes: THREE.Mesh[], update: (allKarts: any[], dt: number) => void }}
 */
export function createBoostPads(mapData) {
  if (!mapData.boostPads || mapData.boostPads.length === 0) {
    return { meshes: [], update() {} };
  }

  const tex = createArrowTexture();
  const meshes = [];
  const pads = [];

  for (const pad of mapData.boostPads) {
    const wx = (pad.x - mapData.width / 2) * mapData.scale * CELL_SIZE;
    const wz = (pad.y - mapData.height / 2) * mapData.scale * CELL_SIZE;
    const angle = (pad.angle || 0) + Math.PI / 2;

    const mesh = createGroundDecal({
      x: wx,
      z: wz,
      width: PAD_SIZE,
      depth: PAD_SIZE,
      angle,
      material: {
        map: tex,
        roughness: 0.7,
        opacity: 0.85,
      },
    });
    mesh.name = 'boostPad';
    meshes.push(mesh);

    pads.push({
      x: wx,
      z: wz,
      cooldowns: new Map(), // kart → remaining cooldown time
    });
  }

  function update(allKarts, dt) {
    for (const pad of pads) {
      // Tick down cooldowns
      for (const [kart, t] of pad.cooldowns) {
        const remaining = t - dt;
        if (remaining <= 0) pad.cooldowns.delete(kart);
        else pad.cooldowns.set(kart, remaining);
      }

      // Check each kart
      for (const kart of allKarts) {
        if (pad.cooldowns.has(kart)) continue;

        const dx = kart.position.x - pad.x;
        const dz = kart.position.z - pad.z;
        if (dx * dx + dz * dz < PAD_TRIGGER_RADIUS * PAD_TRIGGER_RADIUS) {
          // Apply max boost
          const ud = kart.userData;
          ud.boostTimer = BOOST_DURATION;
          ud.boostSpeed = BOOST_SPEED;
          pad.cooldowns.set(kart, PAD_COOLDOWN);
        }
      }
    }
  }

  return { meshes, update };
}
