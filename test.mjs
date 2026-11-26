/* Playwright acceptance run for the Sky Whale scene.
   node test.mjs            → full pass, writes shots/*.png
   node test.mjs home       → only the opening shot
*/
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8137, ROOT = process.cwd();
const ONLY = process.argv[2] || '';
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const fails = [], notes = [];
const ok = (cond, msg, extra = '') => {
  (cond ? notes : fails).push(`${cond ? 'PASS' : 'FAIL'} ${msg}${extra ? ' :: ' + extra : ''}`);
  return cond;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
  { cwd: ROOT, stdio: 'ignore' });
await sleep(700);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 562 }, deviceScaleFactor: 1 });

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('requestfailed', r => consoleErrors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) consoleErrors.push(`http ${r.status()}: ${r.url()}`); });

const tele = () => page.evaluate(() => window.__whale?.telemetry?.() ?? null);
async function shot(name) {
  const p = path.join(SHOTS, name + '.png');
  await page.screenshot({ path: p });
  return p;
}
/** average luminance of a screenshot region, sampled in-page from the live canvas */
async function brightness(x, y, w, h) {
  return page.evaluate(async ([x, y, w, h]) => {
    const c = document.querySelector('canvas');
    const bmp = await createImageBitmap(c);
    const cv = new OffscreenCanvas(w, h), ctx = cv.getContext('2d');
    ctx.drawImage(bmp, x, y, w, h, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
    return +(s / (d.length / 4)).toFixed(1);
  }, [x, y, w, h]);
}

try {
  await page.goto(`http://127.0.0.1:${PORT}/index.html?preserve=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__whale?.ready === true, null, { timeout: 30000 });
  const first = await tele();
  ok(!!first, 'telemetry available');
  ok(first.errors === 0, 'no in-page errors', JSON.stringify(await page.evaluate(() => window.__whale.errors)));
  ok(first.drawCalls > 5, 'scene rendered', `calls=${first.drawCalls} tris=${first.tris}`);
  ok(first.tris > 5000, 'geometry present', `tris=${first.tris}`);
  ok(first.mode === 'sunrise', 'opens in sunrise mode', first.mode);
  ok(first.programs > 2, 'shaders compiled', `programs=${first.programs}`);
  notes.push(`load: frames=${first.frames} drawCalls=${first.drawCalls} tris=${first.tris} programs=${first.programs} geo=${first.geo} kids=${first.kids}`);

  await sleep(1200);
  const warm = await tele();
  ok(warm.fps > 5, 'animation loop runs', `fps=${warm.fps}`);

  if (!ONLY || ONLY === 'home') {
    await shot('01-home');
    const skyTop = await brightness(600, 40, 200, 60);
    const low = await brightness(120, 470, 200, 60);
    ok(skyTop > 100, 'sky is bright at sunrise', `lum=${skyTop}`);
    ok(low > skyTop * .8, 'cloud sea is lit below', `lum=${low}`);
    ok((await page.evaluate(() => document.querySelector('#panel').getBoundingClientRect().width)) > 200, 'control panel visible');
  }

  if (!ONLY || ONLY === 'fly') {
    const before = await tele();
    await page.mouse.move(450, 300); await page.mouse.down();
    await page.mouse.move(610, 250, { steps: 12 }); await page.mouse.up();
    await page.keyboard.down('KeyD'); await sleep(600); await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyE'); await sleep(350); await page.keyboard.up('KeyE');
    await page.mouse.wheel(0, -300); await sleep(400);
    const after = await tele();
    ok(after.cam.yaw !== before.cam.yaw, 'drag looks around', `yaw ${before.cam.yaw}→${after.cam.yaw}`);
    ok(after.cam.pos[2] !== before.cam.pos[2] || after.cam.pos[0] !== before.cam.pos[0], 'WASD flies the camera',
      `pos ${before.cam.pos}→${after.cam.pos}`);
    ok(after.cam.pos[0] !== before.cam.pos[0] || after.cam.pos[1] !== before.cam.pos[1], 'scroll dollies',
      `pos ${after.cam.pos}`);
    await shot('02-flown');
  }

  if (!ONLY || ONLY === 'close') {
    // fly in on the village: props have to hold up when the user gets close
    await page.evaluate(() => window.__whale.rig.teleport([9.5, 8.5, 15.5], Math.PI + .5, -.26));
    await sleep(600);
    await shot('06-village-close');
    await page.evaluate(() => window.__whale.rig.teleport([-15, 5.5, 12], 2.15, -.05));
    await sleep(600);
    await shot('07-tail-close');
    await page.evaluate(() => window.__whale.rig.teleport([6, 15, 15], Math.PI + .35, -.55));
    await sleep(600);
    await shot('08-island-top');
    const lit = await brightness(330, 150, 240, 160);
    ok(lit > 120, 'village well lit at close range', `lum=${lit}`);
    await page.evaluate(() => window.__whale.reset());
    await sleep(2000);
  }

  if (!ONLY || ONLY === 'night') {
    await page.evaluate(() => window.__whale.rig.teleport([5.2, 6.8, 27.5], Math.PI + .09, -.1));
    await page.click('#btn-night');
    await sleep(2600);
    const n = await tele();
    ok(n.mode === 'night', 'switched to starry night', n.mode);
    ok(n.stars > .85, 'stars faded in', `stars=${n.stars}`);
    ok(n.keyInt < 1.8 && n.hemiInt < 1.0, 'key light dimmed to moonlight', `key=${n.keyInt} hemi=${n.hemiInt}`);
    ok(n.fog > .0013, 'night fog denser', `fog=${n.fog}`);
    await shot('03-night');
    const anim = await page.evaluate(() => {
      const W = window.__whale;
      const b = W.flock.children[0];
      const w0 = b.children[1].rotation.z;
      return { sail: W.mill.sails.rotation.z, beam: W.lighthouse.beams.rotation.y, wing: w0,
               lampOn: W.lighthouse.lampLight.intensity > 1, birds: W.flock.children.length };
    });
    const wings = [];
    for (let i = 0; i < 5; i++) {
      wings.push(await page.evaluate(() => window.__whale.flock.children[0].children[1].rotation.z));
      await sleep(150);
    }
    const anim2 = await page.evaluate(() => {
      const W = window.__whale;
      return { sail: W.mill.sails.rotation.z, beam: W.lighthouse.beams.rotation.y };
    });
    const wingRange = Math.max(...wings) - Math.min(...wings);
    ok(Math.abs(anim2.sail - anim.sail) > .1, 'windmill sails spin', `${anim.sail}→${anim2.sail}`);
    ok(Math.abs(anim2.beam - anim.beam) > .1, 'lighthouse beam sweeps', `${anim.beam}→${anim2.beam}`);
    ok(anim.birds >= 10, 'flock present', `${anim.birds} birds`);
    ok(wingRange > .8, 'birds flap', `wing sweep ${(wingRange * 2).toFixed(2)} rad over ${(wingRange * 2 * 57.3).toFixed(0)}°`);
    ok(anim.lampOn, 'lighthouse lamp lit at night');
    await page.click('#btn-sunrise'); await sleep(2200);
    ok((await tele()).stars < .2, 'stars faded back out at sunrise');
  }

  if (!ONLY || ONLY === 'ride') {
    await page.click('#btn-ride'); await sleep(2200);
    const a = await tele(); await sleep(1600); const b = await tele();
    ok(a.ride === true && b.ride === true, 'ride mode engaged');
    const dist = t => { const [wx, wy, wz] = t.whale.split(',').map(Number); const [cx, cy, cz] = t.cam.cam; return Math.hypot(wx - cx, wy - cy, wz - cz); };
    const wmove = (() => { const A2 = a.whale.split(',').map(Number), B = b.whale.split(',').map(Number); return Math.hypot(...A2.map((v, i) => v - B[i])); })();
    ok(Math.abs(dist(a) - dist(b)) < .6 && wmove > .2, 'camera tracks the drifting whale',
      `range ${dist(a).toFixed(1)}→${dist(b).toFixed(1)} while the whale moved ${wmove.toFixed(2)}u`);
    await shot('04-ride');
    await page.click('#btn-ride'); await sleep(900);
    ok((await tele()).ride === false, 'ride mode toggles off');
  }

  if (!ONLY || ONLY === 'reset') {
    await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
    const away = await tele();
    await page.click('#btn-reset'); await sleep(2200);
    const home = await tele();
    const d = Math.hypot(...home.cam.pos.map((v, i) => v - away.cam.pos[i]));
    const HOME = [5.2, 6.8, 27.5];
    const back = Math.hypot(...home.cam.pos.map((v, i) => v - HOME[i]));
    ok(d > 4, 'camera was away from home', `dist=${d.toFixed(1)}`);
    ok(back < .5, 'reset returns to the opening framing', `off by ${back.toFixed(2)} (pos ${home.cam.pos})`);
    await shot('05-reset');
  }

  if (!ONLY || ONLY === 'ui') {
    await page.evaluate(() => window.__whale.rig.teleport([5.2, 6.8, 27.5], Math.PI + .09, -.1));
    await page.keyboard.press('KeyH'); await sleep(500);
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById('keys')).opacity);
    ok(+shown > .9, 'H reveals the controls overlay', `opacity=${shown}`);
    await shot('09-keys');
    await page.keyboard.press('KeyH'); await sleep(300);
    await page.click('#btn-ride'); await sleep(2600);
    const r = await tele();
    ok(r.ride && r.cam.ride.dist > 25, 'ride along settles at a sane distance', `dist=${r.cam.ride.dist}`);
    const mid = await brightness(300, 200, 300, 200);
    ok(mid < 250, 'whale fills the ride framing', `centre lum=${mid}`);
    await shot('10-ride-home');
    await page.click('#btn-ride'); await sleep(600);
    const pressed = await page.evaluate(() => document.getElementById('btn-ride').getAttribute('aria-pressed'));
    ok(pressed === 'false', 'ride button aria state follows mode', pressed);
  }

  const t = await tele();
  notes.push(`final: ${JSON.stringify({ fps: t.fps, drawCalls: t.drawCalls, tris: t.tris, mode: t.mode })}`);
} catch (err) {
  fails.push('FAIL exception: ' + err.message);
  await shot('zz-crash').catch(() => {});
} finally {
  const unexpected = consoleErrors.filter(e => !/favicon|DevTools|Autoplay/i.test(e));
  if (unexpected.length) fails.push('FAIL console output: ' + unexpected.slice(0, 8).join(' | '));
  else notes.push('PASS clean console');
  console.log('\n' + [...notes, ...fails].join('\n'));
  console.log(`\n${fails.length ? 'FAILED' : 'ALL PASS'} — ${fails.length} failure(s)`);
  await browser.close();
  server.kill();
  process.exit(fails.length ? 1 : 0);
}
