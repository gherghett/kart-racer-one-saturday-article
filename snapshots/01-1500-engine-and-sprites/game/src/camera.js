import * as THREE from 'three';

const CAM_DISTANCE = 12;
const CAM_HEIGHT = 6;
const CAM_LOOK_AHEAD = 4;
const CAM_SMOOTHING = 4;
const CAM_ROTATE_SPEED = 2.5;

const _idealPos = new THREE.Vector3();
const _lookAt = new THREE.Vector3();

export class CameraController {
  constructor(camera, target) {
    this.camera = camera;
    this.target = target;
    this.currentPos = new THREE.Vector3();
    this.orbitAngle = 0; // manual orbit offset from Q/E

    this._computeIdeal();
    this.currentPos.copy(_idealPos);
    this.camera.position.copy(this.currentPos);
  }

  _computeIdeal() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.target.quaternion);
    forward.y = 0;
    forward.normalize();

    // Rotate the behind-vector by the orbit angle
    const behind = forward.clone().negate();
    const cos = Math.cos(this.orbitAngle);
    const sin = Math.sin(this.orbitAngle);
    const rx = behind.x * cos - behind.z * sin;
    const rz = behind.x * sin + behind.z * cos;

    _idealPos.set(
      this.target.position.x + rx * CAM_DISTANCE,
      this.target.position.y + CAM_HEIGHT,
      this.target.position.z + rz * CAM_DISTANCE,
    );
  }

  update(dt, input) {
    // Q/E orbit
    if (input) {
      this.orbitAngle += input.camRotate * CAM_ROTATE_SPEED * dt;
      // Slowly return to center when not pressing
      if (Math.abs(input.camRotate) < 0.1) {
        this.orbitAngle *= 1 - 3 * dt;
        if (Math.abs(this.orbitAngle) < 0.01) this.orbitAngle = 0;
      }
    }

    this._computeIdeal();

    const t = 1 - Math.exp(-CAM_SMOOTHING * dt);
    this.currentPos.lerp(_idealPos, t);
    this.camera.position.copy(this.currentPos);

    // Look at kart
    _lookAt.copy(this.target.position);
    _lookAt.y += 1.5;
    this.camera.lookAt(_lookAt);
  }
}
