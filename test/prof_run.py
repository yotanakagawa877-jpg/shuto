# CPU profile of the start-up (CDP): prints the top functions by self and total time
import sys, json, asyncio, time
from collections import defaultdict
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/prof.json'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width': 960, 'height': 540})
        pg = await ctx.new_page()
        pg.on('console', lambda m: print(m.text[:300]) if 'LOG' in m.text or m.type == 'error' and 'Failed to load' not in m.text else None)
        pg.on('pageerror', lambda e: print('[pageerror]', str(e)[:600]))
        await pg.add_init_script("try{localStorage.setItem('shuto2.quality','mid')}catch(e){}")
        cdp = await ctx.new_cdp_session(pg)
        await pg.goto('http://localhost:8765/index.html')
        await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>{const b=document.getElementById('tNew')||document.getElementById('startBtn'); b && b.click();}")
        t0 = time.time()
        while time.time() - t0 < 900:
            if await pg.evaluate("()=>!!(window.__G&&window.__G.G&&window.__G.G.started)"): break
            await pg.wait_for_timeout(1000)
        print('STARTED', round(time.time() - t0, 1))
        await pg.wait_for_timeout(20000)
        await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', {'interval': 1000}); await cdp.send('Profiler.start')
        f0 = await pg.evaluate('()=>__G.G.frameN'); await pg.wait_for_timeout(int(sys.argv[2]) if len(sys.argv)>2 else 30000); f1 = await pg.evaluate('()=>__G.G.frameN'); print('frames', f1-f0)
        prof = (await cdp.send('Profiler.stop'))['profile']
        json.dump(prof, open(OUT, 'w'))
        nodes = {n['id']: n for n in prof['nodes']}
        dt = defaultdict(float)
        ts = prof['timeDeltas']; sm = prof['samples']
        for i, s in enumerate(sm): dt[s] += ts[i] / 1000 if i < len(ts) else 0
        self_t = defaultdict(float); parent = {}
        for n in prof['nodes']:
            for c in n.get('children', []): parent[c] = n['id']
        tot = defaultdict(float)
        for nid, t in dt.items():
            f = nodes[nid]['callFrame']; key = f"{f['functionName'] or '(anon)'}:{f['lineNumber']}"
            self_t[key] += t
            seen = set(); x = nid
            while x is not None:
                f = nodes[x]['callFrame']; k = f"{f['functionName'] or '(anon)'}:{f['lineNumber']}"
                if k not in seen: tot[k] += t; seen.add(k)
                x = parent.get(x)
        print('--- self ms'); [print(round(v), k) for k, v in sorted(self_t.items(), key=lambda a: -a[1])[:35]]
        print('--- total ms'); [print(round(v), k) for k, v in sorted(tot.items(), key=lambda a: -a[1])[:60]]
        await b.close()
asyncio.run(main())
