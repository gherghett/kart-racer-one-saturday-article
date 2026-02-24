import * as THREE from "three";
import type { ObjectDefinition } from "./types";

const STEER_ANGLE = Math.PI / 7;

export const firetruck: ObjectDefinition = {
  name: "Firetruck",
  create(steer = 0) {
    const group = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xcc2211 });
    const darkRed = new THREE.MeshStandardMaterial({ color: 0x991a0a });
    const chrome = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.6,
      roughness: 0.3,
    });
    const gold = new THREE.MeshStandardMaterial({ color: 0xddaa22 });
    const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const blue = new THREE.MeshStandardMaterial({ color: 0x3366ff });

    // ---- Chassis / lower body ----
    const chassisGeo = new THREE.BoxGeometry(3.2, 0.35, 1.3);
    const chassis = new THREE.Mesh(chassisGeo, darkRed);
    chassis.position.set(0, 0.38, 0);
    group.add(chassis);

    // ---- Cab (front) — boxy but slightly tapered ----
    const cabGeo = new THREE.BoxGeometry(1.1, 0.8, 1.25);
    const cab = new THREE.Mesh(cabGeo, red);
    cab.position.set(1.0, 0.95, 0);
    group.add(cab);

    // Cab roof — slightly wider, overhangs
    const roofGeo = new THREE.BoxGeometry(1.15, 0.1, 1.3);
    const roof = new THREE.Mesh(roofGeo, darkRed);
    roof.position.set(1.0, 1.4, 0);
    group.add(roof);

    // Windshield
    const windshieldGeo = new THREE.BoxGeometry(0.05, 0.45, 1.0);
    const windshield = new THREE.Mesh(windshieldGeo, blue);
    windshield.position.set(1.53, 1.0, 0);
    group.add(windshield);

    // Side windows
    for (const side of [-1, 1]) {
      const winGeo = new THREE.BoxGeometry(0.6, 0.35, 0.05);
      const win = new THREE.Mesh(winGeo, blue);
      win.position.set(1.05, 1.02, side * 0.64);
      group.add(win);
    }

    // ---- Rear body — the big boxy tank area ----
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.7, 1.2);
    const body = new THREE.Mesh(bodyGeo, red);
    body.position.set(-0.55, 0.9, 0);
    group.add(body);

    // Equipment panels — recessed side panels
    for (const side of [-1, 1]) {
      const panelGeo = new THREE.BoxGeometry(1.5, 0.45, 0.06);
      const panel = new THREE.Mesh(panelGeo, chrome);
      panel.position.set(-0.5, 0.82, side * 0.63);
      group.add(panel);
    }

    // ---- Ladder rack on top ----
    const ladderBaseGeo = new THREE.BoxGeometry(1.6, 0.08, 0.5);
    const ladderBase = new THREE.Mesh(ladderBaseGeo, chrome);
    ladderBase.position.set(-0.5, 1.3, 0);
    group.add(ladderBase);

    // Ladder rungs
    const rungMat = gold;
    for (let i = 0; i < 6; i++) {
      const rungGeo = new THREE.BoxGeometry(0.06, 0.06, 0.4);
      const rung = new THREE.Mesh(rungGeo, rungMat);
      rung.position.set(-1.15 + i * 0.28, 1.38, 0);
      group.add(rung);
    }
    // Ladder rails
    for (const side of [-1, 1]) {
      const railGeo = new THREE.BoxGeometry(1.55, 0.06, 0.06);
      const rail = new THREE.Mesh(railGeo, gold);
      rail.position.set(-0.5, 1.38, side * 0.22);
      group.add(rail);
    }

    // ---- Hose reel on back ----
    const reelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.35, 12);
    const reel = new THREE.Mesh(reelGeo, gold);
    reel.position.set(-1.55, 0.85, 0);
    reel.rotation.x = Math.PI / 2;
    group.add(reel);

    // Hose coil (torus around the reel)
    const hoseGeo = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0xcccc33 });
    const hose = new THREE.Mesh(hoseGeo, hoseMat);
    hose.position.set(-1.55, 0.85, 0);
    group.add(hose);

    // ---- Light bar on cab roof ----
    const barGeo = new THREE.BoxGeometry(0.5, 0.1, 0.9);
    const bar = new THREE.Mesh(barGeo, chrome);
    bar.position.set(1.0, 1.5, 0);
    group.add(bar);

    // Red + white lights
    const lightGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const redLight = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
    });
    const whiteLight = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.3,
    });
    for (let i = 0; i < 4; i++) {
      const light = new THREE.Mesh(
        lightGeo,
        i % 2 === 0 ? redLight : whiteLight,
      );
      light.position.set(1.0, 1.58, -0.3 + i * 0.2);
      group.add(light);
    }

    // ---- Headlights ----
    const headlightGeo = new THREE.SphereGeometry(0.08, 8, 6);
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(headlightGeo, whiteLight);
      hl.position.set(1.56, 0.72, side * 0.45);
      group.add(hl);
    }

    // ---- Front bumper ----
    const bumperGeo = new THREE.BoxGeometry(0.15, 0.2, 1.35);
    const bumper = new THREE.Mesh(bumperGeo, chrome);
    bumper.position.set(1.6, 0.5, 0);
    group.add(bumper);

    // ---- Rear bumper ----
    const rBumperGeo = new THREE.BoxGeometry(0.12, 0.18, 1.3);
    const rBumper = new THREE.Mesh(rBumperGeo, chrome);
    rBumper.position.set(-1.6, 0.48, 0);
    group.add(rBumper);

    // ---- Wheels with treads ----
    const treadTex = makeTreadTexture();
    treadTex.wrapS = THREE.RepeatWrapping;
    treadTex.wrapT = THREE.RepeatWrapping;
    treadTex.magFilter = THREE.NearestFilter;
    treadTex.minFilter = THREE.NearestFilter;
    treadTex.generateMipmaps = false;

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: treadTex,
      bumpMap: treadTex,
      bumpScale: 1.5,
      roughness: 0.95,
    });

    const axles: { x: number; z: number; front: boolean }[] = [
      { x: 0.95, z: 0.75, front: true },
      { x: 0.95, z: -0.75, front: true },
      { x: -0.7, z: 0.75, front: false },
      { x: -0.7, z: -0.75, front: false },
      { x: -1.15, z: 0.75, front: false },
      { x: -1.15, z: -0.75, front: false },
    ];

    for (const a of axles) {
      const tireGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 16);
      const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.24, 6);

      if (a.front) {
        const pivot = new THREE.Group();
        pivot.position.set(a.x, 0.28, a.z);
        pivot.rotation.y = -steer * STEER_ANGLE;

        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.x = Math.PI / 2;
        pivot.add(tire);

        const hub = new THREE.Mesh(hubGeo, chrome);
        hub.rotation.x = Math.PI / 2;
        pivot.add(hub);

        group.add(pivot);
      } else {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.position.set(a.x, 0.28, a.z);
        tire.rotation.x = Math.PI / 2;
        group.add(tire);

        const hub = new THREE.Mesh(hubGeo, chrome);
        hub.position.set(a.x, 0.28, a.z);
        hub.rotation.x = Math.PI / 2;
        group.add(hub);
      }
    }

    // ---- Number "51" on the side (box letters) ----
    for (const side of [-1, 1]) {
      // "5" — three horizontal bars + two vertical
      const fiveParts: [number, number, number, number][] = [
        // x-off, y-off, w, h
        [0, 0.15, 0.15, 0.04], // top bar
        [0, 0, 0.15, 0.04], // mid bar
        [0, -0.15, 0.15, 0.04], // bottom bar
        [-0.055, 0.075, 0.04, 0.11], // top-left vertical
        [0.055, -0.075, 0.04, 0.11], // bottom-right vertical
      ];
      for (const [xo, yo, w, h] of fiveParts) {
        const geo = new THREE.BoxGeometry(0.04, h, w);
        const m = new THREE.Mesh(geo, white);
        m.position.set(-0.2 + xo, 1.05 + yo, side * 0.64);
        m.rotation.y = side > 0 ? 0 : Math.PI;
        group.add(m);
      }

      // "1" — single vertical bar + small base
      const oneGeo = new THREE.BoxGeometry(0.04, 0.34, 0.04);
      const one = new THREE.Mesh(oneGeo, white);
      one.position.set(-0.2 + 0.2, 1.05, side * 0.64);
      group.add(one);
    }

    return group;
  },
};

function makeTreadTexture(): THREE.CanvasTexture {
  const w = 8;
  const h = 8;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 1, w, 1);
  ctx.fillRect(0, 4, w, 1);
  ctx.fillRect(0, 7, w, 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.repeat.set(1, 1);
  return tex;
}
