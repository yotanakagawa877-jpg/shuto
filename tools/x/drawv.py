import json, sys
from PIL import Image, ImageDraw
W=json.load(open(sys.argv[1])); V=json.load(open(sys.argv[2])); name=sys.argv[3]; lat,lng,half,S=map(float,sys.argv[4:8])
A9=90451.0; cx,cz=((lng-139.755)*A9, -(lat-35.64)*110950); x0,z0=cx-half,cz-half
w=h=int(2*half*S); im=Image.new('RGB',(w,h),(40,48,40)); d=ImageDraw.Draw(im); P=lambda x,z:((x-x0)*S,(z-z0)*S)
for l in V: d.line([P(*p) for p in l], fill=(95,95,100), width=max(1,int(S*6)))
N=W['nodes']
for e in W['edges']:
    pts=[N[e[0]][:2]]+(e[4] or [])+[N[e[1]][:2]]
    if all(not(x0-300<p[0]<x0+2*half+300 and z0-300<p[1]<z0+2*half+300) for p in pts): continue
    k=e[2]; col={0:(230,140,40),1:(170,170,175),2:(150,150,155),3:(125,125,130),4:(200,110,60)}[k]
    d.line([P(*p) for p in pts], fill=col, width=max(1,int(S*{0:17,1:22,2:15,3:7,4:8}[k])))
for r in W['rails']:
    c=r['color'].lstrip('#'); col=tuple(int(c[i:i+2],16) for i in (0,2,4))
    if r['kind']=='sub': continue
    pts=[p for p in r['path'] if x0-200<p[0]<x0+2*half+200 and z0-200<p[1]<z0+2*half+200]
    if len(pts)>1: d.line([P(*p) for p in pts], fill=col, width=max(1,int(S*10)))
im.save('test/maps/'+name+'.png'); print(name)
