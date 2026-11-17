# Headless test driver for SHUTO.
# usage: python3 test/game.py NAME "STEP;;STEP;;..." [W H TOUCH] [URL]
#   STEP = JS expression (result printed as EVAL <json>) | wait MS | shot LABEL | key CODE MS
import sys, json, asyncio, os, time
from playwright.async_api import async_playwright

name = sys.argv[1]
steps = [s.strip() for s in sys.argv[2].split(';;') if s.strip()] if len(sys.argv) > 2 else []
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1280
H = int(sys.argv[4]) if len(sys.argv) > 4 else 720
TOUCH = len(sys.argv) > 5 and sys.argv[5] == '1'
URL = sys.argv[6] if len(sys.argv) > 6 else 'http://localhost:8765/index.html'
OUT = os.environ.get('SHOTDIR', '/home/claude/shuto3/test/shots')
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path=os.environ.get('PW_EXEC') or None, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                                                         '--js-flags=--expose-gc', '--enable-precise-memory-info'])
        ctx = await b.new_context(viewport={'width': W, 'height': H}, has_touch=TOUCH, is_mobile=TOUCH, device_scale_factor=1)
        pg = await ctx.new_page()
        pg.on('console', lambda m: print(f'[{m.type}] {m.text}'[:400]) if m.type in ('error', 'warning') or 'scenery' in m.text or 'verts' in m.text or 'LOG' in m.text else None)
        pg.on('pageerror', lambda e: print('[pageerror]', str(e)[:600]))
        await pg.add_init_script("try{localStorage.setItem('shuto2.settings',JSON.stringify({quality:'" + os.environ.get('Q','mid') + "'}))}catch(e){}")
        await pg.goto(URL)
        await pg.wait_for_timeout(1500)
        # start a new game
        await pg.evaluate("()=>{const b=document.getElementById('tNew')||document.getElementById('startBtn'); b && b.click();}")
        t0 = time.time()
        while time.time() - t0 < 900:
            ok = await pg.evaluate("()=>!!(window.__G&&window.__G.G&&window.__G.G.started)")
            if ok: break
            await pg.wait_for_timeout(500)
        print('STARTED', round(time.time() - t0, 1))
        await pg.wait_for_timeout(1500)
        pass
        for s in steps:
            if s.startswith('wait '):
                await pg.wait_for_timeout(int(s[5:]))
            elif s.startswith('shot '):
                await pg.screenshot(path=f'{OUT}/{name}_{s[5:].strip()}.png', timeout=180000)
            elif s.startswith('hold '):
                await pg.keyboard.down(s.split()[1])
            elif s.startswith('release '):
                await pg.keyboard.up(s.split()[1])
            elif s.startswith('key '):
                _, code, ms = s.split()
                await pg.keyboard.down(code); await pg.wait_for_timeout(int(ms)); await pg.keyboard.up(code)
            else:
                try:
                    r = await pg.evaluate(s if s.startswith('(') or s.startswith('async') else f'()=>({s})')
                    print('EVAL', json.dumps(r, ensure_ascii=False)[:6000])
                except Exception as e:
                    print('EVALERR', str(e)[:800])
        await pg.screenshot(path=f'{OUT}/{name}_end.png', timeout=180000)
        await b.close()

asyncio.run(main())
