import * as THREE from "three";
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
  const lappdResponses = simulateLappdResponses(source, direction, waterTrackLength);
  const pmtHits = pmtResponses.filter((pmt) => pmt.hit);
  const lappdHits = lappdResponses.filter((lappd) => lappd.hit);
  const totalCharge = pmtHits.reduce((sum, hit) => sum + hit.hitCharge, 0);

  return {
    cherenkov: {
      angleDegrees: CHERENKOV_ANGLE_DEGREES,
      coneWidthDegrees: CHERENKOV_CONE_WIDTH_DEGREES,
    },
    pmtResponses,
    pmtHits,
    lappdResponses,
    lappdHits,
    totals: {
      pmtHits: pmtHits.length,
      pmtCharge: round(totalCharge, 2),
      lappdHits: lappdHits.length,
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

function simulateLappdResponses(source, direction, waterTrackLength) {
  return detectorGeometry.lappdPositions.map((lappd) => {
    const center = lappd.position.clone();
    const normal = lappd.normal.clone().normalize();
    const projection = center.clone().sub(source).dot(direction);
    const angle = getCherenkovAngleToPoint(source, direction, center);
    const distance = source.distanceTo(center);
    const panelAngularHalfWidth = THREE.MathUtils.radToDeg(Math.atan((lappd.widthMeters * 0.75) / Math.max(distance, 0.1)));
    const facesSource = center.clone().sub(source).normalize().dot(normal) < -0.2;
    const hit = projection >= 0 && projection <= waterTrackLength
      && Math.abs(angle - CHERENKOV_ANGLE_DEGREES) < CHERENKOV_CONE_WIDTH_DEGREES + panelAngularHalfWidth
      && facesSource;

    return {
      id: lappd.id,
      hit,
      hitTime: hit ? round(calculateHitTime(distance), 2) : null,
      hitPosition: hit ? getLappdHitPosition(center, normal, source, direction, lappd) : null,
      positionMeters: center.toArray(),
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

function getLappdHitPosition(center, normal, source, direction, lappd) {
  const rayPoint = source.clone().add(direction.clone().multiplyScalar(source.distanceTo(center)));
  const projected = rayPoint.clone().sub(normal.clone().multiplyScalar(rayPoint.clone().sub(center).dot(normal)));
  const localOffset = projected.sub(center).clampLength(0, lappd.widthMeters * 0.45);

  return center.clone().add(localOffset).toArray().map((value) => round(value, 3));
}

function createEmptyResponse() {
  return {
    cherenkov: {
      angleDegrees: CHERENKOV_ANGLE_DEGREES,
      coneWidthDegrees: CHERENKOV_CONE_WIDTH_DEGREES,
    },
    pmtResponses: [],
    pmtHits: [],
    lappdResponses: [],
    lappdHits: [],
    totals: {
      pmtHits: 0,
      pmtCharge: 0,
      lappdHits: 0,
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
