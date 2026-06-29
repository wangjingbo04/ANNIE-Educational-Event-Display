import { generateEvent, getEventOptions } from "./eventGenerator.js";
import { simulateDetectorResponse } from "./detectorResponse.js";
import { exportCurrentViewToPdf } from "./pdfExport.js";

export function initUI({ statusText, sceneDisplay, eventDisplay2D, setView }) {
  const controlsRoot = document.querySelector("#event-controls");
  const truthRoot = document.querySelector("#truth-readout");
  const options = getEventOptions();
  let currentEvent = null;
  let currentMode = "student";
  let score = { correct: 0, incorrect: 0 };
  let hasGuessedCurrentEvent = false;

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
        <option value="student" selected>Student Mode</option>
        <option value="teacher">Teacher Mode</option>
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
      <button id="export-pdf" type="button">Export PDF</button>
      <button id="reset-view" type="button">Reset View</button>
      <button id="set-default-view" type="button">Set Current View as Default</button>
      <button id="copy-camera-json" type="button">Copy Camera JSON</button>
    </div>
    <label class="toggle-field">
      <input id="show-cone" type="checkbox" checked />
      <span>Show Cherenkov Photons</span>
    </label>
    <label class="toggle-field">
      <input id="generate-fv" type="checkbox" />
      <span>Generate in Fiducial Volume</span>
    </label>
    <label class="toggle-field">
      <input id="show-fv" type="checkbox" />
      <span>Show Fiducial Volume</span>
    </label>
    <p class="control-note">Classification game: decide whether the unknown event is Signal or Background. Dirt backgrounds can leave FMV hits before the water; cosmic muons enter from above without a top veto. MRD detects muon tracks, not Cherenkov light.</p>
    <div class="classification-panel">
      <h3>Student Challenge</h3>
      <div class="button-row">
        <button id="guess-signal" type="button" disabled>Guess Signal</button>
        <button id="guess-background" type="button" disabled>Guess Background</button>
      </div>
      <dl>
        <dt>Correct</dt><dd id="score-correct">0</dd>
        <dt>Incorrect</dt><dd id="score-incorrect">0</dd>
      </dl>
    </div>
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
  const exportPdfButton = controlsRoot.querySelector("#export-pdf");
  const resetViewButton = controlsRoot.querySelector("#reset-view");
  const setDefaultViewButton = controlsRoot.querySelector("#set-default-view");
  const copyCameraJsonButton = controlsRoot.querySelector("#copy-camera-json");
  const guessSignalButton = controlsRoot.querySelector("#guess-signal");
  const guessBackgroundButton = controlsRoot.querySelector("#guess-background");
  const scoreCorrect = controlsRoot.querySelector("#score-correct");
  const scoreIncorrect = controlsRoot.querySelector("#score-incorrect");
  const viewSelect = controlsRoot.querySelector("#view-mode");
  const modeSelect = controlsRoot.querySelector("#display-mode");
  const coneToggle = controlsRoot.querySelector("#show-cone");
  const generateFvToggle = controlsRoot.querySelector("#generate-fv");
  const showFvToggle = controlsRoot.querySelector("#show-fv");
  const showPmtHitsButton = controlsRoot.querySelector("#show-pmt-hits");
  const resetPmtHitsButton = controlsRoot.querySelector("#reset-pmt-hits");

  renderNoEvent();

  runButton.addEventListener("click", () => {
    currentEvent = generateEvent({
      neutrinoEnergy: Number(energySelect.value),
      eventType: eventTypeSelect.value,
      noiseLevel: noiseSelect.value,
      generateInFiducialVolume: generateFvToggle.checked,
    });
    currentEvent.response = simulateDetectorResponse(currentEvent);
    currentMode = modeSelect.value;
    hasGuessedCurrentEvent = false;
    truthRoot.hidden = true;
    truthRoot.innerHTML = "";
    revealButton.disabled = false;
    guessSignalButton.disabled = false;
    guessBackgroundButton.disabled = false;
    applyDisplayMode();
    renderObservables(currentEvent, currentMode);
    statusText.textContent = currentMode === "teacher"
      ? `Event generated: ${currentEvent.truth.eventType}`
      : "Unknown event generated: classify as signal or background";
  });

  resetButton.addEventListener("click", () => {
    currentEvent = null;
    hasGuessedCurrentEvent = false;
    sceneDisplay.clearEvent();
    eventDisplay2D.clear();
    revealButton.disabled = true;
    guessSignalButton.disabled = true;
    guessBackgroundButton.disabled = true;
    showPmtHitsButton.disabled = true;
    resetPmtHitsButton.disabled = true;
    coneToggle.disabled = currentMode !== "teacher";
    truthRoot.hidden = true;
    truthRoot.innerHTML = "";
    renderNoEvent();
    sceneDisplay.resetView();
    statusText.textContent = "Event reset and view restored";
  });

  revealButton.addEventListener("click", () => {
    if (!currentEvent) {
      return;
    }
    renderTruth(currentEvent);
    truthRoot.hidden = false;
    eventDisplay2D.showEvent(currentEvent, { showTruth: true });
    statusText.textContent = `Truth revealed: ${currentEvent.truth.eventType}`;
  });

  guessSignalButton.addEventListener("click", () => scoreGuess("signal"));
  guessBackgroundButton.addEventListener("click", () => scoreGuess("background"));

  showFvToggle.addEventListener("change", () => {
    sceneDisplay.setFiducialVolumeVisible(showFvToggle.checked);
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
    renderObservables(currentEvent, currentMode);
    statusText.textContent = currentMode === "teacher"
      ? "Teacher Mode: truth track, event type, and photons shown"
      : "Student Mode: event type and true vertex hidden";
  });

  viewSelect.addEventListener("change", () => {
    setView(viewSelect.value);
    if (currentEvent) {
      eventDisplay2D.showEvent(currentEvent, { showTruth: currentMode === "teacher" });
    }
    statusText.textContent = viewSelect.value === "event-display"
      ? "Event Display View selected"
      : "3D View selected";
  });

  resetViewButton.addEventListener("click", () => {
    sceneDisplay.resetView();
    statusText.textContent = "3D view reset";
  });

  setDefaultViewButton.addEventListener("click", () => {
    sceneDisplay.setCurrentViewAsDefault();
    statusText.textContent = "Current 3D view saved as default";
  });

  copyCameraJsonButton.addEventListener("click", async () => {
    const json = sceneDisplay.getCurrentCameraJson();
    try {
      await navigator.clipboard.writeText(json);
      statusText.textContent = "Camera JSON copied to clipboard";
    } catch (error) {
      console.log("Camera JSON:\n" + json);
      statusText.textContent = "Clipboard blocked; camera JSON printed to console";
    }
  });

  exportPdfButton.addEventListener("click", () => {
    const exported = exportCurrentViewToPdf({
      view: viewSelect.value,
      sceneDisplay,
      eventDisplay2D,
      event: currentEvent,
    });
    statusText.textContent = exported
      ? "PDF export opened in print dialog"
      : "PDF export was blocked by the browser";
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
      eventDisplay2D.showEvent(currentEvent, { showTruth: false });
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
    eventDisplay2D.showEvent(currentEvent, { showTruth: true });
    coneToggle.disabled = false;
    showPmtHitsButton.disabled = false;
    resetPmtHitsButton.disabled = false;
  }

  function scoreGuess(guess) {
    if (!currentEvent || hasGuessedCurrentEvent) {
      return;
    }
    hasGuessedCurrentEvent = true;
    const correct = guess === currentEvent.challenge.classification;
    if (correct) {
      score.correct += 1;
    } else {
      score.incorrect += 1;
    }
    scoreCorrect.textContent = String(score.correct);
    scoreIncorrect.textContent = String(score.incorrect);
    guessSignalButton.disabled = true;
    guessBackgroundButton.disabled = true;
    statusText.textContent = correct ? "Correct classification" : "Incorrect classification";
  }
}

function renderNoEvent() {
  document.querySelector("#student-observables").innerHTML = `
    <h3>Student Observables</h3>
    <p class="muted">No event loaded</p>
  `;
}

function renderObservables(event, mode = "student") {
  const response = event.response;
  const isStudentMode = mode === "student";
  document.querySelector("#student-observables").innerHTML = `
    <h3>Event Summary</h3>
    <dl>
      <dt>Event type</dt>
      <dd>${isStudentMode ? "Unknown Event" : event.truth.eventType}</dd>
      <dt>Signal/background</dt>
      <dd>${isStudentMode ? "Hidden" : capitalize(event.challenge.classification)}</dd>
      <dt>FMV hits</dt>
      <dd>${event.observables.fmvHitCount}</dd>
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
  const hasNeutrinoEnergy = typeof truth.neutrinoEnergyGeV === "number";
  document.querySelector("#truth-readout").innerHTML = `
    <h3>Truth</h3>
    <dl>
      <dt>Event type</dt>
      <dd>${truth.eventType}</dd>
      <dt>Classification</dt>
      <dd>${capitalize(event.challenge.classification)}</dd>
      <dt>True neutrino energy</dt>
      <dd>${hasNeutrinoEnergy ? `${truth.neutrinoEnergyGeV.toFixed(1)} GeV` : "None"}</dd>
      <dt>True interaction vertex</dt>
      <dd>${truth.vertexMeters ? "Inside water" : truth.hiddenDirtVertexMeters ? "Upstream dirt, hidden in 3D" : "None"}</dd>
      <dt>True muon energy</dt>
      <dd>${truth.muonEnergyGeV === null ? "Not a neutrino target" : `${truth.muonEnergyGeV.toFixed(3)} GeV`}</dd>
      <dt>True muon angle</dt>
      <dd>${truth.muonAngleDegrees === null ? "Cosmic track" : `${truth.muonAngleDegrees.toFixed(1)} deg`}</dd>
      <dt>True neutron multiplicity</dt>
      <dd>${truth.neutronMultiplicity}</dd>
      <dt>FMV hit count</dt>
      <dd>${truth.fmvHitCount}</dd>
      <dt>Fiducial Volume</dt>
      <dd>${truth.insideFiducialVolume ? "Inside" : "Outside"}</dd>
      <dt>True water track length</dt>
      <dd>${truth.muonTrackLengthWaterMeters.toFixed(2)} m</dd>
      <dt>True MRD track length</dt>
      <dd>${truth.projectedMrdTrackLengthMeters.toFixed(2)} m</dd>
      <dt>MRD stop status</dt>
      <dd>${truth.mrdStopped ? "Stopped in MRD" : truth.projectedMrdTrackLengthMeters > 0 ? "Punch-through" : "Did not reach MRD"}</dd>
    </dl>
  `;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}


