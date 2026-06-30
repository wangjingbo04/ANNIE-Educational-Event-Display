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
  const chargeScale = getInteractionChargeScale(event);
  if (chargeScale !== 1) {
    pmtResponses.forEach((pmt) => {
      if (pmt.hit) {
        pmt.hitCharge = round(pmt.hitCharge * chargeScale, 2);
      }
    });
  }
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

function getInteractionChargeScale(event) {
  if (event.truth?.interactionMode === "RES") {
    return 1.18;
  }
  if (event.truth?.interactionMode === "DIS") {
    return 1.48;
  }
  return 1;
}

function simulatePmtResponses(event, source, direction, waterTrackLength) {
  return detectorGeometry.pmtPositions.map((pmt) => {
    const position = pmt.position.clone();
    const footprint = calculateFootprintResponse(source, direction, waterTrackLength, position);
    const baseHit = footprint.weight > FOOTPRINT_HIT_THRESHOLD;
    const secondaryCharge = calculateSecondaryCharge(event, position);
    const totalCharge = (baseHit ? calculateCharge(event, footprint) : 0) + secondaryCharge;
    const hit = baseHit || totalCharge > 0.25;

    return {
      id: pmt.id,
      hit,
      positionMeters: position.toArray(),
      angleDegrees: round(footprint.angleDegrees, 2),
      trackProjectionMeters: round(footprint.projectionMeters, 3),
      distanceToTrackMeters: round(footprint.distanceToTrackMeters, 3),
      distanceMeters: round(footprint.distanceMeters, 3),
      footprintWeight: round(footprint.weight, 3),
      hitCharge: hit ? round(totalCharge, 2) : 0,
      hitTime: hit ? round(calculateHitTime(footprint.lightPathMeters, footprint.projectionMeters), 2) : null,
    };
  });
}

function calculateSecondaryCharge(event, position) {
  const tracks = event.truth?.secondaryTracks ?? [];
  if (!tracks.length) {
    return 0;
  }

  const mode = event.truth?.interactionMode;
  const muonEnergy = event.truth.muonEnergyGeV ?? 1.0;
  let charge = 0;

  tracks.forEach((track, index) => {
    const start = arrayToPoint(track.startPosition);
    const end = arrayToPoint(track.endPosition);
    const segment = subtractPoints(end, start);
    const length = Math.max(vectorLength(segment), 0.001);
    const toPmt = subtractPoints(pointFromVector(position), start);
    const projection = clamp(dot(toPmt, segment) / (length * length), 0, 1);
    const closest = addPoints(start, scalePoint(segment, projection));
    const distance = vectorLength(subtractPoints(pointFromVector(position), closest));
    const vertexDistance = vectorLength(subtractPoints(pointFromVector(position), start));
    const width = mode === "DIS" ? 0.62 : 0.38;
    const amplitude = mode === "DIS" ? 13.5 : 8.5;
    const blob = Math.exp(-((distance / width) ** 2));
    const vertexBlob = Math.exp(-((vertexDistance / (mode === "DIS" ? 0.85 : 0.55)) ** 2));
    const irregularity = mode === "DIS" ? randomBetween(0.7, 1.45) : randomBetween(0.9, 1.18);
    charge += amplitude * muonEnergy * (0.65 * blob + 0.35 * vertexBlob) * irregularity / Math.sqrt(index + 1);
  });

  return charge;
}

function pointFromVector(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function arrayToPoint(array) {
  return { x: array[0], y: array[1], z: array[2] };
}

function subtractPoints(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addPoints(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scalePoint(point, scale) {
  return { x: point.x * scale, y: point.y * scale, z: point.z * scale };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vectorLength(point) {
  return Math.hypot(point.x, point.y, point.z);
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



