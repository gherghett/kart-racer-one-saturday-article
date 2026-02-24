const HISTORY = 180; // ~3 seconds at 60fps
const WIDTH = 260;
const HEIGHT = 100;
const PADDING = 4;

export class DebugGraph {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.canvas.style.cssText = `
      position: fixed; bottom: 12px; left: 12px;
      background: rgba(0,0,0,0.6); border-radius: 6px;
      pointer-events: none; z-index: 100;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.velY = new Float32Array(HISTORY);
    this.posY = new Float32Array(HISTORY);
    this.idx = 0;
    this.count = 0;

    this.lastTime = performance.now();
    this.fps = 0;
    this.fpsSmooth = 60;

    // Checkpoint tracking
    this.checkpoints = [];  // [{x, z}] in world coords
    this.nextCP = 0;
    this.wrongWay = false;
  }

  /** Set checkpoints (world coordinates) for direction tracking */
  setCheckpoints(checkpoints) {
    this.checkpoints = checkpoints;
    this.nextCP = 0;
    this.wrongWay = false;
  }

  push(velY, posY) {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    if (delta > 0) {
      this.fps = 1000 / delta;
      this.fpsSmooth += (this.fps - this.fpsSmooth) * 0.1;
    }

    this.velY[this.idx] = velY;
    this.posY[this.idx] = posY;
    this.idx = (this.idx + 1) % HISTORY;
    if (this.count < HISTORY) this.count++;
  }

  /** Update checkpoint direction check. Call each frame with kart position and forward vector. */
  updateDirection(kartX, kartZ, forwardX, forwardZ) {
    if (this.checkpoints.length < 2) {
      this.wrongWay = false;
      return;
    }

    const cp = this.checkpoints[this.nextCP];
    const dx = cp.x - kartX;
    const dz = cp.z - kartZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Reached checkpoint — advance to next
    if (dist < 15) {
      this.nextCP = (this.nextCP + 1) % this.checkpoints.length;
      this.wrongWay = false;
      return;
    }

    // Dot product of forward direction and direction to next checkpoint
    if (dist > 0.01) {
      const dot = (forwardX * dx + forwardZ * dz) / dist;
      this.wrongWay = dot < -0.3;
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = WIDTH;
    const h = HEIGHT;
    ctx.clearRect(0, 0, w, h);

    // Find range for vel.y
    let velMin = 0, velMax = 0;
    let posMin = Infinity, posMax = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const vi = (this.idx - this.count + i + HISTORY) % HISTORY;
      if (this.velY[vi] < velMin) velMin = this.velY[vi];
      if (this.velY[vi] > velMax) velMax = this.velY[vi];
      if (this.posY[vi] < posMin) posMin = this.posY[vi];
      if (this.posY[vi] > posMax) posMax = this.posY[vi];
    }

    // Ensure some range so we don't divide by zero
    const velRange = Math.max(1, velMax - velMin);
    const posRange = Math.max(1, posMax - posMin);

    const graphW = w - PADDING * 2;
    const graphH = h - PADDING * 2 - 14; // room for labels

    // Zero line for vel.y
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    const zeroY = PADDING + 14 + graphH * (1 - (0 - velMin) / velRange);
    ctx.moveTo(PADDING, zeroY);
    ctx.lineTo(PADDING + graphW, zeroY);
    ctx.stroke();

    // Draw vel.y line
    this._drawLine(ctx, this.velY, velMin, velRange, graphW, graphH, '#ff4444');
    // Draw pos.y line
    this._drawLine(ctx, this.posY, posMin, posRange, graphW, graphH, '#44aaff');

    // Labels
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ff4444';
    const lastVel = this.velY[(this.idx - 1 + HISTORY) % HISTORY];
    ctx.fillText(`vel.y: ${lastVel.toFixed(1)}`, PADDING, 11);

    ctx.fillStyle = '#44aaff';
    const lastPos = this.posY[(this.idx - 1 + HISTORY) % HISTORY];
    ctx.fillText(`pos.y: ${lastPos.toFixed(1)}`, PADDING + 120, 11);

    ctx.fillStyle = '#aaddaa';
    ctx.fillText(`${Math.round(this.fpsSmooth)} fps`, w - 50, 11);

    // Checkpoint direction indicator
    if (this.checkpoints.length >= 2) {
      const label = this.wrongWay ? 'WRONG WAY' : 'RIGHT WAY';
      const color = this.wrongWay ? '#ff4444' : '#44ff44';
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(label, PADDING, h - 4);

      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText(`cp ${this.nextCP}/${this.checkpoints.length}`, w - 60, h - 4);
    }
  }

  _drawLine(ctx, buf, min, range, graphW, graphH, color) {
    if (this.count < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < this.count; i++) {
      const vi = (this.idx - this.count + i + HISTORY) % HISTORY;
      const x = PADDING + (i / (HISTORY - 1)) * graphW;
      const y = PADDING + 14 + graphH * (1 - (buf[vi] - min) / range);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
