/* sky, lights, stars, cloud sea, drifting puffs */
import * as THREE from 'three';
import { fbm, mesh, smoothstep, rr, rnd, clamp, lerp, hash2 } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, renderer } from './core.js';

const C = h => new THREE.Color(h);
const PRESETS = {
  sunrise: {
    skyTop: C('#5f9ad4'), skyMid: C('#ffd9ab'), skyLow: C('#f6c6a0'),
    sunCol: C('#fff2da'), sunSize: 2000, sunDir: new THREE.Vector3(.62, .62, .42).normalize(),
    lightCol: C('#ffeed4'), lightInt: 2.7,
    rimCol: C('#bcd6f4'), rimInt: .42,
    hemiSky: C('#d3e6fa'), hemiGround: C('#eecdae'), hemiInt: .85,
    ambInt: .3, fogCol: C('#f6e6d8'), fogDen: .00118,
    exposure: 1.02, stars: 0, glass: .12, beam: .016, lamp: .4, cloudTint: C('#ffffff'),
    seaDeep: C('#a7b9d8'), seaHigh: C('#ffffff'),
  },
  night: {
    skyTop: C('#050a22'), skyMid: C('#16264e'), skyLow: C('#2b3f68'),
    sunCol: C('#dfe8ff'), sunSize: 3200, sunDir: new THREE.Vector3(-.55, .48, -.55).normalize(),
    lightCol: C('#a9c0f2'), lightInt: 1.5,
    rimCol: C('#4c6ba8'), rimInt: .3,
    hemiSky: C('#35508a'), hemiGround: C('#182543'), hemiInt: .8,
    ambInt: .26, fogCol: C('#1a2748'), fogDen: .00150,
    exposure: 1.06, stars: 1, glass: 2.8, beam: .26, lamp: 3.4, cloudTint: C('#c2d2ee'),
    seaDeep: C('#41567f'), seaHigh: C('#9fb2d6'),
  },
};
/* live atmosphere state, seeded from the opening preset */
const A = {};
for (const key in PRESETS.sunrise) {
  const v = PRESETS.sunrise[key];
  A[key] = (v && v.clone) ? v.clone() : v;
}

/* ---- sky dome ---- */
const skyUni = {
  uTop: { value: A.skyTop }, uMid: { value: A.skyMid }, uLow: { value: A.skyLow },
  uSunCol: { value: A.sunCol }, uSunSize: { value: A.sunSize }, uSunDir: { value: A.sunDir },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1900, 48, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUni,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uLow, uSunCol, uSunDir; uniform float uSunSize;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(uMid, uTop, smoothstep(0.04, 0.62, d.y));
        col = mix(uLow, col, smoothstep(-0.16, 0.10, d.y));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunCol * pow(s, uSunSize) * 3.0;
        col += uSunCol * pow(s, 13.0) * 0.16;
        col += uSunCol * pow(s, 2.2) * 0.05;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
);
sky.frustumCulled = false; sky.renderOrder = -10;
scene.add(sky);
scene.fog = new THREE.FogExp2(A.fogCol.getHex(), A.fogDen);

/* ---- lights ---- */
const hemi = new THREE.HemisphereLight(A.hemiSky, A.hemiGround, A.hemiInt); scene.add(hemi);
const amb  = new THREE.AmbientLight(0xffffff, A.ambInt); scene.add(amb);
const sun  = new THREE.DirectionalLight(A.lightCol, A.lightInt);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = .12; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
const rim = new THREE.DirectionalLight(A.rimCol, A.rimInt); scene.add(rim);

/* ---- stars ---- */
function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  const ctx = c.getContext('2d');
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const starMat = new THREE.PointsMaterial({
  map: starTexture(), size: 2.6 * (renderer.getPixelRatio()), transparent: true,
  depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
});
const starGeo = new THREE.BufferGeometry();
{
  const N = 1400, pos = new Float32Array(N * 3), sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = rr(-1, 1), th = rr(0, Math.PI * 2), r = Math.sqrt(Math.max(0, 1 - u * u));
    const y = Math.abs(u) * .98 + .02;
    pos[i * 3] = Math.cos(th) * r * 1600; pos[i * 3 + 1] = y * 1600; pos[i * 3 + 2] = Math.sin(th) * r * 1600;
    sz[i] = rr(.5, 1);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
}
const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);

const SEA_Y = -19, SEA_SIZE = 4200, SEA_SEG = 200;
function seaHeight(x, z) {
  const h = (fbm(x * .0043 + 11, z * .0043 + 7, 5) - .5) * 21
          + (fbm(x * .021 + 3, z * .021 + 21, 4) - .5) * 8.5
          + (fbm(x * .075 + 40, z * .075 + 12, 2) - .5) * 1.6;
  return h;
}
/** seamless soft-blob texture: summed integer-frequency sinusoids (tiles exactly) */
function cloudTexture(size = 512) {
  const F = [[1, 2], [2, 3], [3, 5], [5, 8], [8, 13], [13, 17]];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const ph = F.map((_, i) => [hash2(i * 3.7, 11.3) * 6.28, hash2(i * 5.1, 2.9) * 6.28, .62 ** i]);
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let n = 0, norm = 0;
      for (let i = 0; i < F.length; i++) {
        const [fx, fy] = F[i], [p1, p2, amp] = ph[i];
        n += amp * .5 * (1 + Math.sin(u * TAU * fx + p1) * Math.cos(v * TAU * fy + p2));
        norm += amp;
      }
      const t = clamp(n / norm, 0, 1), k = .88 + .12 * Math.pow(t, .7);
      const i4 = (y * size + x) * 4;
      d[i4] = 255 * (k * 1.005); d[i4 + 1] = 255 * k; d[i4 + 2] = 255 * (k * .985); d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(4, 4); tex.anisotropy = 4;
  return tex;
}
const seaTex = cloudTexture();
const seaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, map: seaTex });
const seaGeo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEG, SEA_SEG);
seaGeo.rotateX(-Math.PI / 2);
const seaT = new Float32Array(seaGeo.attributes.position.count);   // baked crest factor: cheap recolour later
{
  const p = seaGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = seaHeight(x, z);
    p.setY(i, h);
    seaT[i] = clamp(smoothstep(-11, 9, h) * .85 + (fbm(x * .07, z * .07, 2) - .5) * .18, 0, 1);
  }
  seaGeo.computeVertexNormals();
  seaGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3), 3));
}
const seaTmp = new THREE.Color();
function paintSea() {
  const col = seaGeo.attributes.color;
  for (let i = 0; i < seaT.length; i++) {
    seaTmp.copy(A.seaDeep).lerp(A.seaHigh, seaT[i]);
    col.setXYZ(i, seaTmp.r, seaTmp.g, seaTmp.b);
  }
  col.needsUpdate = true;
}
paintSea();
const seaMesh = new THREE.Mesh(seaGeo, seaMat);
seaMesh.position.y = SEA_Y; seaMesh.receiveShadow = false;
scene.add(seaMesh);

const puffMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0 });
function makePuff(scale) {
  const parts = [];
  const n = 8 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const r = rr(.55, 1.25);
    const g = new THREE.IcosahedronGeometry(r, 2);
    const dx = rr(-2.3, 2.3) * 1.15, dy = rr(-.5, .75), dz = rr(-1.3, 1.3);
    g.scale(1, rr(.66, .96), 1);
    g.translate(dx, dy - Math.abs(dx) * .1, dz);
    // vertical shading: warm-lit top, cool underside
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const top = new THREE.Color('#ffffff'), bot = new THREE.Color('#c3cfe4'), tc = new THREE.Color();
    const cy = dy, rad = r;
    for (let v = 0; v < pos.count; v++) {
      const t = smoothstep(cy - rad, cy + rad * .9, pos.getY(v));
      tc.copy(bot).lerp(top, t);
      col[v * 3] = tc.r; col[v * 3 + 1] = tc.g; col[v * 3 + 2] = tc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    parts.push(g);
  }
  const geo = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  const m = mesh(geo, puffMat, false, false);
  m.scale.setScalar(scale);
  return m;
}
const clouds = [];
function seedClouds() {
  const specs = [
    // [x, y, z, scale]  — big hero clouds high right, medium around, small far
    [-46, 17, 130, 7.5], [78, 26, 150, 9], [135, 12, 60, 6.2], [-120, 8, -40, 8],
    [34, -2, 82, 4.4], [-30, 6, 62, 3.2], [26, 11, 58, 2.6], [-64, 6, -100, 5.5],
    [120, 20, -140, 11], [-180, 14, 110, 12], [200, -4, 30, 9], [-210, 22, -120, 13],
    [66, 34, -30, 6], [-40, 38, -10, 5], [150, 30, 140, 10], [-150, 30, 180, 9],
    [260, 8, -220, 15], [-280, 4, -60, 14], [300, 16, 120, 16], [-90, -6, 220, 10],
    [40, 44, 210, 12], [-240, 40, 40, 13], [180, 42, -60, 11], [12, 50, -160, 10],
    [36, -5, 15, 2.4], [-32, 15, 34, 3.4], [48, 4, 24, 4.2],
  ];
  for (const [x, y, z, s] of specs) {
    const c = makePuff(s);
    c.position.set(x + rr(-8, 8), y + rr(-2, 2), z + rr(-8, 8));
    c.userData = { vx: rr(-.55, .55), vy: rr(-.06, .09), baseY: c.position.y, ph: rr(0, 6.28) };
    scene.add(c); clouds.push(c);
  }
}
seedClouds();

/* ---------------- atmosphere blending + ambient motion ---------------- */
const COLOR_KEYS = ['skyTop', 'skyMid', 'skyLow', 'sunCol', 'lightCol', 'rimCol',
  'hemiSky', 'hemiGround', 'fogCol', 'cloudTint', 'seaDeep', 'seaHigh'];
const NUM_KEYS = ['sunSize', 'lightInt', 'rimInt', 'hemiInt', 'ambInt', 'fogDen',
  'exposure', 'stars', 'glass', 'beam', 'lamp'];

let modeName = 'sunrise';
let goal = PRESETS.sunrise;
let seaDirty = true;

function setGoal(name) {
  if (!PRESETS[name]) return modeName;
  modeName = name; goal = PRESETS[name];
  seaDirty = true;
  document.body.classList.toggle('night', name === 'night');
  return modeName;
}
const isNight = () => modeName === 'night';
const kNight = { v: 0 };

/** ease every live atmosphere value toward the active preset and push it onto the GPU state */
function applyAtmos(dt) {
  const k = 1 - Math.exp(-dt * 2.4);
  for (const key of COLOR_KEYS) A[key].lerp(goal[key], k);
  for (const key of NUM_KEYS) A[key] = lerp(A[key], goal[key], k);
  A.sunDir.lerp(goal.sunDir, k).normalize();
  kNight.v = lerp(kNight.v, isNight() ? 1 : 0, k);

  sun.color.copy(A.lightCol); sun.intensity = A.lightInt;
  rim.color.copy(A.rimCol); rim.intensity = A.rimInt;
  hemi.color.copy(A.hemiSky); hemi.groundColor.copy(A.hemiGround); hemi.intensity = A.hemiInt;
  amb.intensity = A.ambInt;
  scene.fog.color.copy(A.fogCol); scene.fog.density = A.fogDen;
  renderer.toneMappingExposure = A.exposure;
  skyUni.uSunSize.value = A.sunSize;
  starMat.opacity = A.stars;
  puffMat.color.copy(A.cloudTint);
  // repainting 40k cloud-sea vertices is only worth it while values are still moving
  if (seaDirty && Math.abs(A.exposure - goal.exposure) < 1e-4 && Math.abs(A.stars - goal.stars) < 1e-4) {
    paintSea(); seaDirty = false;
  } else if (seaDirty) {
    paintSea();
  }
}

const _cv = new THREE.Vector3();
function updateClouds(dt, t) {
  for (const c of clouds) {
    const u = c.userData;
    c.position.x += u.vx * dt;
    c.position.y = u.baseY + Math.sin(t * .18 + u.ph) * .9;
    if (c.position.x > 420) c.position.x -= 840;
    if (c.position.x < -420) c.position.x += 840;
  }
}

/** keep the key light + shadow frustum centred on the whale wherever it drifts */
function lightTheWhale(anchor) {
  sun.position.copy(anchor).addScaledVector(A.sunDir, 80);
  sun.target.position.copy(anchor);
  sun.target.updateMatrixWorld();
  rim.position.copy(anchor).addScaledVector(A.sunDir, -60).add(_cv.set(0, 40, 0));
}

export {
  PRESETS, A, sky, skyUni, sun, rim, hemi, amb, stars, starMat,
  seaMesh, seaMat, clouds, puffMat, applyAtmos, setGoal, isNight, kNight,
  updateClouds, lightTheWhale, paintSea,
};
