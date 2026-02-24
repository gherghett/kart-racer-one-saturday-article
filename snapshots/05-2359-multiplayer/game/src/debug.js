const HISTORY = 180; // ~3 seconds at 60fps
const WIDTH = 260;
const HEIGHT = 130;
const PADDING = 4;

// Sweet spot windows (must match physics.js)
const SWEET_SPOTS = [
  [0.55, 0.85],
  [0.60, 0.80],
  [0.65, 0.80],
];

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
    this.speed = new Float32Array(HISTORY);
    this.idx = 0;
    this.count = 0;

    this.lastTime = performance.now();
    this.fps = 0;
    this.fpsSmooth = 60;

    // Checkpoint tracking
    this.checkpoints = [];
    this.nextCP = 0;
    this.wrongWay = false;

    // Slide/boost state
    this.slideActive = false;
    this.slideTimer = 0;
    this.slideMeterDuration = 1.5;
    this.slideBoosts = 0;
    this.boostTimer = 0;
    this.boostSpeed = 0;
  }

  setCheckpoints(checkpoints) {
    this.checkpoints = checkpoints;
    this.nextCP = 0;
    this.wrongWay = false;
  }

  push(velY, posY, speed) {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    if (delta > 0) {
      this.fps = 1000 / delta;
      this.fpsSmooth += (this.fps - this.fpsSmooth) * 0.1;
    }

    this.velY[this.idx] = velY;
    this.posY[this.idx] = posY;
    this.speed[this.idx] = speed;
    this.idx = (this.idx + 1) % HISTORY;
    if (this.count < HISTORY) this.count++;
  }

  updateDirection(kartX, kartZ, forwardX, forwardZ) {
    if (this.checkpoints.length < 2) {
      this.wrongWay = false;
      return;
    }

    const cp = this.checkpoints[this.nextCP];
    const dx = cp.x - kartX;
    const dz = cp.z - kartZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 15) {
      this.nextCP = (this.nextCP + 1) % this.checkpoints.length;
      this.wrongWay = false;
      return;
    }

    if (dist > 0.01) {
      const dot = (forwardX * dx + forwardZ * dz) / dist;
      this.wrongWay = dot < -0.3;
    }
  }

  updateSlide(ud) {
    this.slideActive = ud.slideActive;
    this.slideTimer = ud.slideTimer;
    this.slideMeterDuration = ud.stats.slideMeterDuration;
    this.slideBoosts = ud.slideBoosts;
    this.boostTimer = ud.boostTimer;
    this.boostSpeed = ud.boostSpeed;
  }

  draw() {
    const ctx = this.ctx;
    const w = WIDTH;
    const h = HEIGHT;
    ctx.clearRect(0, 0, w, h);

    const graphW = w - PADDING * 2;
    const graphH = 60;

    // --- Speed line (separate scale: 0 to ~55) ---
    const spdMax = 55;
    this._drawLine(ctx, this.speed, 0, spdMax, graphW, graphH, '#ffaa00');
    // Max speed reference line at 35
    ctx.strokeStyle = 'rgba(255,170,0,0.2)';
    ctx.beginPath();
    const maxSpeedY = PADDING + 14 + graphH * (1 - 35 / spdMax);
    ctx.moveTo(PADDING, maxSpeedY);
    ctx.lineTo(PADDING + graphW, maxSpeedY);
    ctx.stroke();

    // --- Vel.y and Pos.y ---
    let velMin = 0, velMax = 0;
    let posMin = Infinity, posMax = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const vi = (this.idx - this.count + i + HISTORY) % HISTORY;
      if (this.velY[vi] < velMin) velMin = this.velY[vi];
      if (this.velY[vi] > velMax) velMax = this.velY[vi];
      if (this.posY[vi] < posMin) posMin = this.posY[vi];
      if (this.posY[vi] > posMax) posMax = this.posY[vi];
    }

    const velRange = Math.max(1, velMax - velMin);
    const posRange = Math.max(1, posMax - posMin);

    // Zero line for vel.y
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    const zeroY = PADDING + 14 + graphH * (1 - (0 - velMin) / velRange);
    ctx.moveTo(PADDING, zeroY);
    ctx.lineTo(PADDING + graphW, zeroY);
    ctx.stroke();

    this._drawLine(ctx, this.velY, velMin, velRange, graphW, graphH, '#ff4444');
    this._drawLine(ctx, this.posY, posMin, posRange, graphW, graphH, '#44aaff');

    // Labels
    ctx.font = '10px monospace';
    ctx.fillStyle = '#ff4444';
    const lastVel = this.velY[(this.idx - 1 + HISTORY) % HISTORY];
    ctx.fillText(`vy:${lastVel.toFixed(1)}`, PADDING, 11);

    ctx.fillStyle = '#44aaff';
    const lastPos = this.posY[(this.idx - 1 + HISTORY) % HISTORY];
    ctx.fillText(`y:${lastPos.toFixed(1)}`, PADDING + 60, 11);

    ctx.fillStyle = '#ffaa00';
    const lastSpd = this.speed[(this.idx - 1 + HISTORY) % HISTORY];
    ctx.fillText(`spd:${lastSpd.toFixed(1)}`, PADDING + 110, 11);

    ctx.fillStyle = '#aaddaa';
    ctx.fillText(`${Math.round(this.fpsSmooth)} fps`, w - 50, 11);

    // --- Boost meter (below graph) ---
    const meterY = PADDING + 14 + graphH + 6;
    const meterH = 10;
    const meterW = graphW;
    const meterX = PADDING;

    if (this.slideActive && this.slideBoosts >= 0 && this.slideBoosts < 3) {
      const fill = Math.min(1, this.slideTimer / this.slideMeterDuration);
      const chargeIdx = Math.min(this.slideBoosts, 2);
      const [sweetStart, sweetEnd] = SWEET_SPOTS[chargeIdx];

      // Background
      ctx.fillStyle = '#222';
      ctx.fillRect(meterX, meterY, meterW, meterH);

      // Sweet spot zone
      ctx.fillStyle = 'rgba(0,255,0,0.25)';
      ctx.fillRect(meterX + sweetStart * meterW, meterY, (sweetEnd - sweetStart) * meterW, meterH);

      // Fill bar
      const inSweet = fill >= sweetStart && fill <= sweetEnd;
      ctx.fillStyle = fill > sweetEnd ? '#ff4444' : inSweet ? '#44ff44' : '#ffaa00';
      ctx.fillRect(meterX, meterY, fill * meterW, meterH);

      // Sweet spot border
      ctx.strokeStyle = '#44ff44';
      ctx.lineWidth = 1;
      ctx.strokeRect(meterX + sweetStart * meterW, meterY, (sweetEnd - sweetStart) * meterW, meterH);
    } else {
      ctx.fillStyle = '#181818';
      ctx.fillRect(meterX, meterY, meterW, meterH);
    }

    // Boost charge dots
    const dotY = meterY + meterH + 8;
    for (let i = 0; i < 3; i++) {
      const dotX = meterX + i * 16 + 4;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
      if (i < this.slideBoosts) {
        ctx.fillStyle = ['#ffaa00', '#ff6600', '#ff0000'][i];
      } else {
        ctx.fillStyle = '#333';
      }
      ctx.fill();
    }

    // Boost active label
    if (this.boostTimer > 0) {
      ctx.fillStyle = '#ff6600';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('BOOST', meterX + 56, dotY + 4);
    }

    // Slide label
    if (this.slideActive) {
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText('SLIDE', w - 48, dotY + 4);
    }

    // --- Checkpoint direction ---
    if (this.checkpoints.length >= 2) {
      const label = this.wrongWay ? 'WRONG WAY' : 'RIGHT WAY';
      const color = this.wrongWay ? '#ff4444' : '#44ff44';
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(label, meterX + 120, dotY + 4);

      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText(`cp ${this.nextCP}/${this.checkpoints.length}`, w - 60, PADDING + 14 + graphH - 2);
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
