/**
 * Node-compatible map loader using pngjs instead of browser Image/canvas.
 */
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const MAPS_DIR = path.resolve(import.meta.dirname, '../maps');

// Terrain type colors (matching map editor state.ts)
const TERRAIN_COLORS_RGB = [
  { r: 0x33, g: 0x33, b: 0x33 }, // Track = 0
  { r: 0x4a, g: 0x8c, b: 0x3f }, // Offroad = 1
  { r: 0x8b, g: 0x00, b: 0x00 }, // Inaccessible = 2
];

function closestTerrain(r, g, b) {
  let bestDist = Infinity;
  let best = 1;
  for (let i = 0; i < TERRAIN_COLORS_RGB.length; i++) {
    const c = TERRAIN_COLORS_RGB[i];
    const dist = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function readPNG(filePath) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(filePath);
    new PNG().parse(data, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

export function listMaps() {
  try {
    return fs.readdirSync(MAPS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        try {
          const json = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, d.name, 'map.json'), 'utf-8'));
          return { id: d.name, ...json };
        } catch {
          return { id: d.name, name: d.name };
        }
      });
  } catch {
    return [];
  }
}

export async function loadMap(mapId) {
  const mapDir = path.join(MAPS_DIR, mapId);
  const meta = JSON.parse(fs.readFileSync(path.join(mapDir, 'map.json'), 'utf-8'));

  const [terrainPng, heightmapPng] = await Promise.all([
    readPNG(path.join(mapDir, 'terrain.png')),
    readPNG(path.join(mapDir, 'heightmap.png')),
  ]);

  const { width, height, scale, start, checkpoints, boostPads, itemBoxes, name } = meta;

  // Parse terrain
  const terrain = new Uint8Array(width * height);
  terrain.fill(1);
  const tw = Math.min(terrainPng.width, width);
  const th = Math.min(terrainPng.height, height);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const si = (y * terrainPng.width + x) * 4;
      terrain[y * width + x] = closestTerrain(
        terrainPng.data[si],
        terrainPng.data[si + 1],
        terrainPng.data[si + 2],
      );
    }
  }

  // Parse heightmap
  const heightmap = new Float32Array(width * height);
  const hw = Math.min(heightmapPng.width, width);
  const hh = Math.min(heightmapPng.height, height);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const si = (y * heightmapPng.width + x) * 4;
      heightmap[y * width + x] = (heightmapPng.data[si] - 128) / 127;
    }
  }

  return {
    id: mapId,
    name: name || mapId,
    width,
    height,
    scale: scale || 1,
    start,
    checkpoints: checkpoints || [],
    boostPads: boostPads || [],
    itemBoxes: itemBoxes || [],
    terrain,
    heightmap,
  };
}
