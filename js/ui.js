import { generateEvent, getEventOptions } from "./eventGenerator.js";
import { simulateDetectorResponse } from "./detectorResponse.js";

export function initUI({ statusText, sceneDisplay, eventDisplay2D, setView }) {
  const controlsRoot = document.querySelector("#event-controls");
  const observablesRoot = document.querySelector("#student-observables");
  const truthRoot = document.querySelector("#truth-readout");
  const options = getEventOptions();
  let currentEvent = null;
  let currentMode = "teacher";

  controlsRoot.innerHTML = `
    <label class="field">
      <span>View</span>
      <select id="view-mode">
        <option value="3d">3D View</option>
        <option value="event-display">Event Display View</option>
      </select>
    </label>
    <label class="field">
      <span>Display mode</span>
      <select id="display-mode">
        <option value="teacher">Teacher Mode</option>
        <option value="student">Student Mode</option>
      </select>
    </label>
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
      <span>Show Cherenkov Photons</span>
    </label>
    <p class="control-note">ANNIE MRD: 11 alternating scintillator layers, 6 horizontal and 5 vertical, interleaved with iron absorber plates. It registers muon track hits, not Cherenkov light.</p>
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
  const viewSelect = controlsRoot.querySelector("#view-mode");
  const modeSelect = controlsRoot.querySelector("#display-mode");
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
    currentMode = modeSelect.value;
    truthRoot.hidden = true;
    truthRoot.innerHTML = "";
    revealButton.disabled = false;
    applyDisplayMode();
    eventDisplay2D.showEvent(currentEvent);
    renderObservables(currentEvent, currentMode);
    statusText.textContent = currentMode === "teacher"
      ? "Event generated: truth track and photons shown"
      : "Event generated: student detector response shown";
  });

  resetButton.addEventListener("click", () => {
    currentEvent = null;
    sceneDisplay.clearEvent();
    eventDisplay2D.clear();
    revealButton.disabled = true;
    showPmtHitsButton.disabled = true;
    resetPmtHitsButton.disabled = true;
    coneToggle.disabled = currentMode !== "teacher";
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
    if (!currentEvent || currentMode !== "teacher") {
      return;
    }
    sceneDisplay.setCherenkovConeVisible(currentEvent, coneToggle.checked);
    statusText.textContent = coneToggle.checked ? "Cherenkov photons shown" : "Cherenkov photons hidden";
  });

  modeSelect.addEventListener("change", () => {
    currentMode = modeSelect.value;
    if (!currentEvent) {
      coneToggle.disabled = currentMode !== "teacher";
      statusText.textContent = currentMode === "teacher" ? "Teacher Mode selected" : "Student Mode selected";
      return;
    }

    applyDisplayMode();
    eventDisplay2D.showEvent(currentEvent);
    renderObservables(currentEvent, currentMode);
    statusText.textContent = currentMode === "teacher"
      ? "Teacher Mode: truth track and photons shown"
      : "Student Mode: PMT and MRD hits shown";
  });

  viewSelect.addEventListener("change", () => {
    setView(viewSelect.value);
    if (currentEvent) {
      eventDisplay2D.showEvent(currentEvent);
    }
    statusText.textContent = viewSelect.value === "event-display"
      ? "Event Display View selected"
      : "3D View selected";
  });
  showPmtHitsButton.addEventListener("click", () => {
    if (!currentEvent?.response) {
      return;
    }
    sceneDisplay.showDetectorHits(currentEvent.response);
    statusText.textContent = "PMT hits shown";
  });

  resetPmtHitsButton.addEventListener("click", () => {
    sceneDisplay.resetDetectorHits();
    statusText.textContent = "PMT hit display reset";
  });

  function applyDisplayMode() {
    if (!currentEvent) {
      return;
    }

    if (currentMode === "student") {
      sceneDisplay.showEvent(currentEvent, {
        showCone: false,
        showTruthTracks: false,
        showVertex: false,
      });
      sceneDisplay.showDetectorHits(currentEvent.response);
      coneToggle.disabled = true;
      showPmtHitsButton.disabled = true;
      resetPmtHitsButton.disabled = false;
      return;
    }

    sceneDisplay.showEvent(currentEvent, {
      showCone: coneToggle.checked,
      showTruthTracks: true,
      showVertex: true,
    });
    sceneDisplay.showDetectorHits(currentEvent.response);
    coneToggle.disabled = false;
    showPmtHitsButton.disabled = false;
    resetPmtHitsButton.disabled = false;
  }
}

function renderNoEvent() {
  document.querySelector("#student-observables").innerHTML = `
    <h3>Student Observables</h3>
    <p class="muted">No event loaded</p>
  `;
}

function renderObservables(event, mode = "teacher") {
  const response = event.response;
  const isStudentMode = mode === "student";
  document.querySelector("#student-observables").innerHTML = `
    <h3>Event Summary</h3>
    <dl>
      <dt>Event type</dt>
      <dd>Hidden</dd>
      <dt>PMT hits</dt>
      <dd>${response.totals.pmtHits}</dd>
      <dt>Total PMT charge</dt>
      <dd>${response.totals.pmtCharge.toFixed(1)}</dd>
      <dt>Muon angle</dt>
      <dd>${isStudentMode || event.truth.muonAngleDegrees === null ? "Hidden" : `${event.truth.muonAngleDegrees.toFixed(1)} deg`}</dd>
      <dt>Muon track length</dt>
      <dd>${isStudentMode ? "Hidden" : `${event.truth.muonTrackLengthWaterMeters.toFixed(2)} m`}</dd>
      <dt>Water path length</dt>
      <dd>${event.observables.roughWaterPathLengthMeters.toFixed(1)} m</dd>
      <dt>Visible topology</dt>
      <dd>${event.observables.visibleTopology}</dd>
      <dt>Visible MRD layers crossed</dt>
      <dd>${event.observables.visibleMrdLayersCrossed}</dd>
      <dt>Estimated MRD track length</dt>
      <dd>${event.observables.estimatedMrdTrackLengthMeters.toFixed(2)} m</dd>
      <dt>MRD status</dt>
      <dd>${event.observables.mrdStopStatus}</dd>
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
      <dt>MRD stop status</dt>
      <dd>${truth.mrdStopped ? "Stopped in MRD" : truth.projectedMrdTrackLengthMeters > 0 ? "Exited MRD" : "Did not reach MRD"}</dd>
    </dl>
  `;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
