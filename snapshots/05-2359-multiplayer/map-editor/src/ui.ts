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
import { genId, pruneImageCache, getDecalImage } from "./decals.ts";

const MODES: { key: EditorMode; label: string }[] = [
  { key: "terrain", label: "Terrain" },
  { key: "height", label: "Height" },
  { key: "color", label: "Color" },
  { key: "checkpoint", label: "Checks" },
  { key: "start", label: "Start" },
  { key: "boost", label: "Boost" },
  { key: "itembox", label: "Items" },
  { key: "decal", label: "Decal" },
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
    const decalOpts = document.getElementById("decal-options")!;
    decalOpts.style.display = editorState.mode === "decal" ? "" : "none";
    if (editorState.mode === "decal") updateDecalSelUI();
    editor.canvas.style.cursor =
      editorState.mode === "checkpoint" || editorState.mode === "start" || editorState.mode === "boost" || editorState.mode === "itembox" || editorState.mode === "decal"
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
      rebuildDecalThumbs();
      editorState.selectedDecalId = null;
      editorState.activeImageId = newMap.decalImages[0]?.id ?? null;
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

  // Decal mode cursor update based on modifier keys
  function updateDecalCursor(e: KeyboardEvent | { altKey: boolean; ctrlKey: boolean }): void {
    if (editorState.mode !== "decal") return;
    if (e.altKey) {
      editor.canvas.style.cursor = "grab";
    } else if (e.ctrlKey) {
      editor.canvas.style.cursor = "nwse-resize";
    } else {
      editor.canvas.style.cursor = "pointer";
    }
  }

  // Keyboard shortcuts for modes
  window.addEventListener("keydown", (e) => {
    updateDecalCursor(e);
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
      case "8":
        editorState.mode = "decal";
        updateModeUI();
        break;
    }
  });

  window.addEventListener("keyup", (e) => {
    updateDecalCursor(e);
  });

  // --- Decal UI ---
  const decalThumbsEl = document.getElementById("decal-thumbs")!;
  const decalFileInput = document.getElementById("decal-file-input") as HTMLInputElement;
  const decalSelOpts = document.getElementById("decal-sel-opts")!;
  const decalOpacitySlider = document.getElementById("decal-opacity") as HTMLInputElement;
  const decalOpacityVal = document.getElementById("decal-opacity-val")!;

  /** Check if a thumbnail is the currently active source */
  function isActiveSource(imageId: string, rect: { x: number; y: number; w: number; h: number } | null): boolean {
    if (editorState.activeImageId !== imageId) return false;
    if (!rect && !editorState.activeSrcRect) return true;
    if (!rect || !editorState.activeSrcRect) return false;
    return rect.x === editorState.activeSrcRect.x && rect.y === editorState.activeSrcRect.y
      && rect.w === editorState.activeSrcRect.w && rect.h === editorState.activeSrcRect.h;
  }

  function makeSpriteThumb(_imageId: string, dataUrl: string, rect: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = 48; c.height = 48;
    const ctx2 = c.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      // Draw the cropped region scaled to 48x48
      const aspect = rect.w / rect.h;
      let dw = 48, dh = 48;
      if (aspect > 1) { dh = 48 / aspect; } else { dw = 48 * aspect; }
      const dx = (48 - dw) / 2, dy = (48 - dh) / 2;
      ctx2.drawImage(img, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh);
    };
    img.src = dataUrl;
    return c;
  }

  function rebuildDecalThumbs(): void {
    decalThumbsEl.innerHTML = "";

    // Full images
    for (const di of editor.map.decalImages) {
      const wrap = document.createElement("div");
      wrap.className = "decal-thumb";
      if (isActiveSource(di.id, null)) wrap.classList.add("active");

      const img = document.createElement("img");
      img.src = di.dataUrl;
      img.title = di.name;
      wrap.appendChild(img);

      const cropBtn = document.createElement("button");
      cropBtn.className = "crop-btn";
      cropBtn.title = "Crop region";
      cropBtn.textContent = "\u2702";
      cropBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openCropModal(di.id);
      });
      wrap.appendChild(cropBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.title = "Remove image";
      delBtn.textContent = "\u00d7";
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const usedCount = editor.map.decals.filter((d) => d.imageId === di.id).length;
        const msg = usedCount > 0
          ? `Remove "${di.name}" and its ${usedCount} placed instance${usedCount > 1 ? "s" : ""}?`
          : `Remove "${di.name}"?`;
        if (!confirm(msg)) return;
        // Remove all decals using this image
        editor.map.decals = editor.map.decals.filter((d) => d.imageId !== di.id);
        // Remove sprites referencing this image
        editor.map.decalSprites = editor.map.decalSprites.filter((s) => s.imageId !== di.id);
        // Remove the image itself
        const idx = editor.map.decalImages.indexOf(di);
        if (idx >= 0) editor.map.decalImages.splice(idx, 1);
        pruneImageCache(editor.map);
        if (editorState.activeImageId === di.id) {
          editorState.activeImageId = editor.map.decalImages[0]?.id ?? null;
          editorState.activeSrcRect = null;
        }
        if (editorState.selectedDecalId && !editor.map.decals.find((d) => d.id === editorState.selectedDecalId)) {
          editorState.selectedDecalId = null;
        }
        rebuildDecalThumbs();
        updateDecalSelUI();
        editor.invalidateTerrain();
      });
      wrap.appendChild(delBtn);

      wrap.addEventListener("click", () => {
        editorState.activeImageId = di.id;
        editorState.activeSrcRect = null;
        rebuildDecalThumbs();
      });
      decalThumbsEl.appendChild(wrap);
    }

    // Sprite regions
    for (const sp of editor.map.decalSprites) {
      const di = editor.map.decalImages.find((i) => i.id === sp.imageId);
      if (!di) continue;

      const wrap = document.createElement("div");
      wrap.className = "decal-thumb";
      if (isActiveSource(sp.imageId, sp.rect)) wrap.classList.add("active");

      const canvas = makeSpriteThumb(sp.imageId, di.dataUrl, sp.rect);
      canvas.title = sp.name;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      wrap.appendChild(canvas);

      // Crop button — opens modal on the parent image (to sub-crop)
      const cropBtn = document.createElement("button");
      cropBtn.className = "crop-btn";
      cropBtn.title = "Crop sub-region";
      cropBtn.textContent = "\u2702";
      cropBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openCropModal(sp.imageId);
      });
      wrap.appendChild(cropBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.title = "Remove sprite";
      delBtn.textContent = "\u00d7";
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // Count decals that match this sprite's imageId + rect
        const usedCount = editor.map.decals.filter((d) =>
          d.imageId === sp.imageId && d.srcRect &&
          d.srcRect.x === sp.rect.x && d.srcRect.y === sp.rect.y &&
          d.srcRect.w === sp.rect.w && d.srcRect.h === sp.rect.h
        ).length;
        const msg = usedCount > 0
          ? `Remove "${sp.name}" and its ${usedCount} placed instance${usedCount > 1 ? "s" : ""}?`
          : `Remove "${sp.name}"?`;
        if (!confirm(msg)) return;
        // Remove matching decals
        editor.map.decals = editor.map.decals.filter((d) =>
          !(d.imageId === sp.imageId && d.srcRect &&
            d.srcRect.x === sp.rect.x && d.srcRect.y === sp.rect.y &&
            d.srcRect.w === sp.rect.w && d.srcRect.h === sp.rect.h)
        );
        // Remove the sprite
        const idx = editor.map.decalSprites.indexOf(sp);
        if (idx >= 0) editor.map.decalSprites.splice(idx, 1);
        if (editorState.activeImageId === sp.imageId && editorState.activeSrcRect &&
            editorState.activeSrcRect.x === sp.rect.x && editorState.activeSrcRect.y === sp.rect.y &&
            editorState.activeSrcRect.w === sp.rect.w && editorState.activeSrcRect.h === sp.rect.h) {
          editorState.activeSrcRect = null;
        }
        if (editorState.selectedDecalId && !editor.map.decals.find((d) => d.id === editorState.selectedDecalId)) {
          editorState.selectedDecalId = null;
        }
        rebuildDecalThumbs();
        updateDecalSelUI();
        editor.invalidateTerrain();
      });
      wrap.appendChild(delBtn);

      wrap.addEventListener("click", () => {
        editorState.activeImageId = sp.imageId;
        editorState.activeSrcRect = { ...sp.rect };
        rebuildDecalThumbs();
      });
      decalThumbsEl.appendChild(wrap);
    }
  }

  function updateDecalSelUI(): void {
    const sel = editor.map.decals.find((d) => d.id === editorState.selectedDecalId);
    decalSelOpts.style.display = sel ? "" : "none";
    if (sel) {
      decalOpacitySlider.value = String(Math.round(sel.opacity * 100));
      decalOpacityVal.textContent = String(Math.round(sel.opacity * 100));
    }
  }

  decalOpacitySlider.addEventListener("input", () => {
    const sel = editor.map.decals.find((d) => d.id === editorState.selectedDecalId);
    if (sel) {
      sel.opacity = parseInt(decalOpacitySlider.value) / 100;
      decalOpacityVal.textContent = decalOpacitySlider.value;
      editor.invalidateTerrain();
    }
  });

  document.getElementById("decal-save-as")!.addEventListener("click", () => {
    const sel = editor.map.decals.find((d) => d.id === editorState.selectedDecalId);
    if (!sel) return;
    const img = getDecalImage(editor.map, sel.imageId);
    if (!img || !img.complete) return;

    // Compute bounding box of corners to determine output size
    const xs = sel.corners.map((c) => c.x);
    const ys = sel.corners.map((c) => c.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const w = Math.max(1, Math.ceil(maxX - minX));
    const h = Math.max(1, Math.ceil(maxY - minY));

    // Render the decal at 1:1 map scale into an offscreen canvas
    const scale = Math.max(1, Math.min(4, 256 / Math.max(w, h))); // upscale small decals
    const cw = Math.ceil(w * scale);
    const ch = Math.ceil(h * scale);
    const offscreen = document.createElement("canvas");
    offscreen.width = cw;
    offscreen.height = ch;
    const ctx = offscreen.getContext("2d")!;

    // Source rect
    const srcX = sel.srcRect?.x ?? 0;
    const srcY = sel.srcRect?.y ?? 0;
    const srcW = sel.srcRect?.w ?? img.naturalWidth;
    const srcH = sel.srcRect?.h ?? img.naturalHeight;

    // Map corners to canvas space (offset by minX/minY, scaled)
    const SUBDIV = 8;
    const corners = sel.corners.map((c) => ({
      x: (c.x - minX) * scale,
      y: (c.y - minY) * scale,
    }));
    const p0 = corners[0]!, p1 = corners[1]!, p2 = corners[2]!, p3 = corners[3]!;

    function bilerp(u: number, v: number) {
      const top = { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u };
      const bot = { x: p3.x + (p2.x - p3.x) * u, y: p3.y + (p2.y - p3.y) * u };
      return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
    }

    function solveAffine(s0: {x:number;y:number}, s1: {x:number;y:number}, s2: {x:number;y:number},
                         d0: {x:number;y:number}, d1: {x:number;y:number}, d2: {x:number;y:number}) {
      const sx1 = s1.x - s0.x, sy1 = s1.y - s0.y;
      const sx2 = s2.x - s0.x, sy2 = s2.y - s0.y;
      const det = sx1 * sy2 - sx2 * sy1;
      if (Math.abs(det) < 1e-10) return [1,0,0,1,0,0] as const;
      const inv = 1 / det;
      const dx1 = d1.x - d0.x, dy1 = d1.y - d0.y;
      const dx2 = d2.x - d0.x, dy2 = d2.y - d0.y;
      return [
        (dx1*sy2 - dx2*sy1)*inv, (dy1*sy2 - dy2*sy1)*inv,
        (sx1*dx2 - sx2*dx1)*inv, (sx1*dy2 - sx2*dy1)*inv,
        d0.x - ((dx1*sy2 - dx2*sy1)*inv)*s0.x - ((sx1*dx2 - sx2*dx1)*inv)*s0.y,
        d0.y - ((dy1*sy2 - dy2*sy1)*inv)*s0.x - ((sx1*dy2 - sx2*dy1)*inv)*s0.y,
      ] as const;
    }

    ctx.globalAlpha = sel.opacity;
    for (let gy = 0; gy < SUBDIV; gy++) {
      for (let gx = 0; gx < SUBDIV; gx++) {
        const u0 = gx / SUBDIV, v0 = gy / SUBDIV;
        const u1 = (gx+1) / SUBDIV, v1 = (gy+1) / SUBDIV;
        const a = bilerp(u0, v0), b = bilerp(u1, v0);
        const c = bilerp(u1, v1), d = bilerp(u0, v1);
        const sa = {x: srcX + u0*srcW, y: srcY + v0*srcH};
        const sb = {x: srcX + u1*srcW, y: srcY + v0*srcH};
        const sc = {x: srcX + u1*srcW, y: srcY + v1*srcH};
        const sd = {x: srcX + u0*srcW, y: srcY + v1*srcH};
        // Triangle 1
        {
          const [aa,bb,cc,dd,ee,ff] = solveAffine(sa,sb,sd,a,b,d);
          ctx.save(); ctx.beginPath();
          ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(d.x,d.y);
          ctx.closePath(); ctx.clip();
          ctx.setTransform(aa,bb,cc,dd,ee,ff); ctx.drawImage(img,0,0);
          ctx.restore();
        }
        // Triangle 2
        {
          const [aa,bb,cc,dd,ee,ff] = solveAffine(sb,sc,sd,b,c,d);
          ctx.save(); ctx.beginPath();
          ctx.moveTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y);
          ctx.closePath(); ctx.clip();
          ctx.setTransform(aa,bb,cc,dd,ee,ff); ctx.drawImage(img,0,0);
          ctx.restore();
        }
      }
    }

    const dataUrl = offscreen.toDataURL("image/png");
    const di = { id: genId(), name: "saved-decal", dataUrl };
    editor.map.decalImages.push(di);
    editorState.activeImageId = di.id;
    editorState.activeSrcRect = null;
    rebuildDecalThumbs();
  });

  document.getElementById("decal-forward")!.addEventListener("click", () => {
    const sel = editor.map.decals.find((d) => d.id === editorState.selectedDecalId);
    if (sel) {
      sel.zOrder++;
      for (const d of editor.map.decals) {
        if (d !== sel && d.zOrder === sel.zOrder) d.zOrder--;
      }
      editor.invalidateTerrain();
    }
  });

  document.getElementById("decal-backward")!.addEventListener("click", () => {
    const sel = editor.map.decals.find((d) => d.id === editorState.selectedDecalId);
    if (sel) {
      sel.zOrder = Math.max(0, sel.zOrder - 1);
      for (const d of editor.map.decals) {
        if (d !== sel && d.zOrder === sel.zOrder) d.zOrder++;
      }
      editor.invalidateTerrain();
    }
  });

  document.getElementById("decal-delete")!.addEventListener("click", () => {
    const idx = editor.map.decals.findIndex((d) => d.id === editorState.selectedDecalId);
    if (idx >= 0) {
      editor.map.decals.splice(idx, 1);
      editorState.selectedDecalId = null;
      updateDecalSelUI();
      editor.invalidateTerrain();
    }
  });

  // Load image button
  document.getElementById("decal-load-btn")!.addEventListener("click", () => {
    decalFileInput.click();
  });

  decalFileInput.addEventListener("change", () => {
    const file = decalFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const di = { id: genId(), name: file.name, dataUrl };
      editor.map.decalImages.push(di);
      editorState.activeImageId = di.id;
      rebuildDecalThumbs();
    };
    reader.readAsDataURL(file);
    decalFileInput.value = "";
  });

  // Periodically sync decal selection UI (since tools.ts modifies selectedDecalId)
  setInterval(() => {
    if (editorState.mode === "decal") updateDecalSelUI();
  }, 200);

  // --- Crop Modal ---
  const cropModal = document.getElementById("crop-modal")!;
  const cropCanvas = document.getElementById("crop-canvas") as HTMLCanvasElement;
  const cropCtx = cropCanvas.getContext("2d")!;
  let cropImageId = "";
  let cropImg: HTMLImageElement | null = null;
  let cropStart: { x: number; y: number } | null = null;
  let cropRect: { x: number; y: number; w: number; h: number } | null = null;

  function openCropModal(imageId: string): void {
    const di = editor.map.decalImages.find((i) => i.id === imageId);
    if (!di) return;
    cropImageId = imageId;
    cropRect = null;
    cropStart = null;
    const img = new Image();
    img.onload = () => {
      cropImg = img;
      cropCanvas.width = img.naturalWidth;
      cropCanvas.height = img.naturalHeight;
      drawCropPreview();
      cropModal.classList.add("open");
    };
    img.src = di.dataUrl;
  }

  function drawCropPreview(): void {
    if (!cropImg) return;
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.drawImage(cropImg, 0, 0);
    if (cropRect) {
      // Darken outside selection
      cropCtx.fillStyle = "rgba(0,0,0,0.5)";
      cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      // Clear the selection area
      cropCtx.clearRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      cropCtx.drawImage(
        cropImg,
        cropRect.x, cropRect.y, cropRect.w, cropRect.h,
        cropRect.x, cropRect.y, cropRect.w, cropRect.h,
      );
      // Selection border
      cropCtx.strokeStyle = "#fff";
      cropCtx.lineWidth = 2;
      cropCtx.setLineDash([4, 4]);
      cropCtx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      cropCtx.setLineDash([]);
    }
  }

  cropCanvas.addEventListener("pointerdown", (e) => {
    const rect = cropCanvas.getBoundingClientRect();
    const scaleX = cropCanvas.width / rect.width;
    const scaleY = cropCanvas.height / rect.height;
    cropStart = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
    cropRect = null;
  });

  cropCanvas.addEventListener("pointermove", (e) => {
    if (!cropStart) return;
    const rect = cropCanvas.getBoundingClientRect();
    const scaleX = cropCanvas.width / rect.width;
    const scaleY = cropCanvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const x = Math.min(cropStart.x, cx);
    const y = Math.min(cropStart.y, cy);
    const w = Math.abs(cx - cropStart.x);
    const h = Math.abs(cy - cropStart.y);
    if (w > 2 && h > 2) {
      cropRect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      drawCropPreview();
    }
  });

  cropCanvas.addEventListener("pointerup", () => {
    cropStart = null;
  });

  document.getElementById("crop-use-btn")!.addEventListener("click", () => {
    if (!cropRect || !cropImg) return;
    // Render cropped region to a new canvas and export as dataUrl
    const c = document.createElement("canvas");
    c.width = cropRect.w;
    c.height = cropRect.h;
    const cx = c.getContext("2d")!;
    cx.drawImage(
      cropImg,
      cropRect.x, cropRect.y, cropRect.w, cropRect.h,
      0, 0, cropRect.w, cropRect.h,
    );
    const dataUrl = c.toDataURL("image/png");
    const parentImg = editor.map.decalImages.find((i) => i.id === cropImageId);
    const name = (parentImg?.name ?? "crop") + ` (${cropRect.x},${cropRect.y} ${cropRect.w}x${cropRect.h})`;
    const di = { id: genId(), name, dataUrl };
    editor.map.decalImages.push(di);
    editorState.activeImageId = di.id;
    cropModal.classList.remove("open");
    cropImg = null;
    rebuildDecalThumbs();
  });

  document.getElementById("crop-cancel-btn")!.addEventListener("click", () => {
    cropModal.classList.remove("open");
    cropImg = null;
  });

  // Initial build
  rebuildDecalThumbs();

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
