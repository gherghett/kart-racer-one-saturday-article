import type * as THREE from "three";

export interface ObjectDefinition {
  name: string;
  /** @param steer -1 = full left, 0 = straight, 1 = full right */
  create: (steer?: number) => THREE.Object3D;
}
