/**
 * Headless boost pad triggers — same logic as client boost-pad.js without meshes.
 */

const CELL_SIZE = 3;
const PAD_TRIGGER_RADIUS = 4;
const PAD_COOLDOWN = 1.5;
const BOOST_SPEED = 20;
const BOOST_DURATION = 1.2;

export function createServerBoostPads(mapData, trackData) {
  if (!mapData.boostPads || mapData.boostPads.length === 0) {
    return { update() { return []; } };
  }

  const pads = mapData.boostPads.map(pad => ({
    x: (pad.x - mapData.width / 2) * mapData.scale * CELL_SIZE,
    z: (pad.y - mapData.height / 2) * mapData.scale * CELL_SIZE,
    cooldowns: new Map(),
  }));

  function update(karts, dt) {
    const events = [];
    for (const pad of pads) {
      for (const [kartId, t] of pad.cooldowns) {
        const remaining = t - dt;
        if (remaining <= 0) pad.cooldowns.delete(kartId);
        else pad.cooldowns.set(kartId, remaining);
      }

      for (const kart of karts) {
        const id = kart.id;
        if (pad.cooldowns.has(id)) continue;

        const dx = kart.position.x - pad.x;
        const dz = kart.position.z - pad.z;
        if (dx * dx + dz * dz < PAD_TRIGGER_RADIUS * PAD_TRIGGER_RADIUS) {
          kart.userData.boostTimer = BOOST_DURATION;
          kart.userData.boostSpeed = BOOST_SPEED;
          pad.cooldowns.set(id, PAD_COOLDOWN);
          events.push({ type: 'boost_pad', kartId: id });
        }
      }
    }
    return events;
  }

  return { update };
}
