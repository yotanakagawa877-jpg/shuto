import sys;sys.path.insert(0,'.')
import pack,numpy as np,pickle,collections,json,math,os
from scipy.spatial import cKDTree
from geo import Ay,QS
HW=pickle.load(open('../ex/hw.pkl','rb'))
# segment midpoints, sampled every ~10m
px=[];pz=[];wi=[];ang=[]
for i,(wid,t,ids,ll) in enumerate(HW):
    a=np.frombuffer(ll,dtype=np.float64).reshape(-1,2); x=(a[:,0]-139.755)*Ay; z=-(a[:,1]-35.64)*QS
    for k in range(len(x)-1):
        L=math.hypot(x[k+1]-x[k],z[k+1]-z[k]); n=max(1,int(L/10))
        an=math.atan2(z[k+1]-z[k],x[k+1]-x[k])%math.pi
        for s in range(n):
            f=(s+.5)/n; px.append(x[k]+(x[k+1]-x[k])*f); pz.append(z[k]+(z[k+1]-z[k])*f); wi.append(i); ang.append(an)
px=np.array(px);pz=np.array(pz);wi=np.array(wi);ang=np.array(ang)
print('samples',len(px),flush=True)
T=cKDTree(np.stack([px,pz],1))
def match(x,z,a):
    ii=T.query_ball_point((x,z),6)
    best=None;bd=1e9
    for k in ii:
        da=abs((ang[k]-a+math.pi/2)%math.pi-math.pi/2)
        d=math.hypot(px[k]-x,pz[k]-z)+da*10
        if d<bd: bd=d;best=wi[k]
    return best
w=json.load(open('../work/world.json'));N=w['nodes']
out={'world':[],'tile':[]}
import random;random.seed(1)
E=w['edges']
for e in random.sample(E,40000):
    pts=[N[e[0]][:2]]+e[4]+[N[e[1]][:2]]
    k=len(pts)//2-1 if len(pts)>2 else 0
    a=pts[k];b=pts[k+1]; x=(a[0]+b[0])/2;z=(a[1]+b[1])/2
    m=match(x,z,math.atan2(b[1]-a[1],b[0]-a[0])%math.pi)
    out['world'].append((e[2],e[5],e[6],e[7],e[8],e[9],e[3],None if m is None else HW[m][1]))
for f in random.sample(sorted(os.listdir('/home/user/shuto/data/t2')),30):
    _,_,ts=pack.parse(pack.load('/home/user/shuto/data/t2/'+f))
    for t in ts[::3]:
        for e in t['edges'][::3]:
            P=lambda v:(N[v][0],N[v][1]) if v>=0 else t['nodes'][-1-v]
            pts=[P(e[0])]+e[6]+[P(e[1])]
            k=len(pts)//2-1 if len(pts)>2 else 0
            a=pts[k];b=pts[k+1]; x=(a[0]+b[0])/2;z=(a[1]+b[1])/2
            m=match(x,z,math.atan2(b[1]-a[1],b[0]-a[0])%math.pi)
            out['tile'].append((e[2],e[3],e[4],e[5],None if m is None else HW[m][1]))
pickle.dump(out,open('../work/rmatch.pkl','wb'))
