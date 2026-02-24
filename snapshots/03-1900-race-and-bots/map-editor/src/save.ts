import { type MapState, TerrainType, TERRAIN_COLORS, createMap } from "./state.ts";

/** Generate terrain PNG as base64 data URL */
function terrainToDataURL(map: MapState): string {
  const canvas = new OffscreenCanvas(map.width, map.height);
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(map.width, map.height);

  const colors = [
    TerrainType.Track,
    TerrainType.Offroad,
    TerrainType.Inaccessible,
  ].map((t) => {
    const hex = TERRAIN_COLORS[t]!;
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  });

  for (let i = 0; i < map.width * map.height; i++) {
    const t = map.terrain[i]!;
    const c = colors[t] ?? colors[0]!;
    const j = i * 4;
    img.data[j] = c.r;
    img.data[j + 1] = c.g;
    img.data[j + 2] = c.b;
    img.data[j + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  const regularCanvas = document.createElement("canvas");
  regularCanvas.width = map.width;
  regularCanvas.height = map.height;
  const regularCtx = regularCanvas.getContext("2d")!;
  regularCtx.drawImage(canvas, 0, 0);
  return regularCanvas.toDataURL("image/png");
}

/** Generate heightmap PNG as base64 data URL. 128 = zero, 0 = -max, 255 = +max */
function heightmapToDataURL(map: MapState): string {
  const canvas = document.createElement("canvas");
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(map.width, map.height);

  for (let i = 0; i < map.width * map.height; i++) {
    const h = map.heightmap[i]!;
    const v = Math.round(128 + h * 127);
    const clamped = Math.max(0, Math.min(255, v));
    const j = i * 4;
    img.data[j] = clamped;
    img.data[j + 1] = clamped;
    img.data[j + 2] = clamped;
    img.data[j + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

function mapToJSON(map: MapState): string {
  return JSON.stringify(
    {
      name: map.name,
      width: map.width,
      height: map.height,
      scale: 1,
      start: map.start,
      checkpoints: map.checkpoints,
      boostPads: map.boostPads,
    },
    null,
    2,
  );
}

/** Save map to server via Vite plugin API */
export async function saveMap(map: MapState): Promise<boolean> {
  const terrain = terrainToDataURL(map);
  const heightmap = heightmapToDataURL(map);
  const mapJson = mapToJSON(map);

  const resp = await fetch("/api/save-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: map.name, terrain, heightmap, mapJson }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    alert("Save failed: " + text);
    return false;
  }

  return true;
}

/** Fetch list of saved maps from the server */
export async function listMaps(): Promise<string[]> {
  const resp = await fetch("/api/maps");
  if (!resp.ok) return [];
  const maps = (await resp.json()) as { name: string; hasJson: boolean }[];
  return maps.filter((m) => m.hasJson).map((m) => m.name);
}

// --- Loading ---

function closestTerrain(r: number, g: number, b: number): TerrainType {
  const targets = [
    TerrainType.Track,
    TerrainType.Offroad,
    TerrainType.Inaccessible,
  ].map((t) => {
    const hex = TERRAIN_COLORS[t]!;
    return {
      t,
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  });

  let bestDist = Infinity;
  let best: TerrainType = TerrainType.Offroad;
  for (const c of targets) {
    const dist = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = c.t;
    }
  }
  return best;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function readImagePixels(dataURL: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return loadImage(dataURL).then((img) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, img.width, img.height);
    return { data: id.data, width: img.width, height: img.height };
  });
}

/** Load a map by name from the server */
export async function loadMap(name: string): Promise<MapState> {
  const resp = await fetch(`/api/load-map?name=${encodeURIComponent(name)}`);
  if (!resp.ok) throw new Error(`Failed to load map: ${resp.statusText}`);

  const payload = (await resp.json()) as {
    mapJson: string;
    terrain: string | null;
    heightmap: string | null;
  };

  const meta = JSON.parse(payload.mapJson) as {
    name: string;
    width: number;
    height: number;
    start: MapState["start"];
    checkpoints: MapState["checkpoints"];
    boostPads?: MapState["boostPads"];
  };

  const map = createMap(meta.width, meta.height, meta.name);
  map.start = meta.start;
  map.checkpoints = meta.checkpoints;
  map.boostPads = meta.boostPads || [];

  if (payload.terrain) {
    const { data, width: iw } = await readImagePixels(payload.terrain);
    const w = Math.min(iw, meta.width);
    const h = Math.min(data.length / (iw * 4), meta.height);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * iw + x) * 4;
        map.terrain[y * meta.width + x] = closestTerrain(
          data[si]!,
          data[si + 1]!,
          data[si + 2]!,
        );
      }
    }
  }

  if (payload.heightmap) {
    const { data, width: iw } = await readImagePixels(payload.heightmap);
    const w = Math.min(iw, meta.width);
    const h = Math.min(data.length / (iw * 4), meta.height);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * iw + x) * 4;
        map.heightmap[y * meta.width + x] = (data[si]! - 128) / 127;
      }
    }
  }

  return map;
}
