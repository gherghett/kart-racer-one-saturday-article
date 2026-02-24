import * as THREE from 'three';

// --- Flame sprite offsets (relative to kart, behind it) ---
const FLAME_OFFSETS = [
  { x:  0,   z: 1.6 },  // center
  { x: -0.6, z: 1.8 },  // left
  { x:  0.6, z: 1.8 },  // right
];

const FLAME_BASE_SCALE = 1.8;

// Build a radial gradient texture on a canvas
function createFlameTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 200, 1)');
  grad.addColorStop(0.3, 'rgba(255, 200, 50, 0.8)');
  grad.addColorStop(0.6, 'rgba(255, 120, 20, 0.5)');
  grad.addColorStop(1, 'rgba(255, 60, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// --- Speedlines (CSS overlay, player only) ---
function createSpeedlines() {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 50; opacity: 0;
    transition: opacity 0.1s;
  `;

  const lines = [];
  const LINE_COUNT = 12;

  for (let i = 0; i < LINE_COUNT; i++) {
    const line = document.createElement('div');
    // Distribute around edges — mostly left/right
    const side = i < 6 ? 'left' : 'right';
    const yPct = 10 + (i % 6) * 15 + Math.random() * 5;
    const xPct = side === 'left' ? (2 + Math.random() * 8) : (90 + Math.random() * 8);

    // Angle toward screen center
    const centerX = 50;
    const centerY = 50;
    const dx = centerX - xPct;
    const dy = centerY - yPct;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    line.style.cssText = `
      position: absolute;
      left: ${xPct}%;
      top: ${yPct}%;
      width: ${40 + Math.random() * 30}px;
      height: 2px;
      transform: rotate(${angle}deg);
      transform-origin: 0% 50%;
      background: linear-gradient(90deg, rgba(255,255,200,0.9), rgba(255,220,100,0) 100%);
      border-radius: 1px;
    `;

    container.appendChild(line);
    lines.push(line);
  }

  document.body.appendChild(container);

  return {
    container,
    lines,
    update(intensity) {
      container.style.opacity = Math.min(1, intensity).toFixed(2);
      if (intensity > 0.01) {
        for (const l of lines) {
          l.style.width = (40 + Math.random() * 40) + 'px';
          l.style.height = (1.5 + Math.random() * 2) + 'px';
        }
      }
    },
    destroy() {
      container.remove();
    },
  };
}

export function createBoostVisuals(allKarts) {
  const flameTex = createFlameTexture();
  const meshes = [];
  const kartFlames = []; // per-kart flame sprite arrays

  // Create flame sprites for each kart
  for (const kart of allKarts) {
    const flames = [];
    for (const offset of FLAME_OFFSETS) {
      const mat = new THREE.SpriteMaterial({
        map: flameTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(FLAME_BASE_SCALE, FLAME_BASE_SCALE, 1);
      sprite.visible = false;
      meshes.push(sprite);
      flames.push({ sprite, offset, mat });
    }
    kartFlames.push({ kart, flames });
  }

  // Speedlines — player kart is index 0
  const speedlines = createSpeedlines();

  function update(allKarts, dt) {
    for (let k = 0; k < kartFlames.length; k++) {
      const { kart, flames } = kartFlames[k];
      const ud = kart.userData;
      const boosting = ud.boostTimer > 0 || ud.boostSpeed > 0;

      // Intensity: 0..1 based on boost power
      const maxBoost = ud.stats.boostSpeeds[2]; // 20
      const intensity = boosting ? Math.min(1, ud.boostSpeed / maxBoost) : 0;

      const angle = kart.rotation.y;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      for (const f of flames) {
        f.sprite.visible = boosting;
        if (!boosting) {
          f.mat.opacity = 0;
          continue;
        }

        // Position in world space behind the kart
        const ox = f.offset.x;
        const oz = f.offset.z;
        const wx = kart.position.x + ox * cosA - oz * sinA;
        const wz = kart.position.z + ox * (-sinA) + oz * (-cosA);
        const wy = kart.position.y + 0.5;

        f.sprite.position.set(wx, wy, wz);

        // Flicker scale
        const flicker = 0.7 + Math.random() * 0.6;
        const s = FLAME_BASE_SCALE * intensity * flicker;
        f.sprite.scale.set(s, s * 1.2, 1);

        f.mat.opacity = intensity * (0.6 + Math.random() * 0.4);
      }

      // Speedlines — player only (index 0)
      if (k === 0) {
        speedlines.update(intensity);
      }
    }
  }

  function destroy() {
    speedlines.destroy();
    flameTex.dispose();
    for (const { flames } of kartFlames) {
      for (const f of flames) {
        f.mat.dispose();
      }
    }
  }

  return { meshes, update, destroy };
}
