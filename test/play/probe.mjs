import { boot } from './boot.mjs';
const { browser, page, log } = await boot();
console.log('boot', log.bootSec);
const r = await page.evaluate(() => {
  const g = __G;
  return {
    keys: Object.keys(g), X: Object.keys(g.X), RIDE: Object.keys(g.RIDE || {}), TR: Object.keys(g.TR || {}), GTA: Object.keys(g.GTA || {}), AC: Object.keys(g.AC || {}), PL: Object.keys(g.PL || {}), MI: Object.keys(g.MI || {}), HUD: Object.keys(g.HUD || {}), V: Object.keys(g.V || {}).slice(0, 80), POL: Object.keys(g.POL || {}),
    P: Object.keys(g.P), aircraft: g.G.aircraft.map(a => [a.kind, a.small, Math.round(a.x), Math.round(a.z), a.m && a.m.name]).slice(0, 40),
    st0: g.W.stations.slice(0, 2).map(s => ({ ja: s.ja, x: s.x, z: s.z, ent: s.entrances && s.entrances.length, keys: Object.keys(s) })),
    btns: [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.id + ':' + b.textContent.trim().slice(0, 8)),
    allbtn: [...document.querySelectorAll('button[id]')].map(b => b.id).join(','),
  };
});
console.log(JSON.stringify(r, null, 0));
console.log('errors', log.errors);
await browser.close();
