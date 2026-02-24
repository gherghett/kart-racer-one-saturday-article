/**
 * Headless item box pickup logic — same as client item-boxes.js without meshes.
 */

const CELL_SIZE = 3;
const PICKUP_RADIUS = 4;
const RESPAWN_TIME = 5;
const AVAILABLE_ITEMS = ['boost', 'tnt', 'missile'];

export function createServerItemBoxes(mapData) {
  if (!mapData.itemBoxes || mapData.itemBoxes.length === 0) {
    return { update() { return []; } };
  }

  const boxes = mapData.itemBoxes.map((ib, i) => ({
    x: (ib.x - mapData.width / 2) * mapData.scale * CELL_SIZE,
    z: (ib.y - mapData.height / 2) * mapData.scale * CELL_SIZE,
    respawnTimer: 0,
    index: i,
  }));

  function update(karts, dt) {
    const events = [];
    for (const box of boxes) {
      if (box.respawnTimer > 0) {
        box.respawnTimer -= dt;
        if (box.respawnTimer < 0) box.respawnTimer = 0;
        continue;
      }

      for (const kart of karts) {
        if (kart.userData.heldItem) continue;

        const dx = kart.position.x - box.x;
        const dz = kart.position.z - box.z;
        if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
          const item = AVAILABLE_ITEMS[Math.floor(Math.random() * AVAILABLE_ITEMS.length)];
          kart.userData.heldItem = item;
          box.respawnTimer = RESPAWN_TIME;
          events.push({ type: 'item_pickup', kartId: kart.id, item, boxIndex: box.index });
          break;
        }
      }
    }
    return events;
  }

  return { update };
}
