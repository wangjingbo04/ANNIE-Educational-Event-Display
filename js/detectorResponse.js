import {
  CHERENKOV_ANGLE_DEGREES,
  CHERENKOV_CONE_WIDTH_DEGREES,
  LIGHT_SPEED_WATER_METERS_PER_NS,
  getCherenkovSource,
  getCherenkovTrackLength,
  getMuonDirection,
} from "./cherenkov.js";
import { detectorGeometry } from "./scene.js";

const TIMING_SMEAR_NS = 0.45;
const FOOTPRINT_EDGE_WIDTH_METERS = 0.38;
const FOOTPRINT_MIN_RADIUS_METERS = 0.28;
const FOOTPRINT_HIT_THRESHOLD = 0.035;

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
      model: "filled-footprint",
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
    const footprint = calculateFootprintResponse(source, direction, waterTrackLength, position);
    const hit = footprint.weight > FOOTPRINT_HIT_THRESHOLD;

    return {
      id: pmt.id,
      hit,
      positionMeters: position.toArray(),
      angleDegrees: round(footprint.angleDegrees, 2),
      trackProjectionMeters: round(footprint.projectionMeters, 3),
      distanceToTrackMeters: round(footprint.distanceToTrackMeters, 3),
      distanceMeters: round(footprint.distanceMeters, 3),
      footprintWeight: round(footprint.weight, 3),
      hitCharge: hit ? round(calculateCharge(event, footprint), 2) : 0,
      hitTime: hit ? round(calculateHitTime(footprint.lightPathMeters, footprint.projectionMeters), 2) : null,
    };
  });
}

function calculateFootprintResponse(source, direction, waterTrackLength, position) {
  const toPmt = position.clone().sub(source);
  const rawProjection = toPmt.dot(direction);
  const projection = clamp(rawProjection, 0, waterTrackLength);
  const closestPoint = source.clone().add(direction.clone().multiplyScalar(projection));
  const transverseDistance = position.distanceTo(closestPoint);
  const directDistance = source.distanceTo(position);
  const angle = directDistance > 0
    ? direction.angleTo(toPmt.clone().normalize()) * 180 / Math.PI
    : 0;

  if (rawProjection < -FOOTPRINT_EDGE_WIDTH_METERS || rawProjection > waterTrackLength + FOOTPRINT_EDGE_WIDTH_METERS) {
    return {
      angleDegrees: angle,
      projectionMeters: rawProjection,
      distanceToTrackMeters: transverseDistance,
      distanceMeters: directDistance,
      lightPathMeters: directDistance,
      weight: 0,
    };
  }

  const coneRadius = Math.max(
    FOOTPRINT_MIN_RADIUS_METERS,
    Math.tan(CHERENKOV_ANGLE_DEGREES * Math.PI / 180) * Math.max(projection, 0.08),
  );
  const radialFill = 1 - smoothstep(0.18, 1, transverseDistance / (coneRadius + FOOTPRINT_EDGE_WIDTH_METERS));
  const angularFill = 1 - smoothstep(
    CHERENKOV_ANGLE_DEGREES + CHERENKOV_CONE_WIDTH_DEGREES,
    CHERENKOV_ANGLE_DEGREES + CHERENKOV_CONE_WIDTH_DEGREES * 2.6,
    angle,
  );
  const segmentFill = smoothstep(-FOOTPRINT_EDGE_WIDTH_METERS, 0.18, rawProjection)
    * (1 - smoothstep(waterTrackLength - 0.18, waterTrackLength + FOOTPRINT_EDGE_WIDTH_METERS, rawProjection));
  const trackCoreBoost = Math.exp(-((transverseDistance / Math.max(coneRadius * 0.42, 0.22)) ** 2));
  const weight = clamp((0.68 * radialFill + 0.32 * trackCoreBoost) * angularFill * segmentFill, 0, 1);

  return {
    angleDegrees: angle,
    projectionMeters: rawProjection,
    distanceToTrackMeters: transverseDistance,
    distanceMeters: directDistance,
    lightPathMeters: Math.hypot(transverseDistance, Math.max(rawProjection - projection, 0)),
    weight,
  };
}

function calculateCharge(event, footprint) {
  const muonEnergy = event.truth.muonEnergyGeV ?? 1.0;
  const distanceScale = 1 / Math.max(footprint.distanceMeters ** 1.35, 0.45);
  const fluctuation = randomBetween(0.88, 1.12);

  return Math.max(0, 46 * muonEnergy * footprint.weight * distanceScale * fluctuation);
}

function calculateHitTime(lightPathMeters, projectionMeters) {
  const emissionDelay = Math.max(projectionMeters, 0) / 0.299792458;
  return emissionDelay + lightPathMeters / LIGHT_SPEED_WATER_METERS_PER_NS + randomBetween(-TIMING_SMEAR_NS, TIMING_SMEAR_NS);
}

function createEmptyResponse() {
  return {
    cherenkov: {
      angleDegrees: CHERENKOV_ANGLE_DEGREES,
      coneWidthDegrees: CHERENKOV_CONE_WIDTH_DEGREES,
      model: "filled-footprint",
    },
    pmtResponses: [],
    pmtHits: [],
    totals: {
      pmtHits: 0,
      pmtCharge: 0,
    },
  };
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
