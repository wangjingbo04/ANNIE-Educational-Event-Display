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
  let currentTimelineStep = 1;

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
        <option value="random">Random energy</option>
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
    <label class="toggle-field">
      <input id="show-neutrons" type="checkbox" checked />
      <span>Show Delayed Neutrons</span>
    </label>
    <div class="classification-panel">
      <h3>Delayed Neutron Timeline</h3>
      <div class="button-row">
        <button id="next-neutron-step" type="button" disabled>Next Step</button>
        <button id="reset-neutron-timeline" type="button" disabled>Reset Timeline</button>
      </div>
      <dl>
        <dt>Step</dt><dd id="neutron-step-readout">Step 1 / 6</dd>
        <dt>Current detector time</dt><dd id="neutron-time-readout">0 ns</dd>
      </dl>
    </div>
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
  const showNeutronsToggle = controlsRoot.querySelector("#show-neutrons");
  const showPmtHitsButton = controlsRoot.querySelector("#show-pmt-hits");
  const resetPmtHitsButton = controlsRoot.querySelector("#reset-pmt-hits");
  const nextNeutronStepButton = controlsRoot.querySelector("#next-neutron-step");
  const resetNeutronTimelineButton = controlsRoot.querySelector("#reset-neutron-timeline");
  const neutronStepReadout = controlsRoot.querySelector("#neutron-step-readout");
  const neutronTimeReadout = controlsRoot.querySelector("#neutron-time-readout");

  renderNoEvent();

  runButton.addEventListener("click", () => {
    currentEvent = generateEvent({
      neutrinoEnergy: energySelect.value === "random" ? "random" : Number(energySelect.value),
      eventType: eventTypeSelect.value,
      noiseLevel: noiseSelect.value,
      generateInFiducialVolume: generateFvToggle.checked,
    });
    currentEvent.response = simulateDetectorResponse(currentEvent);
    currentTimelineStep = 1;
    currentMode = modeSelect.value;
    hasGuessedCurrentEvent = false;
    truthRoot.hidden = true;
    truthRoot.innerHTML = "";
    revealButton.disabled = false;
    nextNeutronStepButton.disabled = currentEvent.truth.neutrons.length === 0;
    resetNeutronTimelineButton.disabled = currentEvent.truth.neutrons.length === 0;
    guessSignalButton.disabled = false;
    guessBackgroundButton.disabled = false;
    if (viewSelect.value === "event-display") {
      eventDisplay2D.showEvent(currentEvent, { showTruth: currentMode === "teacher", timelineStep: currentTimelineStep });
      coneToggle.disabled = currentMode !== "teacher";
      showNeutronsToggle.disabled = currentMode !== "teacher";
      showPmtHitsButton.disabled = currentMode === "student";
      resetPmtHitsButton.disabled = false;
    } else {
      applyDisplayMode();
    }
    updateTimelineReadout(currentEvent);
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
    nextNeutronStepButton.disabled = true;
    resetNeutronTimelineButton.disabled = true;
    currentTimelineStep = 1;
    updateTimelineReadout(null);
    coneToggle.disabled = currentMode !== "teacher";
    showNeutronsToggle.disabled = currentMode !== "teacher";
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
    eventDisplay2D.showEvent(currentEvent, { showTruth: true, timelineStep: currentTimelineStep });
    statusText.textContent = `Truth revealed: ${currentEvent.truth.eventType}`;
  });

  guessSignalButton.addEventListener("click", () => scoreGuess("signal"));
  guessBackgroundButton.addEventListener("click", () => scoreGuess("background"));

  showFvToggle.addEventListener("change", () => {
    sceneDisplay.setFiducialVolumeVisible(showFvToggle.checked);
  });

  showNeutronsToggle.addEventListener("change", () => {
    if (!currentEvent || currentMode !== "teacher") {
      return;
    }
    sceneDisplay.setNeutronTimelineStep(currentEvent, currentTimelineStep);
    statusText.textContent = showNeutronsToggle.checked ? "Delayed neutron captures shown" : "Delayed neutron captures hidden";
  });


  nextNeutronStepButton.addEventListener("click", () => {
    if (!currentEvent) {
      return;
    }
    currentTimelineStep = Math.min(6, currentTimelineStep + 1);
    updateTimelineDisplay();
  });

  resetNeutronTimelineButton.addEventListener("click", () => {
    if (!currentEvent) {
      return;
    }
    currentTimelineStep = 1;
    updateTimelineDisplay();
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
      showNeutronsToggle.disabled = currentMode !== "teacher";
      statusText.textContent = currentMode === "teacher" ? "Teacher Mode selected" : "Student Mode selected";
      return;
    }

    if (viewSelect.value === "event-display") {
      eventDisplay2D.showEvent(currentEvent, { showTruth: currentMode === "teacher", timelineStep: currentTimelineStep });
      coneToggle.disabled = currentMode !== "teacher";
      showNeutronsToggle.disabled = currentMode !== "teacher";
      showPmtHitsButton.disabled = currentMode === "student";
      resetPmtHitsButton.disabled = false;
    } else {
      applyDisplayMode();
    }
    updateTimelineReadout(currentEvent);
    renderObservables(currentEvent, currentMode);
    statusText.textContent = currentMode === "teacher"
      ? "Teacher Mode: truth track, event type, and photons shown"
      : "Student Mode: event type and true vertex hidden";
  });

  viewSelect.addEventListener("change", () => {
    setView(viewSelect.value);
    if (currentEvent) {
      if (viewSelect.value === "event-display") {
        eventDisplay2D.showEvent(currentEvent, { showTruth: currentMode === "teacher", timelineStep: currentTimelineStep });
      } else {
        applyDisplayMode();
      }
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


  function updateTimelineDisplay() {
    updateTimelineReadout(currentEvent);
    if (!currentEvent) {
      return;
    }
    if (viewSelect.value === "event-display") {
      eventDisplay2D.showEvent(currentEvent, { showTruth: currentMode === "teacher", timelineStep: currentTimelineStep });
    } else {
      sceneDisplay.setNeutronTimelineStep(currentEvent, currentTimelineStep);
    }
  }

  function updateTimelineReadout(event) {
    const neutrons = event?.truth?.neutrons ?? [];
    if (event && neutrons.length === 0) {
      neutronStepReadout.textContent = "No delayed neutron captures in this event.";
      neutronTimeReadout.textContent = "None";
      return;
    }
    neutronStepReadout.textContent = `Step ${currentTimelineStep} / 6`;
    neutronTimeReadout.textContent = timelineTimeLabel(currentTimelineStep, neutrons);
  }
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
      sceneDisplay.setNeutronTimelineStep(currentEvent, currentTimelineStep);
      eventDisplay2D.showEvent(currentEvent, { showTruth: false, timelineStep: currentTimelineStep });
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
    sceneDisplay.setNeutronTimelineStep(currentEvent, currentTimelineStep);
    eventDisplay2D.showEvent(currentEvent, { showTruth: true, timelineStep: currentTimelineStep });
    coneToggle.disabled = false;
    showNeutronsToggle.disabled = false;
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
      <dt>Neutron captures</dt>
      <dd>${event.observables.neutronCaptureCount}</dd>
      <dt>Earliest capture time</dt>
      <dd>${formatCaptureTime(event.observables.earliestNeutronCaptureTimeUs)}</dd>
      <dt>Latest capture time</dt>
      <dd>${formatCaptureTime(event.observables.latestNeutronCaptureTimeUs)}</dd>
      <dt>Noise level</dt>
      <dd>${capitalize(event.observables.noiseLevel)}</dd>
    </dl>
    <p class="control-note">Toy model: neutron multiplicity increases with neutrino energy and inelasticity. Zero-neutron events are possible.</p>
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
      <dt>Neutron truth</dt>
      <dd>${formatNeutronTruth(truth.neutrons)}</dd>
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
      <p class="control-note">Neutrons scatter in Gd-loaded water and are captured on Gd, producing a delayed signal.</p>
  `;
}

function timelineTimeLabel(step, neutrons = []) {
  if (step === 1) return "0 ns";
  if (step === 2) return "10 ns";
  if (step === 3) return "100 ns";
  if (step === 4) return "1 us";
  if (step === 5) return "10 us";
  return neutrons.length ? `${neutrons[0].captureTimeUs.toFixed(1)} us` : "Capture";
}
function formatCaptureTime(timeUs) {
  return typeof timeUs === "number" ? `${timeUs.toFixed(1)} us` : "None";
}

function formatNeutronTruth(neutrons = []) {
  if (!neutrons.length) {
    return "None";
  }
  return neutrons
    .map((neutron) => `${neutron.id}: ${neutron.captureTimeUs.toFixed(1)} us on ${neutron.capturedOn}`)
    .join("; ");
}
function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}










