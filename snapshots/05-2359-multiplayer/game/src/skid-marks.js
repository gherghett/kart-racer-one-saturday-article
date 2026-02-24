import * as THREE from 'three';
import { getGroundHeight } from './track.js';

const TIRES = [
  { x: -0.8, z: -1.0 }, // front-left
  { x:  0.8, z: -1.0 }, // front-right
  { x: -0.9, z:  1.2 }, // back-left
  { x:  0.9, z:  1.2 }, // back-right
];

const SEGS = 20;          // segments per tire strip
const VERTS_PER_TIRE = SEGS * 2;   // two verts per segment (left/right edge)
const TOTAL_VERTS = TIRES.length * VERTS_PER_TIRE; // 160
const STRIP_HALF_W = 0.12; // half-width of each tire mark
const Y_OFFSET = 0.09;
const FADE_RATE = 1.5;     // alpha decay per second
const NEW_ALPHA = 0.7;

export function createSkidMarks(allKarts) {
  const meshes = [];
  const kartData = [];

  for (const kart of allKarts) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(TOTAL_VERTS * 3);
    const colors = new Float32Array(TOTAL_VERTS * 4); // RGBA via vertex colors

    // Initialize all positions to zero (invisible degenerate triangles)
    // Initialize colors to dark gray with zero alpha
    for (let i = 0; i < TOTAL_VERTS; i++) {
      colors[i * 4]     = 0;
      colors[i * 4 + 1] = 0;
      colors[i * 4 + 2] = 0;
      colors[i * 4 + 3] = 0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));

    // Build index for triangle strips → triangles
    const indices = [];
    for (let t = 0; t < TIRES.length; t++) {
      const base = t * VERTS_PER_TIRE;
      for (let s = 0; s < SEGS - 1; s++) {
        const i0 = base + s * 2;
        const i1 = base + s * 2 + 1;
        const i2 = base + (s + 1) * 2;
        const i3 = base + (s + 1) * 2 + 1;
        indices.push(i0, i1, i2,  i2, i1, i3);
      }
    }
    geo.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1.5;
    meshes.push(mesh);

    kartData.push({
      kart,
      positions,
      colors,
      geo,
      active: false, // was skidding last frame
    });
  }

  function update(allKarts, dt) {
    for (let k = 0; k < kartData.length; k++) {
      const d = kartData[k];
      const kart = d.kart;
      const ud = kart.userData;
      const pos = d.positions;
      const col = d.colors;
      const skidding = ud.slideActive && ud.grounded;

      // Fade all existing alpha
      const fadeAmt = FADE_RATE * dt;
      for (let i = 0; i < TOTAL_VERTS; i++) {
        const ai = i * 4 + 3;
        if (col[ai] > 0) {
          col[ai] = Math.max(0, col[ai] - fadeAmt);
        }
      }

      if (skidding) {
        // Kart forward direction (includes slide angle for visual)
        const angle = kart.rotation.y;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        for (let t = 0; t < TIRES.length; t++) {
          const tire = TIRES[t];
          const base = t * VERTS_PER_TIRE;

          // Shift old data down: move segments 0..SEGS-2 to 1..SEGS-1
          // Each segment = 2 verts = 6 floats in positions, 8 floats in colors
          const pOff = base * 3;
          const cOff = base * 4;
          const pStride = 6; // 2 verts * 3 components
          const cStride = 8; // 2 verts * 4 components

          // Shift from end to start (copyWithin shifts toward higher indices)
          pos.copyWithin(pOff + pStride, pOff, pOff + (SEGS - 1) * pStride);
          col.copyWithin(cOff + cStride, cOff, cOff + (SEGS - 1) * cStride);

          // World position of this tire
          const wx = kart.position.x + tire.x * cosA - tire.z * sinA;
          const wz = kart.position.z + tire.x * (-sinA) + tire.z * (-cosA);
          const wy = getGroundHeight(wx, wz) + Y_OFFSET;

          // Perpendicular to kart forward for strip width
          const perpX = cosA * STRIP_HALF_W;
          const perpZ = -sinA * STRIP_HALF_W;

          // Write new segment at head (index 0)
          const pi = pOff;
          pos[pi]     = wx - perpX;
          pos[pi + 1] = wy;
          pos[pi + 2] = wz - perpZ;
          pos[pi + 3] = wx + perpX;
          pos[pi + 4] = wy;
          pos[pi + 5] = wz + perpZ;

          // Color for new segment
          const ci = cOff;
          col[ci]     = 0; col[ci + 1] = 0; col[ci + 2] = 0; col[ci + 3] = NEW_ALPHA;
          col[ci + 4] = 0; col[ci + 5] = 0; col[ci + 6] = 0; col[ci + 7] = NEW_ALPHA;
        }
      }

      d.active = skidding;
      d.geo.attributes.position.needsUpdate = true;
      d.geo.attributes.color.needsUpdate = true;
    }
  }

  return { meshes, update };
}
