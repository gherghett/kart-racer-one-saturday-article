import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TOTAL_DIRECTIONS = 16;
const PREVIEW_COUNT = 8;
const PREVIEW_LABELS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE"];
const PREVIEW_SIZE = 112;
const ELEVATION_DEG = 20;
const ELEVATION_RAD = THREE.MathUtils.degToRad(ELEVATION_DEG);

export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly webglRenderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private currentObject: THREE.Object3D | null = null;
  private previewCanvases: HTMLCanvasElement[] = [];
  private previewRenderer: THREE.WebGLRenderer | null = null;
  private previewCam: THREE.OrthographicCamera | null = null;

  private _snapEnabled = false;
  private snapIndex = 0;
  private snapDist = 5;

  constructor(container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100,
    );

    this.webglRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.webglRenderer.setPixelRatio(window.devicePixelRatio);
    this.webglRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.webglRenderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);

    // Controls
    this.controls = new OrbitControls(
      this.camera,
      this.webglRenderer.domElement,
    );
    this.controls.enableDamping = true;

    // Snap input: scroll wheel and arrow keys
    this.webglRenderer.domElement.addEventListener("wheel", (e) => {
      if (!this._snapEnabled) return;
      e.preventDefault();
      this.snapIndex =
        (this.snapIndex + (e.deltaY > 0 ? 1 : -1) + TOTAL_DIRECTIONS) %
        TOTAL_DIRECTIONS;
      this.applySnapPosition();
    });
    window.addEventListener("keydown", (e) => {
      if (!this._snapEnabled) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        this.snapIndex = (this.snapIndex + 1) % TOTAL_DIRECTIONS;
        this.applySnapPosition();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        this.snapIndex =
          (this.snapIndex - 1 + TOTAL_DIRECTIONS) % TOTAL_DIRECTIONS;
        this.applySnapPosition();
      }
    });

    // Handle resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.webglRenderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // Preview strip
    this.initPreviewStrip();

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (!this._snapEnabled) {
        this.controls.update();
      }
      this.webglRenderer.render(this.scene, this.camera);
      this.renderPreviews();
    };
    animate();
  }

  get snapEnabled() {
    return this._snapEnabled;
  }

  set snapEnabled(v: boolean) {
    this._snapEnabled = v;
    this.controls.enabled = !v;
    if (v) {
      // Derive initial snap index from current camera azimuth
      const offset = this.camera.position
        .clone()
        .sub(this.controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      const snapInterval = (Math.PI * 2) / TOTAL_DIRECTIONS;
      const adjusted = spherical.theta - Math.PI / 2;
      this.snapIndex =
        ((Math.round(adjusted / snapInterval) % TOTAL_DIRECTIONS) +
          TOTAL_DIRECTIONS) %
        TOTAL_DIRECTIONS;
      this.snapDist = offset.length();
      this.applySnapPosition();
    }
  }

  setObject(obj: THREE.Object3D) {
    if (this.currentObject) {
      this.scene.remove(this.currentObject);
    }
    this.currentObject = obj;
    this.scene.add(obj);
    this.fitCamera(obj);
  }

  private fitCamera(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim / (2 * Math.tan((this.camera.fov * Math.PI) / 360));

    this.snapDist = dist * 1.5;
    this.camera.position.set(center.x + this.snapDist, center.y, center.z);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private applySnapPosition() {
    const target = this.controls.target;
    const angle = (this.snapIndex * Math.PI * 2) / TOTAL_DIRECTIONS + Math.PI / 2;
    this.camera.position.set(
      target.x + Math.sin(angle) * Math.cos(ELEVATION_RAD) * this.snapDist,
      target.y + Math.sin(ELEVATION_RAD) * this.snapDist,
      target.z + Math.cos(angle) * Math.cos(ELEVATION_RAD) * this.snapDist,
    );
    this.camera.lookAt(target);
  }

  private initPreviewStrip() {
    const strip = document.getElementById("preview-strip")!;
    this.previewRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.previewRenderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE);

    this.previewCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

    for (let i = 0; i < PREVIEW_COUNT; i++) {
      const frame = document.createElement("div");
      frame.className = "frame";
      const canvas = document.createElement("canvas");
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      canvas.style.width = `${PREVIEW_SIZE}px`;
      canvas.style.height = `${PREVIEW_SIZE}px`;
      const label = document.createElement("span");
      label.textContent = PREVIEW_LABELS[i]!;
      frame.appendChild(canvas);
      frame.appendChild(label);
      strip.appendChild(frame);
      this.previewCanvases.push(canvas);
    }
  }

  private renderPreviews() {
    if (!this.currentObject || !this.previewRenderer || !this.previewCam)
      return;

    const box = new THREE.Box3().setFromObject(this.currentObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const halfExtent = maxDim * 0.55;
    const dist = maxDim * 3;

    // Shift focus point up so kart sits in lower part of frame
    const lookAt = center.clone();
    lookAt.y += halfExtent * 0.35;

    this.previewCam.left = -halfExtent;
    this.previewCam.right = halfExtent;
    this.previewCam.top = halfExtent;
    this.previewCam.bottom = -halfExtent;
    this.previewCam.updateProjectionMatrix();

    for (let i = 0; i < PREVIEW_COUNT; i++) {
      const angle = (i * Math.PI * 2) / TOTAL_DIRECTIONS + Math.PI / 2;
      this.previewCam.position.set(
        lookAt.x + Math.sin(angle) * Math.cos(ELEVATION_RAD) * dist,
        lookAt.y + Math.sin(ELEVATION_RAD) * dist,
        lookAt.z + Math.cos(angle) * Math.cos(ELEVATION_RAD) * dist,
      );
      this.previewCam.lookAt(lookAt);

      this.previewRenderer.render(this.scene, this.previewCam);

      const ctx = this.previewCanvases[i]!.getContext("2d")!;
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      ctx.drawImage(this.previewRenderer.domElement, 0, 0);
    }
  }
}
