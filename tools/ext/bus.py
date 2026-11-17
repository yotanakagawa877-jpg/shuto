import sys,os;sys.path.insert(0,os.path.dirname(__file__))
import pickle,json,math,re,collections
from geo import *
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
REL=pickle.load(open(SC+'/ex/rel.pkl','rb'))
STOPS=pickle.load(open(SC+'/ex/stops.pkl','rb'))
STN=pickle.load(open(SC+'/ex/stn.pkl','rb'))
node={nid:(lo,la,nm) for nid,lo,la,nm,en in STOPS}
for nid,lo,la,t in STN:
    if t.get('bus')=='yes' or t.get('highway')=='bus_stop': node.setdefault(nid,(lo,la,t.get('name','')))
ox0,oz0,ox1,oz1=box(OLD); nx0,nz0,nx1,nz1=box(NEW)
def ring(lo,la):
    x,z=P(lo,la); return nx0+1500<x<nx1-1500 and nz0+1500<z<nz1-1500 and not(ox0-300<x<ox1+300 and oz0-300<z<oz1+300)
cands=[]
for rid,t,mem in REL:
    if t.get('route')!='bus' or t.get('type')!='route': continue
    ref=(t.get('ref') or '').strip()
    if not ref or len(ref)>8 or not re.search(r'\d',ref) or not re.search(r'[^\d\-]',ref) or '深夜' in ref: continue
    st=[]
    for ty,ref2,role in mem:
        if ty=='n' and ref2 in node and (role.startswith('platform') or role.startswith('stop')):
            lo,la,nm=node[ref2]
            if nm and (not st or st[-1][2]!=nm): st.append((lo,la,nm))
    if len(st)<4: continue
    if not all(ring(lo,la) for lo,la,_ in st): continue
    a,b=st[0],st[-1]
    if not re.search('駅',a[2]+b[2]): continue
    L=sum(math.dist(P(*p[:2]),P(*q[:2])) for p,q in zip(st,st[1:]))
    if L<2500 or L>15000: continue
    cands.append((L,ref,t,st))
cands.sort(key=lambda c:-len(c[3]))
chosen=[];cent=[]
for L,ref,t,st in cands:
    xs=[P(lo,la) for lo,la,_ in st]; c=(sum(x for x,_ in xs)/len(xs),sum(z for _,z in xs)/len(xs))
    if any(math.dist(c,o)<6000 for o in cent): continue
    if any(ch[1]==ref for ch in chosen): continue
    chosen.append((L,ref,t,st)); cent.append(c)
    if len(chosen)>=24: break
TOEI=re.compile(r'^(都|品|渋|橋|虹|東|宿|上|業|池|早|茶|黒|田|錦|海|反|秋|飯|草|急行)')
Q={};X=[]
for n,(L,ref,t,st) in enumerate(chosen):
    k=len(st); pick=[0,k//3,(2*k)//3,k-1] if k>=6 else [0,k//2,k-1]
    pick=sorted(set(pick)); keys=[]
    for i in pick:
        lo,la,nm=st[i]; key='xb%d_%d'%(n,i); Q[key]=[nm,round(la,5),round(lo,5)]; keys.append(key)
    code=ref+('系' if TOEI.match(ref) else '')
    title=re.sub(r'駅$','駅',st[0][2])+' ↔ '+st[-1][2]
    X.append([code,title,3115598,keys])
    print(code,title,len(st),round(L))
json.dump(dict(Q=Q,X=X),open(SC+'/gen/bus.json','w'),ensure_ascii=False)
