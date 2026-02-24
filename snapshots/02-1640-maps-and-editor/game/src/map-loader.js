/**
 * Loads map data from the /maps/ directory.
 */

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function getImageData(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

// Terrain type colors (matching map editor state.ts)
const TERRAIN_COLORS_RGB = [
  { r: 0x33, g: 0x33, b: 0x33 }, // Track = 0
  { r: 0x4a, g: 0x8c, b: 0x3f }, // Offroad = 1
  { r: 0x8b, g: 0x00, b: 0x00 }, // Inaccessible = 2
];

function closestTerrain(r, g, b) {
  let bestDist = Infinity;
  let best = 1; // offroad
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

/** Fetch the list of available maps from the dev server */
export async function listMaps() {
  const resp = await fetch('/api/maps');
  return resp.json();
}

/** Load a full map by folder name */
export async function loadMap(mapId) {
  const [meta, terrainImg, heightmapImg] = await Promise.all([
    fetch(`/maps/${mapId}/map.json`).then(r => r.json()),
    loadImage(`/maps/${mapId}/terrain.png`),
    loadImage(`/maps/${mapId}/heightmap.png`),
  ]);

  const { width, height, scale, start, checkpoints, name } = meta;

  // Parse terrain image
  const terrainData = getImageData(terrainImg);
  const terrain = new Uint8Array(width * height);
  terrain.fill(1); // default offroad
  const tw = Math.min(terrainImg.width, width);
  const th = Math.min(terrainImg.height, height);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const si = (y * terrainImg.width + x) * 4;
      terrain[y * width + x] = closestTerrain(
        terrainData.data[si],
        terrainData.data[si + 1],
        terrainData.data[si + 2],
      );
    }
  }

  // Parse heightmap image: pixel value 128 = 0, 0 = -1, 255 = +1
  const heightData = getImageData(heightmapImg);
  const heightmap = new Float32Array(width * height);
  const hw = Math.min(heightmapImg.width, width);
  const hh = Math.min(heightmapImg.height, height);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const si = (y * heightmapImg.width + x) * 4;
      heightmap[y * width + x] = (heightData.data[si] - 128) / 127;
    }
  }

  return {
    id: mapId,
    name: name || mapId,
    width,
    height,
    scale: scale || 1,
    start,
    checkpoints,
    terrain,
    heightmap,
  };
}
