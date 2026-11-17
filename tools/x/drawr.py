# python3 tools/x/drawr.py world.json name lat lng halfm scale
import json, sys
from PIL import Image, ImageDraw, ImageFont
W=json.load(open(sys.argv[1])); name=sys.argv[2]; lat,lng,half,S=map(float,sys.argv[3:7])
A9=90451.0
cx,cz=((lng-139.755)*A9, -(lat-35.64)*110950)
x0,z0,x1,z1=cx-half,cz-half,cx+half,cz+half
w=h=int(2*half*S); im=Image.new('RGB',(w,h),(24,26,30)); d=ImageDraw.Draw(im); P=lambda x,z:((x-x0)*S,(z-z0)*S)
f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',11)
N=W['nodes']
for e in W['edges']:
    pts=[N[e[0]][:2]]+(e[4] or [])+[N[e[1]][:2]]
    if all(not(x0-300<p[0]<x1+300 and z0-300<p[1]<z1+300) for p in pts): continue
    k=e[2]; col={0:(150,100,40),4:(150,100,40),1:(80,80,84),2:(70,70,74),3:(50,50,54)}[k]
    d.line([P(*p) for p in pts], fill=col, width=max(1,int(S*{0:17,1:22,2:15,3:7,4:8}[k])))
for r in W['rails']:
    c=r['color'].lstrip('#'); col=tuple(int(c[i:i+2],16) for i in (0,2,4))
    pts=r['path']; ys=r['ys']
    for i in range(len(pts)-1):
        a,b=pts[i],pts[i+1]
        if not(x0-200<a[0]<x1+200 and z0-200<a[1]<z1+200): continue
        y=ys[i]
        if y<0: cc=tuple(int(v*0.3) for v in col); wd=max(1,int(S*3))
        else: cc=col; wd=max(1,int(S*10.5))
        d.line([P(*a),P(*b)],fill=cc,width=wd)
        if y>=12 and i%4==0: d.line([P(*a),P(*b)],fill=(255,255,255),width=1)
    for s in r['st']:
        q=pts[s['i']]
        if x0<q[0]<x1 and z0<q[1]<z1:
            x,y=P(*q); d.ellipse([x-4,y-4,x+4,y+4],outline=(255,255,255)); d.text((x+5,y-6),r['code']+s['ja'],fill=(255,255,200),font=f)
im.save('test/maps/'+name+'.png'); print(name,w,h)
