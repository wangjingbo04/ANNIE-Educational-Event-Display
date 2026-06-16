import { initScene } from "./scene.js";
import { initUI } from "./ui.js";

const container = document.querySelector("#scene-container");
const statusText = document.querySelector("#status-text");

const sceneDisplay = initScene({
  container,
  onReady: () => {
    statusText.textContent = "Detector view initialized";
  },
});

initUI({ statusText, sceneDisplay });
