/* the sky whale: lathed body, hinged tail, fins, face */
import * as THREE from 'three';
import { profile, mesh, tint, shapeGeo, smoothstep, lerp, fbm, clamp } from './util.js';
import { scene } from './core.js';

const whaleRoot = new THREE.Group(); scene.add(whaleRoot);
const whaleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0 });
const skinMat  = new THREE.MeshStandardMaterial({ color: '#8ba5b8', roughness: .84, metalness: 0 });
const skinDark = new THREE.MeshStandardMaterial({ color: '#5f7d95', roughness: .8, metalness: 0 });
const bellyMat = new THREE.MeshStandardMaterial({ color: '#efe6d5', roughness: .82, metalness: 0 });
const eyeMat   = new THREE.MeshStandardMaterial({ color: '#131a21', roughness: .3, metalness: .1 });
const glossMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .1, emissive: '#ffffff', emissiveIntensity: .5 });
const lineMat  = new THREE.MeshStandardMaterial({ color: '#3c4b58', roughness: .75 });

/* (radius, axial) profile — blunt heavy head forward at +X, thin tail stock at -X */
const BODY = [
  [.004, 14.6], [2.30, 14.35], [3.45, 13.75], [4.20, 12.85], [4.66, 11.65], [4.90, 10.10],
  [5.00, 8.20], [5.02, 6.00], [4.92, 3.80], [4.66, 1.60], [4.22,-0.60], [3.60,-2.90],
  [2.86,-5.10], [2.14,-7.10], [1.58,-8.90], [1.20,-10.40], [0.96,-11.70], [0.84,-12.80],
];
const FLAT = .74, WIDE = 1.0;
/** the head is deliberately blocky (sperm-whale silhouette) */
const headLift = x => 1 + .13 * smoothstep(5, 13.5, x);
function bodyRadiusAt(x) {
  const p = BODY;
  if (x >= p[0][1]) return p[0][0];
  for (let i = 0; i < p.length - 1; i++) {
    const [r0, x0] = p[i], [r1, x1] = p[i + 1];
    if (x <= x0 && x >= x1) return lerp(r1, r0, clamp((x - x1) / ((x0 - x1) || 1), 0, 1));
  }
  return p[p.length - 1][0];
}
/** point on the body surface: ang measured from the top (+Y) around toward +Z */
function bodySurface(x, ang, k = 1) {
  const r = bodyRadiusAt(x) * k;
  return new THREE.Vector3(x, Math.cos(ang) * r * FLAT * headLift(x), Math.sin(ang) * r * WIDE);
}
function countershade(geo, backHex, deepHex, bellyHex) {
  const p = geo.attributes.position, n = p.count;
  const back = new THREE.Color(backHex), deep = new THREE.Color(deepHex), belly = new THREE.Color(bellyHex), c = new THREE.Color();
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const q = y / FLAT, r = Math.hypot(q, z / WIDE) || 1e-4, nv = q / r;
    const throat = smoothstep(7, 14, x) * .55;                 // pale jaw wraps up the snout
    const band = smoothstep(-.80 + throat, .18 + throat, nv);  // cream belly, slate back
    c.copy(belly).lerp(back, band);
    c.lerp(deep, smoothstep(-5, -12.5, x) * .45 * band);       // deeper tail stock
    c.offsetHSL(0, 0, (fbm(x * .3 + 5, (Math.abs(z) + Math.abs(q)) * .28 + 9, 3) - .5) * .045);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* body */
const bodyGeo = new THREE.LatheGeometry(profile([...BODY].reverse(), 64), 64);
bodyGeo.rotateZ(-Math.PI / 2); bodyGeo.scale(1, FLAT, WIDE);
{   // lift the crown through the head, then rebuild the smooth normals
  const p = bodyGeo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * headLift(p.getX(i)));
  bodyGeo.computeVertexNormals();
}
countershade(bodyGeo, '#8ba5b8', '#6b8aa3', '#f5ecd9');
whaleRoot.add(mesh(bodyGeo, whaleMat));

/* low dorsal hump behind the village */
{
  const g = new THREE.SphereGeometry(1, 20, 14);
  g.scale(2.2, .58, .6); g.translate(-8.8, .85, 0);
  whaleRoot.add(mesh(g, skinMat));
}

/* tail: hinges inside the body so the fluke swing never cracks the seam */
const tail = new THREE.Group(); tail.position.set(-12.1, 0, 0); whaleRoot.add(tail);
{
  const ped = new THREE.LatheGeometry(profile([[.62, -4.4], [.66, -3.8], [.72, -2.9], [.82, -1.7], [.90, -.4], [.98, .8]], 26), 28);
  ped.rotateZ(-Math.PI / 2); ped.scale(1, FLAT, WIDE);
  tint(ped, '#5f7d94');
  tail.add(mesh(ped, whaleMat.clone()));
}
/* pair the geometry so shape-x → hull width (Z), shape-y → hull length (X), thickness → Y */
const FLAT_BASIS = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
function flukeGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, .3);
  s.bezierCurveTo(2.1, -.1, 4.2, .5, 5.9, 2.5);
  s.bezierCurveTo(4.0, 2.2, 1.9, 1.15, 0, 1.35);
  s.bezierCurveTo(-1.9, 1.15, -4.0, 2.2, -5.6, 2.4);
  s.bezierCurveTo(-4.2, .5, -2.1, -.1, 0, .3);
  const g = shapeGeo(s, .5);
  g.applyMatrix4(FLAT_BASIS); g.translate(0, -.25, 0); g.rotateY(Math.PI);
  return g;
}
{
  const bar = new THREE.Group(); bar.position.set(-4.15, -.1, 0); bar.rotation.z = .42;
  for (const side of [1, -1]) {
    const f = mesh(flukeGeo(), skinDark);
    f.scale.z = side;
    f.rotation.z = -.07;
    bar.add(f);
  }
  tail.add(bar);
}
/* pectoral fins: big, low, swept back */
function finGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, .18);
  s.bezierCurveTo(1.0, -.1, 2.5, -1.0, 3.6, -2.9);
  s.bezierCurveTo(2.6, -3.3, 1.0, -2.3, 0, -.85);
  s.closePath();
  const g = shapeGeo(s, .34);
  g.applyMatrix4(FLAT_BASIS); g.translate(0, -.17, 0);
  return g;
}
const pecs = [];
for (const side of [1, -1]) {
  const pivot = new THREE.Group();
  pivot.position.copy(bodySurface(3.4, 2.05));
  pivot.rotation.y = side * 1.05;
  const fin = mesh(finGeo(), skinDark);
  fin.scale.z = side;
  fin.rotation.x = -.45;
  pivot.add(fin); whaleRoot.add(pivot);
  pecs.push({ pivot, fin, side });
}
/* face: small eye with a highlight, gentle smile, blowhole */
{
  for (const side of [1, -1]) {
    const p = bodySurface(10.2, 1.62, 1.0);
    const e = mesh(new THREE.SphereGeometry(.26, 16, 12), eyeMat);
    e.scale.set(.8, 1, .45); e.position.copy(p); whaleRoot.add(e);
    const hl = mesh(new THREE.SphereGeometry(.07, 8, 6), glossMat, false, false);
    hl.position.copy(p).add(new THREE.Vector3(.14, .13, .1 * side)); whaleRoot.add(hl);
  }
  for (const side of [1, -1]) {
    const pts = [[13.25, 1.84], [12.3, 1.95], [11.0, 2.03], [9.6, 2.09], [8.1, 2.13]]
      .map(([x, a]) => { const v = bodySurface(x, a, 1.006); return new THREE.Vector3(v.x, v.y, v.z * side); });
    if (side < 0) pts.reverse();
    whaleRoot.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, .075, 6, false), lineMat, false, false));
  }
  const bh = bodySurface(12.2, .07, 1.005);
  const bhM = mesh(new THREE.SphereGeometry(.24, 10, 8), lineMat, false, false);
  bhM.scale.set(1.6, .35, .85); bhM.position.copy(bh).setY(bh.y + .05); whaleRoot.add(bhM);
}

/* ---------------- motion: slow drift on a big circle, tail sweep, fin sway ---------------- */
whaleRoot.rotation.order = 'YXZ';
const PATH = { R: 16, T: 300, PHI: -Math.PI / 2 + .18 };   // PHI puts the whale broadside to the opening shot
const _prev = new THREE.Vector3();
let whaleSpeed = 0;
function animateWhale(t, dt) {
  const a = PATH.PHI + (t / PATH.T) * Math.PI * 2;
  _prev.copy(whaleRoot.position);
  whaleRoot.position.set(
    Math.cos(a) * PATH.R,
    Math.sin(t * .34) * 1.05 + Math.sin(t * .12 + 1.7) * .5,
    PATH.R + Math.sin(a) * PATH.R,
  );
  whaleSpeed = dt > 0 ? _prev.distanceTo(whaleRoot.position) / dt : whaleSpeed;
  const dx = -Math.sin(a), dz = Math.cos(a);
  whaleRoot.rotation.y = Math.atan2(-dz, dx);
  whaleRoot.rotation.x = Math.sin(t * .34 + 1.1) * .02;
  whaleRoot.rotation.z = Math.sin(t * .27 + .5) * .028;
  tail.rotation.z = -.1 + Math.sin(t * 1.05) * .12;
  tail.position.y = Math.sin(t * 1.05 + .6) * .16;
  for (const p of pecs) p.fin.rotation.x = -.45 + Math.sin(t * .8 + (p.side > 0 ? 0 : 1.2)) * .06;
}
animateWhale(0, 0);

export {
  whaleRoot, tail, pecs, animateWhale, bodySurface, bodyRadiusAt, FLAT, WIDE, headLift,
  whaleMat, skinMat, skinDark, bellyMat, eyeMat, lineMat,
};
