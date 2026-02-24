/**
 * Race HUD — HTML overlay for lap, position, boost, countdown, wrong-way, minimap
 */

import { FINISH_LINE_WIDTH } from './race.js';
import { CELL_SIZE } from './track.js';

const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'];

// Sweet spot windows (must match physics.js)
const SWEET_SPOTS = [
  [0.55, 0.85],
  [0.60, 0.80],
  [0.65, 0.80],
];

const MINIMAP_SIZE = 160;

export class RaceHUD {
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'race-hud';
    this.root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50;';

    // Lap counter — bottom-left
    this.lapEl = this._el('bottom:20px;left:20px;font-size:28px;font-weight:bold;color:#fff;text-shadow:2px 2px 4px #000;font-family:monospace;');

    // Position — top-right
    this.posEl = this._el('top:20px;right:20px;font-size:36px;font-weight:bold;color:#fff;text-shadow:2px 2px 4px #000;font-family:monospace;');

    // Boost meter — center of screen
    this.boostWrap = this._el('bottom:40%;left:50%;transform:translateX(-50%);width:200px;height:16px;background:rgba(0,0,0,0.5);border-radius:4px;overflow:hidden;display:none;');
    this.boostFill = document.createElement('div');
    this.boostFill.style.cssText = 'height:100%;width:0%;transition:none;border-radius:4px;';
    this.boostWrap.appendChild(this.boostFill);

    // Sweet spot indicator on boost bar
    this.sweetSpot = document.createElement('div');
    this.sweetSpot.style.cssText = 'position:absolute;top:0;height:100%;background:rgba(0,255,0,0.25);border:1px solid #0f0;border-radius:2px;box-sizing:border-box;';
    this.boostWrap.style.position = 'fixed';
    this.boostWrap.appendChild(this.sweetSpot);

    // Charge dots
    this.dotsEl = this._el('bottom:calc(40% + 22px);left:50%;transform:translateX(-50%);display:none;');
    this.dots = [];
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block;width:10px;height:10px;border-radius:50%;background:#333;margin:0 3px;';
      this.dotsEl.appendChild(dot);
      this.dots.push(dot);
    }

    // Countdown — center
    this.countdownEl = this._el('top:30%;left:50%;transform:translate(-50%,-50%);font-size:120px;font-weight:bold;color:#fff;text-shadow:4px 4px 8px #000;font-family:monospace;opacity:1;transition:opacity 0.3s;');

    // Wrong way — top-center
    this.wrongWayEl = this._el('top:60px;left:50%;transform:translateX(-50%);font-size:32px;font-weight:bold;color:#ff4444;text-shadow:2px 2px 4px #000;font-family:monospace;opacity:0;transition:opacity 0.3s;');
    this.wrongWayEl.textContent = 'WRONG WAY';

    // Finish overlay — hidden until race end
    this.finishEl = this._el('inset:0;display:none;background:rgba(0,0,0,0.6);');
    this.finishPlace = document.createElement('div');
    this.finishPlace.style.cssText = 'position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);font-size:72px;font-weight:bold;color:#ffcc00;text-shadow:3px 3px 6px #000;font-family:monospace;text-align:center;';
    this.finishEl.appendChild(this.finishPlace);
    this.finishLabel = document.createElement('div');
    this.finishLabel.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:28px;color:#fff;text-shadow:2px 2px 4px #000;font-family:monospace;text-align:center;';
    this.finishEl.appendChild(this.finishLabel);

    // Item indicator — bottom-center
    this.itemEl = this._el('bottom:80px;left:50%;transform:translateX(-50%);font-size:22px;font-weight:bold;color:#ffcc00;text-shadow:2px 2px 4px #000;font-family:monospace;text-align:center;display:none;background:rgba(0,0,0,0.4);padding:6px 16px;border-radius:8px;');

    // Minimap
    this.minimapCanvas = null;
    this.minimapCtx = null;
    this.minimapBg = null; // pre-rendered terrain ImageData
    this.mapScale = 1;
    this.mapOffX = 0;
    this.mapOffZ = 0;

    document.body.appendChild(this.root);
  }

  _el(css) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;' + css;
    this.root.appendChild(el);
    return el;
  }

  /**
   * Set up the minimap from map terrain data
   * @param {object} mapData - loaded map data with .terrain, .width, .height, .scale
   * @param {{x,z,nx,nz}} finishLine - finish line in world coords
   */
  setupMinimap(mapData, finishLine) {
    const canvas = document.createElement('canvas');
    canvas.width = MINIMAP_SIZE;
    canvas.height = MINIMAP_SIZE;
    canvas.style.cssText = `position:fixed;bottom:12px;right:12px;width:${MINIMAP_SIZE}px;height:${MINIMAP_SIZE}px;border-radius:8px;`;
    this.root.appendChild(canvas);
    this.minimapCanvas = canvas;
    this.minimapCtx = canvas.getContext('2d');

    // Scale: fit map into minimap
    const mapWorldW = mapData.width * mapData.scale * CELL_SIZE;
    const mapWorldH = mapData.height * mapData.scale * CELL_SIZE;
    const maxDim = Math.max(mapWorldW, mapWorldH);
    this.mapScale = (MINIMAP_SIZE - 8) / maxDim; // 4px padding each side
    this.mapOffX = mapWorldW / 2;
    this.mapOffZ = mapWorldH / 2;

    // Pre-render terrain to an offscreen canvas
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = MINIMAP_SIZE;
    bgCanvas.height = MINIMAP_SIZE;
    const bgCtx = bgCanvas.getContext('2d');

    // Draw track pixels only — everything else stays transparent
    const cellWorld = mapData.scale * CELL_SIZE;
    const pxSize = Math.max(1, Math.ceil(cellWorld * this.mapScale));

    for (let row = 0; row < mapData.height; row++) {
      for (let col = 0; col < mapData.width; col++) {
        const t = mapData.terrain[row * mapData.width + col];
        if (t !== 0) continue; // only draw track (type 0)

        const wx = (col - mapData.width / 2) * cellWorld;
        const wz = (row - mapData.height / 2) * cellWorld;
        const mx = 4 + (wx + this.mapOffX) * this.mapScale;
        const my = 4 + (wz + this.mapOffZ) * this.mapScale;

        bgCtx.fillStyle = 'rgba(255,255,255,0.18)';
        bgCtx.fillRect(mx, my, pxSize, pxSize);
      }
    }

    // Draw finish line
    if (finishLine) {
      const flCx = 4 + (finishLine.x + this.mapOffX) * this.mapScale;
      const flCy = 4 + (finishLine.z + this.mapOffZ) * this.mapScale;
      // Line direction is perpendicular to normal: (-nz, nx)
      const ldx = -finishLine.nz;
      const ldz = finishLine.nx;
      const halfLen = (FINISH_LINE_WIDTH / 2) * this.mapScale;

      bgCtx.strokeStyle = '#ffffff';
      bgCtx.lineWidth = 2;
      bgCtx.beginPath();
      bgCtx.moveTo(flCx - ldx * halfLen, flCy - ldz * halfLen);
      bgCtx.lineTo(flCx + ldx * halfLen, flCy + ldz * halfLen);
      bgCtx.stroke();
    }

    this.minimapBg = bgCanvas;
  }

  /**
   * Update minimap with kart positions
   * @param {Array} allKarts - all kart groups
   * @param {object} playerKart - the player's kart group
   */
  updateMinimap(allKarts, playerKart) {
    if (!this.minimapCtx || !this.minimapBg) return;

    const ctx = this.minimapCtx;

    // Clear and redraw background
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    ctx.drawImage(this.minimapBg, 0, 0);

    // Draw kart dots
    for (const kart of allKarts) {
      const mx = 4 + (kart.position.x + this.mapOffX) * this.mapScale;
      const my = 4 + (kart.position.z + this.mapOffZ) * this.mapScale;
      const isPlayer = kart === playerKart;

      ctx.beginPath();
      ctx.arc(mx, my, isPlayer ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isPlayer ? '#ff3333' : '#ffffff';
      ctx.fill();
    }
  }

  updateCountdown(value) {
    if (value >= 1) {
      this.countdownEl.textContent = String(value);
      this.countdownEl.style.opacity = '1';
    } else if (value === 0) {
      this.countdownEl.textContent = 'GO!';
      this.countdownEl.style.opacity = '1';
    } else {
      this.countdownEl.style.opacity = '0';
    }
  }

  updateLap(current, total) {
    this.lapEl.textContent = `${current}/${total}`;
  }

  updatePosition(pos) {
    this.posEl.textContent = POSITION_LABELS[pos - 1] || `${pos}th`;
  }

  updateBoost(ud) {
    const active = ud.slideActive && ud.slideBoosts >= 0 && ud.slideBoosts < 3;

    if (active) {
      this.boostWrap.style.display = 'block';
      this.dotsEl.style.display = 'block';

      const fill = Math.min(1, ud.slideTimer / ud.stats.slideMeterDuration);
      const chargeIdx = Math.min(ud.slideBoosts, 2);
      const [sweetStart, sweetEnd] = SWEET_SPOTS[chargeIdx];

      // Sweet spot zone
      this.sweetSpot.style.left = (sweetStart * 100) + '%';
      this.sweetSpot.style.width = ((sweetEnd - sweetStart) * 100) + '%';

      // Fill bar
      this.boostFill.style.width = (fill * 100) + '%';
      if (fill > sweetEnd) {
        this.boostFill.style.background = '#ff4444';
      } else if (fill >= sweetStart) {
        this.boostFill.style.background = '#44ff44';
      } else {
        this.boostFill.style.background = '#ffaa00';
      }
    } else {
      this.boostWrap.style.display = 'none';
      this.dotsEl.style.display = 'none';
    }

    // Charge dots
    const dotColors = ['#ffaa00', '#ff6600', '#ff0000'];
    for (let i = 0; i < 3; i++) {
      this.dots[i].style.background = i < ud.slideBoosts ? dotColors[i] : '#333';
    }
  }

  updateWrongWay(isWrongWay) {
    this.wrongWayEl.style.opacity = isWrongWay ? '1' : '0';
  }

  updateItem(heldItem) {
    if (heldItem) {
      this.itemEl.style.display = 'block';
      this.itemEl.textContent = heldItem.toUpperCase() + ' [F]';
    } else {
      this.itemEl.style.display = 'none';
    }
  }

  showFinish(position, secondsLeft) {
    this.finishEl.style.display = 'block';
    this.finishPlace.textContent = POSITION_LABELS[position - 1] || `${position}th`;
    this.finishLabel.textContent = `FINISH!\nReturning in ${secondsLeft}...`;
    // Hide race elements
    this.lapEl.style.display = 'none';
    this.posEl.style.display = 'none';
    this.wrongWayEl.style.opacity = '0';
    this.boostWrap.style.display = 'none';
    this.dotsEl.style.display = 'none';
    this.itemEl.style.display = 'none';
  }

  destroy() {
    this.root.remove();
  }
}
