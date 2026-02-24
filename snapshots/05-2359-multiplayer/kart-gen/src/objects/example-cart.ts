import * as THREE from "three";
import type { ObjectDefinition } from "./types";

const STEER_ANGLE = Math.PI / 7; // ~25°

export const exampleCart: ObjectDefinition = {
  name: "Cart",
  create(steer = 0) {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.6, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xdd4444 }),
    );
    body.position.y = 0.6;
    group.add(body);

    // Cabin / windshield area
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.5, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x4488dd }),
    );
    cabin.position.set(-0.2, 1.15, 0);
    group.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

    // Front wheels (steerable) — at +X
    for (const z of [0.65, -0.65]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.65, 0.3, z);
      pivot.rotation.y = -steer * STEER_ANGLE;
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      pivot.add(wheel);
      group.add(pivot);
    }

    // Rear wheels (fixed)
    for (const z of [0.65, -0.65]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(-0.65, 0.3, z);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
    }

    return group;
  },
};
