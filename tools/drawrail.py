# rails-only debug map coloured by height: python3 tools/drawrail.py world.json OUT.png x0 z0 x1 z1 scale
import json, sys
from PIL import Image, ImageDraw
W = json.load(open(sys.argv[1])); out = sys.argv[2]; x0, z0, x1, z1 = map(float, sys.argv[3:7]); S = float(sys.argv[7])
w, h = int((x1 - x0) * S), int((z1 - z0) * S)
im = Image.new('RGB', (w, h), (24, 26, 30)); d = ImageDraw.Draw(im); P = lambda x, z: ((x - x0) * S, (z - z0) * S)
N = W['nodes']
for e in W['edges']:
    if e[2] in (0, 4, 1):
        pts = [N[e[0]][:2]] + (e[4] or []) + [N[e[1]][:2]]
        d.line([P(*p) for p in pts], fill=(120, 80, 30) if e[2] != 1 else (60, 60, 64), width=max(1, int(S * (17 if e[2] == 0 else 8))))
for r in W['rails']:
    c = r['color'].lstrip('#'); col = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    pts = r['path']; ys = r['ys']
    for i in range(len(pts) - 1):
        y = ys[i]
        cc = tuple(int(v * 0.35) for v in col) if y < 0 else col
        wd = max(1, int(S * (10 if y < 12 else 14 if y < 21 else 18)))
        d.line([P(*pts[i]), P(*pts[i + 1])], fill=cc, width=wd)
    for s in r['st']:
        x, y = P(*pts[s['i']]); d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(255, 255, 255))
im.save(out); print(out, w, h)
