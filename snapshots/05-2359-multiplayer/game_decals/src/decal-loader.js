/**
 * Bakes map decals into a ground texture.
 *
 * Instead of rendering decals as separate meshes (which causes z-fighting
 * and sorting issues), this paints them directly onto a canvas that becomes
 * the ground mesh texture.
 *
 * Usage:
 *   const texture = await bakeGroundTexture(mapData);
 *   // apply texture to the ground mesh material
 */
import * as THREE from 'three';

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

const SUBDIV = 8;

/**
 * Solve 2D affine transform mapping triangle (s0,s1,s2) → (d0,d1,d2).
 * Returns [a,b,c,d,e,f] for ctx.setTransform(a,b,c,d,e,f).
 */
function solveAffine(s0, s1, s2, d0, d1, d2) {
  const sx1 = s1.x - s0.x, sy1 = s1.y - s0.y;
  const sx2 = s2.x - s0.x, sy2 = s2.y - s0.y;
  const det = sx1 * sy2 - sx2 * sy1;
  if (Math.abs(det) < 1e-10) return [1, 0, 0, 1, 0, 0];
  const inv = 1 / det;
  const dx1 = d1.x - d0.x, dy1 = d1.y - d0.y;
  const dx2 = d2.x - d0.x, dy2 = d2.y - d0.y;
  return [
    (dx1 * sy2 - dx2 * sy1) * inv,
    (dy1 * sy2 - dy2 * sy1) * inv,
    (sx1 * dx2 - sx2 * dx1) * inv,
    (sx1 * dy2 - sx2 * dy1) * inv,
    d0.x - ((dx1 * sy2 - dx2 * sy1) * inv) * s0.x - ((sx1 * dx2 - sx2 * dx1) * inv) * s0.y,
    d0.y - ((dy1 * sy2 - dy2 * sy1) * inv) * s0.x - ((sx1 * dy2 - sx2 * dy1) * inv) * s0.y,
  ];
}

/** Render a single decal onto a 2D canvas context in map-pixel coordinates. */
function renderDecal(ctx, decal, img) {
  const srcX = decal.srcRect?.x ?? 0;
  const srcY = decal.srcRect?.y ?? 0;
  const srcW = decal.srcRect?.w ?? img.naturalWidth;
  const srcH = decal.srcRect?.h ?? img.naturalHeight;

  const [p0, p1, p2, p3] = decal.corners; // TL, TR, BR, BL in map space

  ctx.save();
  ctx.globalAlpha = decal.opacity ?? 1;

  for (let gy = 0; gy < SUBDIV; gy++) {
    for (let gx = 0; gx < SUBDIV; gx++) {
      const u0 = gx / SUBDIV, v0 = gy / SUBDIV;
      const u1 = (gx + 1) / SUBDIV, v1 = (gy + 1) / SUBDIV;

      // Bilinear interp for screen positions
      function bilerp(u, v) {
        const topX = p0.x + (p1.x - p0.x) * u;
        const topY = p0.y + (p1.y - p0.y) * u;
        const botX = p3.x + (p2.x - p3.x) * u;
        const botY = p3.y + (p2.y - p3.y) * u;
        return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
      }

      const a = bilerp(u0, v0), b = bilerp(u1, v0);
      const c = bilerp(u1, v1), d = bilerp(u0, v1);

      // Source image positions
      const sa = { x: srcX + u0 * srcW, y: srcY + v0 * srcH };
      const sb = { x: srcX + u1 * srcW, y: srcY + v0 * srcH };
      const sc = { x: srcX + u1 * srcW, y: srcY + v1 * srcH };
      const sd = { x: srcX + u0 * srcW, y: srcY + v1 * srcH };

      // Triangle 1: a-b-d
      drawTriangle(ctx, img, sa, sb, sd, a, b, d);
      // Triangle 2: b-c-d
      drawTriangle(ctx, img, sb, sc, sd, b, c, d);
    }
  }

  ctx.restore();
}

function drawTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
  const [a, b, c, d, e, f] = solveAffine(s0, s1, s2, d0, d1, d2);

  // Expand clip triangle slightly from centroid to eliminate seams
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const PAD = 0.8;
  function expand(p) {
    const dx = p.x - cx, dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * PAD, y: p.y + (dy / len) * PAD };
  }
  const e0 = expand(d0), e1 = expand(d1), e2 = expand(d2);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(e0.x, e0.y);
  ctx.lineTo(e1.x, e1.y);
  ctx.lineTo(e2.x, e2.y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Bake terrain colors + decals into a single ground texture.
 *
 * @param {object} mapData - loaded map data with terrain, colorData, decalImages, decals
 * @returns {Promise<THREE.CanvasTexture|null>} baked texture, or null if no painting needed
 */
const BAKE_SCALE = 8; // render at 8x map resolution (256 map → 2048 texture)

export async function bakeGroundTexture(mapData) {
  const { width, height } = mapData;
  const decalDefs = mapData.decalImages || [];
  const decals = mapData.decals || [];

  // Load decal images
  const images = {};
  if (decals.length > 0 && decalDefs.length > 0) {
    const imgPromises = decalDefs.map(di =>
      loadImage(`/maps/${mapData.id}/decals/${di.id}.png`)
        .then(img => { images[di.id] = img; })
        .catch(() => {})
    );
    await Promise.all(imgPromises);
  }

  // If no decals and no color data, skip baking
  if (decals.length === 0 && !mapData.colorData) return null;

  const cw = width * BAKE_SCALE;
  const ch = height * BAKE_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');

  // Paint base at 1:1 into a small canvas, then draw scaled up with nearest-neighbor
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext('2d');
  const imgData = baseCtx.createImageData(width, height);
  const pixels = imgData.data;

  // Terrain type RGB values
  const terrainRGB = [
    { r: 0x55, g: 0x55, b: 0x55 }, // track
    { r: 0x4a, g: 0x8c, b: 0x3f }, // offroad
    { r: 0x8b, g: 0x22, b: 0x22 }, // inaccessible
  ];

  // Apply custom terrain colors if provided
  if (mapData.terrainColors) {
    for (const [key, hex] of Object.entries(mapData.terrainColors)) {
      const idx = parseInt(key);
      if (idx >= 0 && idx < terrainRGB.length && typeof hex === 'string') {
        terrainRGB[idx] = {
          r: parseInt(hex.slice(1, 3), 16),
          g: parseInt(hex.slice(3, 5), 16),
          b: parseInt(hex.slice(5, 7), 16),
        };
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    const j = i * 4;
    if (mapData.colorData) {
      const ci = i * 3;
      pixels[j] = mapData.colorData[ci];
      pixels[j + 1] = mapData.colorData[ci + 1];
      pixels[j + 2] = mapData.colorData[ci + 2];
    } else {
      const t = mapData.terrain[i] ?? 1;
      const c = terrainRGB[t] || terrainRGB[1];
      pixels[j] = c.r;
      pixels[j + 1] = c.g;
      pixels[j + 2] = c.b;
    }
    pixels[j + 3] = 255;
  }

  baseCtx.putImageData(imgData, 0, 0);

  // Scale base up with nearest-neighbor (crisp pixels)
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseCanvas, 0, 0, cw, ch);

  // Render decals at full bake resolution (decal coords scaled by BAKE_SCALE)
  // Re-enable smoothing for decal images so they look good
  ctx.imageSmoothingEnabled = true;
  const sorted = [...decals].sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
  for (const decal of sorted) {
    const img = images[decal.imageId];
    if (!img) continue;
    // Scale decal corners to bake resolution
    const scaled = {
      ...decal,
      corners: decal.corners.map(c => ({ x: c.x * BAKE_SCALE, y: c.y * BAKE_SCALE })),
    };
    renderDecal(ctx, scaled, img);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
