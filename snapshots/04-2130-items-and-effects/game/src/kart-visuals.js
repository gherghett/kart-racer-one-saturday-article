import { getGroundHeight } from './track.js';

/**
 * Check if a point is occluded from camera by terrain.
 * Samples terrain height along the camera→target line.
 */
function isOccludedByTerrain(camera, targetX, targetY, targetZ) {
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  for (let i = 1; i <= 5; i++) {
    const f = i / 6;
    const sampleY = getGroundHeight(cx + (targetX - cx) * f, cz + (targetZ - cz) * f);
    const lineY = cy + (targetY - cy) * f;
    if (sampleY > lineY + 0.5) return true;
  }
  return false;
}

/**
 * Update kart shadow mesh and sprite visibility.
 * Extracted from physics so the sim can run without any visual dependencies.
 */
export function updateKartVisuals(kart, camera) {
  const groundY = getGroundHeight(kart.position.x, kart.position.z);

  // Shadow — conform vertices to terrain each frame
  const shadow = kart.userData.shadow;
  if (shadow) {
    const airHeight = Math.max(0, kart.position.y - groundY);
    const t = Math.max(0.3, 1 - airHeight * 0.03);

    // Cache base local positions on first use
    if (!shadow.geometry.userData.basePos) {
      shadow.geometry.userData.basePos = new Float32Array(shadow.geometry.attributes.position.array);
    }
    const base = shadow.geometry.userData.basePos;
    const pos = shadow.geometry.attributes.position;
    const cx = kart.position.x;
    const cz = kart.position.z;
    for (let i = 0; i < pos.count; i++) {
      const wx = cx + base[i * 3] * t;
      const wz = cz + base[i * 3 + 2] * t;
      pos.array[i * 3]     = wx;
      pos.array[i * 3 + 1] = getGroundHeight(wx, wz) + 0.1;
      pos.array[i * 3 + 2] = wz;
    }
    pos.needsUpdate = true;
    shadow.position.set(0, 0, 0);
    shadow.scale.set(1, 1, 1);

    const shadowOcc = camera && isOccludedByTerrain(camera, kart.position.x, groundY + 0.1, kart.position.z);
    shadow.visible = !shadowOcc;
    shadow.material.opacity = shadowOcc ? 0 : Math.max(0.05, 1 - airHeight * 0.04);
  }

  // Kart visibility — hide when terrain blocks camera line of sight
  if (camera) {
    const kartOcc = isOccludedByTerrain(camera, kart.position.x, kart.position.y + 1.5, kart.position.z);
    kart.visible = !kartOcc;
  }
}
