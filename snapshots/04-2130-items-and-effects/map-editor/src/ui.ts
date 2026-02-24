import type { Editor } from "./editor.ts";
import {
  type MapState,
  type EditorState,
  type EditorMode,
  DEFAULT_TERRAIN_COLORS,
  TERRAIN_LABELS,
  TerrainType,
  createMap,
  resizeMap,
  getTerrainColor,
} from "./state.ts";
import { saveMap, listMaps, loadMap } from "./save.ts";
import type { Preview3D } from "./preview3d.ts";

const MODES: { key: EditorMode; label: string }[] = [
  { key: "terrain", label: "Terrain" },
  { key: "height", label: "Height" },
  { key: "color", label: "Color" },
  { key: "checkpoint", label: "Checks" },
  { key: "start", label: "Start" },
  { key: "boost", label: "Boost" },
  { key: "itembox", label: "Items" },
];

const TERRAIN_TYPES = [TerrainType.Track, TerrainType.Offroad, TerrainType.Inaccessible];

export function initUI(
  editor: Editor,
  map: MapState,
  editorState: EditorState,
  onMapReplaced: (newMap: MapState) => void,
  preview3d: Preview3D,
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
    const colorOpts = document.getElementById("color-options")!;
    colorOpts.style.display = editorState.mode === "color" ? "" : "none";
    editor.canvas.style.cursor =
      editorState.mode === "checkpoint" || editorState.mode === "start" || editorState.mode === "boost" || editorState.mode === "itembox"
        ? "pointer"
        : "crosshair";
  }

  // Terrain swatches
  const swatchContainer = document.getElementById("terrain-swatches")!;
  const swatchEls: HTMLDivElement[] = [];
  for (const t of TERRAIN_TYPES) {
    const swatch = document.createElement("div");
    swatch.className = "terrain-swatch";
    swatch.style.backgroundColor = getTerrainColor(editor.map, t);
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

  function updateSwatchColors(): void {
    swatchEls.forEach((s, i) => {
      s.style.backgroundColor = getTerrainColor(editor.map, TERRAIN_TYPES[i]!);
    });
  }

  // Terrain color pickers
  const colorPickersContainer = document.getElementById("terrain-color-pickers")!;
  const colorInputs: HTMLInputElement[] = [];

  function buildColorPickers(): void {
    colorPickersContainer.innerHTML = "";
    colorInputs.length = 0;

    for (const t of TERRAIN_TYPES) {
      const row = document.createElement("div");
      row.className = "color-row";

      const label = document.createElement("label");
      label.textContent = TERRAIN_LABELS[t]!;
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "color";
      input.value = getTerrainColor(editor.map, t);
      input.addEventListener("input", () => {
        editor.map.terrainColors[t] = input.value;
        editor.invalidateTerrain();
        updateSwatchColors();
        if (preview3d.visible) preview3d.rebuild();
      });
      row.appendChild(input);
      colorInputs.push(input);

      const resetBtn = document.createElement("button");
      resetBtn.textContent = "Reset";
      resetBtn.title = "Reset to default color";
      resetBtn.addEventListener("click", () => {
        editor.map.terrainColors[t] = DEFAULT_TERRAIN_COLORS[t]!;
        input.value = DEFAULT_TERRAIN_COLORS[t]!;
        editor.invalidateTerrain();
        updateSwatchColors();
        if (preview3d.visible) preview3d.rebuild();
      });
      row.appendChild(resetBtn);

      colorPickersContainer.appendChild(row);
    }
  }

  buildColorPickers();

  // Color layer paint color
  const colorPaintInput = document.getElementById("color-paint") as HTMLInputElement;
  colorPaintInput.value = editorState.selectedColor;
  colorPaintInput.addEventListener("input", () => {
    editorState.selectedColor = colorPaintInput.value;
  });

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
      buildColorPickers();
      updateSwatchColors();
      if (preview3d.visible) {
        preview3d.map = editor.map;
        preview3d.rebuild();
      }
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

  // 3D Preview floating box
  const openBtn = document.getElementById("preview-3d-open")!;
  const closeBtn = document.getElementById("preview-3d-close")!;

  function showPreview(): void {
    preview3d.map = editor.map;
    preview3d.show();
    preview3d.rebuild();
    openBtn.style.display = "none";
  }

  function hidePreview(): void {
    preview3d.hide();
    openBtn.style.display = "";
  }

  openBtn.addEventListener("click", showPreview);
  closeBtn.addEventListener("click", hidePreview);

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
        editorState.mode = "color";
        updateModeUI();
        break;
      case "4":
        editorState.mode = "checkpoint";
        updateModeUI();
        break;
      case "5":
        editorState.mode = "start";
        updateModeUI();
        break;
      case "6":
        editorState.mode = "boost";
        updateModeUI();
        break;
      case "7":
        editorState.mode = "itembox";
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
