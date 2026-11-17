import sys,os;sys.path.insert(0,'.')
import pack,numpy as np,pickle
from scipy.spatial import cKDTree
D=np.load('../ex/bld.npz'); cx,cz,area,lev,hgt=[D[k] for k in('cx','cz','area','lev','hgt')]
m=(abs(cx)<36000)&(abs(cz+0)<42000)
idx=np.where(m)[0]; T=cKDTree(np.stack([cx[idx],cz[idx]],1))
rows=[]
for f in sorted(os.listdir('/home/user/shuto/data/t2')):
    px,pz,ts=pack.parse(pack.load('/home/user/shuto/data/t2/'+f))
    for t in ts[::2]:
        if not t['bld']: continue
        gx=(t['tx']+.5)*1280; gz=(t['tz']+.5)*1280
        S=np.array([(gx+b[0]/10,gz+b[1]/10) for b in t['bld']])
        d,j=T.query(S)
        o=idx[j]
        dens=T.query_ball_point(S,100,return_length=True)
        for k,b in enumerate(t['bld']):
            if d[k]>2: continue
            oo=o[k]; tagged=1 if hgt[oo]>0 else (2 if lev[oo]>0 else 0)
            rows.append((float(area[oo]),int(dens[k]),tagged,b[6]/10,b[5],b[8],b[3]/4,b[4]/4))
    print(f,len(rows),flush=True)
np.save('../work/hrows.npy',np.array(rows,np.float32))
