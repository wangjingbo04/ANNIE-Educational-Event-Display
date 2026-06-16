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
  0.6: [15, 45],
  0.8: [10, 40],
  1.0: [8, 35],
  1.5: [5, 25],
  2.0: [3, 20],
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
  const muonRangeInWater = estimateMuonRangeInWater(muonEnergy);
  const waterTrackLength = Math.min(waterExit.distance, muonRangeInWater);
  const waterEnd = vertex.clone().add(muonDirection.clone().multiplyScalar(waterTrackLength));
  const mrd = estimateMrdSegment(waterEnd, muonDirection, muonRangeInWater - waterTrackLength);
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
      waterExitPointMeters: vectorToArray(waterEnd),
      muonTrackLengthWaterMeters: round(waterTrackLength, 2),
      projectedMrdTrackLengthMeters: round(mrd.length, 2),
      neutronMultiplicity,
    },
    observables: {
      visibleTopology: "single downstream track",
      roughWaterPathLengthMeters: round(jitter(waterTrackLength, noiseLevel), 1),
      crossedMrdLayers: mrd.crossedLayers,
      visibleMrdLayersCrossed: mrd.crossedLayers.length,
      noiseLevel,
    },
    display: {
      incomingNeutrino: {
        start: vectorToArray(new THREE.Vector3(-2.35, vertex.y, vertex.z)),
        end: vectorToArray(vertex),
      },
      vertex: vectorToArray(vertex),
      muonTrack: {
        start: vectorToArray(vertex),
        end: vectorToArray(waterEnd),
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
      muonTrackLengthWaterMeters: round(length, 2),
      projectedMrdTrackLengthMeters: 0,
      neutronMultiplicity: 0,
      cosmicEntryMeters: vectorToArray(waterEntry),
    },
    observables: {
      visibleTopology: "through-going cosmic-like track",
      roughWaterPathLengthMeters: round(jitter(length, noiseLevel), 1),
      crossedMrdLayers: [],
      visibleMrdLayersCrossed: 0,
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
  const radius = Math.sqrt(Math.random()) * detectorGeometry.tank.radiusMeters * 0.82;
  const angle = randomBetween(0, Math.PI * 2);
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    randomBetween(getBottomY() + 0.35, getTopY() - 0.35),
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
    Math.cos(theta),
    Math.sin(theta) * Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
  ).normalize();
}

function estimateMuonRangeInWater(muonEnergyGeV) {
  return 4.6 * muonEnergyGeV;
}

function estimateMrdSegment(waterEnd, direction, remainingRange) {
  if (direction.x <= 0.05 || remainingRange <= 0) {
    return { length: 0, crossedLayers: [], start: null, end: null };
  }

  const mrdStartX = detectorGeometry.mrd.startXMeters;
  const distanceToMrd = (mrdStartX - waterEnd.x) / direction.x;
  if (distanceToMrd < 0 || distanceToMrd > remainingRange + 0.25) {
    return { length: 0, crossedLayers: [], start: null, end: null };
  }

  const start = waterEnd.clone().add(direction.clone().multiplyScalar(Math.max(distanceToMrd, 0)));
  const maxLength = Math.min(remainingRange - Math.max(distanceToMrd, 0), 2.1);
  const length = Math.max(0, maxLength);
  const end = start.clone().add(direction.clone().multiplyScalar(length));
  const crossedLayers = getCrossedMrdLayers(start.x, end.x);

  return { length, crossedLayers, start, end };
}

function getCrossedMrdLayers(startX, endX) {
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const layers = [];

  for (let i = 0; i < detectorGeometry.mrd.layerCount; i += 1) {
    const layerX = detectorGeometry.mrd.startXMeters + i * detectorGeometry.mrd.layerSpacingMeters;
    if (layerX >= minX && layerX <= maxX) {
      layers.push(i);
    }
  }

  return layers;
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
  return [round(vector.x, 3), round(vector.y, 3), round(vector.z, 3)];
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
