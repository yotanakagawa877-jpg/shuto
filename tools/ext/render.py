import sys,os,math,json,pickle;sys.path.insert(0,os.path.dirname(__file__))
import pack
from PIL import Image,ImageDraw
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
W=json.load(open(SC+'/work/world.json')); RD=pickle.load(open(SC+'/gen/roads.pkl','rb'))
N=W['nodes']+RD['nodes']
fn,x0,z0,sz,out=sys.argv[1],float(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]),sys.argv[5]
S=1600/sz
img=Image.new('RGB',(1600,1600),(235,232,225)); d=ImageDraw.Draw(img)
T=lambda x,z:((x-x0)*S,(z-z0)*S)
for e in W['edges']+RD['edges']:
    p=[N[e[0]][:2]]+e[4]+[N[e[1]][:2]]
    if any(x0-200<q[0]<x0+sz+200 and z0-200<q[1]<z0+sz+200 for q in p):
        d.line([T(*q) for q in p],fill=(250,180,60) if e[2]<3 else (255,255,255),width=max(1,int(e[5]/10*2*S)))
for f in fn.split(','):
    px,pz,ts=pack.parse(pack.load(f))
    for t in ts:
        gx=(t['tx']+.5)*1280;gz=(t['tz']+.5)*1280
        for e in t['edges']:
            P=lambda v:N[v][:2] if v>=0 else t['nodes'][-1-v]
            p=[P(e[0])]+e[6]+[P(e[1])]
            d.line([T(*q) for q in p],fill=(255,255,255),width=max(1,int(e[3]/10*2*S)))
        pl={bi:pts for bi,pts in t['polys']}
        for i,b in enumerate(t['bld']):
            if b[3]==0: continue
            if i in pl:
                d.polygon([T(gx+x/10,gz+z/10) for x,z in pl[i]],fill=(150,150,170) if b[6]<120 else (90,90,120))
            else:
                cx,cz=gx+b[0]/10,gz+b[1]/10; r=b[2]/255*math.pi; w,dd=b[3]/8,b[4]/8
                c,s=math.cos(r),math.sin(r)
                d.polygon([T(cx+c*u-s*v,cz+s*u+c*v) for u,v in((-w,-dd),(w,-dd),(w,dd),(-w,dd))],fill=(170,160,150) if b[6]<120 else (110,100,100))
img.save(out)
