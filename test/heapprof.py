# sampled heap profile of live objects after start-up: memory retained, grouped by allocating function
import sys, json, asyncio, time, os
from collections import defaultdict
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path=os.environ.get('PW_EXEC') or None, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'])
        ctx = await b.new_context(viewport={'width': 852, 'height': 393}, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        await pg.add_init_script("try{localStorage.setItem('shuto2.settings',JSON.stringify({quality:'low'}))}catch(e){}")
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', {'samplingInterval': 65536})
        await pg.evaluate("()=>{const b=document.getElementById('tNew'); b && b.click();}")
        t0 = time.time()
        while time.time() - t0 < 900:
            if await pg.evaluate("()=>!!(window.__G&&window.__G.G&&window.__G.G.started)"): break
            await pg.wait_for_timeout(1000)
        await pg.wait_for_timeout(8000)
        await pg.evaluate("()=>{window.gc&&gc()}")
        prof = (await cdp.send('HeapProfiler.getSamplingProfile'))['profile']
        selfm = defaultdict(float); tot = defaultdict(float)
        def walk(n, stack):
            f = n['callFrame']; k = f"{f['functionName'] or '(anon)'}:{f['lineNumber']}"
            s = sum(x['size'] * x['count'] for x in n.get('samples', [])) if 'samples' in n else n.get('selfSize', 0)
            selfm[k] += n.get('selfSize', 0)
            st = stack + [k]
            for k2 in set(st): tot[k2] += n.get('selfSize', 0)
            for c in n.get('children', []): walk(c, st)
        walk(prof['head'], [])
        print('--- self MB'); [print(round(v / 1e6, 1), k) for k, v in sorted(selfm.items(), key=lambda a: -a[1])[:30]]
        print('--- total MB'); [print(round(v / 1e6, 1), k) for k, v in sorted(tot.items(), key=lambda a: -a[1])[:50]]
        await b.close()
asyncio.run(main())
