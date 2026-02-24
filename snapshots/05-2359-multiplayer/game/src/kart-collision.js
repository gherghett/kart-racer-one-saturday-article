/**
 * Kart-to-kart sphere collision resolution
 */

const KART_RADIUS = 1.5;
const BOUNCE_SLOWDOWN = 0.85;
const SEPARATION_FORCE = 8; // extra push-apart velocity

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

        // Push apart — extra margin to prevent sticking
        const push = overlap * 0.5 + 0.15;
        a.position.x -= nx * push;
        a.position.z -= nz * push;
        b.position.x += nx * push;
        b.position.z += nz * push;

        // Bounce: swap velocity component along collision normal
        const va = a.userData.velocity;
        const vb = b.userData.velocity;
        const relVelN = (vb.x - va.x) * nx + (vb.z - va.z) * nz;

        if (relVelN < 0) {
          va.x += nx * relVelN * 0.5;
          va.z += nz * relVelN * 0.5;
          vb.x -= nx * relVelN * 0.5;
          vb.z -= nz * relVelN * 0.5;
        }

        // Always apply a separation impulse so karts bounce apart
        va.x -= nx * SEPARATION_FORCE;
        va.z -= nz * SEPARATION_FORCE;
        vb.x += nx * SEPARATION_FORCE;
        vb.z += nz * SEPARATION_FORCE;

        a.userData.speed *= BOUNCE_SLOWDOWN;
        b.userData.speed *= BOUNCE_SLOWDOWN;
      }
    }
  }
}
