import * as THREE from "three";

export const WATER_REFRACTIVE_INDEX = 1.33;
export const CHERENKOV_ANGLE_DEGREES = 41;
export const CHERENKOV_CONE_WIDTH_DEGREES = 8;
export const LIGHT_SPEED_WATER_METERS_PER_NS = 0.299792458 / WATER_REFRACTIVE_INDEX;

export function getCherenkovSource(event) {
  if (event.truth.vertexMeters) {
    return new THREE.Vector3().fromArray(event.truth.vertexMeters);
  }

  if (event.truth.cosmicEntryMeters) {
    return new THREE.Vector3().fromArray(event.truth.cosmicEntryMeters);
  }

  return null;
}

export function getMuonDirection(event) {
  if (!event.truth.muonDirection) {
    return null;
  }

  return new THREE.Vector3().fromArray(event.truth.muonDirection).normalize();
}

export function getCherenkovTrackLength(event) {
  return event.truth.muonTrackLengthWaterMeters ?? 0;
}

export function getCherenkovAngleToPoint(source, direction, point) {
  const toPoint = point.clone().sub(source);
  if (toPoint.lengthSq() === 0) {
    return 0;
  }

  return THREE.MathUtils.radToDeg(direction.angleTo(toPoint.normalize()));
}

export function isOnCherenkovCone(angleDegrees) {
  return Math.abs(angleDegrees - CHERENKOV_ANGLE_DEGREES) < CHERENKOV_CONE_WIDTH_DEGREES;
}

export function getCherenkovConeDimensions(trackLength) {
  const length = Math.max(trackLength, 0.05);
  return {
    length,
    radius: Math.tan(THREE.MathUtils.degToRad(CHERENKOV_ANGLE_DEGREES)) * length,
  };
}
