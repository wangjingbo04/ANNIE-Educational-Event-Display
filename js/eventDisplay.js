import * as THREE from "three";
import { getCherenkovConeDimensions, getCherenkovSource, getCherenkovTrackLength, getMuonDirection } from "./cherenkov.js";

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

  const baseMrdColors = mrdLayers.map((layer) => layer.material.color.getHex());
  const pmtBaseStates = captureBaseStates(pmtMeshes);

  function showEvent(event, { showCone = true } = {}) {
    clearEvent();

    if (event.display.incomingNeutrino) {
      addDashedLine(eventGroup, event.display.incomingNeutrino.start, event.display.incomingNeutrino.end, 0xf3c96b);
    }

    if (event.display.vertex) {
      addVertex(eventGroup, event.display.vertex);
    }

    if (event.display.muonTrack) {
      addSolidLine(eventGroup, event.display.muonTrack.start, event.display.muonTrack.end, 0xff3b1f, 0.025);
    }

    if (event.display.mrdTrack) {
      addSolidLine(eventGroup, event.display.mrdTrack.start, event.display.mrdTrack.end, 0xff8f2a, 0.035);
    }

    if (event.display.cosmicTrack) {
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
    mrdLayers.forEach((layer, index) => {
      layer.material.color.setHex(baseMrdColors[index]);
      layer.material.emissive?.setHex(0x000000);
    });
  }

  function setCherenkovConeVisible(event, visible) {
    coneGroup.clear();
    if (!visible) {
      return;
    }

    addCherenkovCone(coneGroup, event, detectorGeometry.tank.radiusMeters * 0.95);
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

function addCherenkovCone(group, event, maxRadius) {
  const source = getCherenkovSource(event);
  const direction = getMuonDirection(event);
  const trackLength = getCherenkovTrackLength(event);

  if (!source || !direction || trackLength <= 0) {
    return;
  }

  const { length, radius } = getCherenkovConeDimensions(trackLength, maxRadius);
  const geometry = new THREE.ConeGeometry(radius, length, 72, 1, true);
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
  cone.position.copy(source).add(direction.clone().multiplyScalar(length / 2));
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
  group.add(cone);
}

function lightMrdLayers(mrdLayers, crossedLayers) {
  for (const layerIndex of crossedLayers) {
    const layer = mrdLayers[layerIndex];
    if (layer) {
      layer.material.color.setHex(0xffb347);
      layer.material.emissive?.setHex(0x7a3300);
    }
  }
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
