import { generateEvent, getEventOptions } from "./eventGenerator.js";
import { simulateDetectorResponse } from "./detectorResponse.js";

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
    <label class="toggle-field">
      <input id="show-cone" type="checkbox" checked />
      <span>Show Cherenkov Cone</span>
    </label>
    <div class="button-row">
      <button id="show-pmt-hits" type="button" disabled>Show PMT Hits</button>
      <button id="reset-pmt-hits" type="button" disabled>Reset PMT Hits</button>
    </div>
  `;

  const energySelect = controlsRoot.querySelector("#neutrino-energy");
  const eventTypeSelect = controlsRoot.querySelector("#event-type");
  const noiseSelect = controlsRoot.querySelector("#noise-level");
  const runButton = controlsRoot.querySelector("#run-event");
  const resetButton = controlsRoot.querySelector("#reset-event");
  const revealButton = controlsRoot.querySelector("#reveal-truth");
  const coneToggle = controlsRoot.querySelector("#show-cone");
  const showPmtHitsButton = controlsRoot.querySelector("#show-pmt-hits");
  const resetPmtHitsButton = controlsRoot.querySelector("#reset-pmt-hits");

  renderNoEvent();

  runButton.addEventListener("click", () => {
    currentEvent = generateEvent({
      neutrinoEnergy: Number(energySelect.value),
      eventType: eventTypeSelect.value,
      noiseLevel: noiseSelect.value,
    });
    currentEvent.response = simulateDetectorResponse(currentEvent);
    sceneDisplay.showEvent(currentEvent, { showCone: coneToggle.checked });
    renderObservables(currentEvent);
    truthRoot.hidden = true;
    truthRoot.innerHTML = "";
    revealButton.disabled = false;
    showPmtHitsButton.disabled = false;
    resetPmtHitsButton.disabled = false;
    statusText.textContent = "Event generated: truth hidden";
  });

  resetButton.addEventListener("click", () => {
    currentEvent = null;
    sceneDisplay.clearEvent();
    revealButton.disabled = true;
    showPmtHitsButton.disabled = true;
    resetPmtHitsButton.disabled = true;
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

  coneToggle.addEventListener("change", () => {
    if (!currentEvent) {
      return;
    }
    sceneDisplay.setCherenkovConeVisible(currentEvent, coneToggle.checked);
    statusText.textContent = coneToggle.checked ? "Cherenkov cone shown" : "Cherenkov cone hidden";
  });

  showPmtHitsButton.addEventListener("click", () => {
    if (!currentEvent?.response) {
      return;
    }
    sceneDisplay.showDetectorHits(currentEvent.response);
    statusText.textContent = "PMT and LAPPD hits shown";
  });

  resetPmtHitsButton.addEventListener("click", () => {
    sceneDisplay.resetDetectorHits();
    statusText.textContent = "PMT and LAPPD hit display reset";
  });
}

function renderNoEvent() {
  document.querySelector("#student-observables").innerHTML = `
    <h3>Student Observables</h3>
    <p class="muted">No event loaded</p>
  `;
}

function renderObservables(event) {
  const response = event.response;
  document.querySelector("#student-observables").innerHTML = `
    <h3>Event Summary</h3>
    <dl>
      <dt>Event type</dt>
      <dd>Hidden</dd>
      <dt>PMT hits</dt>
      <dd>${response.totals.pmtHits}</dd>
      <dt>Total PMT charge</dt>
      <dd>${response.totals.pmtCharge.toFixed(1)}</dd>
      <dt>LAPPD hits</dt>
      <dd>${response.totals.lappdHits}</dd>
      <dt>Muon angle</dt>
      <dd>${event.truth.muonAngleDegrees === null ? "Not shown" : `${event.truth.muonAngleDegrees.toFixed(1)} deg`}</dd>
      <dt>Muon track length</dt>
      <dd>${event.truth.muonTrackLengthWaterMeters.toFixed(2)} m</dd>
      <dt>Water path length</dt>
      <dd>${event.observables.roughWaterPathLengthMeters.toFixed(1)} m</dd>
      <dt>Visible topology</dt>
      <dd>${event.observables.visibleTopology}</dd>
      <dt>Visible MRD layers crossed</dt>
      <dd>${event.observables.visibleMrdLayersCrossed}</dd>
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
