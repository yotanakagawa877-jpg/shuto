import json, sys
from PIL import Image, ImageDraw
W=json.load(open(sys.argv[1])); out=sys.argv[2]; S=float(sys.argv[3]) if len(sys.argv)>3 else 0.02
bg=Image.open('/tmp/claude-0/-home-claude/3bbe58eb-4d0e-551e-9fd5-f5c9a1cde57a/scratchpad/mask.ppm')
meta=json.load(open('/tmp/claude-0/-home-claude/3bbe58eb-4d0e-551e-9fd5-f5c9a1cde57a/scratchpad/mask_meta.json'))
X0,Z0,cell=meta['X0'],meta['Z0'],meta['cell']
w=int(bg.width*cell*S); h=int(bg.height*cell*S)
im=bg.resize((w,h)).convert('RGB'); d=ImageDraw.Draw(im)
P=lambda x,z:((x-X0)*S,(z-Z0)*S)
N=W['nodes']
for e in W['edges']:
    k=e[2]
    if k not in (0,1,4): continue
    pts=[N[e[0]][:2]]+(e[4] or [])+[N[e[1]][:2]]
    d.line([P(*p) for p in pts], fill=(230,140,40) if k==0 else (200,90,90) if k==4 else (170,170,170), width=2 if k==0 else 1)
for r in W['rails']:
    c=r['color'].lstrip('#'); col=tuple(int(c[i:i+2],16) for i in (0,2,4))
    if r['kind']=='sub': col=tuple(int(v*0.5) for v in col)
    d.line([P(*p) for p in r['path'][::3]], fill=col, width=2 if r.get('shin') else 1)
im.save(out); print(out,w,h)
