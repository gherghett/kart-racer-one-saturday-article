export class InputManager {
  constructor() {
    this.keys = {};
    this._accel = 0;
    this._steer = 0;

    // Hop buttons (Z/X) — held state + rising edge
    this.hopZ = false;
    this.hopX = false;
    this.hopZTap = false;
    this.hopXTap = false;
    this.hopZRel = false;
    this.hopXRel = false;
    this._prevZ = false;
    this._prevX = false;

    this.camRotate = 0;

    // Item use button
    this.itemUse = false;
    this.itemUseTap = false;
    this._prevItemUse = false;

    // Gamepad state
    this._gpPrevZ = false;
    this._gpPrevX = false;
    this._gpPrevItem = false;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  get accel() { return this._accel; }
  set accel(v) { this._accel = v; }

  get steer() { return this._steer; }
  set steer(v) { this._steer = v; }

  // Call once per frame to derive clean values from raw key state
  poll() {
    // --- Keyboard ---
    let kbAccel = 0;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) kbAccel += 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) kbAccel -= 1;

    let kbSteer = 0;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) kbSteer += 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) kbSteer -= 1;

    const kbZ = this.keys['KeyZ'] || false;
    const kbX = this.keys['KeyX'] || false;
    const kbItem = this.keys['KeyF'] || false;

    let kbCam = 0;
    if (this.keys['KeyQ']) kbCam += 1;
    if (this.keys['KeyE']) kbCam -= 1;

    // --- Gamepad ---
    let gpAccel = 0;
    let gpSteer = 0;
    let gpZ = false;
    let gpX = false;
    let gpItem = false;
    let gpCam = 0;

    const gp = navigator.getGamepads()[0];
    if (gp) {
      // Accel: A (btn 0) or right trigger
      // Brake: B (btn 1) or left trigger
      if (gp.buttons[0]?.pressed) gpAccel += 1;  // A
      if (gp.buttons[1]?.pressed) gpAccel -= 1;  // B

      // Steer: left stick X (axis 0) + d-pad (axes 6,7 on this controller)
      const stickX = gp.axes[0] || 0;
      if (Math.abs(stickX) > 0.15) gpSteer = -stickX; // inverted: left=+1

      // D-pad as axes 6,7: axis6 = left/right (-1/+1), axis7 = up/down (-1/+1)
      const dpadX = gp.axes[6] || 0;
      if (Math.abs(dpadX) > 0.5) gpSteer = -dpadX;

      // Hop buttons: LB/RB — on this controller they're at btn 6 and btn 7
      gpZ = gp.buttons[6]?.pressed || false;  // LB
      gpX = gp.buttons[7]?.pressed || false;  // RB

      // Item use: Y/Triangle (button 3)
      gpItem = gp.buttons[3]?.pressed || false;

      // Camera: left/right on right stick (axis 2 or 3)
      const rStickX = gp.axes[2] || 0;
      if (Math.abs(rStickX) > 0.15) gpCam = -rStickX;
    }

    // --- Merge keyboard + gamepad ---
    this._accel = Math.max(-1, Math.min(1, kbAccel + gpAccel));
    this._steer = Math.max(-1, Math.min(1, kbSteer + gpSteer));
    this.camRotate = Math.max(-1, Math.min(1, kbCam + gpCam));

    const z = kbZ || gpZ;
    const x = kbX || gpX;

    this.hopZTap = z && !this._prevZ;
    this.hopXTap = x && !this._prevX;
    this.hopZRel = !z && this._prevZ;
    this.hopXRel = !x && this._prevX;
    this.hopZ = z;
    this.hopX = x;
    this._prevZ = z;
    this._prevX = x;

    const item = kbItem || gpItem;
    this.itemUseTap = item && !this._prevItemUse;
    this.itemUse = item;
    this._prevItemUse = item;
  }
}
