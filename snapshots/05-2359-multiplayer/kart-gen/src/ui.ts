import * as THREE from "three";
import { registry } from "./objects/registry";
import { Renderer } from "./renderer";
import { exportSpriteSheet, exportAllToFolder } from "./sprite-exporter";

const STEER_OPTIONS: { label: string; value: number }[] = [
  { label: "Left", value: -1 },
  { label: "Straight", value: 0 },
  { label: "Right", value: 1 },
];

export function initUI(renderer: Renderer) {
  const listEl = document.getElementById("object-list")!;
  const sizeInput = document.getElementById("sprite-size") as HTMLInputElement;
  const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
  const saveAllBtn = document.getElementById("save-all-btn") as HTMLButtonElement;
  const snapToggle = document.getElementById("snap-toggle") as HTMLInputElement;
  const steerBtnsEl = document.getElementById("steer-btns")!;

  let currentObject: THREE.Object3D | null = null;
  let activeItem: HTMLElement | null = null;
  let currentName: string | null = null;
  let currentSteer = 0;

  function loadObject(name: string, steer: number) {
    const def = registry.find((d) => d.name === name);
    if (!def) return;
    currentObject = def.create(steer);
    currentName = name;
    currentSteer = steer;
    renderer.setObject(currentObject);
  }

  function selectItem(name: string, item: HTMLElement) {
    if (activeItem) activeItem.classList.remove("active");
    item.classList.add("active");
    activeItem = item;
    loadObject(name, currentSteer);
  }

  // Steer buttons
  const steerBtnEls: HTMLButtonElement[] = [];
  for (const opt of STEER_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "steer-btn";
    btn.textContent = opt.label;
    if (opt.value === 0) btn.classList.add("active");
    btn.addEventListener("click", () => {
      steerBtnEls.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentSteer = opt.value;
      if (currentName) loadObject(currentName, currentSteer);
    });
    steerBtnsEl.appendChild(btn);
    steerBtnEls.push(btn);
  }

  function setSteer(value: number) {
    const idx = STEER_OPTIONS.findIndex((o) => o.value === value);
    if (idx === -1) return;
    steerBtnEls.forEach((b) => b.classList.remove("active"));
    steerBtnEls[idx]!.classList.add("active");
    currentSteer = value;
    if (currentName) loadObject(currentName, currentSteer);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "a" || e.key === "A") setSteer(-1);
    else if (e.key === "d" || e.key === "D") setSteer(1);
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "a" || e.key === "A" || e.key === "d" || e.key === "D") {
      setSteer(0);
    }
  });

  // Build clickable list
  for (const def of registry) {
    const item = document.createElement("div");
    item.className = "object-item";
    item.textContent = def.name;
    item.addEventListener("click", () => selectItem(def.name, item));
    listEl.appendChild(item);
  }

  snapToggle.addEventListener("change", () => {
    renderer.snapEnabled = snapToggle.checked;
  });

  exportBtn.addEventListener("click", () => {
    if (!currentObject) return;
    const frameSize = parseInt(sizeInput.value, 10) || 128;
    exportSpriteSheet(renderer.scene, currentObject, frameSize);
  });

  saveAllBtn.addEventListener("click", async () => {
    const origText = saveAllBtn.textContent;
    saveAllBtn.disabled = true;
    saveAllBtn.textContent = "Saving...";
    try {
      await exportAllToFolder(renderer.scene, registry, 256);
      saveAllBtn.textContent = "Saved!";
      setTimeout(() => {
        saveAllBtn.textContent = origText;
        saveAllBtn.disabled = false;
      }, 2000);
    } catch (e) {
      saveAllBtn.textContent = "Error!";
      console.error(e);
      setTimeout(() => {
        saveAllBtn.textContent = origText;
        saveAllBtn.disabled = false;
      }, 2000);
    }
  });

  // Load first object
  const firstItem = listEl.querySelector(".object-item") as HTMLElement | null;
  if (registry.length > 0 && firstItem) {
    selectItem(registry[0]!.name, firstItem);
  }
}
