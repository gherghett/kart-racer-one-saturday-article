/**
 * Headless TNT system — same logic as client tnt.js without meshes.
 */

const TRIGGER_RADIUS = 2.5;
const EXPLODE_VEL_Y = 22;
const LIFETIME = 30;

export function createServerTNTSystem(trackData) {
  const placed = [];

  function place(kart) {
    const angle = kart.rotation.y;
    const behindDist = 3;
    const wx = kart.position.x + Math.sin(angle) * behindDist;
    const wz = kart.position.z + Math.cos(angle) * behindDist;

    placed.push({
      x: wx,
      z: wz,
      ownerId: kart.id,
      immuneTimer: 0.8,
      lifetime: LIFETIME,
    });

    return { type: 'tnt_place', kartId: kart.id, x: wx, z: wz };
  }

  function update(karts, dt) {
    const events = [];

    for (let i = placed.length - 1; i >= 0; i--) {
      const tnt = placed[i];
      tnt.lifetime -= dt;
      if (tnt.immuneTimer > 0) tnt.immuneTimer -= dt;

      if (tnt.lifetime <= 0) {
        placed.splice(i, 1);
        continue;
      }

      let triggered = false;
      for (const kart of karts) {
        if (tnt.immuneTimer > 0 && kart.id === tnt.ownerId) continue;

        const dx = kart.position.x - tnt.x;
        const dz = kart.position.z - tnt.z;
        if (dx * dx + dz * dz < TRIGGER_RADIUS * TRIGGER_RADIUS) {
          explodeKart(kart);
          events.push({ type: 'tnt_detonate', kartId: kart.id, x: tnt.x, z: tnt.z });
          triggered = true;
          break;
        }
      }

      if (triggered) {
        placed.splice(i, 1);
      }
    }

    return events;
  }

  return { place, update };
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
