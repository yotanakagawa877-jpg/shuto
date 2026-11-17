# Debug map renderer: python3 tools/drawmap.py OUT.png [x0 z0 x1 z1] [px_per_m]
import json, sys
from PIL import Image, ImageDraw
W = json.load(open('data/world.json'))
out = sys.argv[1]
if len(sys.argv) > 5: x0, z0, x1, z1 = map(float, sys.argv[2:6])
else: x0, z0, x1, z1 = -14100, -11700, 8200, 23900
S = float(sys.argv[6]) if len(sys.argv) > 6 else 2000 / (x1 - x0)
w, h = int((x1 - x0) * S), int((z1 - z0) * S)
im = Image.new('RGB', (w, h), (30, 34, 40)); d = ImageDraw.Draw(im)
P = lambda x, z: ((x - x0) * S, (z - z0) * S)
N = W['nodes']
KC = {0: (240, 140, 40), 1: (200, 200, 200), 2: (150, 150, 150), 3: (90, 90, 95), 4: (240, 60, 200)}
KW = {0: 3, 1: 2, 2: 1.5, 3: 1, 4: 2}
order = sorted(W['edges'], key=lambda e: -{3: 0, 2: 1, 1: 2, 4: 3, 0: 4}[e[2]] if False else {3: 0, 2: 1, 1: 2, 4: 3, 0: 4}[e[2]])
for e in order:
    a, b, k = e[0], e[1], e[2]; pts = [N[a][:2]] + (e[4] or []) + [N[b][:2]]
    d.line([P(*p) for p in pts], fill=KC[k], width=max(1, int(KW[k] * S * 6)))
for r in W['rails']:
    c = r['color'].lstrip('#'); col = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    pts = [P(*p) for p in r['path']]
    if r['kind'] == 'sub': col = tuple(int(v * 0.6) for v in col)
    d.line(pts, fill=col, width=max(1, int(S * 8)))
    for s in r['st']:
        x, y = P(*r['path'][s['i']]); d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 255, 255))
im.save(out); print(out, w, h)
