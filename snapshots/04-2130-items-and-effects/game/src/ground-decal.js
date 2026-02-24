import * as THREE from 'three';
import { getGroundHeight } from './track.js';

const VERTS_PER_UNIT = 1; // subdivision density — 1 vertex per world unit
const Y_OFFSET = 0.08;    // raise above ground to prevent z-fighting

/**
 * Create a textured quad that conforms to the terrain surface.
 *
 * @param {object} opts
 * @param {number} opts.x - world X center
 * @param {number} opts.z - world Z center
 * @param {number} opts.width - size along the decal's local X axis
 * @param {number} opts.depth - size along the decal's local Z axis
 * @param {number} opts.angle - rotation around Y in radians
 * @param {THREE.Material|object} opts.material - material or material options
 * @returns {THREE.Mesh}
 */
export function createGroundDecal({ x, z, width, depth, angle = 0, material }) {
  const segsX = Math.max(1, Math.ceil(width * VERTS_PER_UNIT));
  const segsZ = Math.max(1, Math.ceil(depth * VERTS_PER_UNIT));

  const geo = new THREE.PlaneGeometry(width, depth, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);

  // Rotate vertices around Y by angle, offset to world position,
  // then sample ground height at each vertex
  const pos = geo.attributes.position;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);

    // Rotate local coords by angle
    const wx = x + lx * cosA - lz * sinA;
    const wz = z + lx * sinA + lz * cosA;

    const wy = getGroundHeight(wx, wz) + Y_OFFSET;

    pos.setXYZ(i, wx, wy, wz);
  }

  geo.computeVertexNormals();

  // Build material
  let mat;
  if (material instanceof THREE.Material) {
    mat = material;
  } else {
    mat = new THREE.MeshStandardMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      ...material,
    });
  }

  const mesh = new THREE.Mesh(geo, mat);
  // Position is baked into vertices — mesh sits at origin
  mesh.renderOrder = -2;
  mesh.name = 'groundDecal';

  return mesh;
}
