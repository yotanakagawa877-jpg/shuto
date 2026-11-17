# expressway debug crops: python3 tools/drawx.py world.json OUT.png cx cz half scale
import json, sys
from PIL import Image, ImageDraw
W = json.load(open(sys.argv[1])); out = sys.argv[2]; cx, cz, half, S = map(float, sys.argv[3:7])
x0, z0, x1, z1 = cx - half, cz - half, cx + half, cz + half
w = h = int(2 * half * S)
im = Image.new('RGB', (w, h), (24, 26, 30)); d = ImageDraw.Draw(im); P = lambda x, z: ((x - x0) * S, (z - z0) * S)
N = W['nodes']; RW = {0: 17, 1: 22, 2: 15, 3: 7, 4: 8}
cols = [(240, 150, 40), (130, 130, 135), (100, 100, 105), (60, 60, 64), (230, 60, 200)]
for k in (3, 2, 1, 4, 0):
    for e in W['edges']:
        if e[2] != k: continue
        pts = [N[e[0]][:2]] + (e[4] or []) + [N[e[1]][:2]]
        if all(not (x0 - 50 < p[0] < x1 + 50 and z0 - 50 < p[1] < z1 + 50) for p in pts): continue
        d.line([P(*p) for p in pts], fill=cols[k], width=max(1, int(RW[k] * S)))
for i, n in enumerate(N):
    if x0 < n[0] < x1 and z0 < n[1] < z1 and n[2] > 1:
        x, y = P(n[0], n[1]); d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(255, 255, 255))
im.save(out)
