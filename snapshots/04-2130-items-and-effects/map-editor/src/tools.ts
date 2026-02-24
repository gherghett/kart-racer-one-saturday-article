import type { MapState, EditorState, Checkpoint, BoostPad, ItemBox } from "./state.ts";
import type { Editor } from "./editor.ts";

/** Parse hex color to RGB */
function hexToRGB(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Paint color layer in a square brush area */
export function paintColor(
  map: MapState,
  cx: number,
  cy: number,
  state: EditorState,
): void {
  const half = Math.floor(state.brushSize / 2);
  const { r, g, b } = hexToRGB(state.selectedColor);
  for (let dy = -half; dy < state.brushSize - half; dy++) {
    for (let dx = -half; dx < state.brushSize - half; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const off = (y * map.width + x) * 4;
      map.colorLayer[off] = r;
      map.colorLayer[off + 1] = g;
      map.colorLayer[off + 2] = b;
      map.colorLayer[off + 3] = 255;
    }
  }
}

/** Erase color layer in a square brush area (reverts to terrain color) */
export function eraseColor(
  map: MapState,
  cx: number,
  cy: number,
  state: EditorState,
): void {
  const half = Math.floor(state.brushSize / 2);
  for (let dy = -half; dy < state.brushSize - half; dy++) {
    for (let dx = -half; dx < state.brushSize - half; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const off = (y * map.width + x) * 4;
      map.colorLayer[off + 3] = 0;
    }
  }
}

/** Paint terrain in a square brush area */
export function paintTerrain(
  map: MapState,
  cx: number,
  cy: number,
  state: EditorState,
): void {
  const half = Math.floor(state.brushSize / 2);
  for (let dy = -half; dy < state.brushSize - half; dy++) {
    for (let dx = -half; dx < state.brushSize - half; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      map.terrain[y * map.width + x] = state.selectedTerrain;
    }
  }
}

/** Adjust height with a soft circular brush. sign = +1 for raise, -1 for lower */
export function paintHeight(
  map: MapState,
  cx: number,
  cy: number,
  state: EditorState,
  sign: number,
): void {
  const half = Math.floor(state.brushSize / 2);
  const radius = half || 1;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;

      // Soft falloff based on distance from center
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;
      const strength = (1 - dist / radius) * state.heightStrength;

      const idx = y * map.width + x;
      map.heightmap[idx] = Math.max(
        -1,
        Math.min(1, map.heightmap[idx]! + sign * strength),
      );
    }
  }
}

const CHECKPOINT_HIT_RADIUS = 8; // in screen pixels

/** Find the checkpoint index near a screen position, or -1 */
export function findCheckpointAt(
  map: MapState,
  editor: Editor,
  sx: number,
  sy: number,
): number {
  for (let i = 0; i < map.checkpoints.length; i++) {
    const cp = map.checkpoints[i]!;
    const cpScreenX = editor.panX + (cp.x + 0.5) * editor.zoom;
    const cpScreenY = editor.panY + (cp.y + 0.5) * editor.zoom;
    const dx = sx - cpScreenX;
    const dy = sy - cpScreenY;
    const hitR = Math.max(CHECKPOINT_HIT_RADIUS, editor.zoom * 0.8);
    if (dx * dx + dy * dy <= hitR * hitR) return i;
  }
  return -1;
}

/** Add a checkpoint at map coordinates */
export function addCheckpoint(map: MapState, x: number, y: number): void {
  map.checkpoints.push({ x, y });
}

/** Remove a checkpoint by index */
export function removeCheckpoint(map: MapState, index: number): void {
  map.checkpoints.splice(index, 1);
}

/** Move a checkpoint to new map coordinates */
export function moveCheckpoint(
  cp: Checkpoint,
  x: number,
  y: number,
): void {
  cp.x = x;
  cp.y = y;
}

/** Set the start position and direction */
export function setStartPosition(
  map: MapState,
  x: number,
  y: number,
): void {
  map.start = { x, y, angle: 0 };
}

/** Update start direction angle from drag position */
export function updateStartDirection(
  map: MapState,
  x: number,
  y: number,
): void {
  if (!map.start) return;
  const dx = x - map.start.x;
  const dy = y - map.start.y;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    map.start.angle = Math.atan2(dy, dx);
  }
}

/** Find the boost pad index near a screen position, or -1 */
export function findBoostPadAt(
  map: MapState,
  editor: Editor,
  sx: number,
  sy: number,
): number {
  for (let i = 0; i < map.boostPads.length; i++) {
    const bp = map.boostPads[i]!;
    const bpScreenX = editor.panX + (bp.x + 0.5) * editor.zoom;
    const bpScreenY = editor.panY + (bp.y + 0.5) * editor.zoom;
    const dx = sx - bpScreenX;
    const dy = sy - bpScreenY;
    const hitR = Math.max(CHECKPOINT_HIT_RADIUS, editor.zoom * 0.8);
    if (dx * dx + dy * dy <= hitR * hitR) return i;
  }
  return -1;
}

export function addBoostPad(map: MapState, x: number, y: number): void {
  map.boostPads.push({ x, y, angle: 0 });
}

export function removeBoostPad(map: MapState, index: number): void {
  map.boostPads.splice(index, 1);
}

export function moveBoostPad(bp: BoostPad, x: number, y: number): void {
  bp.x = x;
  bp.y = y;
}

export function updateBoostPadDirection(
  bp: BoostPad,
  x: number,
  y: number,
): void {
  const dx = x - bp.x;
  const dy = y - bp.y;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    bp.angle = Math.atan2(dy, dx);
  }
}

/** Find the item box index near a screen position, or -1 */
export function findItemBoxAt(
  map: MapState,
  editor: Editor,
  sx: number,
  sy: number,
): number {
  for (let i = 0; i < map.itemBoxes.length; i++) {
    const ib = map.itemBoxes[i]!;
    const ibScreenX = editor.panX + (ib.x + 0.5) * editor.zoom;
    const ibScreenY = editor.panY + (ib.y + 0.5) * editor.zoom;
    const dx = sx - ibScreenX;
    const dy = sy - ibScreenY;
    const hitR = Math.max(CHECKPOINT_HIT_RADIUS, editor.zoom * 0.8);
    if (dx * dx + dy * dy <= hitR * hitR) return i;
  }
  return -1;
}

export function addItemBox(map: MapState, x: number, y: number): void {
  map.itemBoxes.push({ x, y });
}

export function removeItemBox(map: MapState, index: number): void {
  map.itemBoxes.splice(index, 1);
}

export function moveItemBox(ib: ItemBox, x: number, y: number): void {
  ib.x = x;
  ib.y = y;
}

export interface ToolHandler {
  onDown(mx: number, my: number, e: PointerEvent): void;
  onMove(mx: number, my: number, e: PointerEvent): void;
  onUp(e: PointerEvent): void;
}

export function createToolHandler(
  editor: Editor,
  map: MapState,
  editorState: EditorState,
): ToolHandler {
  let isDrawing = false;
  let dragCheckpointIdx = -1;
  let isSettingDirection = false;
  let dragBoostPadIdx = -1;
  let isSettingBoostDir = false;
  let dragItemBoxIdx = -1;

  return {
    onDown(mx: number, my: number, e: PointerEvent) {
      switch (editorState.mode) {
        case "terrain": {
          if (e.button !== 0) return;
          isDrawing = true;
          paintTerrain(map, mx, my, editorState);
          editor.invalidateTerrain();
          break;
        }
        case "height": {
          if (e.button !== 0 && e.button !== 2) return;
          isDrawing = true;
          const sign = e.button === 0 ? 1 : -1;
          paintHeight(map, mx, my, editorState, sign);
          editor.invalidateTerrain();
          break;
        }
        case "color": {
          if (e.button !== 0 && e.button !== 2) return;
          isDrawing = true;
          if (e.button === 0) {
            paintColor(map, mx, my, editorState);
          } else {
            eraseColor(map, mx, my, editorState);
          }
          editor.invalidateTerrain();
          break;
        }
        case "checkpoint": {
          if (e.button === 2) {
            // Right-click: remove
            const idx = findCheckpointAt(map, editor, e.offsetX, e.offsetY);
            if (idx >= 0) removeCheckpoint(map, idx);
          } else if (e.button === 0) {
            // Left-click: drag existing or add new
            const idx = findCheckpointAt(map, editor, e.offsetX, e.offsetY);
            if (idx >= 0) {
              dragCheckpointIdx = idx;
            } else {
              addCheckpoint(map, mx, my);
            }
          }
          break;
        }
        case "start": {
          if (e.button === 0) {
            setStartPosition(map, mx, my);
            isSettingDirection = true;
          }
          break;
        }
        case "boost": {
          if (e.button === 2) {
            const idx = findBoostPadAt(map, editor, e.offsetX, e.offsetY);
            if (idx >= 0) removeBoostPad(map, idx);
          } else if (e.button === 0) {
            const idx = findBoostPadAt(map, editor, e.offsetX, e.offsetY);
            if (idx >= 0) {
              dragBoostPadIdx = idx;
              isSettingBoostDir = true;
            } else {
              addBoostPad(map, mx, my);
              dragBoostPadIdx = map.boostPads.length - 1;
              isSettingBoostDir = true;
            }
          }
          break;
        }
        case "itembox": {
          if (e.button === 2) {
            const idx = findItemBoxAt(map, editor, e.offsetX, e.offsetY);
            if (idx >= 0) removeItemBox(map, idx);
          } else if (e.button === 0) {
            const idx = findItemBoxAt(map, editor, e.offsetX, e.offsetY);
            if (idx >= 0) {
              dragItemBoxIdx = idx;
            } else {
              addItemBox(map, mx, my);
            }
          }
          break;
        }
      }
    },

    onMove(mx: number, my: number, e: PointerEvent) {
      if (!isDrawing && dragCheckpointIdx < 0 && !isSettingDirection && !isSettingBoostDir && dragItemBoxIdx < 0) return;

      switch (editorState.mode) {
        case "terrain": {
          paintTerrain(map, mx, my, editorState);
          editor.invalidateTerrain();
          break;
        }
        case "height": {
          const sign = e.buttons & 2 ? -1 : 1;
          paintHeight(map, mx, my, editorState, sign);
          editor.invalidateTerrain();
          break;
        }
        case "color": {
          if (e.buttons & 2) {
            eraseColor(map, mx, my, editorState);
          } else {
            paintColor(map, mx, my, editorState);
          }
          editor.invalidateTerrain();
          break;
        }
        case "checkpoint": {
          if (dragCheckpointIdx >= 0) {
            const cp = map.checkpoints[dragCheckpointIdx];
            if (cp) moveCheckpoint(cp, mx, my);
          }
          break;
        }
        case "start": {
          if (isSettingDirection) {
            updateStartDirection(map, mx, my);
          }
          break;
        }
        case "boost": {
          if (dragBoostPadIdx >= 0 && isSettingBoostDir) {
            const bp = map.boostPads[dragBoostPadIdx];
            if (bp) updateBoostPadDirection(bp, mx, my);
          }
          break;
        }
        case "itembox": {
          if (dragItemBoxIdx >= 0) {
            const ib = map.itemBoxes[dragItemBoxIdx];
            if (ib) moveItemBox(ib, mx, my);
          }
          break;
        }
      }
    },

    onUp(_e: PointerEvent) {
      isDrawing = false;
      dragCheckpointIdx = -1;
      isSettingDirection = false;
      dragBoostPadIdx = -1;
      isSettingBoostDir = false;
      dragItemBoxIdx = -1;
    },
  };
}
