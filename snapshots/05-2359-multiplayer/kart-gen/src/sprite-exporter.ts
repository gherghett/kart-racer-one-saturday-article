import * as THREE from "three";
import type { ObjectDefinition } from "./objects/types";

const TOTAL_DIRECTIONS = 16;
const ELEVATION_RAD = THREE.MathUtils.degToRad(20);

const DIR_NAMES = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function renderRow(
  offRenderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  object: THREE.Object3D,
  frameSize: number,
  ctx: CanvasRenderingContext2D,
  rowY: number,
) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const halfExtent = maxDim * 0.55;
  const dist = maxDim * 3;

  // Shift focus point up so kart sits in lower part of frame
  const lookAt = center.clone();
  lookAt.y += halfExtent * 0.35;

  const cam = new THREE.OrthographicCamera(
    -halfExtent, halfExtent, halfExtent, -halfExtent, 0.1, 100,
  );

  for (let i = 0; i < TOTAL_DIRECTIONS; i++) {
    const angle = (i * Math.PI * 2) / TOTAL_DIRECTIONS + Math.PI / 2;
    cam.position.set(
      lookAt.x + Math.sin(angle) * Math.cos(ELEVATION_RAD) * dist,
      lookAt.y + Math.sin(ELEVATION_RAD) * dist,
      lookAt.z + Math.cos(angle) * Math.cos(ELEVATION_RAD) * dist,
    );
    cam.lookAt(lookAt);
    offRenderer.render(scene, cam);

    ctx.drawImage(offRenderer.domElement, i * frameSize, rowY);
  }
}

export function exportSpriteSheet(
  scene: THREE.Scene,
  object: THREE.Object3D,
  frameSize: number,
): void {
  const offRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  offRenderer.setSize(frameSize, frameSize);

  const sheet = document.createElement("canvas");
  sheet.width = frameSize * TOTAL_DIRECTIONS;
  sheet.height = frameSize;
  const ctx = sheet.getContext("2d")!;

  renderRow(offRenderer, scene, object, frameSize, ctx, 0);
  offRenderer.dispose();

  const link = document.createElement("a");
  link.download = "spritesheet.png";
  link.href = sheet.toDataURL("image/png");
  link.click();
}

const STEER_VARIANTS: { label: string; steer: number }[] = [
  { label: "straight", steer: 0 },
  { label: "turn_left", steer: -1 },
  { label: "turn_right", steer: 1 },
];
const ROWS_PER_KART = STEER_VARIANTS.length;

export async function exportAllToFolder(
  scene: THREE.Scene,
  definitions: ObjectDefinition[],
  frameSize: number,
): Promise<void> {
  const offRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  offRenderer.setSize(frameSize, frameSize);

  const totalRows = definitions.length * ROWS_PER_KART;
  const sheet = document.createElement("canvas");
  sheet.width = frameSize * TOTAL_DIRECTIONS;
  sheet.height = frameSize * totalRows;
  const ctx = sheet.getContext("2d")!;

  // Remove non-light objects temporarily
  const existingObjects: THREE.Object3D[] = [];
  scene.children.forEach((child) => {
    if (!(child instanceof THREE.Light)) {
      existingObjects.push(child);
    }
  });
  existingObjects.forEach((obj) => scene.remove(obj));

  const kartMeta: {
    name: string;
    rows: { row: number; variant: string; steer: number }[];
    directions: number;
    frameSize: number;
  }[] = [];

  let rowIdx = 0;
  for (const def of definitions) {
    const rows: { row: number; variant: string; steer: number }[] = [];

    for (const variant of STEER_VARIANTS) {
      const obj = def.create(variant.steer);
      scene.add(obj);

      renderRow(offRenderer, scene, obj, frameSize, ctx, rowIdx * frameSize);

      scene.remove(obj);
      rows.push({ row: rowIdx, variant: variant.label, steer: variant.steer });
      rowIdx++;
    }

    kartMeta.push({
      name: def.name,
      rows,
      directions: TOTAL_DIRECTIONS,
      frameSize,
    });
  }

  existingObjects.forEach((obj) => scene.add(obj));
  offRenderer.dispose();

  const pngData = sheet.toDataURL("image/png");

  const jsonData = JSON.stringify(
    {
      spriteSheet: "sprites.png",
      frameWidth: frameSize,
      frameHeight: frameSize,
      columns: TOTAL_DIRECTIONS,
      rowsPerKart: ROWS_PER_KART,
      steerVariants: STEER_VARIANTS.map((v) => v.label),
      directionNames: DIR_NAMES,
      karts: kartMeta,
    },
    null,
    2,
  );

  const mdData = `# kart-sprites

## Format

- **sprites.png** — sprite sheet with all karts and steering variants
- **sprites.json** — metadata describing the layout

## Sprite Sheet Layout

Each kart occupies **${ROWS_PER_KART} rows** (one per steering variant):

| Row offset | Variant |
|-----------|---------|
${STEER_VARIANTS.map((v, i) => `| ${i} | ${v.label} (steer=${v.steer}) |`).join("\n")}

Each row has **${TOTAL_DIRECTIONS} columns** (one per direction):

| Column | Direction |
|--------|-----------|
${DIR_NAMES.map((name, i) => `| ${i} | ${name} |`).join("\n")}

## Frame Size

Each frame is \`${frameSize} x ${frameSize}\` pixels.

The full sheet is \`${frameSize * TOTAL_DIRECTIONS} x ${frameSize * totalRows}\` pixels (${definitions.length} karts x ${ROWS_PER_KART} variants = ${totalRows} rows).

## Directions

Directions go clockwise starting from North (camera facing the front of the kart).
Directions 9-15 (SSW through NNW) are horizontal mirrors of directions 7-1.

## JSON Schema

\`\`\`json
{
  "spriteSheet": "sprites.png",
  "frameWidth": number,
  "frameHeight": number,
  "columns": 16,
  "rowsPerKart": ${ROWS_PER_KART},
  "steerVariants": ["straight", "turn_left", "turn_right"],
  "directionNames": ["N", "NNE", ...],
  "karts": [
    {
      "name": "Kart Name",
      "rows": [
        { "row": 0, "variant": "straight", "steer": 0 },
        { "row": 1, "variant": "turn_left", "steer": -1 },
        { "row": 2, "variant": "turn_right", "steer": 1 }
      ],
      "directions": 16,
      "frameSize": ${frameSize}
    }
  ]
}
\`\`\`

To get the pixel rect for a specific kart, variant, and direction:
- **x** = column * frameWidth
- **y** = row * frameHeight
- **width** = frameWidth
- **height** = frameHeight
`;

  const resp = await fetch("/api/save-sprites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ png: pngData, json: jsonData, md: mdData }),
  });

  if (!resp.ok) {
    throw new Error(`Save failed: ${resp.statusText}`);
  }
}
