/* geometry diagnostics: bounding boxes + camera from several angles */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 8138, ROOT = process.cwd();
fs.mkdirSync(`${ROOT}/shots`, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 760, height: 460 } });
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto(`http://127.0.0.1:${PORT}/index.html?preserve=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__whale?.ready === true, null, { timeout: 30000 });

const info = await page.evaluate(() => {
  const W = window.__whale, THREE = W.THREE;
  const box = new THREE.Box3();
  const out = [];
  W.whaleRoot.updateMatrixWorld(true);
  W.whaleRoot.traverse(o => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    const n = o.geometry.attributes.position.count;
    const p = o.geometry.attributes.position;
    let sum = [0, 0, 0];
    for (let i = 0; i < Math.min(n, 400); i++) { sum[0] += p.getX(i); sum[1] += p.getY(i); sum[2] += p.getZ(i); }
    out.push({
      name: o.name || o.type, tris: Math.round((o.geometry.index ? o.geometry.index.count : n) / 3),
      local: [b.min, b.max].map(v => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]).flat(),
      centroid: sum.map(v => +(v / Math.min(n, 400)).toFixed(2)),
      vc: !!o.geometry.attributes.color, vcSize: o.geometry.attributes.color?.itemSize,
      mat: o.material.type + (o.material.vertexColors ? '/vc' : ''),
    });
  });
  // sample the radius helper the face/fins are placed with
  const rad = [];
  for (const x of [12, 10, 8, 6, 3, 0, -4, -8, -12]) rad.push([x, W.bodyRadiusAt ? +W.bodyRadiusAt(x).toFixed(2) : null]);
  const wl = W.whaleRoot.children.length;
  return { meshes: out, rad, whaleChildren: wl, whalePos: W.whaleRoot.position.toArray().map(v => +v.toFixed(2)), whaleRot: W.whaleRoot.rotation.order };
});
console.log('whale children:', info.whaleChildren, 'pos', info.whalePos, 'order', info.whaleRot);
console.log('bodyRadiusAt samples:', JSON.stringify(info.rad));
console.table(info.meshes);

const views = [
  ['broadside', [3, 4, 34], Math.PI, -0.05],
  ['from-front', [30, 5, 16], Math.PI / 2 + .5, -0.05],
  ['from-above', [2, 26, 20], Math.PI + .1, -0.85],
  ['tail-close', [-14, 2, 14], Math.PI + 1.15, -0.05],
  ['head-close', [16, 3, 12], Math.PI / 2 + .75, -0.05],
];
for (const [name, pos, yaw, pitch] of views) {
  await page.evaluate(([p, y, pi]) => window.__whale.rig.teleport(p, y, pi), [pos, yaw, pitch]);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${ROOT}/shots/inspect-${name}.png` });
}
await browser.close(); server.kill();
