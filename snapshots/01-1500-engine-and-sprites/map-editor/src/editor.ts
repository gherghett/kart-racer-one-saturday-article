import {
  type MapState,
  type EditorState,
  TERRAIN_COLORS,
  TerrainType,
} from "./state.ts";

const GRID_ZOOM_THRESHOLD = 6;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 64;

export class Editor {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  /** Pixels per map cell */
  zoom = 3;
  /** Camera offset in screen pixels (top-left of the map in screen space) */
  panX = 0;
  panY = 0;

  private isPanning = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private spaceHeld = false;

  /** Terrain bitmap cached as ImageData for fast rendering */
  private terrainImage: ImageData | null = null;
  private terrainDirty = true;

  /** Current pointer position in map coordinates (for brush preview) */
  cursorMapX = -1;
  cursorMapY = -1;

  map!: MapState;
  editorState!: EditorState;

  /** Called each frame with map coords when pointer moves */
  onPointerMove: ((x: number, y: number, e: PointerEvent) => void) | null =
    null;
  onPointerDown: ((x: number, y: number, e: PointerEvent) => void) | null =
    null;
  onPointerUp: ((e: PointerEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.setupEvents();
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  init(map: MapState, editorState: EditorState): void {
    this.map = map;
    this.editorState = editorState;
    this.centerView();
    this.invalidateTerrain();
  }

  centerView(): void {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    this.panX = cx - (this.map.width * this.zoom) / 2;
    this.panY = cy - (this.map.height * this.zoom) / 2;
  }

  invalidateTerrain(): void {
    this.terrainDirty = true;
  }

  /** Convert screen coords to map cell coords */
  screenToMap(sx: number, sy: number): [number, number] {
    const mx = (sx - this.panX) / this.zoom;
    const my = (sy - this.panY) / this.zoom;
    return [Math.floor(mx), Math.floor(my)];
  }

  private resizeCanvas(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.invalidateTerrain();
  }

  private setupEvents(): void {
    this.canvas.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.handlePointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.handlePointerUp(e));
    this.canvas.addEventListener("pointerleave", () => {
      this.cursorMapX = -1;
      this.cursorMapY = -1;
    });
    this.canvas.addEventListener("wheel", (e) => this.handleWheel(e), {
      passive: false,
    });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        this.spaceHeld = true;
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceHeld = false;
    });
  }

  private handlePointerDown(e: PointerEvent): void {
    // Middle mouse or space+click = pan
    if (e.button === 1 || (this.spaceHeld && e.button === 0)) {
      this.isPanning = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    const [mx, my] = this.screenToMap(e.offsetX, e.offsetY);
    this.onPointerDown?.(mx, my, e);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.isPanning) {
      this.panX += e.clientX - this.lastPointerX;
      this.panY += e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      return;
    }

    const [mx, my] = this.screenToMap(e.offsetX, e.offsetY);
    this.cursorMapX = mx;
    this.cursorMapY = my;
    this.onPointerMove?.(mx, my, e);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }
    this.onPointerUp?.(e);
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * zoomFactor));

    // Zoom towards cursor
    const mx = e.offsetX;
    const my = e.offsetY;
    this.panX = mx - ((mx - this.panX) / this.zoom) * newZoom;
    this.panY = my - ((my - this.panY) / this.zoom) * newZoom;
    this.zoom = newZoom;
  }

  private rebuildTerrainImage(): void {
    const { width, height, terrain } = this.map;
    if (
      !this.terrainImage ||
      this.terrainImage.width !== width ||
      this.terrainImage.height !== height
    ) {
      this.terrainImage = new ImageData(width, height);
    }

    const data = this.terrainImage.data;
    // Pre-parse terrain colors to RGB
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

    for (let i = 0; i < width * height; i++) {
      const t = terrain[i]!;
      const c = colors[t] ?? colors[0]!;
      const j = i * 4;
      data[j] = c.r;
      data[j + 1] = c.g;
      data[j + 2] = c.b;
      data[j + 3] = 255;
    }

    this.terrainDirty = false;
  }

  render(): void {
    const { ctx, canvas } = this;
    const { width: cw, height: ch } = canvas;

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, cw, ch);

    if (!this.map) return;

    // Draw terrain bitmap
    if (this.terrainDirty) this.rebuildTerrainImage();

    if (this.terrainImage) {
      // Render terrain to an offscreen canvas, then draw scaled
      const offscreen = new OffscreenCanvas(this.map.width, this.map.height);
      const offCtx = offscreen.getContext("2d")!;
      offCtx.putImageData(this.terrainImage, 0, 0);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        offscreen,
        this.panX,
        this.panY,
        this.map.width * this.zoom,
        this.map.height * this.zoom,
      );
    }

    // Draw height overlay
    if (this.editorState.mode === "height" || this.editorState.showHeight) {
      this.renderHeightOverlay();
    }

    // Draw grid when zoomed in enough
    if (this.zoom >= GRID_ZOOM_THRESHOLD) {
      this.renderGrid();
    }

    // Draw checkpoints
    this.renderCheckpoints();

    // Draw start line
    this.renderStartLine();

    // Draw brush cursor preview
    this.renderBrushCursor();

    // Draw map border
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.panX,
      this.panY,
      this.map.width * this.zoom,
      this.map.height * this.zoom,
    );
  }

  private renderHeightOverlay(): void {
    const { ctx, map, zoom, panX, panY } = this;
    const { width, height, heightmap } = map;

    // Use semi-transparent overlay to show height
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const h = heightmap[y * width + x]!;
        if (Math.abs(h) < 0.01) continue;

        const sx = panX + x * zoom;
        const sy = panY + y * zoom;

        // Skip pixels outside viewport
        if (sx + zoom < 0 || sy + zoom < 0 || sx > ctx.canvas.width || sy > ctx.canvas.height)
          continue;

        if (h > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(h, 1) * 0.5})`;
        } else {
          ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(-h, 1) * 0.5})`;
        }
        ctx.fillRect(sx, sy, zoom, zoom);
      }
    }
  }

  private renderGrid(): void {
    const { ctx, map, zoom, panX, panY, canvas } = this;

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Vertical lines
    const startX = Math.max(0, Math.floor(-panX / zoom));
    const endX = Math.min(map.width, Math.ceil((canvas.width - panX) / zoom));
    for (let x = startX; x <= endX; x++) {
      const sx = panX + x * zoom;
      ctx.moveTo(sx, Math.max(0, panY));
      ctx.lineTo(sx, Math.min(canvas.height, panY + map.height * zoom));
    }

    // Horizontal lines
    const startY = Math.max(0, Math.floor(-panY / zoom));
    const endY = Math.min(map.height, Math.ceil((canvas.height - panY) / zoom));
    for (let y = startY; y <= endY; y++) {
      const sy = panY + y * zoom;
      ctx.moveTo(Math.max(0, panX), sy);
      ctx.lineTo(Math.min(canvas.width, panX + map.width * zoom), sy);
    }

    ctx.stroke();
  }

  private renderCheckpoints(): void {
    const { ctx, map, zoom, panX, panY } = this;

    for (let i = 0; i < map.checkpoints.length; i++) {
      const cp = map.checkpoints[i]!;
      const sx = panX + (cp.x + 0.5) * zoom;
      const sy = panY + (cp.y + 0.5) * zoom;
      const r = Math.max(8, zoom * 0.8);

      // Circle
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 200, 0, 0.8)";
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number
      ctx.fillStyle = "#000";
      ctx.font = `bold ${Math.max(10, r)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), sx, sy);
    }
  }

  private renderStartLine(): void {
    const { ctx, map, zoom, panX, panY } = this;
    if (!map.start) return;

    const sx = panX + (map.start.x + 0.5) * zoom;
    const sy = panY + (map.start.y + 0.5) * zoom;
    const r = Math.max(10, zoom);

    // Triangle pointing in the start direction
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(map.start.angle);

    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.6, -r * 0.6);
    ctx.lineTo(-r * 0.6, r * 0.6);
    ctx.closePath();

    ctx.fillStyle = "rgba(0, 150, 255, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // Label
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(10, zoom * 0.6)}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("START", sx, sy - r - 4);
  }

  private renderBrushCursor(): void {
    const { ctx, zoom, panX, panY, cursorMapX: mx, cursorMapY: my, editorState } = this;

    if (mx < 0 || my < 0) return;
    if (editorState.mode !== "terrain" && editorState.mode !== "height") return;

    const size = editorState.brushSize;
    const half = Math.floor(size / 2);

    if (editorState.mode === "terrain") {
      // Square brush preview
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        panX + (mx - half) * zoom,
        panY + (my - half) * zoom,
        size * zoom,
        size * zoom,
      );
    } else {
      // Circular brush preview
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(
        panX + (mx + 0.5) * zoom,
        panY + (my + 0.5) * zoom,
        half * zoom,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  startRenderLoop(): void {
    const loop = (): void => {
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
