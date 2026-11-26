/* renderer, scene, camera */
import * as THREE from 'three';

const stage = document.getElementById('stage');
const FLAGS = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({
  antialias: true, powerPreference: 'high-performance', stencil: false,
  preserveDrawingBuffer: FLAGS.has('preserve'),   // lets the test harness read back pixels
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, .5, 4200);
const clock = new THREE.Clock();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);

export { renderer, scene, camera, clock, stage, resize };
