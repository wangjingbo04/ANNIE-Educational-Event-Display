import { initEventDisplay2D } from "./eventDisplay2D.js";
import { detectorGeometry, initScene } from "./scene.js";
import { initUI } from "./ui.js";

const container = document.querySelector("#scene-container");
const eventDisplayContainer = document.querySelector("#event-display-container");
const statusText = document.querySelector("#status-text");

const sceneDisplay = initScene({
  container,
  onReady: () => {
    statusText.textContent = "Detector view initialized";
  },
});

const eventDisplay2D = initEventDisplay2D({
  container: eventDisplayContainer,
  detectorGeometry,
});

function setView(view) {
  const showEventDisplay = view === "event-display";
  container.classList.toggle("view-hidden", showEventDisplay);
  eventDisplayContainer.classList.toggle("view-hidden", !showEventDisplay);
}

initUI({ statusText, sceneDisplay, eventDisplay2D, setView });
