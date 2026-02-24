import * as THREE from 'three';
import sheetUrl from '@sprites/sprites.png';
import sheetMeta from '@sprites/sprites.json';

const FRAME_W = sheetMeta.frameWidth;
const FRAME_H = sheetMeta.frameHeight;
const COLUMNS = sheetMeta.columns;
const TOTAL_ROWS = sheetMeta.karts.length * sheetMeta.rowsPerKart;
const SHEET_W = FRAME_W * COLUMNS;       // 4096
const SHEET_H = FRAME_H * TOTAL_ROWS;    // 2304

export function createKart(kartIndex = 1) {
  const group = new THREE.Group();
  group.name = 'kart';

  const kartDef = sheetMeta.karts[kartIndex];

  // --- Sprite sheet texture ---
  const texture = new THREE.TextureLoader().load(sheetUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.repeat.set(FRAME_W / SHEET_W, FRAME_H / SHEET_H);
  // Initial frame: straight, column 0
  const straightRow = kartDef.rows[0].row;
  texture.offset.set(0, 1 - (straightRow + 1) * (FRAME_H / SHEET_H));

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.05,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(3, 3, 1);
  sprite.position.y = 1.5;
  sprite.name = 'kartSprite';
  sprite.renderOrder = 1;
  group.add(sprite);

  // Store for frame updates
  group.userData.spriteTexture = texture;
  group.userData.kartDef = kartDef;
  group.userData.currentFrame = -1;
  group.userData.currentVariant = -1;

  // --- Shadow (flat mesh plane on ground) ---
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d');

  const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 64);

  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowGeo = new THREE.PlaneGeometry(3, 3, 4, 4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.scale.set(1, 1, 1);
  shadow.frustumCulled = false;
  shadow.name = 'kartShadow';
  shadow.renderOrder = -1;
  group.userData.shadow = shadow;

  return group;
}

/**
 * Update the kart sprite frame based on the angle between
 * the kart's facing direction and the camera's view direction,
 * and the current steering input.
 */
export function updateKartFrame(kart, camera, input) {
  const tex = kart.userData.spriteTexture;
  if (!tex) return;

  const kartDef = kart.userData.kartDef;

  // Use raw input for instant visual feedback
  let variant = 0; // straight
  if (input && input.steer > 0) variant = 1;       // turn_left
  else if (input && input.steer < 0) variant = 2;  // turn_right

  // Angle from camera to kart (in world XZ plane)
  const dx = kart.position.x - camera.position.x;
  const dz = kart.position.z - camera.position.z;
  const cameraAngle = Math.atan2(dx, dz);

  const kartAngle = kart.rotation.y;

  let rel = cameraAngle - kartAngle;
  rel = ((rel % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

  let frame = Math.round(rel / (Math.PI * 2) * COLUMNS) % COLUMNS;

  if (frame === kart.userData.currentFrame && variant === kart.userData.currentVariant) return;
  kart.userData.currentFrame = frame;
  kart.userData.currentVariant = variant;

  const row = kartDef.rows[variant].row;
  tex.offset.set(
    frame * (FRAME_W / SHEET_W),
    1 - (row + 1) * (FRAME_H / SHEET_H),
  );
}
