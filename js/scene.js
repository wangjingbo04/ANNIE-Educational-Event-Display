import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DETECTOR = {
  tank: {
    radius: 1.5,
    height: 3.7,
    center: new THREE.Vector3(0, 1.85, 0),
  },
  pmt: {
    radius: 0.105,
  },
  lappd: {
    width: 0.42,
    height: 0.42,
    depth: 0.045,
  },
  mrd: {
    layerCount: 7,
    layerSpacing: 0.28,
    layerThickness: 0.1,
    startX: 2.45,
    height: 3.4,
    widthZ: 3.4,
  },
};

export const detectorGeometry = {
  tank: {
    diameterMeters: DETECTOR.tank.radius * 2,
    heightMeters: DETECTOR.tank.height,
  },
  coordinateSystem: {
    beam: "+X",
    vertical: "+Y",
    horizontalTransverse: "+Z",
  },
  pmtPositions: buildPmtPositions(),
  lappdPositions: buildLappdPositions(),
};

export function initScene({ container, onReady }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0f12);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(6.1, 4.6, 6.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(1.35, 1.65, 0);

  addLighting(scene);
  addDetectorModel(scene);
  addGround(scene);

  const resizeObserver = new ResizeObserver(() => {
    resizeRenderer(container, camera, renderer);
  });
  resizeObserver.observe(container);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  resizeRenderer(container, camera, renderer);
  animate();
  onReady?.();
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

  addWaterTank(group);
  addCapSupportArrays(group);
  addWallPmtSupportFrames(group);
  addPmts(group);
  addLappds(group);
  addMrd(group);
  addDetectorAxes(group);

  scene.add(group);
}

function addWaterTank(group) {
  const { radius, height, center } = DETECTOR.tank;
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

  const topRing = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 16, 96), frameMaterial);
  topRing.position.set(center.x, center.y + height / 2, center.z);
  topRing.rotation.x = Math.PI / 2;
  group.add(topRing);

  const bottomRing = topRing.clone();
  bottomRing.position.y = center.y - height / 2;
  group.add(bottomRing);

  const sideLineGeometry = new THREE.CylinderGeometry(0.012, 0.012, height, 12);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const line = new THREE.Mesh(sideLineGeometry, frameMaterial);
    line.position.set(Math.cos(angle) * radius, center.y, Math.sin(angle) * radius);
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

  const bottomPlate = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.055, 1.95), bottomMaterial);
  bottomPlate.position.set(0, getBottomY() + 0.13, 0);
  bottomPlate.name = "bottom PMT support platform";
  group.add(bottomPlate);

  const tileMaterialA = new THREE.MeshStandardMaterial({ color: 0x121719, roughness: 0.58 });
  const tileMaterialB = new THREE.MeshStandardMaterial({ color: 0x5f6c72, roughness: 0.48 });
  for (let ix = -2; ix <= 2; ix += 1) {
    for (let iz = -2; iz <= 2; iz += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.012, 0.34),
        (ix + iz) % 2 === 0 ? tileMaterialA : tileMaterialB,
      );
      tile.position.set(ix * 0.34, getBottomY() + 0.165, iz * 0.34);
      group.add(tile);
    }
  }
}

function addPmts(group) {
  const materials = {
    wall: makePmtMaterials(0x1359ff, 0xaed2ff, 0x071c63),
    top: makePmtMaterials(0xff4f4f, 0xffb0a0, 0x601818),
    bottom: makePmtMaterials(0x1148d7, 0xa9d4ff, 0x07184d),
  };
  const bodyGeometry = new THREE.CylinderGeometry(DETECTOR.pmt.radius, DETECTOR.pmt.radius * 0.72, 0.11, 20);
  const faceGeometry = new THREE.CircleGeometry(DETECTOR.pmt.radius * 0.9, 20);

  for (const pmt of detectorGeometry.pmtPositions) {
    const materialKey = pmt.surface === "top" ? "top" : pmt.surface === "bottom" ? "bottom" : "wall";
    const pmtGroup = new THREE.Group();
    pmtGroup.position.copy(pmt.position);
    pmtGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pmt.normal);

    const body = new THREE.Mesh(bodyGeometry, materials[materialKey].body);
    body.rotation.x = Math.PI / 2;
    pmtGroup.add(body);

    const face = new THREE.Mesh(faceGeometry, materials[materialKey].face);
    face.position.z = 0.058;
    pmtGroup.add(face);

    pmtGroup.userData = {
      id: pmt.id,
      positionMeters: pmt.position.toArray(),
      normal: pmt.normal.toArray(),
      surface: pmt.surface,
    };
    group.add(pmtGroup);
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

function addLappds(group) {
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x0c5f25,
    metalness: 0.15,
    roughness: 0.28,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x31ff55,
    emissive: 0x0f7a22,
    roughness: 0.12,
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x9bff8c,
    metalness: 0.45,
    roughness: 0.22,
  });
  const panelGeometry = new THREE.BoxGeometry(DETECTOR.lappd.width, DETECTOR.lappd.height, DETECTOR.lappd.depth);
  const windowGeometry = new THREE.PlaneGeometry(DETECTOR.lappd.width * 0.78, DETECTOR.lappd.height * 0.78);

  for (const lappd of detectorGeometry.lappdPositions) {
    const panelGroup = new THREE.Group();
    panelGroup.position.copy(lappd.position);
    panelGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), lappd.normal);

    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panelGroup.add(panel);

    const window = new THREE.Mesh(windowGeometry, windowMaterial);
    window.position.z = DETECTOR.lappd.depth / 2 + 0.002;
    panelGroup.add(window);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(DETECTOR.lappd.width * 1.15, DETECTOR.lappd.height * 1.15, DETECTOR.lappd.depth * 0.35),
      frameMaterial,
    );
    frame.position.z = -DETECTOR.lappd.depth * 0.12;
    panelGroup.add(frame);

    panelGroup.userData = {
      id: lappd.id,
      positionMeters: lappd.position.toArray(),
      normal: lappd.normal.toArray(),
      surface: lappd.surface,
    };
    group.add(panelGroup);
  }
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
  const frameAngles = [22, 78, 145, 212, 287].map(degreesToRadians);
  const yLevels = [0.62, 1.28, 1.98, 2.72, 3.26];
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

function addMrd(group) {
  const { layerCount, layerSpacing, layerThickness, startX, height, widthZ } = DETECTOR.mrd;
  const ironMaterial = new THREE.MeshStandardMaterial({
    color: 0x171a1c,
    metalness: 0.55,
    roughness: 0.36,
  });
  const tubeMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a4e50,
    metalness: 0.25,
    roughness: 0.34,
  });
  const layerGeometry = new THREE.BoxGeometry(layerThickness, height, widthZ);
  const tubeGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.38, 12);

  for (let i = 0; i < layerCount; i += 1) {
    const layer = new THREE.Mesh(layerGeometry, ironMaterial);
    layer.position.set(startX + i * layerSpacing, DETECTOR.tank.center.y, 0);
    layer.name = `MRD iron layer ${i + 1}`;
    group.add(layer);

    for (let iy = 0; iy < 9; iy += 1) {
      for (let iz = 0; iz < 8; iz += 1) {
        if ((iy + iz + i) % 3 === 0) {
          const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
          tube.rotation.z = Math.PI / 2;
          tube.position.set(
            layer.position.x - layerThickness / 2 - 0.08,
            DETECTOR.tank.center.y - height / 2 + 0.32 + iy * 0.34,
            -widthZ / 2 + 0.3 + iz * 0.39,
          );
          group.add(tube);
        }
      }
    }
  }
}

function addDetectorAxes(group) {
  const origin = new THREE.Vector3(-2.25, 0.15, -2.25);
  const axes = [
    { direction: new THREE.Vector3(1, 0, 0), color: 0xff6f61, label: "+X Beam" },
    { direction: new THREE.Vector3(0, 1, 0), color: 0x8bd450, label: "+Y Vertical" },
    { direction: new THREE.Vector3(0, 0, 1), color: 0x67b7ff, label: "+Z Transverse" },
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
  const frameLayouts = [
    { angle: 24, ys: [0.74, 1.42, 2.12, 2.88], offsets: [-0.09, 0.1, -0.06, 0.08] },
    { angle: 82, ys: [0.92, 1.68, 2.36, 3.08], offsets: [0.08, -0.08, 0.11, -0.05] },
    { angle: 151, ys: [0.66, 1.28, 2.02, 2.76], offsets: [0.05, -0.1, 0.08, -0.07] },
    { angle: 227, ys: [0.98, 1.58, 2.2, 3.0], offsets: [-0.08, 0.06, -0.11, 0.08] },
    { angle: 304, ys: [0.78, 1.5, 2.32, 2.94], offsets: [0.1, -0.06, 0.05, -0.09] },
  ];
  let id = 1;

  for (const frame of frameLayouts) {
    const baseAngle = degreesToRadians(frame.angle);
    for (let i = 0; i < frame.ys.length; i += 1) {
      const angle = baseAngle + frame.offsets[i];
      positions.push({
        id: `W${String(id).padStart(2, "0")}`,
        surface: "wall-frame",
        position: cylindricalWallPosition(angle, frame.ys[i], DETECTOR.tank.radius - 0.07),
        normal: inwardWallNormal(angle),
        supportFrameDegrees: frame.angle,
      });
      id += 1;
    }
  }
}

function buildLappdPositions() {
  const layout = [
    { id: "LAPPD01", angle: 58, y: 1.16 },
    { id: "LAPPD02", angle: 111, y: 2.5 },
    { id: "LAPPD03", angle: 196, y: 1.8 },
    { id: "LAPPD04", angle: 266, y: 2.72 },
    { id: "LAPPD05", angle: 326, y: 1.2 },
  ];

  return layout.map((panel) => {
    const angle = degreesToRadians(panel.angle);
    return {
      id: panel.id,
      surface: "wall-lappd",
      position: cylindricalWallPosition(angle, panel.y, DETECTOR.tank.radius - 0.045),
      normal: inwardWallNormal(angle),
      widthMeters: DETECTOR.lappd.width,
      heightMeters: DETECTOR.lappd.height,
    };
  });
}

function getTopPmtLayout() {
  return [
    [0, 0],
    [-0.42, -0.24],
    [0.42, -0.24],
    [-0.42, 0.24],
    [0.42, 0.24],
    [0, -0.58],
    [0, 0.58],
    [-0.82, -0.58],
    [0.82, -0.58],
    [-0.82, 0],
    [0.82, 0],
    [-0.82, 0.58],
    [0.82, 0.58],
    [0.32, 1.03],
  ];
}

function getBottomPmtLayout() {
  return [
    [0.12, -0.04],
    [-0.35, -0.34],
    [0.54, -0.34],
    [-0.52, 0.18],
    [0.36, 0.28],
    [-0.06, -0.72],
    [0.1, 0.72],
    [-0.94, -0.44],
    [0.74, -0.64],
    [-0.88, 0.38],
    [0.92, 0.08],
    [-0.58, 0.78],
    [0.68, 0.76],
    [-0.12, 1.08],
  ];
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
