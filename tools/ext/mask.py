import sys,os;sys.path.insert(0,os.path.dirname(__file__))
import numpy as np,pickle,json,math
from PIL import Image,ImageDraw
from scipy import ndimage
from geo import *
import maskio
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
W=json.load(open(SC+'/work/world.json'))
om=W['ext']['mask']; OA=maskio.decode(om); C=16
nx0,nz0,nx1,nz1=box(NEW)
# align new grid to old grid
kx=math.ceil((om['X0']-(nx0-1200))/C); kz=math.ceil((om['Z0']-(nz0-1200))/C)
X0=om['X0']-kx*C; Z0=om['Z0']-kz*C
Wd=math.ceil((nx1+1200-X0)/C); Ht=math.ceil((nz1+1200-Z0)/C)
print('grid',X0,Z0,Wd,Ht)
def tr(ll):
    a=np.frombuffer(ll,dtype=np.float64).reshape(-1,2)
    x=((a[:,0]-139.755)*Ay-X0)/C; z=(-(a[:,1]-35.64)*QS-Z0)/C
    return list(zip(x.tolist(),z.tolist()))
img=Image.new('L',(Wd,Ht),1); dr=ImageDraw.Draw(img)
LAND=pickle.load(open(SC+'/ex/land.pkl','rb'))
def fill(kinds,val,pred=None):
    for oid,k,t,rings in LAND:
        if k not in kinds: continue
        if pred and not pred(t): continue
        for outer,inner in rings:
            p=tr(outer)
            if len(p)>=3: dr.polygon(p,fill=val)
            for i in inner:
                q=tr(i)
                if len(q)>=3: dr.polygon(q,fill=1)
fill('f',4)
fill('p',2,lambda t: t.get('leisure') in('park','garden','golf_course','nature_reserve','common') or t.get('landuse') in('recreation_ground','village_green','cemetery'))
fill('a',6,lambda t: t.get('aeroway')=='aerodrome')
fill('w',0,lambda t: t.get('natural')=='water' or t.get('waterway') in('riverbank','dock') or t.get('landuse') in('reservoir','basin') or t.get('water'))
WW=pickle.load(open(SC+'/ex/waterways.pkl','rb'))
for wid,ww,nm,en,wd,ll in WW:
    try: w=float(wd)
    except: w=14 if ww=='river' else 8
    p=tr(ll)
    if len(p)>=2: dr.line(p,fill=0,width=max(1,int(round(w/C))))
A=np.array(img)
# sea via coastline barrier + flood
bar=Image.new('L',(Wd,Ht),0); bd=ImageDraw.Draw(bar)
CO=pickle.load(open(SC+'/ex/coast.pkl','rb'))
for wid,ll in CO:
    p=tr(ll)
    if len(p)>=2: bd.line(p,fill=1,width=3)
B=np.array(bar)>0
lab,n=ndimage.label(~B)
seeds=[(35.50,139.90),(35.25,139.45),(35.17,139.60),(35.25,139.75),(35.17,139.30)]
sea=np.zeros_like(B)
for la,lo in seeds:
    x,z=P(lo,la); i=int((x-X0)/C); j=int((z-Z0)/C)
    if 0<=i<Wd and 0<=j<Ht and lab[j,i]>0: sea|=lab==lab[j,i]
# guard: sea component must not be giant land (check fraction)
print('sea frac',sea.mean())
A[sea]=0
# paste old mask
A[kz:kz+om['H'],kx:kx+om['W']]=OA
np.save(SC+'/gen/mask.npy',A)
pal=np.array([[30,60,120],[200,200,190],[80,160,80],[200,100,100],[30,110,40],[40,90,160],[150,150,150]],np.uint8)
Image.fromarray(pal[A[::6,::6]]).save(SC+'/gen/mask.png')
json.dump(dict(X0=int(X0),Z0=int(Z0),W=int(Wd),H=int(Ht),cell=C),open(SC+'/gen/mask_meta.json','w'))
