/* camera rig: free-fly (WASD + drag look + scroll dolly) and a ride-along chase orbit */
import * as THREE from 'three';
import { clamp, lerp, easeInOut } from './util.js';

const HOME = {
  pos: new THREE.Vector3(5.2, 6.8, 27.5),
  yaw: Math.PI + .09,
  pitch: -.10,
  ride: { yaw: .12, pitch: .18, dist: 34 },
};
const UP = new THREE.Vector3(0, 1, 0);

export function createRig(camera, dom, anchorObj) {
  const S = {
    mode: 'free',
    pos: HOME.pos.clone(),
    yaw: HOME.yaw,
    pitch: HOME.pitch,
    vel: new THREE.Vector3(),
    ride: { ...HOME.ride },
    lookAt: new THREE.Vector3(),
    speed: 14,
    tween: null,
    dragging: false,
  };
  const keys = new Set();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  const anchor = new THREE.Vector3(), want = new THREE.Vector3(), tmp = new THREE.Vector3();

  const forward = () => fwd.set(Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), Math.cos(S.yaw) * Math.cos(S.pitch)).normalize();
  const shortest = a => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- pointer: drag to look, two-finger pinch to zoom ---------- */
  const pointers = new Map();
  let lastPinch = 0;
  dom.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { S.dragging = true; dom.setPointerCapture(e.pointerId); }
    dom.style.cursor = 'grabbing';
  });
  dom.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) {
      const v = [...pointers.values()];
      const d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
      if (lastPinch) zoom((lastPinch - d) * .12);
      lastPinch = d;
      return;
    }
    look(dx * .0027, dy * .0027);
  });
  const release = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
    if (pointers.size === 0) { S.dragging = false; dom.style.cursor = 'grab'; }
  };
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', release);
  dom.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY * .028); }, { passive: false });
  dom.style.cursor = 'grab';

  window.addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    keys.add(e.code);
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) { S.tween = null; e.preventDefault(); }
  });
  window.addEventListener('keyup', e => keys.add(e.code) && keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const down = (...c) => c.some(k => keys.has(k));

  function look(dx, dy) {
    S.tween = null;
    if (S.mode === 'ride') {
      S.ride.yaw -= dx;
      S.ride.pitch = clamp(S.ride.pitch + dy, -.5, 1.2);
    } else {
      S.yaw -= dx;
      S.pitch = clamp(S.pitch + dy, -1.42, 1.42);
    }
  }
  function zoom(d) {
    S.tween = null;
    if (S.mode === 'ride') { S.ride.dist = clamp(S.ride.dist * Math.exp(d * .12), 11, 140); return; }
    S.pos.addScaledVector(forward(), -d * Math.max(1.6, S.pos.distanceTo(anchor) * .12));
    clampPos();
  }
  function clampPos() {
    S.pos.y = clamp(S.pos.y, -13, 240);
    S.pos.x = clamp(S.pos.x, -480, 480);
    S.pos.z = clamp(S.pos.z, -480, 480);
  }

  function setRide(on) {
    on = !!on;
    if ((S.mode === 'ride') === on) return on;
    anchorObj.getWorldPosition(anchor);
    if (on) {
      tmp.copy(camera.position).sub(anchor);
      const d = tmp.length();
      S.ride.dist = clamp(d, 27, 120);   // never start inside the whale
      S.ride.pitch = clamp(Math.asin(clamp(tmp.y / d, -1, 1)), -.5, 1.2);
      S.ride.yaw = Math.atan2(tmp.x, tmp.z);
      S.mode = 'ride';
    } else {
      S.pos.copy(camera.position);
      camera.getWorldDirection(tmp);
      S.yaw = Math.atan2(tmp.x, tmp.z);
      S.pitch = clamp(Math.asin(clamp(tmp.y, -1, 1)), -1.42, 1.42);
      S.vel.set(0, 0, 0);
      S.mode = 'free';
    }
    return on;
  }

  function reset() {
    if (S.mode === 'ride') { Object.assign(S.ride, HOME.ride); return; }
    S.vel.set(0, 0, 0);
    S.tween = {
      t: 0, dur: 1.15,
      p0: S.pos.clone(), p1: HOME.pos.clone(),
      y0: S.yaw, y1: S.yaw + shortest(HOME.yaw - S.yaw),
      i0: S.pitch, i1: HOME.pitch,
    };
  }
  function teleport(p, yaw, pitch) {
    S.pos.set(...p); S.yaw = yaw; S.pitch = pitch; S.vel.set(0, 0, 0); S.tween = null;
    S.mode = 'free'; apply(0, 0);
  }

  function apply(dt, t) {
    anchorObj.getWorldPosition(anchor);
    if (S.tween) {                       // easing home owns the camera until it lands
      const k = easeInOut(Math.min(1, (S.tween.t += dt) / S.tween.dur));
      S.pos.lerpVectors(S.tween.p0, S.tween.p1, k);
      S.yaw = lerp(S.tween.y0, S.tween.y1, k);
      S.pitch = lerp(S.tween.i0, S.tween.i1, k);
      S.vel.set(0, 0, 0);
      camera.position.copy(S.pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(tmp.copy(S.pos).add(forward()));
      if (k >= 1) S.tween = null;
      return;
    }
    if (S.mode === 'free') {
      const boost = down('ShiftLeft', 'ShiftRight') ? 3.4 : 1;
      wish.set(0, 0, 0);
      wish.addScaledVector(forward(), (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0));
      wish.addScaledVector(right.crossVectors(fwd, UP).normalize(), (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0));
      wish.y += (down('KeyE') ? 1 : 0) - (down('KeyQ') ? 1 : 0);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(S.speed * boost);
      S.vel.lerp(wish, 1 - Math.exp(-dt * 7));
      if (dt > 0) S.pos.addScaledVector(S.vel, dt);
      clampPos();
      camera.position.copy(S.pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(tmp.copy(S.pos).add(fwd));
    } else {
      if (down('KeyW', 'KeyS')) S.ride.dist = clamp(S.ride.dist * (1 - ((down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0)) * dt * 1.1), 11, 140);
      if (down('KeyA', 'KeyD')) S.ride.yaw += ((down('KeyA') ? 1 : 0) - (down('KeyD') ? 1 : 0)) * dt * .8;
      if (down('KeyQ', 'KeyE')) S.ride.pitch = clamp(S.ride.pitch + ((down('KeyE') ? 1 : 0) - (down('KeyQ') ? 1 : 0)) * dt * .6, -.5, 1.2);
      const cp = Math.cos(S.ride.pitch);
      want.set(Math.sin(S.ride.yaw) * cp, Math.sin(S.ride.pitch), Math.cos(S.ride.yaw) * cp)
        .multiplyScalar(S.ride.dist).add(anchor);
      want.y += Math.sin(t * .34) * .55;                    // breathe with the whale
      camera.position.lerp(want, 1 - Math.exp(-dt * 4.2));
      S.lookAt.lerp(tmp.copy(anchor).setY(anchor.y + .6), 1 - Math.exp(-dt * 5));
      camera.up.set(0, 1, 0);
      camera.lookAt(S.lookAt);
    }
  }

  const telemetry = () => ({
    mode: S.mode,
    cam: [+camera.position.x.toFixed(2), +camera.position.y.toFixed(2), +camera.position.z.toFixed(2)],
    dir: (() => { const d = camera.getWorldDirection(new THREE.Vector3()); return [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)]; })(),
    yaw: +S.yaw.toFixed(3), pitch: +S.pitch.toFixed(3), ride: { ...S.ride },
    speed: +S.vel.length().toFixed(2), dragging: S.dragging, tween: !!S.tween,
    pos: [+S.pos.x.toFixed(2), +S.pos.y.toFixed(2), +S.pos.z.toFixed(2)],
  });

  apply(0, 0);
  return { S, apply, setRide, reset, teleport, telemetry, look, zoom, keys };
}
