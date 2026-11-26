/* small math + geometry helpers shared by every module */
import * as THREE from 'three';

let _seed = 20261126 >>> 0;
const rnd  = () => ((_seed = (_seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr   = (a, b) => a + (b - a) * rnd();
const clamp= (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, oct = 4) { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }

/** normalise a geometry so it can be merged: non-indexed, has normals + vertex colours */
function prep(geo, color) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv'); geo.deleteAttribute('uv1'); geo.deleteAttribute('tangent');
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.color) {
    const c = new THREE.Color(color ?? 0xffffff);
    const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return geo;
}
/** rebuild a geometry's colour attribute from a single tint (keeps other attrs) */
function tint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const mesh = (geo, mat, cast = true, receive = true) => {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
};
function shapeGeo(shape, depth = .06) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
}
/** smooth profile (radius, height) pairs -> Vector2 list for LatheGeometry */
function profile(pts, n) {
  const cv = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], 0)), false, 'catmullrom', .4);
  return cv.getSpacedPoints(n).map(p => new THREE.Vector2(Math.max(.004, p.x), p.y));
}

export { rnd, rr, clamp, smoothstep, lerp, easeInOut, hash2, vnoise, fbm, prep, tint, mesh, shapeGeo, profile };
