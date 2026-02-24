/**
 * Kart-to-kart sphere collision resolution
 */

const KART_RADIUS = 1.5;
const BOUNCE_SLOWDOWN = 0.85;

/**
 * Resolve collisions between all kart pairs
 * @param {Array} karts - array of kart groups with .position and .userData.velocity/.speed
 */
export function resolveKartCollisions(karts) {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];

      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const distSq = dx * dx + dz * dz;
      const minDist = KART_RADIUS * 2;

      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;

        // Normal from a to b
        const nx = dx / dist;
        const nz = dz / dist;

        // Push apart equally
        const half = overlap * 0.5;
        a.position.x -= nx * half;
        a.position.z -= nz * half;
        b.position.x += nx * half;
        b.position.z += nz * half;

        // Bounce: swap velocity component along collision normal
        const va = a.userData.velocity;
        const vb = b.userData.velocity;
        const relVelN = (vb.x - va.x) * nx + (vb.z - va.z) * nz;

        if (relVelN < 0) {
          va.x += nx * relVelN * 0.5;
          va.z += nz * relVelN * 0.5;
          vb.x -= nx * relVelN * 0.5;
          vb.z -= nz * relVelN * 0.5;

          a.userData.speed *= BOUNCE_SLOWDOWN;
          b.userData.speed *= BOUNCE_SLOWDOWN;
        }
      }
    }
  }
}
