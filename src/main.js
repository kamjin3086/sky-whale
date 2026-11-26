/* The Sky Whale — scene assembly, UI wiring, render loop */
import * as THREE from 'three';
import { renderer, scene, camera, clock, resize } from './core.js';
import {
  A, setGoal, isNight, applyAtmos, updateClouds, lightTheWhale, sun, hemi, stars, sky,
} from './atmos.js';
import { whaleRoot, animateWhale, bodyRadiusAt } from './whale.js';
import { village, animate as animateVillage, mill, lighthouse } from './village.js';
import { flock, animate as animateBirds } from './birds.js';
import { createRig } from './controls.js';

const rig = createRig(camera, renderer.domElement, whaleRoot);
const _shadowAnchor = new THREE.Vector3();

/* ---------------- ui ---------------- */
const el = id => document.getElementById(id);
const btnRide = el('btn-ride'), btnSun = el('btn-sunrise'), btnNight = el('btn-night'),
  btnReset = el('btn-reset'), btnHelp = el('help'), fpsEl = el('fps'), bootMsg = el('bootmsg');

function syncButtons() {
  btnRide.classList.toggle('on', rig.S.mode === 'ride');
  btnRide.setAttribute('aria-pressed', String(rig.S.mode === 'ride'));
  btnSun.classList.toggle('on', isNight() === false);
  btnNight.classList.toggle('on', isNight());
}
function setMode(m) { setGoal(m); syncButtons(); return m; }
function setRide(on) { const v = rig.setRide(on); syncButtons(); return v; }

btnRide.addEventListener('click', e => { setRide(rig.S.mode !== 'ride'); e.currentTarget.blur(); });
btnSun.addEventListener('click', e => { setMode('sunrise'); e.currentTarget.blur(); });
btnNight.addEventListener('click', e => { setMode('night'); e.currentTarget.blur(); });
btnReset.addEventListener('click', e => { rig.reset(); e.currentTarget.blur(); });
btnHelp.addEventListener('click', e => { document.body.classList.toggle('showkeys'); e.currentTarget.blur(); });

window.addEventListener('keydown', e => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.code;
  if (k === 'KeyV') setRide(rig.S.mode !== 'ride');
  else if (k === 'Digit1') setMode('sunrise');
  else if (k === 'Digit2') setMode('night');
  else if (k === 'KeyR') rig.reset();
  else if (k === 'KeyH') document.body.classList.toggle('showkeys');
});

renderer.domElement.addEventListener('webglcontextlost', ev => {
  ev.preventDefault();
  bootMsg.textContent = 'The graphics context was lost — reload the page to fly again.';
  document.body.classList.remove('ready');
});

/* ---------------- loop ---------------- */
let frames = 0, fpsWin = 0, fpsFrames = 0, fpsNum = 0, ready = false;
const t0 = performance.now();

/* the sky dome and stars ride with the camera so the horizon never runs out */
function skyFollow() {
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05);
  const t = clock.elapsedTime;

  applyAtmos(dt);
  animateWhale(t, dt);
  animateVillage(dt, t, A);
  animateBirds(t);
  updateClouds(dt, t);

  _shadowAnchor.copy(whaleRoot.position);
  lightTheWhale(_shadowAnchor);

  rig.apply(dt, t);
  skyFollow();
  renderer.render(scene, camera);

  frames++; fpsWin += dt; fpsFrames++;
  if (fpsWin > .5) { fpsNum = Math.round(fpsFrames / fpsWin); fpsEl.textContent = `${fpsNum} fps`; fpsWin = 0; fpsFrames = 0; }
  if (!ready && frames > 2) { ready = true; document.body.classList.add('ready'); }
});

/* ---------------- test surface ---------------- */
const errors = [];
window.addEventListener('error', e => errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + e.reason));

window.__whale = {
  THREE, scene, camera, renderer, rig, whaleRoot, village, mill, lighthouse, flock, A, errors, bodyRadiusAt,
  get ready() { return ready; },
  loadMs: () => Math.round(performance.now() - t0),
  mode: () => (isNight() ? 'night' : 'sunrise'),
  setMode, setRide, reset: () => rig.reset(),
  telemetry() {
    const r = renderer.info.render;
    return {
      ready, frames, mode: this.mode(), ride: rig.S.mode === 'ride',
      fps: fpsNum, errors: errors.length,
      drawCalls: r.calls, tris: r.triangles, programs: renderer.info.programs.length,
      geo: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      whale: [whaleRoot.position.x.toFixed(1), whaleRoot.position.y.toFixed(1), whaleRoot.position.z.toFixed(1)].join(','),
      cam: rig.telemetry(),
      exposure: +A.exposure.toFixed(3), stars: +A.stars.toFixed(3), fog: +scene.fog.density.toFixed(5),
      keyInt: +sun.intensity.toFixed(2), hemiInt: +hemi.intensity.toFixed(2),
      kids: scene.children.length,
    };
  },
};
resize();
export { setMode, setRide };
