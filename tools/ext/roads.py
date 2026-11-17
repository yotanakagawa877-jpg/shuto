# Stage: roads for the new ring. Output: ../gen/roads.pkl
import sys,os;sys.path.insert(0,os.path.dirname(__file__))
import numpy as np,pickle,json,math,collections
from geo import *
from scipy.spatial import cKDTree
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
W=json.load(open(SC+'/work/world.json'))
ON=W['nodes'];OE=W['edges']
ox0,oz0,ox1,oz1=box(OLD); nx0,nz0,nx1,nz1=box(NEW)
WORLD={'motorway':0,'motorway_link':4,'trunk':1,'trunk_link':1,'primary':1,'primary_link':1,'secondary':2,'secondary_link':2}
TILE={'tertiary':(3.4,2.0),'tertiary_link':(3.4,2.0),'residential':(2.6,2.4),'unclassified':(2.9,2.4),'living_street':(2.6,2.4),'service':(2.0,2.0)}
def num(v,d):
    try: return int(float(str(v).split(';')[0]))
    except: return d
HW=pickle.load(open(SC+'/ex/hw.pkl','rb'))
def clip(x,z):
    """return list of pieces: each list of (x,z,src) src = index into vertices or ('cut',side)"""
    pieces=[];cur=[]
    def inside(px,pz):
        return nx0<=px<=nx1 and nz0<=pz<=nz1 and not(ox0<px<ox1 and oz0<pz<oz1)
    n=len(x)
    for k in range(n-1):
        ax,az,bx,bz=x[k],z[k],x[k+1],z[k+1]
        # breakpoints along segment where crossing box lines
        ts={0.0,1.0}
        for (p0,p1,lim) in((ax,bx,ox0),(ax,bx,ox1),(ax,bx,nx0),(ax,bx,nx1),(az,bz,oz0),(az,bz,oz1),(az,bz,nz0),(az,bz,nz1)):
            if (p0-lim)*(p1-lim)<0: ts.add((lim-p0)/(p1-p0))
        ts=sorted(ts)
        for i in range(len(ts)-1):
            ta,tb=ts[i],ts[i+1]; tm=(ta+tb)/2
            mx,mz=ax+(bx-ax)*tm,az+(bz-az)*tm
            if inside(mx,mz):
                pa=(ax+(bx-ax)*ta,az+(bz-az)*ta, k if ta==0 else ('cut',))
                pb=(ax+(bx-ax)*tb,az+(bz-az)*tb, k+1 if tb==1 else ('cut',))
                if not cur: cur=[pa]
                elif cur[-1][2]!=pa[2] or (cur[-1][0],cur[-1][1])!=(pa[0],pa[1]): 
                    pieces.append(cur); cur=[pa]
                cur.append(pb)
            else:
                if cur: pieces.append(cur); cur=[]
    if cur: pieces.append(cur)
    return [p for p in pieces if len(p)>=2]
pieces=[]  # (cls, tags, [(nodeid,x,z)])
cutid=-1
for wid,t,ids,ll in HW:
    h=t.get('highway')
    if h not in WORLD and h not in TILE: continue
    if t.get('area')=='yes': continue
    if h=='service' and t.get('service') in('parking_aisle','drive-through','emergency_access'): continue
    a=np.frombuffer(ll,dtype=np.float64).reshape(-1,2)
    x=(a[:,0]-139.755)*Ay; z=-(a[:,1]-35.64)*QS
    if x.max()<nx0 or x.min()>nx1 or z.max()<nz0 or z.min()>nz1: continue
    if x.min()>ox0 and x.max()<ox1 and z.min()>oz0 and z.max()<oz1: continue
    for p in clip(list(x),list(z)):
        pts=[]
        for px,pz,src in p:
            if isinstance(src,tuple):
                pts.append((cutid,px,pz)); cutid-=1
            else: pts.append((int(ids[src]),px,pz))
        pieces.append((h,t,pts))
print('pieces',len(pieces),flush=True)
# junction detection
cnt=collections.Counter()
for h,t,pts in pieces:
    for i,(nid,_,_) in enumerate(pts):
        cnt[nid]+= 2 if i in(0,len(pts)-1) else 1
def isworld(h): return h in WORLD
worldnode=set()
for h,t,pts in pieces:
    if isworld(h):
        for nid,_,_ in pts:
            if cnt[nid]>=2: worldnode.add(nid)
def dp(pts,tol):
    if len(pts)<3: return pts
    a=np.array([(p[1],p[2]) for p in pts]); keep=[0,len(pts)-1]; st=[(0,len(pts)-1)]
    while st:
        i,j=st.pop(); 
        if j<=i+1: continue
        A=a[i];B=a[j];d=B-A;L=math.hypot(*d)
        seg=a[i+1:j]
        if L<1e-9: dist=np.hypot(*(seg-A).T)
        else: dist=np.abs(d[0]*(seg[:,1]-A[1])-d[1]*(seg[:,0]-A[0]))/L
        k=int(np.argmax(dist))
        if dist[k]>tol: m=i+1+k; keep.append(m); st+=[(i,m),(m,j)]
    keep=sorted(keep); return [pts[k] for k in keep]
wedges=[];tedges=[]
for h,t,pts in pieces:
    # split at junctions (cnt>=2 interior or worldnode)
    seg=[pts[0]]
    for i in range(1,len(pts)):
        seg.append(pts[i])
        nid=pts[i][0]
        if i==len(pts)-1 or cnt[nid]>=2 or nid in worldnode:
            if len(seg)>=2:
                (wedges if isworld(h) else tedges).append((h,t,seg))
            seg=[pts[i]]
print('world edges',len(wedges),'tile edges',len(tedges),flush=True)
# ---------- old boundary snapping ----------
deg=collections.Counter()
for e in OE: deg[e[0]]+=1; deg[e[1]]+=1
okind={}
for e in OE: okind.setdefault(e[0],e[2]); okind.setdefault(e[1],e[2])
def bd(x,z): return min(abs(x-ox0),abs(x-ox1),abs(z-oz0),abs(z-oz1))
dang=[i for i in deg if deg[i]==1 and bd(ON[i][0],ON[i][1])<25]
dT=cKDTree(np.array([ON[i][:2] for i in dang]))
snap={}  # cut node id -> old node idx
used=set()
cands=[]
for h,t,seg in wedges+[x for x in tedges if x[0] in('tertiary','tertiary_link')]:
    for p in (seg[0],seg[-1]):
        if p[0]<0 and bd(p[1],p[2])<1:
            for d,j in zip(*dT.query((p[1],p[2]),k=4,distance_upper_bound=40)):
                if j<len(dang):
                    k=WORLD.get(h,3); ok=okind[dang[j]]
                    pen=0 if ok==k else (15 if {ok,k}<= {1,2,3} else 40)
                    cands.append((d+pen,p[0],dang[j]))
for d,cid,oi in sorted(cands):
    if cid in snap or oi in used: continue
    snap[cid]=oi; used.add(oi)
print('snapped',len(snap),'of dangling',len(dang),flush=True)
# ---------- assign world node indices ----------
names=list(W['roadNames']); nidx={n:i for i,n in enumerate(names)}
NODES=[]; nodemap={}
base=len(ON)
def gnode(nid,x,z):
    if nid in snap: return snap[nid]
    if nid not in nodemap:
        nodemap[nid]=base+len(NODES); NODES.append([round(x,1),round(z,1),0])
    return nodemap[nid]
EDGES=[]; xinfo=collections.defaultdict(list)
for h,t,seg in wedges:
    k=WORLD[h]
    seg=dp(seg,0.8)
    a=gnode(*seg[0]); b=gnode(*seg[-1])
    if a==b and len(seg)<3: continue
    mid=[[round(p[1],1),round(p[2],1)] for p in seg[1:-1]]
    if seg[0][0] in snap: pass
    nm=t.get('name') or t.get('ref') or ''
    if k==0 and not nm: nm=t.get('ref','')
    road=-1
    if nm:
        if nm not in nidx: nidx[nm]=len(names); names.append(nm)
        road=nidx[nm]
    ow=t.get('oneway') in('yes','1','true') or (k in(0,4) and t.get('oneway')!='no')
    rev=t.get('oneway')=='-1'
    if rev: a,b=b,a; mid=mid[::-1]; ow=True
    L=num(t.get('lanes'),-1)
    layer=num(t.get('layer'),0); bridge=t.get('bridge') not in(None,'no')
    top=0
    if k==0:
        l=L if L>0 else 2; l=min(l,4); hw={1:30,2:48,3:65,4:82}[l]; lanes=l; owf=1; side=0
        if bridge and layer>=2: top=int(round((12+6.5*(min(layer,4)-1))*10))
    elif k==4:
        l=L if L>0 else 1; l=min(l,4); hw={1:28,2:45,3:62,4:80}[l]; lanes=min(l,3); owf=1; side=0
        if bridge and layer>=2: top=int(round((12+6.5*(min(layer,4)-1))*10))
    else:
        sd={1:(35,28),2:(30,24),3:(20,16)}[k]
        if ow:
            l=L if L>0 else (2 if k==1 else 1); l=min(l,4)
            hw=int(round((l*1.6+0.4)*10)); lanes=min(l,3); owf=1; side=sd[1]
        else:
            l=L if L>0 else 2; l=min(l,8)
            hw=int(round((l*1.6+0.2)*10)); lanes=max(1,min(3,l//2)); owf=0; side=sd[0]
    EDGES.append([a,b,k,road,mid,hw,lanes,owf,side,top])
    if k in(0,4):
        for v in(a,b): xinfo[v].append((k,top))
# node heights for expressway graph
ground=set()
for e in EDGES:
    if e[2] not in(0,4):
        ground.add(e[0]);ground.add(e[1])
for v,lst in xinfo.items():
    if v<base: continue
    hasX=any(k==0 for k,_ in lst)
    tops=[tp for k,tp in lst if tp>0]
    if v in ground: y=0
    elif tops: y=max(tops)/10
    elif hasX: y=12.0
    else: y=0
    NODES[v-base][2]=y
print('new world nodes',len(NODES),'edges',len(EDGES),'names',len(names)-len(W['roadNames']),flush=True)
# ---------- tile streets ----------
T=[]
for h,t,seg in tedges:
    seg=dp(seg,0.6)
    ow=t.get('oneway') in('yes','1','true','-1')
    if t.get('oneway')=='-1': seg=seg[::-1]
    hw=TILE[h][1 if ow else 0]
    # split long
    out=[[seg[0]]]
    acc=0
    for p in seg[1:]:
        q=out[-1][-1]; acc+=math.hypot(p[1]-q[1],p[2]-q[2]); out[-1].append(p)
        if acc>600 and p is not seg[-1]: out.append([p]); acc=0
    for s in out:
        ends=[]
        for p in (s[0],s[-1]):
            if p[0] in snap: ends.append(('g',snap[p[0]]))
            elif p[0] in nodemap: ends.append(('g',nodemap[p[0]]))
            else: ends.append(('l',p[0],round(p[1],1),round(p[2],1)))
        T.append((ends[0],ends[1],int(round(hw*10)),1|(16 if ow else 0),[(round(p[1],1),round(p[2],1)) for p in s[1:-1]],(s[0][1],s[0][2]),(s[-1][1],s[-1][2])))
print('tile streets',len(T),flush=True)
os.makedirs(SC+'/gen',exist_ok=True)
pickle.dump(dict(nodes=NODES,edges=EDGES,names=names,tiles=T,snap=snap),open(SC+'/gen/roads.pkl','wb'))
