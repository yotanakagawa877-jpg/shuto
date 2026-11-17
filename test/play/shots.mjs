// screenshots for the release notes (iPhone landscape 844x390)
import fs from 'fs';
import { chromium } from 'playwright';
import { boot } from './boot.mjs';
const OUT = process.env.SHOTDIR || '/tmp/shots'; fs.mkdirSync(OUT, { recursive: true });
const PAGE = process.env.URL || 'http://localhost:8780/index.html';
// title (no boot)
{
  const b = await chromium.launch({ executablePath: process.env.PW_EXEC || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })).newPage();
  await p.goto(PAGE); await p.waitForTimeout(2500); await p.screenshot({ path: `${OUT}/01_title.png` }); await b.close();
}
const { browser, page } = await boot({ url: PAGE, q: 'mid' });
await page.evaluate(fs.readFileSync(new URL('./lib.js', import.meta.url), 'utf8'));
const W8 = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 180000 });
// Ferris wheel near the top (葛西)
await page.evaluate(async () => { const g = __G, w = g.X.WHEELS[0]; g.R.tod = 17.6; await T.tp(w.x, w.z, false); g.P.x = w.x; g.P.z = w.z + 3; g.G.money = 1e5; g.interact(); T.sim(36); g.G.cam.yaw = Math.PI * 1.2; g.G.cam.pitch = 0.1; });
await W8(9000); await shot('02_wheel_top');
await page.evaluate(() => { T.sim(45); });
// horse race at 大井
await page.evaluate(async () => { const g = __G, rc = g.W.fun.race.find((r) => /大井/.test(r.name)); g.R.tod = 15; await T.tp(rc.c[0], rc.c[1], false); g.P.x = rc.c[0]; g.P.z = rc.c[1]; g.interact(); });
await W8(1500); await shot('03_bet_menu');
await page.locator('#v4ov .v4l .row').nth(2).locator('button').first().tap().catch((e) => console.log('bet tap', e.message.slice(0, 80)));
console.log('race', await page.evaluate(() => !!__G.X.V4.race));
await page.evaluate(() => { const g = __G, r = g.X.V4.race; T.sim(14); if (r) { const h = r.horses[0].h.position; const y = g.G.cam.yaw; g.P.x = h.x - Math.sin(y) * 14; g.P.z = h.z - Math.cos(y) * 14; T.sim(0.5); r.horses.forEach((o) => (o.s = 0, o.v = 0)); /* hold the field still for the slow headless frame */ } });
await W8(9000); await shot('04_race');
await page.evaluate(() => { let k = 0; while (__G.X.V4.race && k++ < 200) T.sim(1); });
// Yokohama chapter mission start (dialog)
await page.evaluate(async () => { const g = __G; g.MS.done.add('m1'); g.MS.done.add('m2'); g.MS.done.add('m3'); g.R.tod = 16.6; const m = g.MI.MISSIONS.find((m) => m.id === 'y1'); await T.tp(m.start[0], m.start[1]); T.sim(4); g.P.x = m.start[0]; g.P.z = m.start[1]; T.sim(1); g.interact(); g.G.cam.yaw += Math.PI; g.G.cam.pitch = 0.2; });
await W8(6000); await shot('05_yokohama_mission');
// encyclopedia
await page.evaluate(() => { const g = __G; for (let i = 0; i < 6 && g.HUD.dialogOpen(); i++) g.interact(); g.MI.fail('x'); });
await page.tap('#pauseBtn'); await W8(1200); await page.tap('#pDex'); await W8(1200); await shot('06_dex');
await page.tap('#v4ov .close'); await page.tap('#pAch'); await W8(1000); await shot('07_achievements');
await page.tap('#v4ov .close'); await page.tap('#pResume'); await W8(500);
// snow in 鎌倉 / fog
// weather is chosen in the pause menu (auto → clear → rain → fog → snow)
async function setWeather(label) {
  await page.tap('#pauseBtn'); await W8(800);
  for (let i = 0; i < 6 && !(await page.textContent('#pWeather')).includes(label); i++) { await page.tap('#pWeather'); await W8(300); }
  console.log('weather', await page.textContent('#pWeather'));
  await page.tap('#pResume'); await W8(500);
}
await setWeather('雪');
await page.evaluate(async () => { const g = __G; g.R.tod = 10; const L = g.W.landmarks.tsurugaoka; await T.tp(L.x + 30, L.z + 120); T.sim(15); g.G.cam.yaw = 0; });
await W8(9000); await shot('08_snow_kamakura');
await setWeather('霧');
await page.evaluate(async () => { const S = T.st('大宮'); await T.tp(S.x + 40, S.z + 40); T.sim(15); });
await W8(9000); await shot('09_fog_omiya');
await browser.close();
console.log('shots done');
