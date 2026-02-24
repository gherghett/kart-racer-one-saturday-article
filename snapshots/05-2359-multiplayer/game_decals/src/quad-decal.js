/**
 * Standalone quad decal renderer for map decals.
 * Creates terrain-conforming textured quads from 4 arbitrary world-space corners.
 *
 * Usage: import into the game's main.js and call after track creation.
 * Requires: THREE, getGroundHeight from track.js
 */
import * as THREE from 'three';

const Y_OFFSET = 0.3;
const SUBDIV = 8;

/**
 * Create a textured quad from 4 arbitrary world-space corners, conforming to terrain.
 * Corners are [TL, TR, BR, BL] in world XZ coordinates.
 *
 * @param {object} opts
 * @param {{ x: number, z: number }[]} opts.corners - 4 corners in world space
 * @param {THREE.Texture} opts.texture - image texture
 * @param {number} [opts.opacity=1] - decal opacity
 * @param {{ x: number, y: number, w: number, h: number }|null} [opts.srcRect=null] - UV source rect (in pixels)
 * @param {number} [opts.imgWidth] - source image width in pixels (for UV calc)
 * @param {number} [opts.imgHeight] - source image height in pixels (for UV calc)
 * @param {(x: number, z: number) => number} opts.getGroundHeight - height sampling function
 * @returns {THREE.Mesh}
 */
export function createQuadDecal({
  corners,
  texture,
  opacity = 1,
  srcRect = null,
  imgWidth = 1,
  imgHeight = 1,
  getGroundHeight,
}) {
  const vCount = (SUBDIV + 1) * (SUBDIV + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = [];

  // UV rect normalized
  const u0 = srcRect ? srcRect.x / imgWidth : 0;
  const v0 = srcRect ? srcRect.y / imgHeight : 0;
  const uSpan = srcRect ? srcRect.w / imgWidth : 1;
  const vSpan = srcRect ? srcRect.h / imgHeight : 1;

  const [tl, tr, br, bl] = corners;

  for (let iy = 0; iy <= SUBDIV; iy++) {
    for (let ix = 0; ix <= SUBDIV; ix++) {
      const idx = iy * (SUBDIV + 1) + ix;
      const u = ix / SUBDIV;
      const v = iy / SUBDIV;

      // Bilinear interpolation of corners
      const topX = tl.x + (tr.x - tl.x) * u;
      const topZ = tl.z + (tr.z - tl.z) * u;
      const botX = bl.x + (br.x - bl.x) * u;
      const botZ = bl.z + (br.z - bl.z) * u;
      const wx = topX + (botX - topX) * v;
      const wz = topZ + (botZ - topZ) * v;
      const wy = getGroundHeight(wx, wz) + Y_OFFSET;

      positions[idx * 3] = wx;
      positions[idx * 3 + 1] = wy;
      positions[idx * 3 + 2] = wz;

      uvs[idx * 2] = u0 + u * uSpan;
      uvs[idx * 2 + 1] = v0 + v * vSpan;
    }
  }

  for (let iy = 0; iy < SUBDIV; iy++) {
    for (let ix = 0; ix < SUBDIV; ix++) {
      const a = iy * (SUBDIV + 1) + ix;
      const b = a + 1;
      const c = a + (SUBDIV + 1);
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    alphaTest: 0.01,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'mapDecal';
  return mesh;
}
