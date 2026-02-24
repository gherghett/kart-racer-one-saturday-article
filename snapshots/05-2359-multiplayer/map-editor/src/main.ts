import { Editor } from "./editor.ts";
import { createMap, type MapState, type EditorState, TerrainType } from "./state.ts";
import { createToolHandler } from "./tools.ts";
import { initUI } from "./ui.ts";
import { Preview3D } from "./preview3d.ts";

const canvas = document.getElementById("map-canvas") as HTMLCanvasElement;
const editor = new Editor(canvas);

const previewContainer = document.getElementById("preview-3d")!;
const preview3d = new Preview3D(previewContainer);

let map = createMap(256, 256, "untitled");

const editorState: EditorState = {
  mode: "terrain",
  selectedTerrain: TerrainType.Track,
  brushSize: 4,
  heightStrength: 0.01,
  heightTarget: 0.5,
  showHeight: false,
  selectedColor: "#c2a645",
  selectedDecalId: null,
  activeImageId: null,
  activeSrcRect: null,
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
  preview3d.map = map;
  wireTools();
  if (preview3d.visible) {
    preview3d.rebuild();
  }
}

editor.init(map, editorState);
editor.onTerrainChanged = () => {
  if (preview3d.visible) preview3d.markDirty();
};
preview3d.map = map;
wireTools();
initUI(editor, map, editorState, onMapReplaced, preview3d);
// Re-wire tools after UI init to pick up the status bar handler
wireTools();
editor.startRenderLoop();
