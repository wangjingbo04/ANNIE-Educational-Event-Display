import * as THREE from "three";

export function createEventDisplay({ scene, mrdLayers }) {
  const eventGroup = new THREE.Group();
  eventGroup.name = "event display";
  scene.add(eventGroup);

  const baseMrdColors = mrdLayers.map((layer) => layer.material.color.getHex());

  function showEvent(event) {
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
  }

  function clearEvent() {
    eventGroup.clear();
    mrdLayers.forEach((layer, index) => {
      layer.material.color.setHex(baseMrdColors[index]);
      layer.material.emissive?.setHex(0x000000);
    });
  }

  return { showEvent, clearEvent };
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

function lightMrdLayers(mrdLayers, crossedLayers) {
  for (const layerIndex of crossedLayers) {
    const layer = mrdLayers[layerIndex];
    if (layer) {
      layer.material.color.setHex(0xffb347);
      layer.material.emissive?.setHex(0x7a3300);
    }
  }
}
