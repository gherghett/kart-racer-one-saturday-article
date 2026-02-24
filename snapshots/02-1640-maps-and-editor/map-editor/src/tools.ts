import type { MapState, EditorState, Checkpoint } from "./state.ts";
import type { Editor } from "./editor.ts";

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
      }
    },

    onMove(mx: number, my: number, e: PointerEvent) {
      if (!isDrawing && dragCheckpointIdx < 0 && !isSettingDirection) return;

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
      }
    },

    onUp(_e: PointerEvent) {
      isDrawing = false;
      dragCheckpointIdx = -1;
      isSettingDirection = false;
    },
  };
}
