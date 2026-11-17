// shared boot helper: iPhone landscape (844x390, touch), quality from Q (default low), returns {browser,page,log}
import { chromium } from 'playwright';
export async function boot({ url = process.env.URL || 'http://localhost:8780/index.html', q = process.env.Q || 'low', cont = false, page: pg0 } = {}) {
  const browser = pg0 ? null : await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC || '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  let page = pg0;
  const log = { errors: [], warns: [], logs: [] };
  if (!page) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    page = await ctx.newPage();
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t)) log.errors.push(`[${log.tag || ''}] ${t}`.slice(0, 600)); else if (/^LOG /.test(t)) log.logs.push(t.slice(0, 200)); });
    page.on('pageerror', (e) => log.errors.push(`[${log.tag || ''}] PAGEERROR ${e.message} ${(e.stack || '').split('\n').slice(1, 4).join(' | ')}`.slice(0, 900)));
    await page.addInitScript((q) => { try { if (!localStorage.getItem('shuto2.settings')) localStorage.setItem('shuto2.settings', JSON.stringify({ quality: q })); } catch (e) {} }, q);
  }
  await page.goto(url);
  await page.waitForSelector('#tNew', { state: 'visible', timeout: 120000 });
  const t0 = Date.now();
  await page.tap(cont ? '#tContinue' : '#tNew');
  await page.waitForTimeout(600);
  // v4.0: CONTINUE / NEW GAME open the save-slot list (slot 1 = first row)
  if (await page.isVisible('#v4ov')) await page.tap('#v4ov .v4l .row:first-child button');
  await page.waitForFunction(() => window.__G && __G.G && __G.G.started, null, { timeout: 900000, polling: 1000 });
  log.bootSec = (Date.now() - t0) / 1000;
  return { browser, page, log };
}
export async function heap(page) {
  return page.evaluate(() => { window.gc && gc(); return Math.round(performance.memory.usedJSHeapSize / 1e6); });
}
