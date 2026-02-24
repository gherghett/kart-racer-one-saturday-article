/**
 * Bot AI — fake InputManager + steering controller
 */

/** Same interface as InputManager but with no-op poll() */
export class BotInput {
  constructor() {
    this.accel = 0;
    this.steer = 0;
    this.hopZ = false;
    this.hopX = false;
    this.hopZTap = false;
    this.hopXTap = false;
    this.hopZRel = false;
    this.hopXRel = false;
    this.camRotate = 0;
    this.itemUse = false;
    this.itemUseTap = false;
  }

  poll() {
    // no-op — BotController sets values directly
  }
}

/** Drives a kart toward checkpoints */
export class BotController {
  constructor(kart, input, checkpoints) {
    this.kart = kart;
    this.input = input;
    this.checkpoints = checkpoints;
    this.nextCP = 0;
    this.stuckTimer = 0;
    this.lastX = 0;
    this.lastZ = 0;
    this.reversing = false;
    this.reverseTimer = 0;
    this.itemUseDelay = 0;
  }

  update(dt) {
    const kart = this.kart;
    const inp = this.input;

    if (this.checkpoints.length === 0) {
      inp.accel = 1;
      inp.steer = 0;
      return;
    }

    // Check if we reached our target checkpoint
    const cp = this.checkpoints[this.nextCP];
    const dx = cp.x - kart.position.x;
    const dz = cp.z - kart.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 30) {
      this.nextCP = (this.nextCP + 1) % this.checkpoints.length;
    }

    // Desired angle toward checkpoint
    const target = this.checkpoints[this.nextCP];
    const tx = target.x - kart.position.x;
    const tz = target.z - kart.position.z;
    const desiredAngle = Math.atan2(-tx, -tz);

    // Angle difference (normalized to [-PI, PI])
    let angleDiff = desiredAngle - kart.rotation.y;
    angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Stuck detection
    const movedX = kart.position.x - this.lastX;
    const movedZ = kart.position.z - this.lastZ;
    const moved = Math.sqrt(movedX * movedX + movedZ * movedZ);

    if (moved < 0.5 * dt) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
    }
    this.lastX = kart.position.x;
    this.lastZ = kart.position.z;

    // Reversing recovery
    if (this.reversing) {
      this.reverseTimer -= dt;
      inp.accel = -1;
      inp.steer = angleDiff > 0 ? -0.5 : 0.5; // turn opposite while reversing
      if (this.reverseTimer <= 0) {
        this.reversing = false;
        this.stuckTimer = 0;
      }
      return;
    }

    if (this.stuckTimer > 1.5) {
      this.reversing = true;
      this.reverseTimer = 0.8;
      return;
    }

    // Steering: proportional control
    const steerAmount = Math.max(-1, Math.min(1, angleDiff * 2.5));
    inp.steer = steerAmount;

    // Throttle: slow down on sharp turns
    const absAngle = Math.abs(angleDiff);
    if (absAngle > 0.6) {
      inp.accel = 0.3 + 0.4 * (1 - Math.min(1, absAngle / Math.PI));
    } else {
      inp.accel = 1;
    }

    // No hops — bots don't power-slide
    inp.hopZ = false;
    inp.hopX = false;
    inp.hopZTap = false;
    inp.hopXTap = false;

    // Item use AI: use held item after random delay
    inp.itemUseTap = false;
    if (kart.userData.heldItem) {
      if (this.itemUseDelay <= 0) {
        this.itemUseDelay = 0.5 + Math.random() * 1.5;
      }
      this.itemUseDelay -= dt;
      if (this.itemUseDelay <= 0) {
        inp.itemUseTap = true;
        this.itemUseDelay = 0;
      }
    }
  }
}
