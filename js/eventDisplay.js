import * as THREE from "three";
import { CHERENKOV_ANGLE_DEGREES, getCherenkovSource, getCherenkovTrackLength, getMuonDirection } from "./cherenkov.js";

export function createEventDisplay({ detectorGeometry, scene, mrdLayers, pmtMeshes }) {
  const eventGroup = new THREE.Group();
  eventGroup.name = "event display";
  scene.add(eventGroup);

  const coneGroup = new THREE.Group();
  coneGroup.name = "Cherenkov cone display";
  scene.add(coneGroup);

  const hitMarkerGroup = new THREE.Group();
  hitMarkerGroup.name = "detector hit display";
  scene.add(hitMarkerGroup);

  const mrdBaseStates = captureMrdStates(mrdLayers);
  const pmtBaseStates = captureBaseStates(pmtMeshes);

  function showEvent(event, { showCone = true, showTruthTracks = true, showVertex = true } = {}) {
    clearEvent();

    if (showTruthTracks && event.display.incomingNeutrino) {
      addDashedLine(eventGroup, event.display.incomingNeutrino.start, event.display.incomingNeutrino.end, 0xf3c96b);
    }

    if (showVertex && event.display.vertex) {
      addVertex(eventGroup, event.display.vertex);
    }

    if (showTruthTracks && event.display.muonTrack) {
      addSolidLine(eventGroup, event.display.muonTrack.start, event.display.muonTrack.end, 0xff8a00, 0.045);
    }

    if (showTruthTracks && event.display.mrdTrack) {
      addSolidLine(eventGroup, event.display.mrdTrack.start, event.display.mrdTrack.end, 0xff9f1a, 0.055);
    }

    if (showTruthTracks && event.display.cosmicTrack) {
      addSolidLine(eventGroup, event.display.cosmicTrack.start, event.display.cosmicTrack.end, 0xc77dff, 0.028);
    }

    lightMrdLayers(mrdLayers, event.observables.crossedMrdLayers);

    if (showCone) {
      setCherenkovConeVisible(event, true);
    }
  }

  function clearEvent() {
    eventGroup.clear();
    coneGroup.clear();
    resetDetectorHits();
    restoreMrdStates(mrdLayers, mrdBaseStates);
  }

  function setCherenkovConeVisible(event, visible) {
    coneGroup.clear();
    if (!visible) {
      return;
    }

    addCherenkovCone(coneGroup, event, detectorGeometry.tank);
  }

  function showDetectorHits(response) {
    resetDetectorHits();

    for (const hit of response.pmtHits) {
      const mesh = pmtMeshes.get(hit.id);
      if (!mesh) {
        continue;
      }

      const scale = 1.18 + Math.min(hit.hitCharge / 80, 0.45);
      mesh.scale.setScalar(scale);
      tintMesh(mesh, 0xfff36c, 0xffbf00, 0.85);
    }
  }

  function resetDetectorHits() {
    hitMarkerGroup.clear();
    restoreBaseStates(pmtMeshes, pmtBaseStates);
  }

  return {
    showEvent,
    clearEvent,
    resetDetectorHits,
    setCherenkovConeVisible,
    showDetectorHits,
  };
}

function addVertex(group, positionArray) {
  const geometry = new THREE.SphereGeometry(0.075, 24, 24);
  const material = new THREE.MeshStandardMaterial({
    color: 0xfff36c,
    emissive: 0xff8a00,
    emissiveIntensity: 1.2,
  });
  const vertex = new THREE.Mesh(geometry, material);
  vertex.position.fromArray(positionArray);
  group.add(vertex);
}

function addSolidLine(group, startArray, endArray, color, radius) {
  const start = new THREE.Vector3().fromArray(startArray);
  const end = new THREE.Vector3().fromArray(endArray);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 16);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
  });
  const line = new THREE.Mesh(geometry, material);
  line.position.copy(midpoint);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  group.add(line);
}

function addDashedLine(group, startArray, endArray, color) {
  const start = new THREE.Vector3().fromArray(startArray);
  const end = new THREE.Vector3().fromArray(endArray);
  const direction = end.clone().sub(start);
  const totalLength = direction.length();
  const unit = direction.normalize();
  const dashLength = 0.16;
  const gapLength = 0.1;
  let distance = 0;

  while (distance < totalLength) {
    const segmentStart = start.clone().add(unit.clone().multiplyScalar(distance));
    const segmentEnd = start.clone().add(unit.clone().multiplyScalar(Math.min(distance + dashLength, totalLength)));
    addSolidLine(group, segmentStart.toArray(), segmentEnd.toArray(), color, 0.012);
    distance += dashLength + gapLength;
  }
}

function addCherenkovCone(group, event, tank) {
  const source = getCherenkovSource(event);
  const direction = getMuonDirection(event);
  const trackLength = getCherenkovTrackLength(event);

  if (!source || !direction || trackLength <= 0) {
    return;
  }

  const geometry = createContainedCherenkovConeGeometry(source, direction, trackLength, tank);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffe45c,
    emissive: 0xffb000,
    emissiveIntensity: 0.42,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cone = new THREE.Mesh(geometry, material);
  group.add(cone);
}

function createContainedCherenkovConeGeometry(source, axis, length, tank) {
  const radialSegments = 72;
  const lengthSegments = 36;
  const theta = THREE.MathUtils.degToRad(CHERENKOV_ANGLE_DEGREES);
  const [u, v] = makePerpendicularBasis(axis);
  const positions = [];
  const indices = [];

  for (let i = 0; i <= lengthSegments; i += 1) {
    const fraction = i / lengthSegments;
    const axisDistance = length * fraction;
    const axisPoint = source.clone().add(axis.clone().multiplyScalar(axisDistance));
    const idealRadius = Math.tan(theta) * axisDistance;
    const exitTaper = Math.max(0, 1 - fraction ** 6);

    for (let j = 0; j < radialSegments; j += 1) {
      const phi = (j / radialSegments) * Math.PI * 2;
      const radialDirection = u.clone().multiplyScalar(Math.cos(phi)).add(v.clone().multiplyScalar(Math.sin(phi))).normalize();
      const containedRadius = findContainedConeRadius(axisPoint, radialDirection, idealRadius * exitTaper, tank);
      const point = axisPoint.clone().add(radialDirection.multiplyScalar(containedRadius));
      positions.push(point.x, point.y, point.z);
    }
  }

  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function makePerpendicularBasis(axis) {
  const reference = Math.abs(axis.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(axis, reference).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();

  return [u, v];
}

function findContainedConeRadius(origin, radialDirection, desiredRadius, tank) {
  if (desiredRadius <= 0) {
    return 0;
  }

  const desiredPoint = origin.clone().add(radialDirection.clone().multiplyScalar(desiredRadius));
  if (isPointInsideTank(desiredPoint, tank)) {
    return desiredRadius;
  }

  let low = 0;
  let high = desiredRadius;
  for (let i = 0; i < 16; i += 1) {
    const mid = (low + high) / 2;
    const point = origin.clone().add(radialDirection.clone().multiplyScalar(mid));
    if (isPointInsideTank(point, tank)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
}

function isPointInsideTank(point, tank) {
  const center = new THREE.Vector3().fromArray(tank.centerMeters);
  const halfHeight = tank.heightMeters / 2;
  const radialDistanceSquared = (point.x - center.x) ** 2 + (point.z - center.z) ** 2;

  return radialDistanceSquared <= tank.radiusMeters ** 2 + 0.000001
    && point.y >= center.y - halfHeight - 0.000001
    && point.y <= center.y + halfHeight + 0.000001;
}

function lightMrdLayers(mrdLayers, crossedLayers) {
  for (const hit of crossedLayers) {
    const layer = mrdLayers[hit.layerIndex];
    const paddle = layer?.paddles?.[hit.paddleIndex];
    if (paddle) {
      paddle.material.color.setHex(0xffb347);
      paddle.material.emissive?.setHex(0xff7a00);
      paddle.material.emissiveIntensity = 0.9;
    }
  }
}

function captureMrdStates(mrdLayers) {
  return mrdLayers.map((layer) => ({
    paddles: layer.paddles.map((paddle) => ({
      color: paddle.material.color.getHex(),
      emissive: paddle.material.emissive?.getHex(),
      emissiveIntensity: paddle.material.emissiveIntensity ?? 0,
    })),
  }));
}

function restoreMrdStates(mrdLayers, baseStates) {
  mrdLayers.forEach((layer, layerIndex) => {
    layer.paddles.forEach((paddle, paddleIndex) => {
      const state = baseStates[layerIndex]?.paddles[paddleIndex];
      if (!state) {
        return;
      }
      paddle.material.color.setHex(state.color);
      paddle.material.emissive?.setHex(state.emissive ?? 0x000000);
      if ("emissiveIntensity" in paddle.material) {
        paddle.material.emissiveIntensity = state.emissiveIntensity;
      }
    });
  });
}

function captureBaseStates(meshMap) {
  const states = new Map();
  meshMap.forEach((group, id) => {
    states.set(id, {
      scale: group.scale.clone(),
      children: group.children.map((child) => ({
        mesh: child,
        color: child.material?.color?.getHex(),
        emissive: child.material?.emissive?.getHex(),
        emissiveIntensity: child.material?.emissiveIntensity ?? 0,
      })),
    });
  });

  return states;
}

function restoreBaseStates(meshMap, baseStates) {
  meshMap.forEach((group, id) => {
    const state = baseStates.get(id);
    if (!state) {
      return;
    }

    group.scale.copy(state.scale);
    for (const childState of state.children) {
      if (childState.color !== undefined) {
        childState.mesh.material.color.setHex(childState.color);
      }
      if (childState.emissive !== undefined) {
        childState.mesh.material.emissive.setHex(childState.emissive);
      }
      if (childState.mesh.material && "emissiveIntensity" in childState.mesh.material) {
        childState.mesh.material.emissiveIntensity = childState.emissiveIntensity;
      }
    }
  });
}

function tintMesh(group, color, emissive, emissiveIntensity) {
  for (const child of group.children) {
    if (!child.material) {
      continue;
    }
    child.material.color?.setHex(color);
    child.material.emissive?.setHex(emissive);
    if ("emissiveIntensity" in child.material) {
      child.material.emissiveIntensity = emissiveIntensity;
    }
  }
}
