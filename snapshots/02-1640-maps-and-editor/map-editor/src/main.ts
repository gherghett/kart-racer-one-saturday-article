import { Editor } from "./editor.ts";
import { createMap, type MapState, type EditorState, TerrainType } from "./state.ts";
import { createToolHandler } from "./tools.ts";
import { initUI } from "./ui.ts";

const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
const editor = new Editor(canvas);

let map = createMap(256, 256, "untitled");

const editorState: EditorState = {
  mode: "terrain",
  selectedTerrain: TerrainType.Track,
  brushSize: 4,
  heightStrength: 0.01,
  showHeight: false,
};

function wireTools(): void {
  const handler = createToolHandler(editor, map, editorState);

  // Preserve any existing pointer move handler (from UI status bar)
  const existingMove = editor.onPointerMove;

  editor.onPointerDown = (mx, my, e) => handler.onDown(mx, my, e);
  editor.onPointerMove = (mx, my, e) => {
    handler.onMove(mx, my, e);
    existingMove?.(mx, my, e);
  };
  editor.onPointerUp = (e) => handler.onUp(e);
}

function onMapReplaced(newMap: MapState): void {
  map = newMap;
  editor.init(map, editorState);
  wireTools();
  // Re-init UI's status bar handler will be set by wireTools calling existing handlers
}

editor.init(map, editorState);
wireTools();
initUI(editor, map, editorState, onMapReplaced);
// Re-wire tools after UI init to pick up the status bar handler
wireTools();
editor.startRenderLoop();
