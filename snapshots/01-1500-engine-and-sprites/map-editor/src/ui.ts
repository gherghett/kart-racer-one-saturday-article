import type { Editor } from "./editor.ts";
import {
  type MapState,
  type EditorState,
  type EditorMode,
  TERRAIN_COLORS,
  TERRAIN_LABELS,
  TerrainType,
  createMap,
  resizeMap,
} from "./state.ts";
import { saveMap, listMaps, loadMap } from "./save.ts";

const MODES: { key: EditorMode; label: string }[] = [
  { key: "terrain", label: "Terrain" },
  { key: "height", label: "Height" },
  { key: "checkpoint", label: "Checks" },
  { key: "start", label: "Start" },
];

const TERRAIN_TYPES = [TerrainType.Track, TerrainType.Offroad, TerrainType.Inaccessible];

export function initUI(
  editor: Editor,
  map: MapState,
  editorState: EditorState,
  onMapReplaced: (newMap: MapState) => void,
): void {
  // Mode buttons
  const modeBtns = document.getElementById("mode-btns")!;
  const modeButtons: HTMLButtonElement[] = [];
  for (const mode of MODES) {
    const btn = document.createElement("button");
    btn.className = "mode-btn";
    btn.textContent = mode.label;
    if (mode.key === editorState.mode) btn.classList.add("active");
    btn.addEventListener("click", () => {
      editorState.mode = mode.key;
      updateModeUI();
    });
    modeBtns.appendChild(btn);
    modeButtons.push(btn);
  }

  function updateModeUI(): void {
    modeButtons.forEach((btn, i) => {
      btn.classList.toggle("active", MODES[i]!.key === editorState.mode);
    });
    const terrainOpts = document.getElementById("terrain-options")!;
    terrainOpts.style.display = editorState.mode === "terrain" ? "" : "none";
    const heightOpts = document.getElementById("height-options")!;
    heightOpts.style.display = editorState.mode === "height" ? "" : "none";
    editor.canvas.style.cursor =
      editorState.mode === "checkpoint" || editorState.mode === "start"
        ? "pointer"
        : "crosshair";
  }

  // Terrain swatches
  const swatchContainer = document.getElementById("terrain-swatches")!;
  const swatchEls: HTMLDivElement[] = [];
  for (const t of TERRAIN_TYPES) {
    const swatch = document.createElement("div");
    swatch.className = "terrain-swatch";
    swatch.style.backgroundColor = TERRAIN_COLORS[t]!;
    swatch.title = TERRAIN_LABELS[t]!;
    if (t === editorState.selectedTerrain) swatch.classList.add("active");
    swatch.addEventListener("click", () => {
      editorState.selectedTerrain = t;
      swatchEls.forEach((s, i) =>
        s.classList.toggle("active", TERRAIN_TYPES[i] === t),
      );
    });
    swatchContainer.appendChild(swatch);
    swatchEls.push(swatch);
  }

  // Brush size
  const brushSlider = document.getElementById("brush-size") as HTMLInputElement;
  const brushVal = document.getElementById("brush-size-val")!;
  brushSlider.value = String(editorState.brushSize);
  brushVal.textContent = String(editorState.brushSize);
  brushSlider.addEventListener("input", () => {
    editorState.brushSize = parseInt(brushSlider.value);
    brushVal.textContent = brushSlider.value;
  });

  // Show height overlay toggle
  const showHeightCb = document.getElementById("show-height") as HTMLInputElement;
  showHeightCb.checked = editorState.showHeight;
  showHeightCb.addEventListener("change", () => {
    editorState.showHeight = showHeightCb.checked;
  });

  // Height strength
  const strengthSlider = document.getElementById("height-strength") as HTMLInputElement;
  const strengthVal = document.getElementById("height-strength-val")!;
  strengthSlider.value = String(Math.round(editorState.heightStrength * 1000));
  strengthVal.textContent = editorState.heightStrength.toFixed(2);
  strengthSlider.addEventListener("input", () => {
    editorState.heightStrength = parseInt(strengthSlider.value) / 1000;
    strengthVal.textContent = editorState.heightStrength.toFixed(2);
  });

  // Map name
  const nameInput = document.getElementById("map-name") as HTMLInputElement;
  nameInput.value = map.name;
  nameInput.addEventListener("input", () => {
    editor.map.name = nameInput.value;
  });

  // Map size
  const sizeSelect = document.getElementById("map-size") as HTMLSelectElement;
  sizeSelect.value = String(map.width);
  sizeSelect.addEventListener("change", () => {
    const newSize = parseInt(sizeSelect.value);
    const newMap = resizeMap(editor.map, newSize, newSize);
    onMapReplaced(newMap);
  });

  // --- Map list ---
  const mapListEl = document.getElementById("map-list")!;
  let activeMapName = "";

  async function refreshMapList(): Promise<void> {
    const names = await listMaps();
    mapListEl.innerHTML = "";

    if (names.length === 0) {
      const msg = document.createElement("div");
      msg.className = "empty-msg";
      msg.textContent = "No saved maps";
      mapListEl.appendChild(msg);
      return;
    }

    for (const name of names) {
      const item = document.createElement("div");
      item.className = "map-item";
      if (name === activeMapName) item.classList.add("active");
      item.textContent = name;
      item.addEventListener("click", () => openMap(name));
      mapListEl.appendChild(item);
    }
  }

  async function openMap(name: string): Promise<void> {
    try {
      const newMap = await loadMap(name);
      activeMapName = name;
      onMapReplaced(newMap);
      nameInput.value = newMap.name;
      sizeSelect.value = String(newMap.width);
      refreshMapList();
    } catch (err) {
      alert("Failed to load map: " + String(err));
    }
  }

  // Save
  const saveBtn = document.getElementById("save-btn")!;
  saveBtn.addEventListener("click", async () => {
    const ok = await saveMap(editor.map);
    if (ok) {
      activeMapName = editor.map.name;
      refreshMapList();
    }
  });

  // New Map
  document.getElementById("new-map-btn")!.addEventListener("click", () => {
    const size = parseInt(sizeSelect.value);
    const newMap = createMap(size, size, "untitled");
    activeMapName = "";
    onMapReplaced(newMap);
    nameInput.value = newMap.name;
  });

  // Keyboard shortcuts for modes
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    switch (e.key) {
      case "1":
        editorState.mode = "terrain";
        updateModeUI();
        break;
      case "2":
        editorState.mode = "height";
        updateModeUI();
        break;
      case "3":
        editorState.mode = "checkpoint";
        updateModeUI();
        break;
      case "4":
        editorState.mode = "start";
        updateModeUI();
        break;
    }
  });

  // Status bar
  const statusBar = document.getElementById("status-bar")!;
  const origPointerMove = editor.onPointerMove;
  editor.onPointerMove = (x, y, e) => {
    origPointerMove?.(x, y, e);
    const m = editor.map;
    if (x >= 0 && x < m.width && y >= 0 && y < m.height) {
      const h = m.heightmap[y * m.width + x]!;
      statusBar.textContent = `(${x}, ${y}) | Height: ${h.toFixed(2)} | Mode: ${editorState.mode} | Brush: ${editorState.brushSize}`;
    } else {
      statusBar.textContent = `Mode: ${editorState.mode} | Brush: ${editorState.brushSize}`;
    }
  };

  updateModeUI();
  refreshMapList();
}
