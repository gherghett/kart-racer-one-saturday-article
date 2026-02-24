export class InputManager {
  constructor() {
    this.keys = {};
    this.accel = 0;    // -1 to 1
    this.steer = 0;    // -1 to 1
    this.drift = false;

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
    this._accel = 0;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) this._accel += 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) this._accel -= 1;

    this._steer = 0;
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) this._steer += 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) this._steer -= 1;

    this.drift = this.keys['Space'] || false;

    this.camRotate = 0;
    if (this.keys['KeyQ']) this.camRotate += 1;
    if (this.keys['KeyE']) this.camRotate -= 1;
  }
}
