import pickle,numpy as np,sys
sys.path.insert(0,sys.argv[1]); from geo import Ay,QS
B=pickle.load(open(sys.argv[2]+'/bld.pkl','rb'))
n=len(B); print(n,flush=True)
cx=np.zeros(n,np.float32);cz=np.zeros(n,np.float32);area=np.zeros(n,np.float32)
lev=np.full(n,-1,np.float32);hgt=np.full(n,-1,np.float32);btype=[];names=[];roof=[]
offs=np.zeros(n+1,np.int64);coords=[]
def num(s):
    try: return float(str(s).split(';')[0].replace('m','').strip())
    except: return -1
tot=0
for i,(oid,isw,t,rings) in enumerate(B):
    ll=np.frombuffer(rings[0][0],dtype=np.float64).reshape(-1,2)
    if len(rings)>1:
        # pick largest outer ring
        best=max(rings,key=lambda r:len(r[0])); ll=np.frombuffer(best[0],dtype=np.float64).reshape(-1,2)
    x=(ll[:,0]-139.755)*Ay; z=-(ll[:,1]-35.64)*QS
    if len(x)>1 and x[0]==x[-1] and z[0]==z[-1]: x=x[:-1];z=z[:-1]
    a=0.5*(np.dot(x,np.roll(z,-1))-np.dot(z,np.roll(x,-1)))
    area[i]=abs(a); cx[i]=x.mean(); cz[i]=z.mean()
    lev[i]=num(t.get('building:levels',-1)); hgt[i]=num(t.get('height',-1))
    btype.append(t.get('building','yes')); names.append(t.get('name','')); roof.append(t.get('roof:shape',''))
    coords.append(np.stack([x,z],1).astype(np.float32)); tot+=len(x); offs[i+1]=tot
    if i%1000000==0: print(i,flush=True)
C=np.concatenate(coords)
np.savez(sys.argv[2]+'/bld.npz',cx=cx,cz=cz,area=area,lev=lev,hgt=hgt,offs=offs,C=C)
pickle.dump((btype,names,roof),open(sys.argv[2]+'/bldtags.pkl','wb'))
print('done',tot)
