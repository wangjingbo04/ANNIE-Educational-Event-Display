import * as THREE from "three";
import { calculateRayCylinderIntersection } from "./cherenkov.js";
import { detectorGeometry } from "./scene.js";

const ENERGY_OPTIONS = [0.6, 0.8, 1.0, 1.5, 2.0];
const EVENT_TYPES = ["Water CCQE (signal)", "Dirt interaction", "Cosmic muon", "Random"];
const NOISE_LEVELS = ["low", "medium", "high"];
const REAL_EVENT_TYPES = ["Water CCQE (signal)", "Dirt interaction", "Cosmic muon"];
const CCQE_MUON_ENERGY_FRACTION = [0.65, 0.9];
const MUON_ANGLE_RANGES = {
  0.6: [8, 28],
  0.8: [7, 24],
  1.0: [5, 20],
  1.5: [3, 15],
  2.0: [2, 12],
};

export function getEventOptions() {
  return {
    energies: ENERGY_OPTIONS,
    eventTypes: EVENT_TYPES,
    noiseLevels: NOISE_LEVELS,
  };
}

export function generateEvent({ neutrinoEnergy, eventType, noiseLevel }) {
  const resolvedType = eventType === "Random" ? choose(REAL_EVENT_TYPES) : eventType;

  if (resolvedType === "Dirt interaction") {
    return generateDirtEvent({ neutrinoEnergy, noiseLevel, requestedEventType: eventType });
  }

  if (resolvedType === "Cosmic muon") {
    return generateCosmicEvent({ noiseLevel, requestedEventType: eventType });
  }

  return generateWaterCcqeEvent({ neutrinoEnergy, noiseLevel, requestedEventType: eventType });
}

function generateWaterCcqeEvent({ neutrinoEnergy, noiseLevel, requestedEventType }) {
  const vertex = randomVertexInTank();
  const muonAngleDegrees = randomMuonAngle(neutrinoEnergy);
  const muonEnergy = randomMuonEnergy(neutrinoEnergy);
  const muonDirection = randomMuonDirection(muonAngleDegrees);
  const waterExit = calculateRayCylinderIntersection(vertex, muonDirection, detectorGeometry.tank);
  const waterTrackLength = waterExit.distance;
  const waterExitPoint = waterExit.point;
  const mrd = estimateMrdSegment(waterExitPoint, muonDirection, muonEnergy, waterTrackLength);

  return buildEvent({
    category: "water-ccqe",
    classification: "signal",
    eventType: "Water CCQE",
    requestedEventType,
    neutrinoEnergy,
    noiseLevel,
    vertex,
    muonEnergy,
    muonDirection,
    muonAngleDegrees,
    waterEntryPoint: vertex,
    waterExitPoint,
    waterTrackLength,
    mrd,
    neutronMultiplicity: randomInteger(0, 1),
    visibleTopology: "contained water vertex with single downstream muon",
    fmvHits: [],
    display: {
      incomingNeutrino: {
        start: vectorToArray(new THREE.Vector3(vertex.x, vertex.y, -2.35)),
        end: vectorToArray(vertex),
      },
      vertex: vectorToArray(vertex),
      throughGoingMuon: null,
    },
  });
}

function generateDirtEvent({ neutrinoEnergy, noiseLevel, requestedEventType }) {
  const track = makeDirtTrack();
  const muonEnergy = Math.max(0.55, randomBetween(0.55, 0.95) * neutrinoEnergy + randomBetween(0.08, 0.25));
  const mrd = estimateMrdSegment(track.waterExitPoint, track.direction, muonEnergy, track.waterTrackLength);
  const hiddenVertex = track.start.clone().add(track.direction.clone().multiplyScalar(-randomBetween(0.8, 1.8)));

  return buildEvent({
    category: "dirt",
    classification: "background",
    eventType: "Dirt",
    requestedEventType,
    neutrinoEnergy,
    noiseLevel,
    vertex: null,
    hiddenVertex,
    muonEnergy,
    muonDirection: track.direction,
    muonAngleDegrees: THREE.MathUtils.radToDeg(track.direction.angleTo(new THREE.Vector3(0, 0, 1))),
    waterEntryPoint: track.waterEntryPoint,
    waterExitPoint: track.waterExitPoint,
    waterTrackLength: track.waterTrackLength,
    mrd,
    neutronMultiplicity: 0,
    visibleTopology: "upstream FMV hit with entering muon and downstream MRD track",
    fmvHits: getFrontFmvHits(track.fmvPoint),
    display: {
      incomingNeutrino: null,
      vertex: null,
      throughGoingMuon: {
        start: vectorToArray(track.start),
        end: vectorToArray(mrd.length > 0 ? mrd.end : track.waterExitPoint),
      },
    },
    dirtInteractionVertexMeters: vectorToArray(hiddenVertex),
  });
}

function generateCosmicEvent({ noiseLevel, requestedEventType }) {
  const track = makeCosmicTrack();
  const muonEnergy = randomBetween(0.85, 1.9);
  const mrd = estimateMrdSegment(track.waterExitPoint, track.direction, muonEnergy, track.waterTrackLength);

  return buildEvent({
    category: "cosmic",
    classification: "background",
    eventType: "Cosmic",
    requestedEventType,
    neutrinoEnergy: null,
    noiseLevel,
    vertex: null,
    muonEnergy,
    muonDirection: track.direction,
    muonAngleDegrees: null,
    waterEntryPoint: track.waterEntryPoint,
    waterExitPoint: track.waterExitPoint,
    waterTrackLength: track.waterTrackLength,
    mrd,
    neutronMultiplicity: 0,
    visibleTopology: "downward through-going cosmic muon with no FMV hit",
    fmvHits: [],
    display: {
      incomingNeutrino: null,
      vertex: null,
      throughGoingMuon: {
        start: vectorToArray(track.start),
        end: vectorToArray(mrd.length > 0 ? mrd.end : track.end),
      },
    },
  });
}

function buildEvent({
  category,
  classification,
  eventType,
  requestedEventType,
  neutrinoEnergy,
  noiseLevel,
  vertex,
  hiddenVertex = null,
  muonEnergy,
  muonDirection,
  muonAngleDegrees,
  waterEntryPoint,
  waterExitPoint,
  waterTrackLength,
  mrd,
  neutronMultiplicity,
  visibleTopology,
  fmvHits,
  display,
  dirtInteractionVertexMeters = null,
}) {
  const muonEnd = mrd.length > 0 ? mrd.end : waterExitPoint;

  return {
    id: createEventId(),
    category,
    challenge: {
      classification,
      truthLabel: eventType,
    },
    selectedControls: {
      neutrinoEnergy,
      eventType: requestedEventType,
      resolvedEventType: eventType,
      noiseLevel,
    },
    truth: {
      eventType,
      classification,
      neutrinoEnergyGeV: neutrinoEnergy,
      vertexMeters: vertex ? vectorToArray(vertex) : null,
      hiddenDirtVertexMeters: hiddenVertex ? vectorToArray(hiddenVertex) : dirtInteractionVertexMeters,
      muonEnergyGeV: round(muonEnergy, 3),
      muonDirection: vectorToArray(muonDirection),
      muonAngleDegrees: muonAngleDegrees === null ? null : round(muonAngleDegrees, 1),
      waterEntryPointMeters: vectorToArray(waterEntryPoint),
      waterExitPointMeters: vectorToArray(waterExitPoint),
      muonTrackLengthWaterMeters: round(waterTrackLength, 4),
      projectedMrdTrackLengthMeters: round(mrd.length, 4),
      mrdStopped: mrd.stopped,
      neutronMultiplicity,
      fmvHitCount: fmvHits.length,
    },
    observables: {
      visibleTopology,
      roughWaterPathLengthMeters: round(jitter(waterTrackLength, noiseLevel), 1),
      crossedMrdLayers: mrd.crossedLayers,
      visibleMrdLayersCrossed: mrd.crossedLayers.length,
      estimatedMrdTrackLengthMeters: round(mrd.length, 2),
      mrdStopStatus: mrd.stopped ? "Stopped in MRD" : mrd.length > 0 ? "Punch-through" : "Did not reach MRD",
      fmvHits,
      fmvHitCount: fmvHits.length,
      noiseLevel,
    },
    display: {
      incomingNeutrino: display.incomingNeutrino,
      vertex: display.vertex,
      muonTrack: {
        start: vectorToArray(waterEntryPoint),
        end: vectorToArray(waterExitPoint),
      },
      muonFullTrack: {
        start: display.throughGoingMuon ? display.throughGoingMuon.start : vectorToArray(waterEntryPoint),
        end: vectorToArray(muonEnd),
      },
      throughGoingMuon: display.throughGoingMuon,
      mrdTrack: mrd.length > 0 ? {
        start: vectorToArray(mrd.start),
        end: vectorToArray(mrd.end),
      } : null,
    },
  };
}

function makeDirtTrack() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const fmvZ = detectorGeometry.frontVeto.zMeters;
    const start = new THREE.Vector3(
      randomBetween(-1.0, 1.0),
      randomBetween(detectorGeometry.tank.fiducialYMinMeters, detectorGeometry.tank.fiducialYMaxMeters),
      fmvZ - randomBetween(0.55, 0.9),
    );
    const direction = new THREE.Vector3(randomBetween(-0.14, 0.14), randomBetween(-0.08, 0.08), 1).normalize();
    const fmvDistance = (fmvZ - start.z) / direction.z;
    const fmvPoint = start.clone().add(direction.clone().multiplyScalar(fmvDistance));
    const entry = calculateRayCylinderIntersection(start, direction, detectorGeometry.tank);
    const waterEntryPoint = entry.point;
    const insideStart = waterEntryPoint.clone().add(direction.clone().multiplyScalar(0.001));
    const exit = calculateRayCylinderIntersection(insideStart, direction, detectorGeometry.tank);
    const waterTrackLength = Math.max(exit.distance + 0.001, 0);
    const waterExitPoint = waterEntryPoint.clone().add(direction.clone().multiplyScalar(waterTrackLength));

    if (waterTrackLength > 0.7 && isInsideFrontFmv(fmvPoint)) {
      return { start, direction, fmvPoint, waterEntryPoint, waterExitPoint, waterTrackLength };
    }
  }

  const fallbackDirection = new THREE.Vector3(0, 0, 1).normalize();
  const start = new THREE.Vector3(0, detectorGeometry.tank.centerMeters[1], detectorGeometry.frontVeto.zMeters - 0.8);
  const entry = calculateRayCylinderIntersection(start, fallbackDirection, detectorGeometry.tank);
  const insideStart = entry.point.clone().add(fallbackDirection.clone().multiplyScalar(0.001));
  const exit = calculateRayCylinderIntersection(insideStart, fallbackDirection, detectorGeometry.tank);
  const waterTrackLength = Math.max(exit.distance + 0.001, 0);
  return {
    start,
    direction: fallbackDirection,
    fmvPoint: new THREE.Vector3(0, detectorGeometry.tank.centerMeters[1], detectorGeometry.frontVeto.zMeters),
    waterEntryPoint: entry.point,
    waterExitPoint: entry.point.clone().add(fallbackDirection.clone().multiplyScalar(waterTrackLength)),
    waterTrackLength,
  };
}

function makeCosmicTrack() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const topY = detectorGeometry.tank.centerMeters[1] + detectorGeometry.tank.heightMeters / 2 + 0.55;
    const start = new THREE.Vector3(randomBetween(-1.0, 1.0), topY, randomBetween(-0.7, 0.45));
    const direction = new THREE.Vector3(randomBetween(-0.12, 0.12), -1, randomBetween(0.35, 0.82)).normalize();
    const entry = calculateRayCylinderIntersection(start, direction, detectorGeometry.tank);
    const waterEntryPoint = entry.point;
    const insideStart = waterEntryPoint.clone().add(direction.clone().multiplyScalar(0.001));
    const exit = calculateRayCylinderIntersection(insideStart, direction, detectorGeometry.tank);
    const waterTrackLength = Math.max(exit.distance + 0.001, 0);
    const waterExitPoint = waterEntryPoint.clone().add(direction.clone().multiplyScalar(waterTrackLength));
    const end = waterExitPoint.clone().add(direction.clone().multiplyScalar(0.75));

    if (waterTrackLength > 0.7) {
      return { start, direction, waterEntryPoint, waterExitPoint, waterTrackLength, end };
    }
  }

  const direction = new THREE.Vector3(0, -1, 0.5).normalize();
  const start = new THREE.Vector3(0, detectorGeometry.tank.centerMeters[1] + detectorGeometry.tank.heightMeters / 2 + 0.55, -0.2);
  const entry = calculateRayCylinderIntersection(start, direction, detectorGeometry.tank);
  const insideStart = entry.point.clone().add(direction.clone().multiplyScalar(0.001));
  const exit = calculateRayCylinderIntersection(insideStart, direction, detectorGeometry.tank);
  const waterTrackLength = Math.max(exit.distance + 0.001, 0);
  const waterExitPoint = entry.point.clone().add(direction.clone().multiplyScalar(waterTrackLength));
  return {
    start,
    direction,
    waterEntryPoint: entry.point,
    waterExitPoint,
    waterTrackLength,
    end: waterExitPoint.clone().add(direction.clone().multiplyScalar(0.75)),
  };
}

function randomVertexInTank() {
  const radius = Math.sqrt(Math.random()) * detectorGeometry.tank.fiducialRadiusMeters;
  const angle = randomBetween(0, Math.PI * 2);
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    randomBetween(detectorGeometry.tank.fiducialYMinMeters, detectorGeometry.tank.fiducialYMaxMeters),
    Math.sin(angle) * radius,
  );
}

function randomMuonEnergy(neutrinoEnergy) {
  const [min, max] = CCQE_MUON_ENERGY_FRACTION;
  return neutrinoEnergy * randomBetween(min, max);
}

function randomMuonAngle(neutrinoEnergy) {
  const [min, max] = MUON_ANGLE_RANGES[neutrinoEnergy];
  return randomBetween(min, max);
}

function randomMuonDirection(angleDegrees) {
  const theta = THREE.MathUtils.degToRad(angleDegrees);
  const phi = randomBetween(0, Math.PI * 2);
  return new THREE.Vector3(
    Math.sin(theta) * Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(theta),
  ).normalize();
}

function estimateMrdSegment(waterExitPoint, direction, muonEnergyGeV, waterTrackLength) {
  if (direction.z <= 0.05) {
    return { length: 0, crossedLayers: [], start: null, end: null, stopped: false };
  }

  const mrdStartZ = detectorGeometry.mrd.startZMeters;
  const distanceToMrd = (mrdStartZ - waterExitPoint.z) / direction.z;
  if (distanceToMrd < 0) {
    return { length: 0, crossedLayers: [], start: null, end: null, stopped: false };
  }

  const start = waterExitPoint.clone().add(direction.clone().multiplyScalar(distanceToMrd));
  if (!isInsideMrdFace(start)) {
    return { length: 0, crossedLayers: [], start: null, end: null, stopped: false };
  }

  const energyEnteringMrd = estimateMuonEnergyEnteringMrd(muonEnergyGeV, waterTrackLength, distanceToMrd);
  if (energyEnteringMrd <= 0.05) {
    return { length: 0, crossedLayers: [], start: null, end: null, stopped: false };
  }

  const maxMrdPath = detectorGeometry.mrd.totalDepthMeters / Math.max(direction.z, 0.05);
  const mrdRange = estimateMrdRange(energyEnteringMrd);
  const length = Math.min(mrdRange, maxMrdPath);
  const end = start.clone().add(direction.clone().multiplyScalar(length));
  const crossedLayers = getCrossedMrdLayers(start, end, direction);
  const stopped = mrdRange < maxMrdPath;

  return {
    length,
    crossedLayers,
    start,
    end,
    stopped,
    energyEnteringMrdGeV: energyEnteringMrd,
    mrdRangeMeters: mrdRange,
  };
}

function estimateMuonEnergyEnteringMrd(muonEnergyGeV, waterTrackLength, distanceToMrd) {
  const waterLoss = 0.055 * waterTrackLength;
  const airGapLoss = 0.018 * Math.max(distanceToMrd, 0);
  return Math.max(0.04, muonEnergyGeV - waterLoss - airGapLoss);
}

function estimateMrdRange(energyEnteringMrdGeV) {
  const nominalRange = 0.8 + 3.0 * (energyEnteringMrdGeV - 0.3);
  const fluctuatedRange = nominalRange * randomBetween(0.8, 1.2);
  return Math.max(0.3, fluctuatedRange);
}

function getCrossedMrdLayers(start, end, direction) {
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);
  const layers = [];

  for (let i = 0; i < detectorGeometry.mrd.layerCount; i += 1) {
    const layerZ = detectorGeometry.mrd.startZMeters
      + i * detectorGeometry.mrd.layerSpacingMeters
      + detectorGeometry.mrd.absorberThicknessMeters / 2
      + detectorGeometry.mrd.scintillatorThicknessMeters / 2
      + 0.018;
    if (layerZ < minZ || layerZ > maxZ) {
      continue;
    }

    const distanceToLayer = (layerZ - start.z) / direction.z;
    const hitPoint = start.clone().add(direction.clone().multiplyScalar(distanceToLayer));
    if (!isInsideMrdFace(hitPoint)) {
      continue;
    }

    const orientation = i % 2 === 0 ? "horizontal" : "vertical";
    const paddleIndex = orientation === "horizontal"
      ? coordinateToPaddleIndex(hitPoint.y, detectorGeometry.tank.centerMeters[1], detectorGeometry.mrd.heightMeters, detectorGeometry.mrd.paddleCountPerLayer)
      : coordinateToPaddleIndex(hitPoint.x, 0, detectorGeometry.mrd.widthXMeters, detectorGeometry.mrd.paddleCountPerLayer);

    layers.push({
      layerIndex: i,
      paddleIndex,
      orientation,
      hitPointMeters: vectorToArray(hitPoint),
      hitTimeNs: round(distanceToLayer / 0.299792458, 2),
    });
  }

  return layers;
}

function getFrontFmvHits(point) {
  const horizontalPaddle = coordinateToPaddleIndex(
    point.y,
    detectorGeometry.tank.centerMeters[1],
    detectorGeometry.frontVeto.heightMeters,
    detectorGeometry.frontVeto.paddleCountPerLayer,
  );
  const verticalPaddle = coordinateToPaddleIndex(
    point.x,
    0,
    detectorGeometry.frontVeto.widthXMeters,
    detectorGeometry.frontVeto.paddleCountPerLayer,
  );

  return [
    { plane: "front", layerIndex: 0, paddleIndex: horizontalPaddle, orientation: "horizontal", hitPointMeters: vectorToArray(point) },
    { plane: "front", layerIndex: 1, paddleIndex: verticalPaddle, orientation: "vertical", hitPointMeters: vectorToArray(point) },
  ];
}

function isInsideFrontFmv(point) {
  return Math.abs(point.x) <= detectorGeometry.frontVeto.widthXMeters / 2
    && Math.abs(point.y - detectorGeometry.tank.centerMeters[1]) <= detectorGeometry.frontVeto.heightMeters / 2;
}
function isInsideMrdFace(point) {
  return Math.abs(point.x) <= detectorGeometry.mrd.widthXMeters / 2
    && Math.abs(point.y - detectorGeometry.tank.centerMeters[1]) <= detectorGeometry.mrd.heightMeters / 2;
}

function coordinateToPaddleIndex(value, center, span, count) {
  const normalized = (value - (center - span / 2)) / span;
  const index = Math.floor(normalized * count);
  return Math.min(count - 1, Math.max(0, index));
}

function jitter(value, noiseLevel) {
  const scale = { low: 0.05, medium: 0.12, high: 0.22 }[noiseLevel];
  return Math.max(0, value * randomBetween(1 - scale, 1 + scale));
}

function choose(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function vectorToArray(vector) {
  return [round(vector.x, 5), round(vector.y, 5), round(vector.z, 5)];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomInteger(min, max) {
  return Math.floor(randomBetween(min, max + 1));
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function createEventId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
