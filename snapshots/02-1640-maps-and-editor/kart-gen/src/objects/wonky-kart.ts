import * as THREE from "three";
import type { ObjectDefinition } from "./types";

const STEER_ANGLE = Math.PI / 7;

export const wonkyKart: ObjectDefinition = {
  name: "Wonky Kart",
  create(steer = 0) {
    const group = new THREE.Group();

    // Flat chassis — tapers toward the front, slightly off-center
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-1.1, -0.55);
    bodyShape.lineTo(1.0, -0.48);
    bodyShape.lineTo(0.85, 0.48);
    bodyShape.lineTo(-1.0, 0.55);
    bodyShape.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
    });
    bodyGeo.center();
    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({ color: 0xff6622 }),
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.42;
    group.add(body);

    // Nose — raised front section
    const noseGeo = new THREE.BoxGeometry(0.6, 0.22, 0.9);
    const nose = new THREE.Mesh(
      noseGeo,
      new THREE.MeshStandardMaterial({ color: 0xff7733 }),
    );
    nose.position.set(0.55, 0.55, 0);
    nose.rotation.z = 0.04;
    group.add(nose);

    // Seat — a lumpy rounded box sitting on top, slightly tilted
    const seatGeo = new THREE.SphereGeometry(0.38, 8, 6);
    seatGeo.scale(1, 0.5, 1);
    const seat = new THREE.Mesh(
      seatGeo,
      new THREE.MeshStandardMaterial({ color: 0x8844cc }),
    );
    seat.position.set(-0.15, 0.75, 0.05);
    seat.rotation.z = 0.1;
    group.add(seat);

    // Steering column — a tilted cylinder sticking up from the front
    const columnGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8);
    const columnMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const column = new THREE.Mesh(columnGeo, columnMat);
    column.position.set(0.5, 0.82, 0.0);
    column.rotation.z = 0.5;
    group.add(column);

    // Steering wheel — a torus, slightly oversized
    const swGeo = new THREE.TorusGeometry(0.18, 0.03, 8, 16);
    const sw = new THREE.Mesh(
      swGeo,
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
    );
    sw.position.set(0.64, 1.07, 0.0);
    sw.rotation.x = Math.PI / 2;
    sw.rotation.z = 0.5;
    group.add(sw);

    // Engine block — boxy lump poking out the back
    const engineGeo = new THREE.BoxGeometry(0.5, 0.45, 0.7);
    const engine = new THREE.Mesh(
      engineGeo,
      new THREE.MeshStandardMaterial({ color: 0x555555 }),
    );
    engine.position.set(-0.85, 0.6, 0);
    engine.rotation.y = 0.08;
    engine.rotation.z = -0.05;
    group.add(engine);

    // Exhaust pipe — a small cylinder out the back-left
    const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.4, 8);
    const exhaust = new THREE.Mesh(
      exhaustGeo,
      new THREE.MeshStandardMaterial({ color: 0x888888 }),
    );
    exhaust.position.set(-1.1, 0.72, 0.25);
    exhaust.rotation.z = -0.3;
    group.add(exhaust);

    // Tread texture — tiny pixelated canvas
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
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xdddd44 });

    // Wheel specs: first two are front (steerable), last two are rear
    const wheels: {
      pos: [number, number, number];
      radius: number;
      width: number;
      tilt: number;
      front: boolean;
    }[] = [
      { pos: [0.7, 0.3, 0.75], radius: 0.32, width: 0.32, tilt: 0.06, front: true },
      { pos: [0.7, 0.3, -0.75], radius: 0.3, width: 0.3, tilt: -0.04, front: true },
      { pos: [-0.65, 0.32, 0.74], radius: 0.35, width: 0.34, tilt: 0.08, front: false },
      { pos: [-0.65, 0.32, -0.74], radius: 0.28, width: 0.28, tilt: -0.1, front: false },
    ];

    for (const w of wheels) {
      const tireGeo = new THREE.CylinderGeometry(
        w.radius, w.radius, w.width, 24, 1,
      );
      const hubGeo = new THREE.CylinderGeometry(
        w.radius * 0.5, w.radius * 0.5, w.width + 0.02, 6,
      );

      if (w.front) {
        const pivot = new THREE.Group();
        pivot.position.set(...w.pos);
        pivot.rotation.y = -steer * STEER_ANGLE;

        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.x = Math.PI / 2 + w.tilt;
        pivot.add(tire);

        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.rotation.x = Math.PI / 2 + w.tilt;
        pivot.add(hub);

        group.add(pivot);
      } else {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.position.set(...w.pos);
        tire.rotation.x = Math.PI / 2 + w.tilt;
        group.add(tire);

        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.position.set(...w.pos);
        hub.rotation.x = Math.PI / 2 + w.tilt;
        group.add(hub);
      }
    }

    // Front bumper — a squished sphere
    const bumperGeo = new THREE.SphereGeometry(0.2, 8, 6);
    bumperGeo.scale(2.0, 0.6, 3.2);
    const bumper = new THREE.Mesh(
      bumperGeo,
      new THREE.MeshStandardMaterial({ color: 0xcccccc }),
    );
    bumper.position.set(1.05, 0.4, 0);
    group.add(bumper);

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
