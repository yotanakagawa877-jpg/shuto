import json, sys
from PIL import Image, ImageDraw, ImageFont
SP='/tmp/claude-0/-home-claude/3bbe58eb-4d0e-551e-9fd5-f5c9a1cde57a/scratchpad/'
S=json.load(open(SP+'shared.json')); M=json.load(open(SP+'munis.json')); T=json.load(open('data/mt3d.json'))['lines']
x0,z0,x1,z1,sc=map(float,sys.argv[1:6]); out=sys.argv[6]
w,h=int((x1-x0)*sc),int((z1-z0)*sc); im=Image.new('RGB',(w,h),(15,30,50)); d=ImageDraw.Draw(im); P=lambda q:((q[0]-x0)*sc,(q[1]-z0)*sc)
for m in M:
  for pl in m['polys']:
    d.polygon([P(q) for q in pl[0]], fill=(60,60,55))
for s in S:
  col=(255,80,80) if s['pa']!=s['pb'] else (160,160,160)
  d.line([P(q) for q in s['L']], fill=col, width=1)
for k,l in T.items():
  d.line([P(q) for q in l['path']], fill=(80,200,255), width=1)
try: f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',12)
except: f=None
for m in M:
  pl=m['polys'][0][0]; cx=sum(q[0] for q in pl)/len(pl); cz=sum(q[1] for q in pl)/len(pl)
  if x0<cx<x1 and z0<cz<z1: d.text(P([cx,cz]), m['name'][-6:], fill=(255,255,0), font=f)
im.save(out); print(w,h)
