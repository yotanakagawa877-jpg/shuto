# v3.3 bake run: start the game with every pack loaded, collect the start-up clears (window.__BAKE)
import asyncio, json, sys, time, os
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=6000'])
        pg = await (await b.new_context(viewport={'width': 800, 'height': 450})).new_page()
        pg.on('console', lambda m: print(m.text[:300]) if 'LOG' in m.text or 'scenery' in m.text or m.type == 'error' else None)
        pg.on('pageerror', lambda e: print('[pageerror]', str(e)[:500]))
        await pg.add_init_script("try{localStorage.setItem('shuto2.settings',JSON.stringify({quality:'" + os.environ.get('Q', 'low') + "'}))}catch(e){}")
        await pg.goto('http://localhost:8765/index.html?bake')
        await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>{const b=document.getElementById('tNew'); b && b.click();}")
        t0 = time.time()
        while time.time() - t0 < 1800:
            r = await pg.evaluate("()=>window.__BAKE?window.__BAKE.length:-1")
            if r >= 0: break
            await pg.wait_for_timeout(1000)
        keys = await pg.evaluate("()=>window.__BAKE")
        json.dump(keys, open(OUT, 'w')); print('cleared', len(keys), 'secs', round(time.time() - t0))
        rp = await pg.evaluate("()=>window.__REPLAY")
        json.dump(rp, open(OUT.replace('.json', '_replay.json'), 'w')); print('replay', {k: len(v) for k, v in rp.items() if k != 'keyed'})
        await b.close()
asyncio.run(main())
