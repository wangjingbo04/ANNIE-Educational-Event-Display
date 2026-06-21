import * as THREE from "three";
import { calculateRayCylinderIntersection } from "./cherenkov.js";
import { detectorGeometry } from "./scene.js";

const ENERGY_OPTIONS = [0.6, 0.8, 1.0, 1.5, 2.0];
const EVENT_TYPES = ["CCQE-like", "Resonance", "DIS-like", "Cosmic background"];
const NOISE_LEVELS = ["low", "medium", "high"];
const MUON_ENERGY_FRACTIONS = {
  "CCQE-like": [0.65, 0.9],
  Resonance: [0.45, 0.75],
  "DIS-like": [0.3, 0.65],
};
const MUON_ANGLE_RANGES = {
  0.6: [8, 28],
  0.8: [7, 24],
  1.0: [5, 20],
  1.5: [3, 15],
  2.0: [2, 12],
};
const NEUTRON_RANGES = {
  "CCQE-like": [0, 1],
  Resonance: [1, 2],
  "DIS-like": [2, 4],
};

export function getEventOptions() {
  return {
    energies: ENERGY_OPTIONS,
    eventTypes: EVENT_TYPES,
    noiseLevels: NOISE_LEVELS,
  };
}

export function generateEvent({ neutrinoEnergy, eventType, noiseLevel }) {
  if (eventType === "Cosmic background") {
    return generateCosmicEvent({ noiseLevel });
  }

  const vertex = randomVertexInTank();
  const muonAngleDegrees = randomMuonAngle(neutrinoEnergy);
  const muonEnergy = randomMuonEnergy(neutrinoEnergy, eventType);
  const muonDirection = randomMuonDirection(muonAngleDegrees);
  const waterExit = calculateRayCylinderIntersection(vertex, muonDirection, detectorGeometry.tank);
  const waterTrackLength = waterExit.distance;
  const waterExitPoint = waterExit.point;
  const totalMuonTrackLength = estimateMuonTrackLength(muonEnergy);
  const mrd = estimateMrdSegment(waterExitPoint, muonDirection, totalMuonTrackLength - waterTrackLength);
  const neutronMultiplicity = randomInteger(...NEUTRON_RANGES[eventType]);

  return {
    id: createEventId(),
    category: "neutrino",
    selectedControls: {
      neutrinoEnergy,
      eventType,
      noiseLevel,
    },
    truth: {
      eventType,
      neutrinoEnergyGeV: neutrinoEnergy,
      vertexMeters: vectorToArray(vertex),
      muonEnergyGeV: round(muonEnergy, 3),
      muonDirection: vectorToArray(muonDirection),
      muonAngleDegrees: round(muonAngleDegrees, 1),
      waterExitPointMeters: vectorToArray(waterExitPoint),
      muonTrackLengthWaterMeters: round(waterTrackLength, 4),
      projectedMrdTrackLengthMeters: round(mrd.length, 4),
      mrdStopped: mrd.stopped,
      neutronMultiplicity,
    },
    observables: {
      visibleTopology: "single downstream track",
      roughWaterPathLengthMeters: round(jitter(waterTrackLength, noiseLevel), 1),
      crossedMrdLayers: mrd.crossedLayers,
      visibleMrdLayersCrossed: mrd.crossedLayers.length,
      estimatedMrdTrackLengthMeters: round(mrd.length, 2),
      mrdStopStatus: mrd.stopped ? "Stopped in MRD" : mrd.length > 0 ? "Exited MRD" : "Did not reach MRD",
      noiseLevel,
    },
    display: {
      incomingNeutrino: {
        start: vectorToArray(new THREE.Vector3(vertex.x, vertex.y, -2.35)),
        end: vectorToArray(vertex),
      },
      vertex: vectorToArray(vertex),
      muonTrack: {
        start: vectorToArray(vertex),
        end: vectorToArray(waterExitPoint),
      },
      muonFullTrack: {
        start: vectorToArray(vertex),
        end: vectorToArray(mrd.length > 0 ? mrd.end : waterExitPoint),
      },
      mrdTrack: mrd.length > 0 ? {
        start: vectorToArray(mrd.start),
        end: vectorToArray(mrd.end),
      } : null,
    },
  };
}

function generateCosmicEvent({ noiseLevel }) {
  const start = new THREE.Vector3(randomBetween(-1.2, 1.2), getTopY() + 0.8, randomBetween(-1.25, 1.25));
  const direction = new THREE.Vector3(randomBetween(-0.25, 0.35), -1, randomBetween(-0.28, 0.28)).normalize();
  const entry = calculateRayCylinderIntersection(start, direction, detectorGeometry.tank);
  const waterEntry = entry.point;
  const insideStart = waterEntry.clone().add(direction.clone().multiplyScalar(0.001));
  const exit = calculateRayCylinderIntersection(insideStart, direction, detectorGeometry.tank);
  const length = Math.max(exit.distance + 0.001, 0);
  const waterExit = waterEntry.clone().add(direction.clone().multiplyScalar(length));
  const end = waterExit.clone().add(direction.clone().multiplyScalar(0.55));

  return {
    id: createEventId(),
    category: "cosmic",
    selectedControls: {
      neutrinoEnergy: null,
      eventType: "Cosmic background",
      noiseLevel,
    },
    truth: {
      eventType: "Cosmic background",
      neutrinoEnergyGeV: null,
      vertexMeters: null,
      muonEnergyGeV: null,
      muonDirection: vectorToArray(direction),
      muonAngleDegrees: null,
      waterExitPointMeters: vectorToArray(waterExit),
      muonTrackLengthWaterMeters: round(length, 4),
      projectedMrdTrackLengthMeters: 0,
      mrdStopped: false,
      neutronMultiplicity: 0,
      cosmicEntryMeters: vectorToArray(waterEntry),
    },
    observables: {
      visibleTopology: "through-going cosmic-like track",
      roughWaterPathLengthMeters: round(jitter(length, noiseLevel), 1),
      crossedMrdLayers: [],
      visibleMrdLayersCrossed: 0,
      estimatedMrdTrackLengthMeters: 0,
      mrdStopStatus: "Did not reach MRD",
      noiseLevel,
    },
    display: {
      cosmicTrack: {
        start: vectorToArray(start),
        end: vectorToArray(end),
      },
      vertex: null,
      incomingNeutrino: null,
      muonTrack: null,
      mrdTrack: null,
    },
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

function randomMuonEnergy(neutrinoEnergy, eventType) {
  const [min, max] = MUON_ENERGY_FRACTIONS[eventType];
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

function estimateMuonTrackLength(muonEnergyGeV) {
  return 3.2 + 5.6 * muonEnergyGeV;
}

function estimateMrdSegment(waterExitPoint, direction, remainingRange) {
  if (direction.z <= 0.05 || remainingRange <= 0) {
    return { length: 0, crossedLayers: [], start: null, end: null, stopped: false };
  }

  const mrdStartZ = detectorGeometry.mrd.startZMeters;
  const distanceToMrd = (mrdStartZ - waterExitPoint.z) / direction.z;
  if (distanceToMrd < 0 || distanceToMrd > remainingRange + 0.25) {
    return { length: 0, crossedLayers: [], start: null, end: null, stopped: false };
  }

  const start = waterExitPoint.clone().add(direction.clone().multiplyScalar(Math.max(distanceToMrd, 0)));
  const maxMrdPath = detectorGeometry.mrd.totalDepthMeters / Math.max(direction.z, 0.05);
  const availableInMrd = remainingRange - Math.max(distanceToMrd, 0);
  const maxLength = Math.min(availableInMrd, maxMrdPath);
  const length = Math.max(0, maxLength);
  const end = start.clone().add(direction.clone().multiplyScalar(length));
  const crossedLayers = getCrossedMrdLayers(start, end, direction);
  const stopped = availableInMrd < maxMrdPath;

  return { length, crossedLayers, start, end, stopped };
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
      ? coordinateToPaddleIndex(hitPoint.y, detectorGeometry.tank.centerMeters[1], detectorGeometry.mrd.heightMeters)
      : coordinateToPaddleIndex(hitPoint.x, 0, detectorGeometry.mrd.widthXMeters);

    layers.push({
      layerIndex: i,
      paddleIndex,
      orientation,
      hitPointMeters: vectorToArray(hitPoint),
    });
  }

  return layers;
}

function isInsideMrdFace(point) {
  return Math.abs(point.x) <= detectorGeometry.mrd.widthXMeters / 2
    && Math.abs(point.y - detectorGeometry.tank.centerMeters[1]) <= detectorGeometry.mrd.heightMeters / 2;
}

function coordinateToPaddleIndex(value, center, span) {
  const normalized = (value - (center - span / 2)) / span;
  const index = Math.floor(normalized * detectorGeometry.mrd.paddleCountPerLayer);
  return Math.min(detectorGeometry.mrd.paddleCountPerLayer - 1, Math.max(0, index));
}

function jitter(value, noiseLevel) {
  const scale = { low: 0.05, medium: 0.12, high: 0.22 }[noiseLevel];
  return Math.max(0, value * randomBetween(1 - scale, 1 + scale));
}

function getTopY() {
  return detectorGeometry.tank.centerMeters[1] + detectorGeometry.tank.heightMeters / 2;
}

function getBottomY() {
  return detectorGeometry.tank.centerMeters[1] - detectorGeometry.tank.heightMeters / 2;
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
