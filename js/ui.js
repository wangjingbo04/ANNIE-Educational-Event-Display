import { generateEvent, getEventOptions } from "./eventGenerator.js";

export function initUI({ statusText, sceneDisplay }) {
  const controlsRoot = document.querySelector("#event-controls");
  const observablesRoot = document.querySelector("#student-observables");
  const truthRoot = document.querySelector("#truth-readout");
  const options = getEventOptions();
  let currentEvent = null;

  controlsRoot.innerHTML = `
    <label class="field">
      <span>True neutrino energy</span>
      <select id="neutrino-energy">
        ${options.energies.map((energy) => `<option value="${energy}">${energy.toFixed(1)} GeV</option>`).join("")}
      </select>
    </label>
    <label class="field">
      <span>Event type</span>
      <select id="event-type">
        ${options.eventTypes.map((type) => `<option value="${type}">${type}</option>`).join("")}
      </select>
    </label>
    <label class="field">
      <span>Noise level</span>
      <select id="noise-level">
        ${options.noiseLevels.map((level) => `<option value="${level}">${capitalize(level)}</option>`).join("")}
      </select>
    </label>
    <div class="button-row">
      <button id="run-event" type="button">Run Event</button>
      <button id="reset-event" type="button">Reset Event</button>
      <button id="reveal-truth" type="button" disabled>Reveal Truth</button>
    </div>
  `;

  const energySelect = controlsRoot.querySelector("#neutrino-energy");
  const eventTypeSelect = controlsRoot.querySelector("#event-type");
  const noiseSelect = controlsRoot.querySelector("#noise-level");
  const runButton = controlsRoot.querySelector("#run-event");
  const resetButton = controlsRoot.querySelector("#reset-event");
  const revealButton = controlsRoot.querySelector("#reveal-truth");

  renderNoEvent();

  runButton.addEventListener("click", () => {
    currentEvent = generateEvent({
      neutrinoEnergy: Number(energySelect.value),
      eventType: eventTypeSelect.value,
      noiseLevel: noiseSelect.value,
    });
    sceneDisplay.showEvent(currentEvent);
    renderObservables(currentEvent);
    truthRoot.hidden = true;
    truthRoot.innerHTML = "";
    revealButton.disabled = false;
    statusText.textContent = "Event generated: truth hidden";
  });

  resetButton.addEventListener("click", () => {
    currentEvent = null;
    sceneDisplay.clearEvent();
    revealButton.disabled = true;
    truthRoot.hidden = true;
    truthRoot.innerHTML = "";
    renderNoEvent();
    statusText.textContent = "Event reset";
  });

  revealButton.addEventListener("click", () => {
    if (!currentEvent) {
      return;
    }
    renderTruth(currentEvent);
    truthRoot.hidden = false;
    statusText.textContent = "Truth revealed";
  });
}

function renderNoEvent() {
  document.querySelector("#student-observables").innerHTML = `
    <h3>Student Observables</h3>
    <p class="muted">No event loaded</p>
  `;
}

function renderObservables(event) {
  document.querySelector("#student-observables").innerHTML = `
    <h3>Student Observables</h3>
    <dl>
      <dt>Event type</dt>
      <dd>Hidden</dd>
      <dt>Visible topology</dt>
      <dd>${event.observables.visibleTopology}</dd>
      <dt>Visible MRD layers crossed</dt>
      <dd>${event.observables.visibleMrdLayersCrossed}</dd>
      <dt>Rough water path length</dt>
      <dd>${event.observables.roughWaterPathLengthMeters.toFixed(1)} m</dd>
      <dt>Noise level</dt>
      <dd>${capitalize(event.observables.noiseLevel)}</dd>
    </dl>
  `;
}

function renderTruth(event) {
  const truth = event.truth;
  const isCosmic = event.category === "cosmic";
  document.querySelector("#truth-readout").innerHTML = `
    <h3>Truth</h3>
    <dl>
      <dt>Event type</dt>
      <dd>${truth.eventType}</dd>
      <dt>True neutrino energy</dt>
      <dd>${isCosmic ? "None" : `${truth.neutrinoEnergyGeV.toFixed(1)} GeV`}</dd>
      <dt>True muon energy</dt>
      <dd>${isCosmic ? "Not a neutrino target" : `${truth.muonEnergyGeV.toFixed(3)} GeV`}</dd>
      <dt>True muon angle</dt>
      <dd>${isCosmic ? "None" : `${truth.muonAngleDegrees.toFixed(1)} deg`}</dd>
      <dt>True neutron multiplicity</dt>
      <dd>${truth.neutronMultiplicity}</dd>
      <dt>True water track length</dt>
      <dd>${truth.muonTrackLengthWaterMeters.toFixed(2)} m</dd>
      <dt>True MRD track length</dt>
      <dd>${truth.projectedMrdTrackLengthMeters.toFixed(2)} m</dd>
    </dl>
  `;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
