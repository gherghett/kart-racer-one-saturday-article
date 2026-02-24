import type { Decal, MapState } from "./state.ts";

/** Decoded image cache keyed by DecalImage id */
const imageCache = new Map<string, HTMLImageElement>();

/** Get or decode an image from the map's decalImages by id */
export function getDecalImage(
  map: MapState,
  imageId: string,
): HTMLImageElement | null {
  const cached = imageCache.get(imageId);
  if (cached && cached.complete) return cached;

  const di = map.decalImages.find((i) => i.id === imageId);
  if (!di) return null;

  if (!cached) {
    const img = new Image();
    img.src = di.dataUrl;
    imageCache.set(imageId, img);
    return img.complete ? img : null;
  }
  return null;
}

/** Clear cache entries for images no longer in the map */
export function pruneImageCache(map: MapState): void {
  const ids = new Set(map.decalImages.map((i) => i.id));
  for (const key of imageCache.keys()) {
    if (!ids.has(key)) imageCache.delete(key);
  }
}

// ---- Triangle subdivision quad rendering ----

const SUBDIV = 8; // 8x8 grid of quads = 128 triangles

interface Vec2 {
  x: number;
  y: number;
}

/** Bilinear interpolation across a quad. u,v in [0,1] */
function bilerp(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  u: number,
  v: number,
): Vec2 {
  // p0=TL, p1=TR, p2=BR, p3=BL
  const top = { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u };
  const bot = { x: p3.x + (p2.x - p3.x) * u, y: p3.y + (p2.y - p3.y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

/**
 * Solve the 2D affine transform that maps triangle (s0,s1,s2) to (d0,d1,d2).
 * Returns the 6 coefficients [a,b,c,d,e,f] for ctx.setTransform(a,b,c,d,e,f).
 */
function solveAffine(
  s0: Vec2,
  s1: Vec2,
  s2: Vec2,
  d0: Vec2,
  d1: Vec2,
  d2: Vec2,
): [number, number, number, number, number, number] {
  // Source triangle edges
  const sx1 = s1.x - s0.x;
  const sy1 = s1.y - s0.y;
  const sx2 = s2.x - s0.x;
  const sy2 = s2.y - s0.y;

  const det = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(det) < 1e-10) return [1, 0, 0, 1, 0, 0];

  const invDet = 1 / det;

  // Dest triangle edges
  const dx1 = d1.x - d0.x;
  const dy1 = d1.y - d0.y;
  const dx2 = d2.x - d0.x;
  const dy2 = d2.y - d0.y;

  // Affine coefficients: maps source -> dest
  const a = (dx1 * sy2 - dx2 * sy1) * invDet;
  const b = (dy1 * sy2 - dy2 * sy1) * invDet;
  const c = (sx1 * dx2 - sx2 * dx1) * invDet;
  const d = (sx1 * dy2 - sx2 * dy1) * invDet;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;

  return [a, b, c, d, e, f];
}

/**
 * Render a decal onto a Canvas 2D context using triangle subdivision.
 * Handles arbitrary 4-corner warping and opacity.
 */
export function renderDecalToCanvas(
  ctx: CanvasRenderingContext2D,
  decal: Decal,
  img: HTMLImageElement,
  panX: number,
  panY: number,
  zoom: number,
): void {
  if (!img.complete || img.naturalWidth === 0) return;

  const srcX = decal.srcRect?.x ?? 0;
  const srcY = decal.srcRect?.y ?? 0;
  const srcW = decal.srcRect?.w ?? img.naturalWidth;
  const srcH = decal.srcRect?.h ?? img.naturalHeight;

  // Map corners to screen space
  const corners = decal.corners.map((c) => ({
    x: panX + c.x * zoom,
    y: panY + c.y * zoom,
  }));
  const [p0, p1, p2, p3] = corners as [Vec2, Vec2, Vec2, Vec2];

  ctx.save();
  ctx.globalAlpha = decal.opacity;

  for (let gy = 0; gy < SUBDIV; gy++) {
    for (let gx = 0; gx < SUBDIV; gx++) {
      const u0 = gx / SUBDIV;
      const v0 = gy / SUBDIV;
      const u1 = (gx + 1) / SUBDIV;
      const v1 = (gy + 1) / SUBDIV;

      // Screen positions of the 4 corners of this sub-quad
      const a = bilerp(p0, p1, p2, p3, u0, v0);
      const b = bilerp(p0, p1, p2, p3, u1, v0);
      const c = bilerp(p0, p1, p2, p3, u1, v1);
      const d = bilerp(p0, p1, p2, p3, u0, v1);

      // Source image positions
      const sa = { x: srcX + u0 * srcW, y: srcY + v0 * srcH };
      const sb = { x: srcX + u1 * srcW, y: srcY + v0 * srcH };
      const sc = { x: srcX + u1 * srcW, y: srcY + v1 * srcH };
      const sd = { x: srcX + u0 * srcW, y: srcY + v1 * srcH };

      // Triangle 1: a-b-d (top-left triangle)
      drawTriangle(ctx, img, sa, sb, sd, a, b, d);
      // Triangle 2: b-c-d (bottom-right triangle)
      drawTriangle(ctx, img, sb, sc, sd, b, c, d);
    }
  }

  ctx.restore();
}

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  s0: Vec2,
  s1: Vec2,
  s2: Vec2,
  d0: Vec2,
  d1: Vec2,
  d2: Vec2,
): void {
  const [a, b, c, d, e, f] = solveAffine(s0, s1, s2, d0, d1, d2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// ---- Hit testing ----

/** Cross product of 2D vectors (p1-p0) x (p2-p0) */
function cross(p0: Vec2, p1: Vec2, p2: Vec2): number {
  return (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
}

/** Test if point is inside a convex or non-convex quad using triangulation */
function pointInQuad(p: Vec2, q0: Vec2, q1: Vec2, q2: Vec2, q3: Vec2): boolean {
  return pointInTriangle(p, q0, q1, q2) || pointInTriangle(p, q0, q2, q3);
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Test if a map coordinate is inside a decal's quad */
export function hitTestDecal(decal: Decal, mapX: number, mapY: number): boolean {
  const p = { x: mapX, y: mapY };
  const [c0, c1, c2, c3] = decal.corners;
  return pointInQuad(p, c0, c1, c2, c3);
}

const CORNER_HIT_RADIUS = 8; // screen pixels

/** Return the corner index (0-3) hit, or -1 */
export function hitTestCorner(
  decal: Decal,
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number,
): number {
  for (let i = 0; i < 4; i++) {
    const c = decal.corners[i]!;
    const sx = panX + c.x * zoom;
    const sy = panY + c.y * zoom;
    const dx = screenX - sx;
    const dy = screenY - sy;
    if (dx * dx + dy * dy <= CORNER_HIT_RADIUS * CORNER_HIT_RADIUS) return i;
  }
  return -1;
}

/** Draw selection handles for a decal */
export function drawDecalHandles(
  ctx: CanvasRenderingContext2D,
  decal: Decal,
  panX: number,
  panY: number,
  zoom: number,
): void {
  const pts = decal.corners.map((c) => ({
    x: panX + c.x * zoom,
    y: panY + c.y * zoom,
  }));

  // Outline
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  ctx.lineTo(pts[1]!.x, pts[1]!.y);
  ctx.lineTo(pts[2]!.x, pts[2]!.y);
  ctx.lineTo(pts[3]!.x, pts[3]!.y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  // Corner handles
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

let nextId = 1;

/** Generate a unique ID for decals / images */
export function genId(): string {
  return `d${Date.now().toString(36)}_${(nextId++).toString(36)}`;
}
