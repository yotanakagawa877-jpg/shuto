import sys;sys.path.insert(0,'.')
import numpy as np,pickle,collections,json,math
from scipy.spatial import cKDTree
from geo import Ay,QS
RW=pickle.load(open('../ex/rw.pkl','rb'))
px=[];pz=[];wi=[]
for i,(wid,t,ids,ll) in enumerate(RW):
    a=np.frombuffer(ll,dtype=np.float64).reshape(-1,2); x=(a[:,0]-139.755)*Ay; z=-(a[:,1]-35.64)*QS
    for k in range(len(x)-1):
        L=math.hypot(x[k+1]-x[k],z[k+1]-z[k]); n=max(1,int(L/5))
        for s in range(n):
            f=(s+.5)/n; px.append(x[k]+(x[k+1]-x[k])*f); pz.append(z[k]+(z[k+1]-z[k])*f); wi.append(i)
T=cKDTree(np.stack([px,pz],1)); wi=np.array(wi)
w=json.load(open('../work/world.json'))
for r in w['rails']:
    if r['code'] in('x',): continue
    c=collections.defaultdict(list); d0=[]
    for (x,z),y in list(zip(r['path'],r['ys']))[::10]:
        d,j=T.query((x,z)); d0.append(d)
        t=RW[wi[j]][1] if d<8 else {}
        key=(t.get('railway'),'B' if t.get('bridge') else 'T' if t.get('tunnel') else '-',t.get('layer'))
        c[key].append(y)
    print(r['code'],r['ja'],r['kind'],'median dist',round(float(np.median(d0)),1),' | '.join('%s:%d:%.1f/%.1f'%(k,len(v),np.median(v),np.percentile(v,90)) for k,v in sorted(c.items(),key=lambda x:-len(x[1]))[:4]))
