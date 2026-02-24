/** Terrain type indices */
export const enum TerrainType {
  Track = 0,
  Offroad = 1,
  Inaccessible = 2,
}

/** Color per terrain type (used for rendering + export) */
export const TERRAIN_COLORS: Record<number, string> = {
  [TerrainType.Track]: "#333333",
  [TerrainType.Offroad]: "#4a8c3f",
  [TerrainType.Inaccessible]: "#8b0000",
};

export const TERRAIN_LABELS: Record<number, string> = {
  [TerrainType.Track]: "Track",
  [TerrainType.Offroad]: "Off-road",
  [TerrainType.Inaccessible]: "Inaccessible",
};

export type EditorMode = "terrain" | "height" | "checkpoint" | "start" | "boost";

export interface Checkpoint {
  x: number;
  y: number;
}

export interface StartLine {
  x: number;
  y: number;
  /** Direction angle in radians */
  angle: number;
}

export interface BoostPad {
  x: number;
  y: number;
  angle: number;
}

export interface MapState {
  name: string;
  width: number;
  height: number;
  /** Flat array [y * width + x] of TerrainType values */
  terrain: Uint8Array;
  /** Flat array [y * width + x] of height values, 0.0 = neutral */
  heightmap: Float32Array;
  checkpoints: Checkpoint[];
  start: StartLine | null;
  boostPads: BoostPad[];
}

export interface EditorState {
  mode: EditorMode;
  selectedTerrain: TerrainType;
  brushSize: number;
  heightStrength: number;
  showHeight: boolean;
}

export function createMap(width: number, height: number, name: string): MapState {
  const terrain = new Uint8Array(width * height);
  // Default to offroad
  terrain.fill(TerrainType.Offroad);
  return {
    name,
    width,
    height,
    terrain,
    heightmap: new Float32Array(width * height),
    checkpoints: [],
    start: null,
    boostPads: [],
  };
}

export function resizeMap(map: MapState, newWidth: number, newHeight: number): MapState {
  const newTerrain = new Uint8Array(newWidth * newHeight);
  newTerrain.fill(TerrainType.Offroad);
  const newHeightmap = new Float32Array(newWidth * newHeight);

  // Copy overlapping region
  const copyW = Math.min(map.width, newWidth);
  const copyH = Math.min(map.height, newHeight);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      newTerrain[y * newWidth + x] = map.terrain[y * map.width + x]!;
      newHeightmap[y * newWidth + x] = map.heightmap[y * map.width + x]!;
    }
  }

  // Filter out checkpoints/start that are out of bounds
  const checkpoints = map.checkpoints.filter(
    (cp) => cp.x < newWidth && cp.y < newHeight,
  );
  const start =
    map.start && map.start.x < newWidth && map.start.y < newHeight
      ? map.start
      : null;

  const boostPads = map.boostPads.filter(
    (bp) => bp.x < newWidth && bp.y < newHeight,
  );

  return {
    name: map.name,
    width: newWidth,
    height: newHeight,
    terrain: newTerrain,
    heightmap: newHeightmap,
    checkpoints,
    start,
    boostPads,
  };
}
