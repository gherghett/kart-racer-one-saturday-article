import * as THREE from 'three';
import { CELL_SIZE } from './track.js';
import { getGroundHeight } from './track.js';

const BOX_SIZE = 2;
const BOX_HOVER_HEIGHT = 2.5;   // base height above ground
const BOB_AMPLITUDE = 0.4;      // vertical bob range
const BOB_SPEED = 2;            // bob cycles per second
const ROTATE_SPEED = 1.5;       // radians per second
const PICKUP_RADIUS = 4;        // proximity trigger
const RESPAWN_TIME = 5;         // seconds

const AVAILABLE_ITEMS = ['boost', 'tnt', 'missile'];

/**
 * Create "?" texture for item box faces
 */
function createQuestionTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Orange background
  ctx.fillStyle = '#ff8c00';
  ctx.fillRect(0, 0, size, size);

  // Border
  ctx.strokeStyle = '#ffaa33';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  // "?" symbol
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.6}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', size / 2, size / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

let _shadowTex = null;
function getShadowTexture() {
  if (_shadowTex) return _shadowTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.35)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  _shadowTex = new THREE.CanvasTexture(canvas);
  return _shadowTex;
}

function createShadowMesh(wx, wz, groundY, size) {
  const geo = new THREE.PlaneGeometry(size, size, 4, 4);
  geo.rotateX(-Math.PI / 2);
  // Conform vertices to terrain
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
    map: getShadowTexture(),
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

/**
 * Create item box meshes and update system
 * @param {object} mapData
 * @returns {{ meshes: THREE.Mesh[], update: (allKarts: any[], dt: number) => void }}
 */
export function createItemBoxes(mapData) {
  if (!mapData.itemBoxes || mapData.itemBoxes.length === 0) {
    return { meshes: [], update() {} };
  }

  const tex = createQuestionTexture();
  const geometry = new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE);
  const material = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: new THREE.Color(0xff6600),
    emissiveIntensity: 0.3,
  });

  const meshes = [];
  const boxes = [];

  for (let i = 0; i < mapData.itemBoxes.length; i++) {
    const ib = mapData.itemBoxes[i];
    const wx = (ib.x - mapData.width / 2) * mapData.scale * CELL_SIZE;
    const wz = (ib.y - mapData.height / 2) * mapData.scale * CELL_SIZE;
    const groundY = getGroundHeight(wx, wz);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(wx, groundY + BOX_HOVER_HEIGHT, wz);
    mesh.castShadow = true;
    meshes.push(mesh);

    const shadow = createShadowMesh(wx, wz, groundY, 3.5);
    meshes.push(shadow);

    boxes.push({
      mesh,
      shadow,
      x: wx,
      z: wz,
      groundY,
      phase: (i / mapData.itemBoxes.length) * Math.PI * 2, // stagger bob
      respawnTimer: 0, // 0 = available
    });
  }

  let time = 0;

  function update(allKarts, dt) {
    time += dt;

    for (const box of boxes) {
      // Respawn logic
      if (box.respawnTimer > 0) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.respawnTimer = 0;
          box.mesh.visible = true;
          box.shadow.visible = true;
        }
        continue;
      }

      // Animate: bob + rotate
      const bobY = Math.sin(time * BOB_SPEED * Math.PI * 2 + box.phase) * BOB_AMPLITUDE;
      box.mesh.position.y = box.groundY + BOX_HOVER_HEIGHT + bobY;
      box.mesh.rotation.y += ROTATE_SPEED * dt;

      // Proximity pickup check
      for (const kart of allKarts) {
        if (kart.userData.heldItem) continue; // already holding

        const dx = kart.position.x - box.x;
        const dz = kart.position.z - box.z;
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
          // Grant random item
          kart.userData.heldItem = AVAILABLE_ITEMS[Math.floor(Math.random() * AVAILABLE_ITEMS.length)];
          box.mesh.visible = false;
          box.shadow.visible = false;
          box.respawnTimer = RESPAWN_TIME;
          break; // only one kart picks up per frame
        }
      }
    }
  }

  return { meshes, update };
}
