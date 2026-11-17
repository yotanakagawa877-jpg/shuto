// SHUTO demo play: normal + irregular play at iPhone landscape size. usage: node test/play/run.mjs [scenario,...]
import fs from 'fs';
import { boot, heap } from './boot.mjs';
import { SCEN } from './scenarios.mjs';
const only = process.argv[2] ? process.argv[2].split(',') : null;
const OUT = process.env.SHOTDIR || '/tmp/shots'; fs.mkdirSync(OUT, { recursive: true });
const { browser, page, log } = await boot();
console.log('BOOT', log.bootSec, 's  heap', await heap(page), 'MB');
const lib = fs.readFileSync(new URL('./lib.js', import.meta.url), 'utf8');
await page.evaluate(lib);
const results = [];
const ctx = { page, log, OUT, heap: () => heap(page), shot: (n) => page.screenshot({ path: `${OUT}/${n}.png`, timeout: 120000 }).catch(() => {}),
  ev: (f, a) => page.evaluate(f, a), lib, browser };
for (const [name, fn] of Object.entries(SCEN)) {
  if (only && !only.includes(name)) continue;
  log.tag = name; const e0 = log.errors.length; const t0 = Date.now();
  await page.evaluate(() => { T.issues = []; T.reset(); });
  let out, err = null;
  try { out = await Promise.race([fn(ctx), new Promise((_, rej) => setTimeout(() => rej(new Error('scenario timeout')), (+process.env.STO || 900) * 1000))]); }
  catch (e) { err = String(e && e.message || e).slice(0, 500); }
  let issues = [], st = null;
  try { issues = await page.evaluate(() => T.issues); st = await page.evaluate(() => T.snap()); } catch (e) { err = (err || '') + ' | page dead: ' + e.message; }
  // freeze check: does the render loop still advance?
  let frozen = null;
  try { const a = await page.evaluate(() => __G.G.t); await page.waitForTimeout(8000); const b = await page.evaluate(() => __G.G.t); frozen = b === a && !(await page.evaluate(() => __G.G.paused)); } catch (e) {}
  const r = { name, sec: Math.round((Date.now() - t0) / 1000), out, err, issues, errors: log.errors.slice(e0), frozen, end: st };
  results.push(r);
  console.log('\n=== ' + name + ' (' + r.sec + 's)' + (err ? ' ERR ' + err : ''));
  console.log(JSON.stringify(out)?.slice(0, 1500));
  if (issues.length) console.log('ISSUES', JSON.stringify(issues).slice(0, 1500));
  if (r.errors.length) console.log('CONSOLE', r.errors.join('\n').slice(0, 2500));
  if (frozen) console.log('FROZEN');
  await ctx.shot(name);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
}
console.log('\nHEAP end', await heap(page), 'MB');
await browser.close();
