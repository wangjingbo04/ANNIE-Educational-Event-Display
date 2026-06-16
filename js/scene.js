import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function initScene({ container, onReady }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0f12);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(5, 4, 7);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.7, 0);

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

  const tankGeometry = new THREE.CylinderGeometry(1.55, 1.55, 3.2, 64, 1, true);
  const tankMaterial = new THREE.MeshStandardMaterial({
    color: 0x6d8795,
    metalness: 0.35,
    roughness: 0.32,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
  });
  const tank = new THREE.Mesh(tankGeometry, tankMaterial);
  tank.position.y = 1.6;
  group.add(tank);

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3c96b,
    metalness: 0.7,
    roughness: 0.2,
  });

  const topRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.035, 16, 96), ringMaterial);
  topRing.position.y = 3.2;
  topRing.rotation.x = Math.PI / 2;
  group.add(topRing);

  const bottomRing = topRing.clone();
  bottomRing.position.y = 0;
  group.add(bottomRing);

  const sphereMaterial = new THREE.MeshStandardMaterial({
    color: 0x61d6b6,
    emissive: 0x12382f,
    roughness: 0.45,
  });
  const sensorGeometry = new THREE.SphereGeometry(0.08, 16, 16);

  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    const sensor = new THREE.Mesh(sensorGeometry, sphereMaterial);
    sensor.position.set(Math.cos(angle) * 1.58, 1.6, Math.sin(angle) * 1.58);
    group.add(sensor);
  }

  const axis = new THREE.AxesHelper(2.4);
  axis.position.set(-2.35, 0.02, -2.1);
  group.add(axis);

  scene.add(group);
}

function addGround(scene) {
  const grid = new THREE.GridHelper(8, 16, 0x33404a, 0x242c33);
  scene.add(grid);
}

function resizeRenderer(container, camera, renderer) {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
