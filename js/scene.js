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
    wallRows: 5,
    wallColumns: 16,
    capRings: [
      { radius: 0, count: 1 },
      { radius: 0.62, count: 8 },
      { radius: 1.12, count: 12 },
    ],
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
  addPmts(group);
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

function addPmts(group) {
  const pmtBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x61d6b6,
    emissive: 0x12382f,
    roughness: 0.45,
  });
  const pmtFaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8f8ff,
    emissive: 0x244f58,
    metalness: 0.1,
    roughness: 0.18,
  });
  const bodyGeometry = new THREE.CylinderGeometry(DETECTOR.pmt.radius, DETECTOR.pmt.radius * 0.72, 0.11, 20);
  const faceGeometry = new THREE.CircleGeometry(DETECTOR.pmt.radius * 0.9, 20);

  for (const pmt of detectorGeometry.pmtPositions) {
    const pmtGroup = new THREE.Group();
    pmtGroup.position.copy(pmt.position);
    pmtGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pmt.normal);

    const body = new THREE.Mesh(bodyGeometry, pmtBodyMaterial);
    body.rotation.x = Math.PI / 2;
    pmtGroup.add(body);

    const face = new THREE.Mesh(faceGeometry, pmtFaceMaterial);
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

function addMrd(group) {
  const { layerCount, layerSpacing, layerThickness, startX, height, widthZ } = DETECTOR.mrd;
  const ironMaterial = new THREE.MeshStandardMaterial({
    color: 0x59626a,
    metalness: 0.55,
    roughness: 0.36,
  });
  const layerGeometry = new THREE.BoxGeometry(layerThickness, height, widthZ);

  for (let i = 0; i < layerCount; i += 1) {
    const layer = new THREE.Mesh(layerGeometry, ironMaterial);
    layer.position.set(startX + i * layerSpacing, DETECTOR.tank.center.y, 0);
    layer.name = `MRD iron layer ${i + 1}`;
    group.add(layer);
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
  const { radius, height, center } = DETECTOR.tank;
  const innerRadius = radius - 0.06;
  const rowSpacing = height / (DETECTOR.pmt.wallRows + 1);
  let id = 1;

  for (let row = 1; row <= DETECTOR.pmt.wallRows; row += 1) {
    const y = center.y - height / 2 + row * rowSpacing;
    const azimuthOffset = row % 2 === 0 ? Math.PI / DETECTOR.pmt.wallColumns : 0;

    for (let column = 0; column < DETECTOR.pmt.wallColumns; column += 1) {
      const angle = (column / DETECTOR.pmt.wallColumns) * Math.PI * 2 + azimuthOffset;
      const normal = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle)).normalize();

      positions.push({
        id: `W${String(id).padStart(3, "0")}`,
        surface: "barrel",
        position: new THREE.Vector3(Math.cos(angle) * innerRadius, y, Math.sin(angle) * innerRadius),
        normal,
      });
      id += 1;
    }
  }

  addCapPmtPositions(positions, "top", center.y + height / 2 - 0.04, new THREE.Vector3(0, -1, 0), "T");
  addCapPmtPositions(positions, "bottom", center.y - height / 2 + 0.04, new THREE.Vector3(0, 1, 0), "B");

  return positions;
}

function addCapPmtPositions(positions, surface, y, normal, prefix) {
  let id = 1;

  for (const ring of DETECTOR.pmt.capRings) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = ring.count === 1 ? 0 : (i / ring.count) * Math.PI * 2;
      positions.push({
        id: `${prefix}${String(id).padStart(3, "0")}`,
        surface,
        position: new THREE.Vector3(Math.cos(angle) * ring.radius, y, Math.sin(angle) * ring.radius),
        normal: normal.clone(),
      });
      id += 1;
    }
  }
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
