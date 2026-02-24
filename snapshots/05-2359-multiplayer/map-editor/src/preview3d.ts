import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { type MapState, TerrainType, getTerrainColor } from "./state.ts";
import { getDecalImage } from "./decals.ts";

const HEIGHT_SCALE = 20;

export class Preview3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private mesh: THREE.Mesh | null = null;
  private decalMeshes: THREE.Mesh[] = [];
  private segsX = 0;
  private segsY = 0;
  private container: HTMLElement;
  private animId = 0;
  private _visible = false;
  private _dirty = false;

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

  /** Mark the preview as needing a vertex/color update (cheap, no geometry recreation) */
  markDirty(): void {
    this._dirty = true;
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
    this.segsX = Math.min(width, 512);
    this.segsY = Math.min(height, 512);
    const segsX = this.segsX;
    const segsY = this.segsY;
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

    this.rebuildDecals();
  }

  private removeDecalMeshes(): void {
    for (const m of this.decalMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.scene.remove(m);
    }
    this.decalMeshes = [];
  }

  private rebuildDecals(): void {
    this.removeDecalMeshes();
    if (!this.map) return;
    const { width, height, heightmap } = this.map;
    const cellSize = 3;
    const SUBDIV = 6;
    const Y_OFFSET = 0.5;

    for (const decal of this.map.decals) {
      const img = getDecalImage(this.map, decal.imageId);
      if (!img || !img.complete || img.naturalWidth === 0) continue;

      // Create texture from the HTMLImageElement
      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      // UV source rect
      const srcX = decal.srcRect?.x ?? 0;
      const srcY = decal.srcRect?.y ?? 0;
      const srcW = decal.srcRect?.w ?? img.naturalWidth;
      const srcH = decal.srcRect?.h ?? img.naturalHeight;
      const u0 = srcX / img.naturalWidth;
      const v0 = srcY / img.naturalHeight;
      const uSpan = srcW / img.naturalWidth;
      const vSpan = srcH / img.naturalHeight;

      const [tl, tr, br, bl] = decal.corners;
      const vCount = (SUBDIV + 1) * (SUBDIV + 1);
      const positions = new Float32Array(vCount * 3);
      const uvs = new Float32Array(vCount * 2);
      const indices: number[] = [];

      for (let iy = 0; iy <= SUBDIV; iy++) {
        for (let ix = 0; ix <= SUBDIV; ix++) {
          const idx = iy * (SUBDIV + 1) + ix;
          const u = ix / SUBDIV;
          const v = iy / SUBDIV;

          // Bilinear interp of map-space corners
          const topX = tl.x + (tr.x - tl.x) * u;
          const topY = tl.y + (tr.y - tl.y) * u;
          const botX = bl.x + (br.x - bl.x) * u;
          const botY = bl.y + (br.y - bl.y) * u;
          const mapX = topX + (botX - topX) * v;
          const mapY = topY + (botY - topY) * v;

          // Convert to world coords
          const wx = (mapX - width / 2) * cellSize;
          const wz = (mapY - height / 2) * cellSize;

          // Sample height
          const hmx = Math.max(0, Math.min(width - 1, Math.round(mapX)));
          const hmy = Math.max(0, Math.min(height - 1, Math.round(mapY)));
          const wy = heightmap[hmy * width + hmx]! * HEIGHT_SCALE + Y_OFFSET;

          positions[idx * 3] = wx;
          positions[idx * 3 + 1] = wy;
          positions[idx * 3 + 2] = wz;

          uvs[idx * 2] = u0 + u * uSpan;
          uvs[idx * 2 + 1] = v0 + v * vSpan;
        }
      }

      for (let iy = 0; iy < SUBDIV; iy++) {
        for (let ix = 0; ix < SUBDIV; ix++) {
          const a = iy * (SUBDIV + 1) + ix;
          const b = a + 1;
          const c = a + (SUBDIV + 1);
          const d = c + 1;
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: decal.opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        alphaTest: 0.01,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = -1;
      this.scene.add(mesh);
      this.decalMeshes.push(mesh);
    }
  }

  /** Update vertex heights and colors in-place (fast, no geometry recreation) */
  private update(): void {
    if (!this.mesh || !this.map) return;
    const { width, height, terrain, heightmap } = this.map;
    const segsX = this.segsX;
    const segsY = this.segsY;
    const geo = this.mesh.geometry;
    const pos = geo.attributes.position!;
    const colorAttr = geo.attributes.color!;
    const colors = colorAttr.array as Float32Array;

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
        const mapX = Math.min(Math.floor((ix / segsX) * width), width - 1);
        const mapY = Math.min(Math.floor((iy / segsY) * height), height - 1);
        const mapIdx = mapY * width + mapX;

        pos.setY(idx, heightmap[mapIdx]! * HEIGHT_SCALE);

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

    pos.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }

  private startLoop(): void {
    const loop = (): void => {
      if (!this._visible) return;
      if (this._dirty && this.mesh) {
        this._dirty = false;
        this.update();
        this.rebuildDecals();
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }
}
