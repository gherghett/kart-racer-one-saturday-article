/**
 * Headless missile system — same logic as client missile.js without meshes.
 */

const MISSILE_SPEED = 55;
const TURN_RATE = 1.8;
const HIT_RADIUS = 2.5;
const LIFETIME = 6;
const EXPLODE_VEL_Y = 20;

export function createServerMissileSystem(trackData) {
  const active = [];

  function fire(kart, allKarts) {
    const angle = kart.rotation.y;
    const spawnDist = 2.5;
    const wx = kart.position.x - Math.sin(angle) * spawnDist;
    const wz = kart.position.z - Math.cos(angle) * spawnDist;

    active.push({
      ownerId: kart.id,
      angle,
      lifetime: LIFETIME,
      x: wx,
      z: wz,
    });

    return { type: 'missile_fire', kartId: kart.id, x: wx, z: wz, angle };
  }

  function update(karts, dt) {
    const events = [];

    for (let i = active.length - 1; i >= 0; i--) {
      const m = active[i];
      m.lifetime -= dt;

      if (m.lifetime <= 0) {
        active.splice(i, 1);
        continue;
      }

      // Find closest kart in front of missile (120° cone)
      const fwdX = -Math.sin(m.angle);
      const fwdZ = -Math.cos(m.angle);
      const CONE_COS = Math.cos(Math.PI / 3);
      let closestDist = Infinity;
      let closestAngle = m.angle;

      for (const kart of karts) {
        if (kart.id === m.ownerId) continue;
        const dx = kart.position.x - m.x;
        const dz = kart.position.z - m.z;
        const dist = dx * dx + dz * dz;
        if (dist < 0.01) continue;
        const len = Math.sqrt(dist);
        const dot = (dx * fwdX + dz * fwdZ) / len;
        if (dot < CONE_COS) continue;
        if (dist < closestDist) {
          closestDist = dist;
          closestAngle = Math.atan2(-dx, -dz);
        }
      }

      // Steer toward target
      let angleDiff = closestAngle - m.angle;
      angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      m.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), TURN_RATE * dt);

      // Move forward
      m.x -= Math.sin(m.angle) * MISSILE_SPEED * dt;
      m.z -= Math.cos(m.angle) * MISSILE_SPEED * dt;

      // Hit detection
      let hit = false;
      for (const kart of karts) {
        if (kart.id === m.ownerId) continue;
        const dx = kart.position.x - m.x;
        const dz = kart.position.z - m.z;
        if (dx * dx + dz * dz < HIT_RADIUS * HIT_RADIUS) {
          explodeKart(kart);
          events.push({ type: 'missile_hit', kartId: kart.id, x: m.x, z: m.z });
          hit = true;
          break;
        }
      }

      if (hit) {
        active.splice(i, 1);
      }
    }

    return events;
  }

  return { fire, update };
}

function explodeKart(kart) {
  const ud = kart.userData;
  ud.velocity.set(0, EXPLODE_VEL_Y, 0);
  kart.position.y += 0.5;
  ud.speed = 0;
  ud.grounded = false;
  ud.slideActive = false;
  ud.slideButton = null;
  ud.slideDir = 0;
  ud.slideAngle = 0;
  ud.slideTimer = 0;
  ud.slideBoosts = 0;
  ud.boostTimer = 0;
  ud.boostSpeed = 0;
}
