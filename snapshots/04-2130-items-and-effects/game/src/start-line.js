import * as THREE from 'three';
import { CELL_SIZE } from './track.js';
import { FINISH_LINE_WIDTH } from './race.js';
import { createGroundDecal } from './ground-decal.js';

const DEPTH = 3; // depth of the checkered strip in world units

/**
 * Create a checkered start/finish line that conforms to the terrain
 */
export function createStartLine(mapData) {
  if (!mapData.start) return null;

  const sx = (mapData.start.x - mapData.width / 2) * mapData.scale * CELL_SIZE;
  const sz = (mapData.start.y - mapData.height / 2) * mapData.scale * CELL_SIZE;
  const angle = (mapData.start.angle || 0) + Math.PI / 2;

  // Canvas checkered texture — 2 rows of square checks
  const checkSize = DEPTH / 2;
  const cols = Math.round(FINISH_LINE_WIDTH / checkSize);
  const rows = 2;
  const pxPerCheck = 16;
  const canvas = document.createElement('canvas');
  canvas.width = cols * pxPerCheck;
  canvas.height = rows * pxPerCheck;
  const ctx = canvas.getContext('2d');

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#222222';
      ctx.fillRect(c * pxPerCheck, r * pxPerCheck, pxPerCheck, pxPerCheck);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;

  const mesh = createGroundDecal({
    x: sx,
    z: sz,
    width: FINISH_LINE_WIDTH,
    depth: DEPTH,
    angle,
    material: {
      map: tex,
      roughness: 0.8,
      opacity: 0.9,
    },
  });

  mesh.name = 'startLine';
  return mesh;
}
