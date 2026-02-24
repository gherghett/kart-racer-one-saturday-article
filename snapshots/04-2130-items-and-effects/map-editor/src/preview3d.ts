import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { type MapState, TerrainType, getTerrainColor } from "./state.ts";

const HEIGHT_SCALE = 20;

export class Preview3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private container: HTMLElement;
  private animId = 0;
  private _visible = false;

  map: MapState | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x111111);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 5000);
    this.camera.position.set(200, 300, 200);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.set(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(200, 400, 100);
    this.scene.add(dir);

    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-100, 200, -200);
    this.scene.add(dir2);

    window.addEventListener("resize", () => {
      if (this._visible) this.resize();
    });
  }

  get visible(): boolean {
    return this._visible;
  }

  show(): void {
    this._visible = true;
    this.container.style.display = "block";
    this.resize();
    this.startLoop();
  }

  hide(): void {
    this._visible = false;
    this.container.style.display = "none";
    cancelAnimationFrame(this.animId);
  }

  toggle(): void {
    if (this._visible) this.hide();
    else this.show();
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Rebuild or update the 3D mesh from the current map state */
  rebuild(): void {
    if (!this.map) return;
    const { width, height, terrain, heightmap } = this.map;

    // Remove old mesh
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.scene.remove(this.mesh);
    }

    // Clamp segments for performance
    const segsX = Math.min(width, 512);
    const segsY = Math.min(height, 512);
    const cellSize = 3;

    const geo = new THREE.PlaneGeometry(
      width * cellSize,
      height * cellSize,
      segsX,
      segsY,
    );

    // Rotate to horizontal (XZ plane)
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position!;
    const colors = new Float32Array(pos.count * 3);

    // Pre-parse custom terrain colors to RGB floats
    const tColors = [
      TerrainType.Track,
      TerrainType.Offroad,
      TerrainType.Inaccessible,
    ].map((t) => {
      const hex = getTerrainColor(this.map!, t);
      return {
        r: parseInt(hex.slice(1, 3), 16) / 255,
        g: parseInt(hex.slice(3, 5), 16) / 255,
        b: parseInt(hex.slice(5, 7), 16) / 255,
      };
    });

    for (let iy = 0; iy <= segsY; iy++) {
      for (let ix = 0; ix <= segsX; ix++) {
        const idx = iy * (segsX + 1) + ix;

        // Map grid position to map pixel
        const mapX = Math.min(Math.floor((ix / segsX) * width), width - 1);
        const mapY = Math.min(Math.floor((iy / segsY) * height), height - 1);
        const mapIdx = mapY * width + mapX;

        // Set height (Y is up after rotation)
        const h = heightmap[mapIdx]! * HEIGHT_SCALE;
        pos.setY(idx, h);

        // Set color: use color layer if painted, else terrain type color
        const clOff = mapIdx * 4;
        if (this.map!.colorLayer[clOff + 3]!) {
          colors[idx * 3] = this.map!.colorLayer[clOff]! / 255;
          colors[idx * 3 + 1] = this.map!.colorLayer[clOff + 1]! / 255;
          colors[idx * 3 + 2] = this.map!.colorLayer[clOff + 2]! / 255;
        } else {
          const t = terrain[mapIdx]!;
          const c = tColors[t] ?? tColors[0]!;
          colors[idx * 3] = c.r;
          colors[idx * 3 + 1] = c.g;
          colors[idx * 3 + 2] = c.b;
        }
      }
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.mesh);

    // Center camera on the map
    this.controls.target.set(0, 0, 0);
    const size = Math.max(width, height) * cellSize * 0.5;
    this.camera.position.set(size * 0.8, size * 0.9, size * 0.8);
    this.controls.update();
  }

  private startLoop(): void {
    const loop = (): void => {
      if (!this._visible) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }
}
