import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createEventDisplay } from "./eventDisplay.js";

const DETECTOR = {
  tank: {
    radius: 1.5,
    bodyRadius: 1.524,
    baseRadius: 1.5494,
    height: 3.7,
    center: new THREE.Vector3(0, 1.85, 0),
    materialName: "TankWater",
    shellMaterialName: "TankSteel",
    fiducialRadius: 1.1,
    fiducialMarginY: 0.55,
  },
  pmt: {
    radius: 0.1016,
  },
  mrd: {
    absorberCount: 11,
    scintillatorLayerCount: 11,
    horizontalLayers: 6,
    verticalLayers: 5,
    layerSpacing: 0.14,
    absorberThickness: 0.05,
    scintillatorThickness: 0.025,
    startZ: 2.38,
    heightY: 2.74,
    widthX: 3.05,
    paddleCountPerLayer: 12,
    realPaddleCountApprox: "306",
    materialName: "MRDSteel",
    scintillatorMaterialName: "Scinti",
  },
  veto: {
    layers: 2,
    paddleCountPerLayer: 13,
    widthX: 3.2,
    heightY: 4.2149,
    paddleThickness: 0.02,
    z: -2.18,
  },
};

const pmtPositions = buildPmtPositions();
const CAMERA_STORAGE_KEY = "annie.defaultCameraState";
const FALLBACK_CAMERA_STATE = {
  position: new THREE.Vector3(-8, 4, -12),
  target: new THREE.Vector3(0, 1.55, 1.35),
  zoom: 1,
};

export const detectorGeometry = {
  tank: {
    diameterMeters: DETECTOR.tank.radius * 2,
    radiusMeters: DETECTOR.tank.radius,
    heightMeters: DETECTOR.tank.height,
    centerMeters: DETECTOR.tank.center.toArray(),
    fiducialRadiusMeters: DETECTOR.tank.fiducialRadius,
    fiducialYMinMeters: DETECTOR.tank.center.y - DETECTOR.tank.height / 2 + DETECTOR.tank.fiducialMarginY,
    fiducialYMaxMeters: DETECTOR.tank.center.y + DETECTOR.tank.height / 2 - DETECTOR.tank.fiducialMarginY,
  },
  mrd: {
    startZMeters: DETECTOR.mrd.startZ,
    layerCount: DETECTOR.mrd.scintillatorLayerCount,
    absorberCount: DETECTOR.mrd.absorberCount,
    layerSpacingMeters: DETECTOR.mrd.layerSpacing,
    absorberThicknessMeters: DETECTOR.mrd.absorberThickness,
    scintillatorThicknessMeters: DETECTOR.mrd.scintillatorThickness,
    heightMeters: DETECTOR.mrd.heightY,
    widthXMeters: DETECTOR.mrd.widthX,
    paddleCountPerLayer: DETECTOR.mrd.paddleCountPerLayer,
    horizontalLayers: DETECTOR.mrd.horizontalLayers,
    verticalLayers: DETECTOR.mrd.verticalLayers,
    totalDepthMeters: DETECTOR.mrd.layerSpacing * (DETECTOR.mrd.scintillatorLayerCount - 1)
      + DETECTOR.mrd.absorberThickness
      + DETECTOR.mrd.scintillatorThickness,
    realPaddleCountApprox: DETECTOR.mrd.realPaddleCountApprox,
    materialName: DETECTOR.mrd.materialName,
    scintillatorMaterialName: DETECTOR.mrd.scintillatorMaterialName,
  },
  frontVeto: {
    layers: DETECTOR.veto.layers,
    paddleCountPerLayer: DETECTOR.veto.paddleCountPerLayer,
    zMeters: DETECTOR.veto.z,
    widthXMeters: DETECTOR.veto.widthX,
    heightMeters: DETECTOR.veto.heightY,
    paddleThicknessMeters: DETECTOR.veto.paddleThickness,
  },
  gdmlSource: {
    repository: "ANNIEsoft/WCSim",
    branch: "annie",
    file: "annie_v04.gdml",
    notes: [
      "WATER_S rmax=1519.24 mm z=3956.05 mm",
      "TBODY_S rmax=1524.0 mm z=3956.05 mm",
      "steelPlate x=3050 mm y=2740 mm z=50 mm",
      "MRD represented as 11 scintillator layers interleaved with 11 iron absorber layers",
      "front veto represented as two layers of 13 scintillator paddles",
    ],
  },
  pmtScanSource: {
    file: "PMTPositions_Scan.txt",
    count: 132,
    notes: [
      "PMT scan IDs 332-463 contain 132 PMTs",
      "Current educational layout adds extra wall rings for more uniform teaching coverage",
      "Active layout has 20 top PMTs, 20 bottom PMTs, and 184 wall PMTs",
    ],
  },
  coordinateSystem: {
    beam: "+Z",
    vertical: "+Y",
    horizontalTransverse: "+X",
  },
  pmtPositions,
};

export function initScene({ container, onReady }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0f12);

  const defaultCameraState = loadDefaultCameraState();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.copy(defaultCameraState.position);
  camera.zoom = defaultCameraState.zoom;
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.copy(defaultCameraState.target);

  scene.defaultCameraState = cloneCameraState(defaultCameraState);

  addLighting(scene);
  const detectorModel = addDetectorModel(scene);
  detectorModel.fiducialVolume.visible = false;
  addGround(scene);
  const eventDisplay = createEventDisplay({
    scene,
    detectorGeometry,
    mrdLayers: detectorModel.mrdLayers,
    fmvLayers: detectorModel.fmvLayers,
    pmtMeshes: detectorModel.pmtMeshes,
  });

  const resizeObserver = new ResizeObserver(() => {
    resizeRenderer(container, camera, renderer);
  });
  resizeObserver.observe(container);

  function resetView() {
    animateCameraToState(camera, controls, scene.defaultCameraState);
  }

  function setCurrentViewAsDefault() {
    scene.defaultCameraState = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      zoom: camera.zoom,
    };
    saveDefaultCameraState(scene.defaultCameraState);
    logCameraState(scene.defaultCameraState);
    return cameraStateToPlainObject(scene.defaultCameraState);
  }

  function getCurrentCameraJson() {
    return JSON.stringify(cameraStateToPlainObject({
      position: camera.position,
      target: controls.target,
      zoom: camera.zoom,
    }), null, 2);
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  resizeRenderer(container, camera, renderer);
  renderer.domElement.addEventListener("dblclick", resetView);
  animate();
  onReady?.();

  return {
    showEvent: eventDisplay.showEvent,
    clearEvent: eventDisplay.clearEvent,
    resetDetectorHits: eventDisplay.resetDetectorHits,
    setFiducialVolumeVisible: (visible) => { detectorModel.fiducialVolume.visible = visible; },
    setCherenkovConeVisible: eventDisplay.setCherenkovConeVisible,
    showDetectorHits: eventDisplay.showDetectorHits,
    resetView,
    setCurrentViewAsDefault,
    getCurrentCameraJson,
    captureImage: () => {
      controls.update();
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    },
  };
}


function animateCameraToState(camera, controls, state) {
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const startZoom = camera.zoom;
  const durationMs = 620;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / durationMs, 1);
    const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(startPosition, state.position, eased);
    controls.target.lerpVectors(startTarget, state.target, eased);
    camera.zoom = startZoom + (state.zoom - startZoom) * eased;
    camera.updateProjectionMatrix();
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function loadDefaultCameraState() {
  const stored = readStoredCameraState();
  return stored ? cloneCameraState(stored) : cloneCameraState(FALLBACK_CAMERA_STATE);
}

function readStoredCameraState() {
  try {
    const json = window.localStorage?.getItem(CAMERA_STORAGE_KEY);
    if (!json) {
      return null;
    }
    const parsed = JSON.parse(json);
    return plainObjectToCameraState(parsed);
  } catch (error) {
    console.warn("Could not load saved ANNIE camera default", error);
    return null;
  }
}

function saveDefaultCameraState(state) {
  try {
    window.localStorage?.setItem(CAMERA_STORAGE_KEY, JSON.stringify(cameraStateToPlainObject(state)));
  } catch (error) {
    console.warn("Could not save ANNIE camera default", error);
  }
}

function logCameraState(state) {
  const plain = cameraStateToPlainObject(state);
  console.log(
    "Default camera updated:\n"
      + `position = (${plain.position.map(formatCameraNumber).join(", ")})\n`
      + `target = (${plain.target.map(formatCameraNumber).join(", ")})\n`
      + `zoom = ${formatCameraNumber(plain.zoom)}`,
  );
}

function cameraStateToPlainObject(state) {
  return {
    position: state.position.toArray().map(roundCameraNumber),
    target: state.target.toArray().map(roundCameraNumber),
    zoom: roundCameraNumber(state.zoom),
  };
}

function plainObjectToCameraState(value) {
  if (!Array.isArray(value?.position) || !Array.isArray(value?.target) || typeof value.zoom !== "number") {
    return null;
  }
  return {
    position: new THREE.Vector3().fromArray(value.position),
    target: new THREE.Vector3().fromArray(value.target),
    zoom: value.zoom,
  };
}

function cloneCameraState(state) {
  return {
    position: state.position.clone(),
    target: state.target.clone(),
    zoom: state.zoom,
  };
}

function roundCameraNumber(value) {
  return Math.round(value * 100) / 100;
}

function formatCameraNumber(value) {
  return value.toFixed(2);
}

function addLighting(scene) {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
  keyLight.position.set(4, 6, 5);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x61d6b6, 2.2, 12);
  fillLight.position.set(-3, 2.5, -2);
  scene.add(fillLight);
}

function addDetectorModel(scene) {
  const group = new THREE.Group();
  const mrdLayers = [];
  const fmvLayers = { front: [] };
  const pmtMeshes = new Map();

  addWaterTank(group);
  addCapSupportArrays(group);
  addWallPmtSupportFrames(group);
  addPmts(group, pmtMeshes);
  addFrontVeto(group, fmvLayers);
  addMrd(group, mrdLayers);
  const fiducialVolume = addFiducialVolume(group);
  addDetectorAxes(group);

  scene.add(group);

  return { mrdLayers, fmvLayers, pmtMeshes, fiducialVolume };
}

function addWaterTank(group) {
  const { radius, bodyRadius, baseRadius, height, center } = DETECTOR.tank;
  const waterGeometry = new THREE.CylinderGeometry(radius, radius, height, 96, 1, false);
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2f9fd7,
    roughness: 0.18,
    transmission: 0.18,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
  });

  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.position.copy(center);
  water.name = "ANNIE water target";
  group.add(water);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3c96b,
    metalness: 0.7,
    roughness: 0.2,
  });

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa6aa,
    metalness: 0.62,
    roughness: 0.28,
    transparent: true,
    opacity: 0.18,
  });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius, bodyRadius, height, 96, 1, true), shellMaterial);
  shell.position.copy(center);
  shell.name = "ANNIE tank steel shell";
  group.add(shell);

  const topRing = new THREE.Mesh(new THREE.TorusGeometry(bodyRadius, 0.025, 16, 96), frameMaterial);
  topRing.position.set(center.x, center.y + height / 2, center.z);
  topRing.rotation.x = Math.PI / 2;
  group.add(topRing);

  const bottomRing = topRing.clone();
  bottomRing.position.y = center.y - height / 2;
  group.add(bottomRing);

  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(baseRadius, 0.018, 12, 96), frameMaterial);
  baseRing.position.set(center.x, center.y - height / 2 + 0.04, center.z);
  baseRing.rotation.x = Math.PI / 2;
  group.add(baseRing);

  const sideLineGeometry = new THREE.CylinderGeometry(0.012, 0.012, height, 12);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const line = new THREE.Mesh(sideLineGeometry, frameMaterial);
    line.position.set(Math.cos(angle) * bodyRadius, center.y, Math.sin(angle) * bodyRadius);
    group.add(line);
  }
}

function addCapSupportArrays(group) {
  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f969a,
    metalness: 0.35,
    roughness: 0.42,
    transparent: true,
    opacity: 0.62,
  });
  const bottomMaterial = new THREE.MeshStandardMaterial({
    color: 0x20272b,
    metalness: 0.2,
    roughness: 0.5,
  });
  const topPlate = new THREE.Mesh(new THREE.CylinderGeometry(1.24, 1.24, 0.045, 72), topMaterial);
  topPlate.position.set(0, getTopY() - 0.16, 0);
  topPlate.name = "top PMT support plate";
  group.add(topPlate);

  const bottomPlate = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, 0.035, 72), bottomMaterial);
  bottomPlate.position.set(0, getBottomY() + 0.012, 0);
  bottomPlate.name = "bottom PMT support platform";
  group.add(bottomPlate);

}

function addPmts(group, pmtMeshes) {
  const sharedPmtMaterial = makePmtMaterials(0x1359ff, 0xaed2ff, 0x071c63);
  const materials = {
    wall: sharedPmtMaterial,
    top: sharedPmtMaterial,
    bottom: sharedPmtMaterial,
  };
  const domeGeometry = createHemisphereGeometry(DETECTOR.pmt.radius, 28, 12);
  const rimGeometry = new THREE.TorusGeometry(DETECTOR.pmt.radius * 0.96, 0.009, 10, 32);

  for (const pmt of detectorGeometry.pmtPositions) {
    const materialKey = pmt.surface === "top" ? "top" : pmt.surface === "bottom" ? "bottom" : "wall";
    const pmtGroup = new THREE.Group();
    pmtGroup.position.copy(pmt.position);
    pmtGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pmt.normal);

    const dome = new THREE.Mesh(domeGeometry, materials[materialKey].face.clone());
    pmtGroup.add(dome);

    const rim = new THREE.Mesh(rimGeometry, materials[materialKey].body.clone());
    pmtGroup.add(rim);

    pmtGroup.userData = {
      id: pmt.id,
      positionMeters: pmt.position.toArray(),
      normal: pmt.normal.toArray(),
      surface: pmt.surface,
    };
    group.add(pmtGroup);
    pmtMeshes.set(pmt.id, pmtGroup);
  }
}

function makePmtMaterials(bodyColor, faceColor, emissiveColor) {
  return {
    body: new THREE.MeshStandardMaterial({
      color: bodyColor,
      emissive: emissiveColor,
      roughness: 0.42,
    }),
    face: new THREE.MeshStandardMaterial({
      color: faceColor,
      emissive: emissiveColor,
      metalness: 0.1,
      roughness: 0.16,
    }),
  };
}

function createHemisphereGeometry(radius, radialSegments, heightSegments) {
  const positions = [];
  const normals = [];
  const indices = [];

  for (let y = 0; y <= heightSegments; y += 1) {
    const theta = (y / heightSegments) * (Math.PI / 2);
    const ringRadius = Math.sin(theta) * radius;
    const z = Math.cos(theta) * radius;

    for (let x = 0; x <= radialSegments; x += 1) {
      const phi = (x / radialSegments) * Math.PI * 2;
      const px = Math.cos(phi) * ringRadius;
      const py = Math.sin(phi) * ringRadius;
      positions.push(px, py, z);

      const normal = new THREE.Vector3(px, py, z).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  }

  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < radialSegments; x += 1) {
      const a = y * (radialSegments + 1) + x;
      const b = a + radialSegments + 1;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  return geometry;
}

function addWallPmtSupportFrames(group) {
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9f3f6,
    metalness: 0.35,
    roughness: 0.3,
  });
  const blueRailMaterial = new THREE.MeshStandardMaterial({
    color: 0x114cff,
    emissive: 0x06134a,
    metalness: 0.25,
    roughness: 0.24,
  });
  const frameAngles = getSupportFrameDegrees().map(degreesToRadians);
  const yLevels = getWallPmtYLevels();
  const radius = DETECTOR.tank.radius + 0.025;

  for (const angle of frameAngles) {
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const centerLine = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const railOffset = 0.16;
    const bottom = DETECTOR.tank.center.y - DETECTOR.tank.height / 2 + 0.24;
    const top = DETECTOR.tank.center.y + DETECTOR.tank.height / 2 - 0.24;

    for (const side of [-1, 1]) {
      const railPosition = centerLine.clone().add(tangent.clone().multiplyScalar(side * railOffset));
      addCylinderBetween(
        group,
        new THREE.Vector3(railPosition.x, bottom, railPosition.z),
        new THREE.Vector3(railPosition.x, top, railPosition.z),
        0.014,
        side === -1 ? frameMaterial : blueRailMaterial,
      );
    }

    for (const y of yLevels) {
      const left = centerLine.clone().add(tangent.clone().multiplyScalar(-railOffset));
      const right = centerLine.clone().add(tangent.clone().multiplyScalar(railOffset));
      addCylinderBetween(group, new THREE.Vector3(left.x, y, left.z), new THREE.Vector3(right.x, y, right.z), 0.011, frameMaterial);
    }
  }
}

function addMrd(group, mrdLayers) {
  const {
    absorberCount,
    scintillatorLayerCount,
    layerSpacing,
    absorberThickness,
    scintillatorThickness,
    startZ,
    heightY,
    widthX,
    paddleCountPerLayer,
  } = DETECTOR.mrd;
  const ironMaterial = new THREE.MeshStandardMaterial({
    color: 0x171a1c,
    metalness: 0.55,
    roughness: 0.36,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const ironEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x9aa3a8,
    transparent: true,
    opacity: 0.36,
  });
  const scintillatorMaterial = new THREE.MeshStandardMaterial({
    color: 0x6bd56a,
    emissive: 0x163d18,
    metalness: 0.04,
    roughness: 0.34,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });

  for (let i = 0; i < absorberCount; i += 1) {
    const absorberZ = startZ + i * layerSpacing;
    const absorber = new THREE.Mesh(
      new THREE.BoxGeometry(widthX, heightY, absorberThickness),
      ironMaterial.clone(),
    );
    absorber.position.set(0, DETECTOR.tank.center.y, absorberZ);
    absorber.name = `MRD iron absorber ${i + 1}`;
    group.add(absorber);

    const absorberEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(absorber.geometry),
      ironEdgeMaterial,
    );
    absorberEdges.position.copy(absorber.position);
    absorberEdges.name = `MRD iron absorber outline ${i + 1}`;
    group.add(absorberEdges);

    if (i >= scintillatorLayerCount) {
      continue;
    }

    const scintillatorZ = absorberZ + absorberThickness / 2 + scintillatorThickness / 2 + 0.018;
    const orientation = i % 2 === 0 ? "horizontal" : "vertical";
    const layer = {
      index: i,
      orientation,
      zMeters: scintillatorZ,
      paddles: [],
    };
    const paddleGeometry = orientation === "horizontal"
      ? new THREE.BoxGeometry(widthX, heightY / paddleCountPerLayer * 0.82, scintillatorThickness)
      : new THREE.BoxGeometry(widthX / paddleCountPerLayer * 0.82, heightY, scintillatorThickness);

    for (let paddleIndex = 0; paddleIndex < paddleCountPerLayer; paddleIndex += 1) {
      const paddle = new THREE.Mesh(paddleGeometry, scintillatorMaterial.clone());
      if (orientation === "horizontal") {
        const y = DETECTOR.tank.center.y - heightY / 2 + (paddleIndex + 0.5) * (heightY / paddleCountPerLayer);
        paddle.position.set(0, y, scintillatorZ);
      } else {
        const x = -widthX / 2 + (paddleIndex + 0.5) * (widthX / paddleCountPerLayer);
        paddle.position.set(x, DETECTOR.tank.center.y, scintillatorZ);
      }
      paddle.name = `MRD ${orientation} scintillator ${i + 1}-${paddleIndex + 1}`;
      group.add(paddle);
      layer.paddles.push(paddle);
    }
    mrdLayers.push(layer);
  }
}

function addFrontVeto(group, fmvLayers) {
  const { layers, paddleCountPerLayer, widthX, heightY, paddleThickness, z } = DETECTOR.veto;
  const paddleMaterial = new THREE.MeshStandardMaterial({
    color: 0x4fb4c7,
    emissive: 0x0a2730,
    metalness: 0.05,
    roughness: 0.38,
    transparent: true,
    opacity: 0.82,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x20282c,
    metalness: 0.42,
    roughness: 0.32,
  });

  for (let layer = 0; layer < layers; layer += 1) {
    const layerZ = z - layer * 0.045;
    const orientation = layer === 0 ? "horizontal" : "vertical";
    const layerRecord = { plane: "front", index: layer, orientation, paddles: [] };
    const paddleGeometry = orientation === "horizontal"
      ? new THREE.BoxGeometry(widthX, heightY / paddleCountPerLayer * 0.82, paddleThickness)
      : new THREE.BoxGeometry(widthX / paddleCountPerLayer * 0.82, heightY, paddleThickness);

    for (let i = 0; i < paddleCountPerLayer; i += 1) {
      const paddle = new THREE.Mesh(paddleGeometry, paddleMaterial.clone());
      if (orientation === "horizontal") {
        const y = DETECTOR.tank.center.y - heightY / 2 + (i + 0.5) * (heightY / paddleCountPerLayer);
        paddle.position.set(0, y, layerZ);
      } else {
        const x = -widthX / 2 + (i + 0.5) * (widthX / paddleCountPerLayer);
        paddle.position.set(x, DETECTOR.tank.center.y, layerZ);
      }
      paddle.name = `FMV ${orientation} paddle ${layer + 1}-${i + 1}`;
      group.add(paddle);
      layerRecord.paddles.push(paddle);
    }
    fmvLayers.front.push(layerRecord);
  }

  const frameGeometry = new THREE.BoxGeometry(0.035, heightY, 0.035);
  for (const xPosition of [-widthX / 2, widthX / 2]) {
    const upright = new THREE.Mesh(frameGeometry, frameMaterial);
    upright.position.set(xPosition, DETECTOR.tank.center.y, z + 0.035);
    group.add(upright);
  }
}

function addFiducialVolume(group) {
  const radius = 1.0;
  const height = 1.0;
  const segments = 40;
  const positions = [];
  const indices = [];

  for (let iy = 0; iy <= 1; iy += 1) {
    const y = DETECTOR.tank.center.y - height / 2 + iy * height;
    positions.push(0, y, 0);
    for (let i = 0; i <= segments; i += 1) {
      const angle = Math.PI + (i / segments) * Math.PI;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
  }

  const row = segments + 2;
  for (let i = 1; i <= segments; i += 1) {
    indices.push(0, i, i + 1);
    indices.push(row, row + i + 1, row + i);
    indices.push(i, row + i, i + 1);
    indices.push(i + 1, row + i, row + i + 1);
  }
  indices.push(0, row, 1);
  indices.push(1, row, row + 1);
  indices.push(segments + 1, row + segments + 1, 0);
  indices.push(0, row + segments + 1, row);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0x49ff77,
    emissive: 0x0d3f18,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "ANNIE fiducial volume";
  group.add(mesh);
  return mesh;
}
function addDetectorAxes(group) {
  const origin = new THREE.Vector3(-2.25, 0.15, -2.25);
  const axes = [
    { direction: new THREE.Vector3(1, 0, 0), color: 0xff6f61, label: "+X Transverse" },
    { direction: new THREE.Vector3(0, 1, 0), color: 0x8bd450, label: "+Y Vertical" },
    { direction: new THREE.Vector3(0, 0, 1), color: 0x67b7ff, label: "+Z Beam" },
  ];

  for (const axis of axes) {
    const arrow = new THREE.ArrowHelper(axis.direction, origin, 1.45, axis.color, 0.18, 0.08);
    group.add(arrow);

    const label = makeTextSprite(axis.label, axis.color);
    label.position.copy(origin).add(axis.direction.clone().multiplyScalar(1.72));
    group.add(label);
  }
}

function addGround(scene) {
  const grid = new THREE.GridHelper(9, 18, 0x33404a, 0x242c33);
  scene.add(grid);
}

function buildPmtPositions() {
  const positions = [];
  addCapPmtPositions(positions, "top", getTopY() - 0.045, new THREE.Vector3(0, -1, 0), "T", getTopPmtLayout());
  addCapPmtPositions(positions, "bottom", getBottomY() + 0.045, new THREE.Vector3(0, 1, 0), "B", getBottomPmtLayout());
  addWallPmtPositions(positions);

  return positions;
}

function addCapPmtPositions(positions, surface, y, normal, prefix, layout) {
  for (let i = 0; i < layout.length; i += 1) {
    const [x, z] = layout[i];
    positions.push({
      id: `${prefix}${String(i + 1).padStart(2, "0")}`,
      surface,
      position: new THREE.Vector3(x, y, z),
      normal: normal.clone(),
    });
  }
}

function addWallPmtPositions(positions) {
  const yLevels = getWallPmtYLevels();
  let id = 1;

  for (let row = 0; row < yLevels.length; row += 1) {
    const phase = row % 2 === 0 ? 0 : 0.5;
    for (let column = 0; column < 23; column += 1) {
      const angle = ((column + phase) / 23) * Math.PI * 2;
      positions.push({
        id: `W${String(id).padStart(2, "0")}`,
        surface: "wall-frame",
        position: cylindricalWallPosition(angle, yLevels[row], DETECTOR.tank.radius - 0.07),
        normal: inwardWallNormal(angle),
        sourceApproximation: "even cylindrical wall coverage",
      });
      id += 1;
    }
  }
}

function getTopPmtLayout() {
  return buildEvenCapLayout();
}

function getBottomPmtLayout() {
  return buildEvenCapLayout(Math.PI / 10);
}

function buildEvenCapLayout(phase = 0) {
  const layout = [[0, 0]];
  const rings = [
    { count: 7, radius: 0.45, phase },
    { count: 12, radius: 0.92, phase: phase + Math.PI / 12 },
  ];

  for (const ring of rings) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = ring.phase + (i / ring.count) * Math.PI * 2;
      layout.push([Math.cos(angle) * ring.radius, Math.sin(angle) * ring.radius]);
    }
  }

  return layout;
}

function getSupportFrameDegrees() {
  return Array.from({ length: 12 }, (_, index) => (index / 12) * 360);
}

function getWallPmtYLevels() {
  const bottom = getBottomY() + 0.45;
  const top = getTopY() - 0.45;
  const ringCount = 8;
  return Array.from({ length: ringCount }, (_, index) => bottom + (index / (ringCount - 1)) * (top - bottom));
}

function getTopY() {
  return DETECTOR.tank.center.y + DETECTOR.tank.height / 2;
}

function getBottomY() {
  return DETECTOR.tank.center.y - DETECTOR.tank.height / 2;
}

function cylindricalWallPosition(angle, y, radius) {
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function inwardWallNormal(angle) {
  return new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle)).normalize();
}

function degreesToRadians(degrees) {
  return (degrees / 180) * Math.PI;
}

function addCylinderBetween(group, start, end, radius, material) {
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
  const cylinder = new THREE.Mesh(geometry, material);
  cylinder.position.copy(midpoint);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  group.add(cylinder);
}

function makeTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "600 26px Arial";
  context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.fillText(text, 10, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.25, 0.31, 1);

  return sprite;
}

function resizeRenderer(container, camera, renderer) {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}




