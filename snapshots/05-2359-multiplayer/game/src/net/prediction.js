/**
 * Client-side prediction for local player.
 *
 * Runs local physics for instant feedback. On each server snapshot,
 * compares predicted position to authoritative position:
 *   - Small error (<SNAP_THRESHOLD): ignore, prediction is good enough
 *   - Large error: smoothly blend toward server position over time
 *
 * No input replay — avoids timing mismatches between 60fps client
 * and 20Hz send rate that cause systematic divergence.
 */
import * as THREE from 'three';
import { KartPhysics } from '../physics.js';

const SNAP_THRESHOLD = 3.0;   // ignore corrections smaller than this
const BLEND_RATE = 5;          // units/sec blend speed for large corrections

export class Prediction {
  constructor(obstacles) {
    this.physics = new KartPhysics(obstacles);
    this._offset = new THREE.Vector3(); // smoothing offset being blended out
  }

  /**
   * Apply local physics prediction for instant feedback
   */
  applyLocal(kart, input, dt) {
    this.physics.update(kart, input, dt);

    // Blend out any correction offset
    if (this._offset.lengthSq() > 0.0001) {
      const blendStep = BLEND_RATE * dt;
      const len = this._offset.length();
      if (len <= blendStep) {
        // Close enough — apply remaining offset
        kart.position.add(this._offset);
        this._offset.set(0, 0, 0);
      } else {
        // Blend a fraction
        const fraction = blendStep / len;
        kart.position.addScaledVector(this._offset, fraction);
        this._offset.multiplyScalar(1 - fraction);
      }
    }
  }

  /**
   * Compare predicted state with server snapshot.
   * Only corrects if error is large enough to matter.
   */
  onServerState(kart, serverState) {
    const dx = serverState.x - kart.position.x;
    const dz = serverState.z - kart.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Always sync non-position state from server (items, boost, slide)
    kart.userData.heldItem = serverState.heldItem;
    kart.userData.boostSpeed = serverState.boostSpeed;
    kart.userData.boostTimer = serverState.boostTimer;

    if (dist < SNAP_THRESHOLD) {
      // Close enough — prediction is fine, don't touch position
      return;
    }

    // Large error — set correction offset to blend toward server position
    // Instead of snapping, we'll smoothly move there
    this._offset.set(dx, serverState.y - kart.position.y, dz);
  }
}
