import * as THREE from 'three';

// Terrain type constants (matching map editor)
const TERRAIN_TRACK = 0;
const TERRAIN_OFFROAD = 1;
const TERRAIN_INACCESSIBLE = 2;

export const CELL_SIZE = 3; // world units per map pixel
const HEIGHT_SCALE = 20; // heightmap [-1,1] maps to [-20,+20] world units

const DEFAULT_TERRAIN_COLORS = {
  [TERRAIN_TRACK]: new THREE.Color(0x555555),
  [TERRAIN_OFFROAD]: new THREE.Color(0x4a8c3f),
  [TERRAIN_INACCESSIBLE]: new THREE.Color(0x8b2222),
};

let TERRAIN_COLORS = { ...DEFAULT_TERRAIN_COLORS };

// --- TrackData class: pure data, no rendering, usable on server ---

export class TrackData {
  constructor(mapData) {
    this.width = mapData.width;
    this.height = mapData.height;
    this.scale = mapData.scale || 1;
    this.heightmap = mapData.heightmap;
    this.terrain = mapData.terrain;
  }

  worldToMap(x, z) {
    const col = (x / (this.scale * CELL_SIZE)) + this.width / 2;
    const row = (z / (this.scale * CELL_SIZE)) + this.height / 2;
    return { col, row };
  }

  sampleHeightmap(col, row) {
    const { width, height, heightmap } = this;

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

  getGroundHeight(x, z) {
    const { col, row } = this.worldToMap(x, z);
    return this.sampleHeightmap(col, row) * HEIGHT_SCALE;
  }

  getGroundNormal(x, z) {
    const eps = 0.3;
    const hC = this.getGroundHeight(x, z);
    const hR = this.getGroundHeight(x + eps, z);
    const hF = this.getGroundHeight(x, z + eps);
    let nx = -(hR - hC) / eps;
    let nz = -(hF - hC) / eps;
    let ny = 1;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= len;
    ny /= len;
    nz /= len;
    return { x: nx, y: ny, z: nz };
  }

  getTerrainType(x, z) {
    const { col, row } = this.worldToMap(x, z);
    const c = Math.round(col);
    const r = Math.round(row);
    if (c < 0 || c >= this.width || r < 0 || r >= this.height) return TERRAIN_OFFROAD;
    return this.terrain[r * this.width + c];
  }

  getWorldSize() {
    return {
      w: this.width * this.scale * CELL_SIZE,
      h: this.height * this.scale * CELL_SIZE,
    };
  }

  getObstacles() {
    const { w, h } = this.getWorldSize();
    const halfW = w / 2;
    const halfH = h / 2;
    const wallHeight = 4;
    const wallThickness = 2;

    const walls = [
      [0, -halfH, w + wallThickness, wallThickness],
      [0, halfH, w + wallThickness, wallThickness],
      [-halfW, 0, wallThickness, h + wallThickness],
      [halfW, 0, wallThickness, h + wallThickness],
    ];

    return walls.map(([px, pz, sx, sz]) => ({
      position: { x: px, y: wallHeight / 2, z: pz },
      halfExtents: { x: sx / 2, y: wallHeight / 2, z: sz / 2 },
    }));
  }
}

// --- Module-level default instance (for singleplayer backward compat) ---

let _defaultTrack = null;
let _mapData = null; // full mapData for rendering (colorData etc.)
let _worldW = 300;
let _worldH = 300;

/** Ground height at any world (x, z) — used by physics */
export function getGroundHeight(x, z) {
  if (!_defaultTrack) return 0;
  return _defaultTrack.getGroundHeight(x, z);
}

/** Approximate ground normal via finite differences */
const _gn = { x: 0, y: 1, z: 0 };
export function getGroundNormal(x, z) {
  if (!_defaultTrack) return _gn;
  return _defaultTrack.getGroundNormal(x, z);
}

/** Terrain type at world position */
export function getTerrainType(x, z) {
  if (!_defaultTrack) return TERRAIN_OFFROAD;
  return _defaultTrack.getTerrainType(x, z);
}

/** Build the 3D track mesh from loaded map data */
export function createTrackMesh(mapData) {
  _defaultTrack = new TrackData(mapData);
  _mapData = mapData;
  _worldW = mapData.width * mapData.scale * CELL_SIZE;
  _worldH = mapData.height * mapData.scale * CELL_SIZE;

  // Apply custom terrain colors from map metadata
  TERRAIN_COLORS = { ...DEFAULT_TERRAIN_COLORS };
  if (mapData.terrainColors) {
    for (const [key, hex] of Object.entries(mapData.terrainColors)) {
      TERRAIN_COLORS[key] = new THREE.Color(hex);
    }
  }

  const group = new THREE.Group();
  group.add(createGround());
  addBoundaryWalls(group);
  return group;
}

// --- Internal mesh builders ---

function createGround() {
  const segsX = Math.min(_defaultTrack.width, 256);
  const segsZ = Math.min(_defaultTrack.height, 256);

  const geo = new THREE.PlaneGeometry(_worldW, _worldH, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, getGroundHeight(x, z));

    // Use per-pixel color data if available, otherwise fall back to terrain colors
    if (_mapData && _mapData.colorData) {
      const { col, row } = _defaultTrack.worldToMap(x, z);
      const c = Math.round(Math.max(0, Math.min(_defaultTrack.width - 1, col)));
      const r = Math.round(Math.max(0, Math.min(_defaultTrack.height - 1, row)));
      const ci = (r * _defaultTrack.width + c) * 3;
      colors[i * 3] = _mapData.colorData[ci] / 255;
      colors[i * 3 + 1] = _mapData.colorData[ci + 1] / 255;
      colors[i * 3 + 2] = _mapData.colorData[ci + 2] / 255;
    } else {
      const tt = getTerrainType(x, z);
      const color = TERRAIN_COLORS[tt] || TERRAIN_COLORS[TERRAIN_OFFROAD];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
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
