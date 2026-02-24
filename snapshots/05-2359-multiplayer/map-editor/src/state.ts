/** Terrain type indices */
export const enum TerrainType {
  Track = 0,
  Offroad = 1,
  Inaccessible = 2,
}

/** Default color per terrain type (used for terrain.png type identification) */
export const DEFAULT_TERRAIN_COLORS: Record<number, string> = {
  [TerrainType.Track]: "#333333",
  [TerrainType.Offroad]: "#4a8c3f",
  [TerrainType.Inaccessible]: "#8b0000",
};

/** Alias kept for backward compat in save.ts terrain export */
export const TERRAIN_COLORS = DEFAULT_TERRAIN_COLORS;

export const TERRAIN_LABELS: Record<number, string> = {
  [TerrainType.Track]: "Track",
  [TerrainType.Offroad]: "Off-road",
  [TerrainType.Inaccessible]: "Inaccessible",
};

export type EditorMode = "terrain" | "height" | "color" | "checkpoint" | "start" | "boost" | "itembox" | "decal";

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

export interface ItemBox {
  x: number;
  y: number;
}

export interface DecalImage {
  id: string;
  name: string;
  dataUrl: string;
}

/** A named region of a DecalImage (for spritesheets). No pixel data copied — just a reference. */
export interface DecalSprite {
  id: string;
  imageId: string;
  rect: { x: number; y: number; w: number; h: number };
  name: string;
}

export interface Decal {
  id: string;
  imageId: string;
  srcRect: { x: number; y: number; w: number; h: number } | null;
  corners: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  opacity: number;
  zOrder: number;
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
  itemBoxes: ItemBox[];
  /** Custom visual colors per terrain type (overrides defaults for rendering/color.png) */
  terrainColors: Record<number, string>;
  /**
   * Per-pixel color override layer. Flat RGBA array [y * width + x] * 4.
   * Alpha 0 = use terrain color, Alpha 255 = use this pixel's RGB.
   */
  colorLayer: Uint8Array;
  decalImages: DecalImage[];
  decalSprites: DecalSprite[];
  decals: Decal[];
}

export interface EditorState {
  mode: EditorMode;
  selectedTerrain: TerrainType;
  brushSize: number;
  heightStrength: number;
  /** Target height for the height brush (-1.0 to +1.0). Left-click paints toward target, right-click flattens toward 0. */
  heightTarget: number;
  showHeight: boolean;
  /** Currently selected paint color for the color layer */
  selectedColor: string;
  selectedDecalId: string | null;
  /** The source image for placing new decals */
  activeImageId: string | null;
  /** If set, crop this rect from the active image when placing. null = full image. */
  activeSrcRect: { x: number; y: number; w: number; h: number } | null;
}

/** Get the visual color for a terrain type, using map custom colors or defaults */
export function getTerrainColor(map: MapState, t: TerrainType): string {
  return map.terrainColors[t] ?? DEFAULT_TERRAIN_COLORS[t] ?? "#ff00ff";
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
    itemBoxes: [],
    terrainColors: { ...DEFAULT_TERRAIN_COLORS },
    colorLayer: new Uint8Array(width * height * 4),
    decalImages: [],
    decalSprites: [],
    decals: [],
  };
}

export function resizeMap(map: MapState, newWidth: number, newHeight: number): MapState {
  const newTerrain = new Uint8Array(newWidth * newHeight);
  newTerrain.fill(TerrainType.Offroad);
  const newHeightmap = new Float32Array(newWidth * newHeight);
  const newColorLayer = new Uint8Array(newWidth * newHeight * 4);

  // Copy overlapping region
  const copyW = Math.min(map.width, newWidth);
  const copyH = Math.min(map.height, newHeight);
  for (let y = 0; y < copyH; y++) {
    for (let x = 0; x < copyW; x++) {
      newTerrain[y * newWidth + x] = map.terrain[y * map.width + x]!;
      newHeightmap[y * newWidth + x] = map.heightmap[y * map.width + x]!;
      const srcOff = (y * map.width + x) * 4;
      const dstOff = (y * newWidth + x) * 4;
      newColorLayer[dstOff] = map.colorLayer[srcOff]!;
      newColorLayer[dstOff + 1] = map.colorLayer[srcOff + 1]!;
      newColorLayer[dstOff + 2] = map.colorLayer[srcOff + 2]!;
      newColorLayer[dstOff + 3] = map.colorLayer[srcOff + 3]!;
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

  const itemBoxes = map.itemBoxes.filter(
    (ib) => ib.x < newWidth && ib.y < newHeight,
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
    itemBoxes,
    terrainColors: { ...map.terrainColors },
    colorLayer: newColorLayer,
    decalImages: [...map.decalImages],
    decalSprites: [...map.decalSprites],
    decals: map.decals.filter((d) =>
      d.corners.some((c) => c.x < newWidth && c.y < newHeight),
    ),
  };
}
