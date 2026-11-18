// v5.0 release screenshots (iPhone landscape 844x390, scale 2 via DSF=2): police, roadblock, tank, fighter, rail creator,
// departure board, fields / greenhouses / industry, suburb infill, facility menu
import fs from 'fs';
import { boot } from './boot.mjs';
const OUT = process.env.SHOTDIR || '/tmp/shots5'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, log } = await boot({ url: process.env.URL || 'http://localhost:8781/index.html', q: 'mid' });
await page.evaluate(fs.readFileSync(new URL('./lib.js', import.meta.url), 'utf8'));
const W8 = (ms) => page.waitForTimeout(ms);
const shot = async (n) => { await W8(6000); await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 180000 }); console.log('shot', n); };
const ev = (f, a) => page.evaluate(f, a);
// 1 roadblock ahead (★3)
await ev(async () => { const g = __G; g.R.tod = 13; T.drop(); const q = await T.roadPoint(-4867, -2166); T.carHere('sport', Math.atan2(q.dx, q.dz)); g.POL.forceStars(3); const c = g.P.car; c.vx = q.dx * 12; c.vz = q.dz * 12; T.sim(0.3); g.X.v5Roadblock(); const b = g.X.V5.blocks[g.X.V5.blocks.length - 1]; if (b) { c.x = b.x - b.dx * 45; c.z = b.z - b.dz * 45; c.yaw = Math.atan2(b.dx, b.dz); c.vx = c.vz = 0; g.G.cam.yaw = c.yaw; } T.sim(1); });
await shot('01_roadblock');
// 2 patrol cars stopping short of a player on foot, officers running
await ev(async () => { const g = __G; T.drop(); g.POL.resetPolice(); g.G.heat = 0; await T.tp(-4867, -2166); g.POL.forceStars(2); T.sim(14); });
await shot('02_police_foot');
// 3 tank at 朝霞
await ev(async () => { const g = __G, M = g.X.MIL; T.drop(); g.POL.resetPolice(); g.G.heat = 0; const b = g.X.MIL_DATA.asaka; await T.tp(b.cx + 600, b.cz); T.sim(2); g.P.x = b.cx; g.P.z = b.cz; for (let i = 0; i < 10; i++) T.sim(0.5); const t = M.built && M.built.cars.find((c) => c.t === 'tank'); if (t) { g.P.x = t.x + 3; g.P.z = t.z; T.sim(0.2); g.PL.tryEnter(); g.G.cam.yaw = t.yaw + 2.4; } g.POL.resetPolice(); g.G.heat = 0; T.sim(1); });
await shot('03_tank');
// 4 fighter climbing out of 入間
await ev(async () => { const g = __G, M = g.X.MIL; T.drop(); g.POL.resetPolice(); g.G.heat = 0; const b = g.X.MIL_DATA.iruma; await T.tp(b.cx + 1200, b.cz); T.sim(2); g.P.x = b.cx; g.P.z = b.cz; for (let i = 0; i < 8; i++) T.sim(0.5); const f = M.built && M.built.air.find((a) => a.fighter); if (f) { g.P.x = f.x + 4; g.P.z = f.z; T.sim(0.3); g.PL.tryEnter(); g.KEYS.ShiftLeft = true; T.sim(12); g.KEYS.KeyS = true; T.sim(3); g.KEYS.KeyS = false; T.sim(6); g.KEYS.ShiftLeft = false; } g.POL.resetPolice(); g.G.heat = 0; });
await shot('04_fighter');
// 5 rail creator from the 新宿 departure board
await ev(async () => { const g = __G; g.PL.tryEnter(); let k = 0; while (g.P.sky && k++ < 300) T.sim(1); T.drop(); const S = T.st('新宿'); const e = S.entrances[0]; await T.tp(e.x, e.z, false); g.P.x = e.x; g.P.z = e.z; g.interact(); T.sim(0.5); g.P.interior && g.doAction('trains'); });
await W8(1500);
await page.locator('#stmenu .row', { hasText: '運行をつくる' }).locator('button', { hasText: 'つくる' }).first().tap().catch(() => {});
await W8(800);
for (const i of [4, 9]) { await page.locator('#v5ov button[data-a="add"]').tap().catch(() => {}); await W8(400); await page.locator('#v5ov button[data-i]').nth(i).tap().catch(() => {}); await W8(400); }
await page.fill('#v5name', 'ほのぼの号').catch(() => {}); await page.fill('#v5line', '首都ライナー').catch(() => {}); await page.fill('#v5code', 'SL').catch(() => {});
await page.selectOption('#v5type', '快速').catch(() => {});
await shot('05_rail_creator');
await page.locator('#v5ov .v5f button', { hasText: '保存' }).tap().catch(() => {});
await W8(1500);
// the departure board of the line the new service starts on
const rj = await ev(() => { const sv = __G.X.USV.list[0]; return sv ? sv.L[0].r.ja : ''; });
await page.locator('#stmenu .row', { hasText: rj }).locator('button', { hasText: '発車案内' }).first().tap().catch(() => {});
await shot('06_departures');
await ev(() => { document.getElementById('stmenu').hidden = true; const o = document.getElementById('v5ov'); o && (o.hidden = true); });
// 7 fields (autumn colours depend on the real month), 8 greenhouses / industry, 9 suburb with infill
await ev(async () => { const g = __G; T.drop(); g.R.tod = 15.5; g.P.interior && g.doAction('exit'); await T.tp(-14200, -41800); for (let i = 0; i < 16; i++) T.sim(0.6); g.G.cam.pitch = 0.35; });
await shot('07_fields');
await ev(async () => { const g = __G, L = g.X.LUL; const q = (() => { for (let r = 0; r < 160; r++) for (let a = 0; a < 16; a++) { const x = 24000 + Math.cos(a * 0.39) * r * 32, z = 3000 + Math.sin(a * 0.39) * r * 32; if (g.X.luAt(x, z) === 3) return [x, z]; } return [24000, 3000]; })(); await T.tp(q[0], q[1]); for (let i = 0; i < 16; i++) T.sim(0.6); g.G.cam.pitch = 0.3; });
await shot('08_industry');
await ev(async () => { const g = __G; await T.tp(-33000, 3500); for (let i = 0; i < 12; i++) T.sim(0.6); g.G.cam.pitch = 0.45; });
await shot('09_suburb');
// 10 a police station menu
await ev(async () => { const g = __G, X = g.X; const S = T.st('大宮'); const f = X.facNearest('po', S.x, S.z, 4000, (n) => !n.endsWith('|k')); if (f) { await T.tp(f.x, f.z, false); g.P.x = f.x + 4; g.P.z = f.z; T.sim(1.2); g.POL.forceStars(2); g.interact(); } });
await shot('10_facility');
await ev(() => { const o = document.getElementById('v4ov'); o && (o.hidden = true); });
console.log('errors', JSON.stringify(log.errors).slice(0, 1500));
await browser.close();
