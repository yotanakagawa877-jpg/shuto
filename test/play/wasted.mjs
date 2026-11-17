// check that the WASTED caption and toast clear in real time (not via T.sim)
import { boot } from './boot.mjs';
const { browser, page, log } = await boot();
await page.waitForTimeout(3000);
await page.evaluate(() => { __G.P.hp = -5; });
const out = [];
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(1500);
  out.push(await page.evaluate(() => [Math.round(__G.G.t), !!__G.G.dying, document.getElementById('big').classList.contains('on'), document.getElementById('toast').classList.contains('on'), __G.P.mode, Math.round(__G.P.hp)].join(',')));
}
const fps = await page.evaluate(() => new Promise((r) => { let k = 0; const t0 = performance.now(); const f = () => (++k < 20 ? requestAnimationFrame(f) : r(Math.round(20000 / (performance.now() - t0)))); requestAnimationFrame(f); }));
console.log(out.join(' | '), 'fps', fps, 'errors', log.errors);
await page.screenshot({ path: process.env.SHOT || '/tmp/w.png' });
await browser.close();
