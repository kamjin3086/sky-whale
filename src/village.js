/* island + village: merged static geometry, merged windows, animated windmill & lighthouse */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rr, rnd, clamp, smoothstep, prep, mesh, fbm, lerp } from './util.js';
import { whaleRoot, bodyRadiusAt, FLAT, WIDE, headLift } from './whale.js';

/* ---------------- island terrain ---------------- */
const ISL = { sx: 5.4, cx: .9, h: 1.5, y: 2.05, x: .85 };
const PS = 1;
/** half-width of the hull under a point of the island (same ellipse the lathe used) */
const hullHalf = x => Math.max(.6, bodyRadiusAt(x + ISL.x) * WIDE);
/** height of the hull's back under a point of the island */
function hullBackY(x, z) {
  const wx = x + ISL.x, r = bodyRadiusAt(wx);
  const hy = r * FLAT * headLift(wx), hz = r * WIDE;
  return hy * Math.sqrt(Math.max(0, 1 - (Math.min(Math.abs(z), hz) / hz) ** 2));
}
const roughAt = (x, z) => (fbm(x * .9 + 10, z * .9 + 4) - .5) * .3 + (fbm(x * 2.3, z * 2.3, 2) - .5) * .08;
/** meadow radius in hull-relative space: u along the spine, v across the flanks */
const footU = x => (x - ISL.cx) / ISL.sx;
const footV = (x, z) => z / (hullHalf(x) * .9);
const footR = (x, z) => Math.hypot(footU(x), footV(x, z));
/** how far the meadow stands proud of the hull — zero at its edge, so it merges into the skin */
function bumpAt(x, z) {
  const rn = footR(x, z);
  if (rn >= 1) return 0;
  return ISL.h * Math.pow(1 - rn * rn, .5) + roughAt(x, z) * Math.pow(1 - rn, .7);
}
/** ground the village stands on, in the island group's frame */
function islandHeight(x, z) {
  return hullBackY(x, z) + bumpAt(x, z) - ISL.y;
}

const village = new THREE.Group();
village.position.set(0, ISL.y, 0);
whaleRoot.add(village);

function islandGeo() {
  const NU = 64, NV = 26;
  const g = new THREE.PlaneGeometry(1, 1, NU, NV);   // remapped below into hull-relative space
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  let k = 0;
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++, k++) {
      const u = (i / NU * 2 - 1) * 1.3, v = (j / NV * 2 - 1) * 1.12;
      const x = ISL.cx + u * ISL.sx, hh = hullHalf(x);
      const z = clamp(v * hh * .9, -hh * 1.05, hh * 1.05);
      const rn = Math.hypot(u, v);
      const flush = hullBackY(x, z) - ISL.y;
      p.setXYZ(i * 0 + k, x, rn <= 1 ? flush + bumpAt(x, z) : flush - .02 - (rn - 1) * .35, z);
    }
  }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  const gA = new THREE.Color('#84c055'), gB = new THREE.Color('#aada70'), gC = new THREE.Color('#5b9a43');
  const sA = new THREE.Color('#7f7a4f'), sB = new THREE.Color('#63593c'), dirt = new THREE.Color(), c = new THREE.Color();
  const hullCol = new THREE.Color('#7f99ac');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const rn = Math.hypot(footU(x), footV(x, z) / .9);
    const n = fbm(x * 1.6 + 2, z * 1.6 + 8, 3);
    c.copy(gA).lerp(n > .52 ? gB : gC, clamp(Math.abs(n - .5) * 2.1, 0, 1));
    dirt.copy(sA).lerp(sB, clamp(fbm(x * 2.1, z * 2.1, 2) * 1.2 - .1, 0, 1));
    c.lerp(dirt, smoothstep(.80, .97, rn));
    c.lerp(hullCol, smoothstep(.99, 1.05, rn));      // dissolve into the whale
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/* ---------------- shared materials ---------------- */
const buildMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: 0 });
const glassMat = new THREE.MeshStandardMaterial({
  vertexColors: true, color: '#fff3d6', emissive: '#ffca70', emissiveIntensity: .18, roughness: .25, metalness: .1,
});
const lampMat = new THREE.MeshStandardMaterial({ color: '#fff8e6', emissive: '#ffd98a', emissiveIntensity: 1.2, roughness: .4, fog: false });
const beamMat = new THREE.MeshBasicMaterial({
  color: '#ffeec4', vertexColors: true, transparent: true, opacity: .1, depthWrite: false,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
});

const stat = [];      // static, one draw call
const glass = [];     // glowing at night, one draw call

/* ---------------- parts ---------------- */
function gableRoof(w, d, h) {
  const hw = w / 2, hd = d / 2;
  const P = [[-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [hw, h, 0]];
  const tri = [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [1, 2, 5], [3, 0, 4]];
  const pos = [];
  for (const t of tri) for (const i of t) pos.push(...P[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function place(g, x, y, z, rot = 0) { g.rotateY(rot); g.translate(x, y, z); return g; }

function addHouse(x, z, rot, o = {}) {
  x *= PS; z *= PS;
  const w = o.w ?? 1.25, d = o.d ?? 1.0, h = o.h ?? .92, rh = o.rh ?? .6;
  const y = islandHeight(x, z);
  const wall = o.wall ?? '#f7f0e4', roof = o.roof ?? '#c8523e';
  const body = new THREE.BoxGeometry(w, h, d); body.translate(0, h / 2, 0);
  stat.push(place(prep(body, wall), x, y, z, rot));
  const rf = gableRoof(w + .2, d + .2, rh); rf.translate(0, h, 0);
  stat.push(place(prep(rf, roof), x, y, z, rot));
  const door = new THREE.BoxGeometry(.24, .4, .07); door.translate(0, .2, d / 2 + .005);
  stat.push(place(prep(door, '#7d5335'), x, y, z, rot));
  const frame = new THREE.BoxGeometry(.2, .2, .06);
  for (const [ox, oz, ry] of [[-.3, d / 2 + .005, 0], [.3, d / 2 + .005, 0], [w / 2 + .005, 0, Math.PI / 2], [-(w / 2 + .005), 0, Math.PI / 2]]) {
    const f = frame.clone(); f.rotateY(ry); f.translate(ox, h * .64, oz);
    glass.push(place(prep(f, '#ffeec2'), x, y, z, rot));
  }
  if (o.chimney) {
    const ch = new THREE.BoxGeometry(.15, .55, .15); ch.translate(-w * .3, h + rh * .55, -d * .18);
    stat.push(place(prep(ch, '#b6a99a'), x, y, z, rot));
  }
}
function addChurch(x, z, rot) {
  x *= PS; z *= PS;
  const y = islandHeight(x, z);
  const nave = new THREE.BoxGeometry(1.5, 1.05, 1.15); nave.translate(0, .52, 0);
  stat.push(place(prep(nave, '#faf4e8'), x, y, z, rot));
  const roof = gableRoof(1.7, 1.35, .68); roof.translate(0, 1.05, 0);
  stat.push(place(prep(roof, '#b8452f'), x, y, z, rot));
  const tower = new THREE.BoxGeometry(.52, 1.55, .52); tower.translate(0, .78, .1);
  stat.push(place(prep(tower, '#faf4e8'), x, y, z, rot));
  const spire = new THREE.ConeGeometry(.44, .85, 4); spire.translate(0, 1.98, .1); spire.rotateY(Math.PI / 4);
  stat.push(place(prep(spire, '#3f4a5c'), x, y, z, rot));
  const win = new THREE.BoxGeometry(.16, .5, .05); win.translate(0, .95, .27);
  glass.push(place(prep(win, '#ffeec2'), x, y, z, rot));
  const rose = new THREE.CircleGeometry(.11, 10); rose.translate(0, 1.3, .27);
  glass.push(place(prep(rose, '#ffd9a0'), x, y, z, rot));
}
function addTree(x, z, s = 1, kind = 'round') {
  x *= PS; z *= PS;
  const y = islandHeight(x, z), r = rr(0, Math.PI * 2);
  const trunk = new THREE.CylinderGeometry(.06 * s, .1 * s, .55 * s, 6); trunk.translate(0, .27 * s, 0);
  stat.push(place(prep(trunk, '#8a6141'), x, y, z, r));
  if (kind === 'cone') {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry((.42 - i * .1) * s, .5 * s, 8);
      c.translate(0, (.6 + i * .36) * s, 0);
      stat.push(place(prep(c, i % 2 ? '#3f7d3a' : '#478a41'), x, y, z, r));
    }
  } else {
    const puffs = [[0, .78 * s, 0, .4 * s], [.22 * s, .62 * s, .1 * s, .27 * s], [-.2 * s, .66 * s, -.12 * s, .25 * s]];
    for (const [ox, oy, oz, rr2] of puffs) {
      const g = new THREE.IcosahedronGeometry(rr2, 1); g.translate(ox, oy, oz);
      stat.push(place(prep(g, rr() > .5 ? '#5da34a' : '#6fb655'), x, y, z, r));
    }
  }
}
function addRock(x, z, s = 1) {
  x *= PS; z *= PS;
  const g = new THREE.IcosahedronGeometry(.2 * s, 0);
  g.scale(1.3, .8, 1);
  stat.push(place(prep(g, '#9a948a'), x, islandHeight(x, z) - .03, z, rr(0, 6.28)));
}

/* windmill: static tower + spinning sails */
function addWindmill(x, z) {
  x *= PS; z *= PS;
  const y = islandHeight(x, z);
  const rot = .38;
  const base = new THREE.CylinderGeometry(.34, .5, .2, 14); base.translate(0, .1, 0);
  stat.push(place(prep(base, '#b6a99a'), x, y, z, rot));
  const tower = new THREE.CylinderGeometry(.28, .44, 1.95, 16); tower.translate(0, 1.15, 0);
  stat.push(place(prep(tower, '#e8d9bd'), x, y, z, rot));
  const band = new THREE.CylinderGeometry(.31, .33, .1, 14); band.translate(0, 1.55, 0);
  stat.push(place(prep(band, '#a8836a'), x, y, z, rot));
  const cap = new THREE.ConeGeometry(.4, .42, 12); cap.translate(0, 2.32, 0);
  stat.push(place(prep(cap, '#8c4a38'), x, y, z, rot));
  const door = new THREE.BoxGeometry(.18, .32, .05); door.translate(0, .18, .43);
  stat.push(place(prep(door, '#6d4a30'), x, y, z, rot));
  const win = new THREE.BoxGeometry(.14, .14, .05); win.translate(0, 1.2, .33);
  glass.push(place(prep(win, '#ffeec2'), x, y, z, rot));
  const tailvane = new THREE.BoxGeometry(.02, .34, .22); tailvane.translate(0, 2.3, -.36);
  stat.push(place(prep(tailvane, '#8a6141'), x, y, z, rot));

  const yokes = new THREE.Group();
  yokes.position.set(x + Math.sin(rot) * .34, y + 2.28, z + Math.cos(rot) * .34);
  yokes.rotation.y = rot;
  const hubGeo = prep(new THREE.CylinderGeometry(.075, .075, .18, 8).rotateX(Math.PI / 2), '#5c4634');
  yokes.add(mesh(hubGeo, buildMat));
  const sails = new THREE.Group(); yokes.add(sails);
  const bladeGeos = [];
  for (let i = 0; i < 4; i++) {
    const axis = new THREE.BoxGeometry(.08, 1.5, .045); axis.translate(0, .78, 0);
    const latt = new THREE.BoxGeometry(.36, 1.12, .026); latt.translate(.2, .86, 0);
    for (let k = 0; k < 3; k++) {
      const slat = new THREE.BoxGeometry(.42, .05, .03); slat.translate(.2, .5 + k * .34, .02);
      slat.rotateZ(i * Math.PI / 2); slat.translate(0, 0, i % 2 ? .07 : -.07);
      bladeGeos.push(prep(slat, '#cdb78f'));
    }
    const a = prep(axis, '#9c7a52'), b = prep(latt, '#e6dcc4');
    a.rotateZ(i * Math.PI / 2); b.rotateZ(i * Math.PI / 2);
    a.translate(0, 0, i % 2 ? .03 : -.03); b.translate(0, 0, i % 2 ? .05 : -.05);
    bladeGeos.push(a, b);
  }
  const sailMesh = mesh(mergeGeometries(bladeGeos, false), buildMat);
  sails.add(sailMesh);
  village.add(yokes);
  return { sails, yokes };
}

/* lighthouse: banded tower, gallery, lantern, rotating beams */
function addLighthouse(x, z) {
  x *= PS; z *= PS;
  const y = islandHeight(x, z);
  const base = new THREE.CylinderGeometry(.52, .70, .34, 22); base.translate(0, .17, 0);
  stat.push(place(prep(base, '#b3aa9c'), x, y, z));
  const bands = 6, h0 = .34, bh = .48;
  for (let i = 0; i < bands; i++) {
    const rB = lerp(.48, .30, i / bands), rT = lerp(.48, .30, (i + 1) / bands);
    const g = new THREE.CylinderGeometry(rT, rB, bh, 22);
    g.translate(0, h0 + bh * i + bh / 2, 0);
    stat.push(place(prep(g, i % 2 ? '#cf4f3c' : '#f8f4ec'), x, y, z));
  }
  const top = h0 + bh * bands;
  const deck = new THREE.CylinderGeometry(.45, .40, .12, 22); deck.translate(0, top + .06, 0);
  stat.push(place(prep(deck, '#3f4a5c'), x, y, z));
  const rail = new THREE.TorusGeometry(.40, .026, 6, 22);
  rail.rotateX(Math.PI / 2); rail.translate(0, top + .3, 0);
  stat.push(place(prep(rail, '#3f4a5c'), x, y, z));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const p = new THREE.BoxGeometry(.03, .3, .03);
    p.translate(Math.cos(a) * .40, top + .17, Math.sin(a) * .40);
    stat.push(place(prep(p, '#3f4a5c'), x, y, z));
  }
  const lampY = y + top + .42;
  const lantern = new THREE.CylinderGeometry(.26, .29, .52, 16); lantern.translate(0, top + .38, 0);
  glass.push(place(prep(lantern, '#fff0cc'), x, y, z));
  const roof = new THREE.ConeGeometry(.35, .32, 14); roof.translate(0, top + .80, 0);
  stat.push(place(prep(roof, '#3f4a5c'), x, y, z));
  const finial = new THREE.SphereGeometry(.06, 8, 6); finial.translate(0, top + .99, 0);
  stat.push(place(prep(finial, '#d8b04a'), x, y, z));

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), lampMat);
  lamp.position.set(x, lampY, z); village.add(lamp);
  const lampLight = new THREE.PointLight('#ffd98a', .6, 60, 1.5);
  lampLight.position.set(x, lampY, z); village.add(lampLight);

  const beams = new THREE.Group(); beams.position.set(x, lampY, z); village.add(beams);
  for (const s of [1, -1]) {
    const g = new THREE.ConeGeometry(1.15, 10, 22, 1, true);
    g.rotateX(-Math.PI / 2); g.translate(0, 0, 5);
    const n = g.attributes.position.count, col = new Float32Array(n * 4);
    const p = g.attributes.position;
    for (let i = 0; i < n; i++) {
      const t = 1 - clamp(p.getZ(i) / 10, 0, 1);
      col[i * 4] = 1; col[i * 4 + 1] = 1; col[i * 4 + 2] = 1; col[i * 4 + 3] = t * t;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const m = new THREE.Mesh(g, beamMat);
    m.scale.z = s;                                  // two opposite beams
    beams.add(m);
  }
  return { beams, lamp, lampLight };
}

/* picket fence along the front lip */
function addFence() {
  const pts = [];
  for (let i = 0; i <= 34; i++) {
    const th = lerp(.34, 1.32, i / 34);
    const x = ISL.cx + Math.cos(th) * ISL.sx * .95, z = Math.sin(th) * hullHalf(x) * .84;
    pts.push(new THREE.Vector3(x, islandHeight(x, z), z));
  }
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i], nx = pts[Math.min(i + 1, pts.length - 1)];
    const g = new THREE.BoxGeometry(.055, .34, .05);
    g.translate(0, .17, 0);
    stat.push(place(prep(g, '#fbf7ef'), p.x, p.y, p.z, Math.atan2(nx.x - p.x, nx.z - p.z)));
  }
  for (const hy of [.13, .27]) {
    const railPts = pts.map(p => new THREE.Vector3(p.x, p.y + hy, p.z));
    const t = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 40, .024, 5, false);
    stat.push(prep(t, '#fbf7ef'));
  }
}
function addScatter() {
  const tufts = [], flowers = [];
  let placed = 0, guard = 0;
  while (placed < 150 && guard++ < 900) {
    const x = ISL.cx + rr(-1, 1) * ISL.sx * .95, z = rr(-1, 1) * hullHalf(x) * .85;
    if (Math.hypot(footU(x), footV(x, z)) > .9) continue;
    const y = islandHeight(x, z);
    placed++;
    const s = rr(.7, 1.3);
    const g = new THREE.ConeGeometry(.055 * s, .26 * s, 4);
    g.translate(0, .13 * s, 0);
    tufts.push(place(prep(g, rnd() > .5 ? '#6fae4b' : '#84bf59'), x, y, z, rr(0, 6.28)));
    if (placed % 4 === 0) {
      const f = new THREE.SphereGeometry(.05, 6, 5); f.translate(0, .26, 0);
      flowers.push(place(prep(f, ['#f7e07a', '#f6a9c0', '#ffffff', '#ffb26b'][placed % 4]), x + .06, y, z, 0));
    }
  }
  stat.push(...tufts, ...flowers);
  // haystacks + path stones + boulders
  for (const [hx, hz, s] of [[-1.9, 1.8, 1], [2.6, 1.6, .8]]) {
    const h = new THREE.ConeGeometry(.28 * s, .46 * s, 9); h.translate(0, .23 * s, 0);
    stat.push(place(prep(h, '#d7b571'), hx, islandHeight(hx, hz), hz, rr(0, 6)));
  }
  for (let i = 0; i <= 12; i++) {
    const x = lerp(-2.6, 2.8, i / 12) + rr(-.12, .12), z = Math.sin(i * .8) * .42 + .12;
    const s = new THREE.CylinderGeometry(.16, .18, .05, 8); s.translate(0, .02, 0);
    stat.push(place(prep(s, '#c3b8a3'), x, islandHeight(x, z), z, rr(0, 6)));
  }
  for (const [rx, rz, s] of [[-3.3, 1.6, 1.2], [4.3, -1.3, 1], [-3.2, -2.0, .8], [1.4, -2.8, .9]]) addRock(rx, rz, s);
}

/* ---------------- lay it out ---------------- */
stat.push(prep(islandGeo(), '#ffffff'));
const mill = addWindmill(-3.2, -.35);
const lighthouse = addLighthouse(4.25, .5);
addChurch(.3, -1.15, .12);
addHouse(-2.45, .95, -.3, { w: 1.2, d: 1, h: .9, chimney: 1 });
addHouse(-1.35, -.55, .5, { w: 1.05, d: .95, h: .82, roof: '#b8452f', wall: '#efe4d1' });
addHouse(1.5, .85, -.25, { w: 1.3, d: 1.05, h: .96, chimney: 1 });
addHouse(2.45, -.95, .22, { w: 1.1, d: .95, h: .86, wall: '#f3e7d3' });
addHouse(.75, 1.85, .1, { w: .95, d: .9, h: .78, roof: '#a8463a' });
addHouse(-2.9, -1.35, -.6, { w: 1.0, d: .9, h: .8, roof: '#c8523e' });
addHouse(3.15, 1.45, .95, { w: 1.0, d: .9, h: .84, wall: '#efe4d1', chimney: 1 });
addHouse(-.5, .45, -.15, { w: .85, d: .8, h: .72 });
for (const [x, z, s, k] of [
  [-3.4, 1.3, .95, 'round'], [-2.6, 2.0, 1.1, 'round'], [-1.0, 2.4, 1, 'cone'], [1.3, 2.4, .9, 'round'],
  [3.4, -1.6, 1.05, 'cone'], [4.2, -.95, .85, 'round'], [-3.5, -1.7, .95, 'round'], [2.1, -2.0, 1.1, 'round'],
  [.8, -2.4, .85, 'cone'], [-2.3, -2.2, 1, 'round'], [4.1, 1.4, .8, 'round'], [-3.6, .2, .7, 'round'],
]) addTree(x, z, s, k);
addFence();
addScatter();

const staticMesh = mesh(mergeGeometries(stat, false), buildMat);
village.add(staticMesh);
const glassMesh = mesh(mergeGeometries(glass, false), glassMat);
glassMesh.castShadow = false;
village.add(glassMesh);
stat.forEach(g => g.dispose()); glass.forEach(g => g.dispose());

/* ---------------- animation ---------------- */
let windSpeed = .9;
function animate(dt, t, A) {
  mill.sails.rotation.z += dt * windSpeed * (1 + Math.sin(t * .3) * .18);
  lighthouse.beams.rotation.y += dt * .55;
  const pulse = .9 + Math.sin(t * 1.6) * .1;
  glassMat.emissiveIntensity = A.glass;
  beamMat.opacity = A.beam * pulse;
  lampMat.emissiveIntensity = .5 + A.lamp * 1.6 * pulse;
  lighthouse.lampLight.intensity = A.lamp * 26 * pulse;
  lighthouse.lamp.visible = A.lamp > .2;
}

export { village, ISL, islandHeight, animate, buildMat, glassMat, beamMat, lampMat, mill, lighthouse };
