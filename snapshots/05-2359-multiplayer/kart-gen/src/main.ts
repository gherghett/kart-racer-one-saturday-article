import { Renderer } from "./renderer";
import { initUI } from "./ui";

const container = document.getElementById("canvas-container")!;
const renderer = new Renderer(container);
initUI(renderer);
