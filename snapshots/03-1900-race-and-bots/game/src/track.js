import * as THREE from 'three';

// Terrain type constants (matching map editor)
const TERRAIN_TRACK = 0;
const TERRAIN_OFFROAD = 1;
const TERRAIN_INACCESSIBLE = 2;

// Module-level map state used by getGroundHeight / getGroundNormal
let _map = null;
let _worldW = 300;
let _worldH = 300;

export const CELL_SIZE = 3; // world units per map pixel
const HEIGHT_SCALE = 20; // heightmap [-1,1] maps to [-20,+20] world units

const TERRAIN_COLORS = {
  [TERRAIN_TRACK]: new THREE.Color(0x555555),
  [TERRAIN_OFFROAD]: new THREE.Color(0x4a8c3f),
  [TERRAIN_INACCESSIBLE]: new THREE.Color(0x8b2222),
};

// --- Coordinate conversion ---

function worldToMap(x, z) {
  const col = (x / (_map.scale * CELL_SIZE)) + _map.width / 2;
  const row = (z / (_map.scale * CELL_SIZE)) + _map.height / 2;
  return { col, row };
}

// --- Heightmap sampling with bilinear interpolation ---

function sampleHeightmap(col, row) {
  const { width, height, heightmap } = _map;

  const c = Math.max(0, Math.min(width - 1, col));
  const r = Math.max(0, Math.min(height - 1, row));

  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const c1 = Math.min(c0 + 1, width - 1);
  const r1 = Math.min(r0 + 1, height - 1);

  const fc = c - c0;
  const fr = r - r0;

  const h00 = heightmap[r0 * width + c0];
  const h10 = heightmap[r0 * width + c1];
  const h01 = heightmap[r1 * width + c0];
  const h11 = heightmap[r1 * width + c1];

  return h00 * (1 - fc) * (1 - fr)
       + h10 * fc * (1 - fr)
       + h01 * (1 - fc) * fr
       + h11 * fc * fr;
}

// --- Public API ---

/** Ground height at any world (x, z) — used by physics */
export function getGroundHeight(x, z) {
  if (!_map) return 0;
  const { col, row } = worldToMap(x, z);
  return sampleHeightmap(col, row) * HEIGHT_SCALE;
}

/** Approximate ground normal via finite differences */
const _NORMAL_EPS = 0.3;
const _gn = { x: 0, y: 1, z: 0 };
export function getGroundNormal(x, z) {
  const hC = getGroundHeight(x, z);
  const hR = getGroundHeight(x + _NORMAL_EPS, z);
  const hF = getGroundHeight(x, z + _NORMAL_EPS);
  _gn.x = -(hR - hC) / _NORMAL_EPS;
  _gn.z = -(hF - hC) / _NORMAL_EPS;
  _gn.y = 1;
  const len = Math.sqrt(_gn.x * _gn.x + _gn.y * _gn.y + _gn.z * _gn.z);
  _gn.x /= len;
  _gn.y /= len;
  _gn.z /= len;
  return _gn;
}

/** Terrain type at world position */
export function getTerrainType(x, z) {
  if (!_map) return TERRAIN_OFFROAD;
  const { col, row } = worldToMap(x, z);
  const c = Math.round(col);
  const r = Math.round(row);
  if (c < 0 || c >= _map.width || r < 0 || r >= _map.height) return TERRAIN_OFFROAD;
  return _map.terrain[r * _map.width + c];
}

/** Build the 3D track mesh from loaded map data */
export function createTrackMesh(mapData) {
  _map = mapData;
  _worldW = mapData.width * mapData.scale * CELL_SIZE;
  _worldH = mapData.height * mapData.scale * CELL_SIZE;

  const group = new THREE.Group();
  group.add(createGround());
  addBoundaryWalls(group);
  return group;
}

// --- Internal mesh builders ---

function createGround() {
  const segsX = Math.min(_map.width, 256);
  const segsZ = Math.min(_map.height, 256);

  const geo = new THREE.PlaneGeometry(_worldW, _worldH, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, getGroundHeight(x, z));

    const tt = getTerrainType(x, z);
    const color = TERRAIN_COLORS[tt] || TERRAIN_COLORS[TERRAIN_OFFROAD];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

function addBoundaryWalls(group) {
  const wallHeight = 4;
  const wallThickness = 2;
  const halfW = _worldW / 2;
  const halfH = _worldH / 2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6 });

  const walls = [
    [0, -halfH, _worldW + wallThickness, wallThickness],
    [0, halfH, _worldW + wallThickness, wallThickness],
    [-halfW, 0, wallThickness, _worldH + wallThickness],
    [halfW, 0, wallThickness, _worldH + wallThickness],
  ];

  for (const [px, pz, sx, sz] of walls) {
    const geo = new THREE.BoxGeometry(sx, wallHeight, sz);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(px, wallHeight / 2, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'wall';
    mesh.userData.isObstacle = true;
    mesh.userData.halfExtents = new THREE.Vector3(sx / 2, wallHeight / 2, sz / 2);
    group.add(mesh);
  }
}
