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

export function calculateRayCylinderIntersection(origin, direction, tank) {
  const center = new THREE.Vector3().fromArray(tank.centerMeters);
  const radius = tank.radiusMeters;
  const halfHeight = tank.heightMeters / 2;
  const bottomY = center.y - halfHeight;
  const topY = center.y + halfHeight;
  const distances = [];

  const dxzA = direction.x ** 2 + direction.z ** 2;
  const relX = origin.x - center.x;
  const relZ = origin.z - center.z;
  const dxzB = 2 * (relX * direction.x + relZ * direction.z);
  const dxzC = relX ** 2 + relZ ** 2 - radius ** 2;
  const discriminant = dxzB ** 2 - 4 * dxzA * dxzC;

  if (dxzA > 0.0001 && discriminant >= 0) {
    const sqrtDiscriminant = Math.sqrt(discriminant);
    const roots = [
      (-dxzB - sqrtDiscriminant) / (2 * dxzA),
      (-dxzB + sqrtDiscriminant) / (2 * dxzA),
    ];

    for (const root of roots) {
      const y = origin.y + direction.y * root;
      if (root > 0 && y >= bottomY && y <= topY) {
        distances.push(root);
      }
    }
  }

  if (Math.abs(direction.y) > 0.0001) {
    for (const yPlane of [bottomY, topY]) {
      const distance = (yPlane - origin.y) / direction.y;
      if (distance > 0 && isPointInsideTank(origin.clone().add(direction.clone().multiplyScalar(distance)), tank)) {
        distances.push(distance);
      }
    }
  }

  const forwardDistances = distances.filter((distance) => distance > 0);
  if (forwardDistances.length === 0) {
    return {
      distance: 0,
      point: origin.clone(),
    };
  }

  const distance = Math.min(...forwardDistances);
  return {
    distance,
    point: origin.clone().add(direction.clone().multiplyScalar(distance)),
  };
}

function isPointInsideTank(point, tank) {
  const center = new THREE.Vector3().fromArray(tank.centerMeters);
  const radialDistanceSquared = (point.x - center.x) ** 2 + (point.z - center.z) ** 2;
  const halfHeight = tank.heightMeters / 2;

  return radialDistanceSquared <= tank.radiusMeters ** 2 + 0.0001
    && point.y >= center.y - halfHeight - 0.0001
    && point.y <= center.y + halfHeight + 0.0001;
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

export function getCherenkovConeDimensions(trackLength, maxRadius = Infinity) {
  const length = Math.max(trackLength, 0.05);
  return {
    length,
    radius: Math.min(Math.tan(THREE.MathUtils.degToRad(CHERENKOV_ANGLE_DEGREES)) * length, maxRadius),
  };
}
