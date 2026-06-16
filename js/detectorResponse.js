import {
  CHERENKOV_ANGLE_DEGREES,
  CHERENKOV_CONE_WIDTH_DEGREES,
  LIGHT_SPEED_WATER_METERS_PER_NS,
  getCherenkovAngleToPoint,
  getCherenkovSource,
  getCherenkovTrackLength,
  getMuonDirection,
  isOnCherenkovCone,
} from "./cherenkov.js";
import { detectorGeometry } from "./scene.js";

const TIMING_SMEAR_NS = 0.45;

export function simulateDetectorResponse(event) {
  const source = getCherenkovSource(event);
  const direction = getMuonDirection(event);
  const waterTrackLength = getCherenkovTrackLength(event);

  if (!source || !direction || waterTrackLength <= 0) {
    return createEmptyResponse();
  }

  const pmtResponses = simulatePmtResponses(event, source, direction, waterTrackLength);
  const pmtHits = pmtResponses.filter((pmt) => pmt.hit);
  const totalCharge = pmtHits.reduce((sum, hit) => sum + hit.hitCharge, 0);

  return {
    cherenkov: {
      angleDegrees: CHERENKOV_ANGLE_DEGREES,
      coneWidthDegrees: CHERENKOV_CONE_WIDTH_DEGREES,
    },
    pmtResponses,
    pmtHits,
    totals: {
      pmtHits: pmtHits.length,
      pmtCharge: round(totalCharge, 2),
    },
  };
}

function simulatePmtResponses(event, source, direction, waterTrackLength) {
  return detectorGeometry.pmtPositions.map((pmt) => {
    const position = pmt.position.clone();
    const projection = position.clone().sub(source).dot(direction);
    const angle = getCherenkovAngleToPoint(source, direction, position);
    const distance = source.distanceTo(position);
    const hit = projection >= 0 && projection <= waterTrackLength && isOnCherenkovCone(angle);

    return {
      id: pmt.id,
      hit,
      positionMeters: position.toArray(),
      angleDegrees: round(angle, 2),
      trackProjectionMeters: round(projection, 3),
      distanceMeters: round(distance, 3),
      hitCharge: hit ? round(calculateCharge(event, distance, angle), 2) : 0,
      hitTime: hit ? round(calculateHitTime(distance), 2) : null,
    };
  });
}

function calculateCharge(event, distance, angle) {
  const muonEnergy = event.truth.muonEnergyGeV ?? 1.0;
  const angularWeight = 1 - Math.abs(angle - CHERENKOV_ANGLE_DEGREES) / CHERENKOV_CONE_WIDTH_DEGREES;
  const fluctuation = randomBetween(0.9, 1.1);

  return Math.max(0, 28 * muonEnergy * angularWeight * fluctuation / Math.max(distance ** 2, 0.2));
}

function calculateHitTime(distance) {
  return distance / LIGHT_SPEED_WATER_METERS_PER_NS + randomBetween(-TIMING_SMEAR_NS, TIMING_SMEAR_NS);
}

function createEmptyResponse() {
  return {
    cherenkov: {
      angleDegrees: CHERENKOV_ANGLE_DEGREES,
      coneWidthDegrees: CHERENKOV_CONE_WIDTH_DEGREES,
    },
    pmtResponses: [],
    pmtHits: [],
    totals: {
      pmtHits: 0,
      pmtCharge: 0,
    },
  };
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
