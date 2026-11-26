/* a migrating flock — orbits the whale, flapping wings, banking into the turn */
import * as THREE from 'three';
import { mesh, rr, rnd } from './util.js';
import { whaleRoot } from './whale.js';

const birdMat = new THREE.MeshStandardMaterial({ color: '#2b333f', roughness: .9, metalness: 0, flatShading: true });
const birdDark = new THREE.MeshStandardMaterial({ color: '#1f2632', roughness: .9, metalness: 0 });

function wingGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, .04);
  s.lineTo(1.05, .2);
  s.lineTo(1.0, -.1);
  s.lineTo(.06, -.3);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .02, bevelEnabled: false, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(.16, 0, 0);
  return g;
}
function bodyGeo() {
  const g = new THREE.SphereGeometry(.15, 7, 5);
  g.scale(.9, .78, 2.1);
  return g;
}

const flock = new THREE.Group();
whaleRoot.add(flock);
const birds = [];
const N = 13;
for (let i = 0; i < N; i++) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const b = mesh(bodyGeo(), birdMat, false, false);
  const wl = new THREE.Group(), wr = new THREE.Group();
  wl.add(mesh(wingGeo(), birdDark, false, false));
  wr.add(mesh(wingGeo().rotateY(Math.PI), birdDark, false, false));
  const head = mesh(new THREE.SphereGeometry(.11, 6, 5).scale(1, .9, 1.2), birdMat, false, false);
  head.position.set(0, .01, .3);
  g.add(b, wl, wr, head);
  const idx = i - (N - 1) / 2;                     // loose V, apex leading
  g.scale.setScalar(rr(.46, .66) * (1 - Math.abs(idx) * .018));
  flock.add(g);
  birds.push({
    g, wl, wr, idx,
    bx: idx * 1.15 + rr(-.12, .12),
    by: Math.abs(idx) * .22 + rr(-.2, .2),
    bz: -Math.abs(idx) * .95 - rr(0, .5),
    bob: rr(0, 6.28),
    flap: rr(6.4, 8.4),
    ph: rr(0, 6.28),
  });
}
/* the whole skein wheels slowly above and behind the whale */
const CENTRE = new THREE.Vector3(-1, 7.8, -12), R = 9, W = .17;
function animate(t) {
  const a = t * W;
  flock.position.set(
    CENTRE.x + Math.cos(a) * R,
    CENTRE.y + Math.sin(t * .3) * .8,
    CENTRE.z + Math.sin(a) * R,
  );
  flock.rotation.y = -a + Math.PI;
  for (const b of birds) {
    b.g.position.set(b.bx, b.by + Math.sin(t * .9 + b.bob) * .22, b.bz);
    b.g.rotation.y = Math.sin(t * .5 + b.bob) * .12;
    b.g.rotation.z = Math.sin(t * .6 + b.bob) * .16 - .06;
    b.g.rotation.x = Math.sin(t * .45 + b.bob) * .05;
    const fl = .34 + Math.sin(t * b.flap + b.ph) * .55;
    b.wl.rotation.z = fl;
    b.wr.rotation.z = -fl;
  }
}

export { flock, birds, animate };
