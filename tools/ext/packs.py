import sys,os;sys.path.insert(0,os.path.dirname(__file__))
import numpy as np,pickle,json,math,collections,struct,gzip,base64,random
import shapely
from shapely.geometry import LineString,Polygon,box as sbox
from scipy.spatial import cKDTree
from geo import *
import pack
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
OUT=SC+'/out/data/t2'; os.makedirs(OUT,exist_ok=True)
SRC='/tmp/claude-0/-home-user-shuto/d6d742ba-4800-50fe-b3b3-a208396ee356/scratchpad/oldsite/data/t2'
TILE=1280;PK=5;PS=TILE*PK
ox0,oz0,ox1,oz1=box(OLD); nx0,nz0,nx1,nz1=box(NEW)
W=json.load(open(SC+'/work/world.json')); ON=W['nodes']
RD=pickle.load(open(SC+'/gen/roads.pkl','rb'))
RS=pickle.load(open(SC+'/gen/rails_sites.pkl','rb'))
ALLN=ON+RD['nodes']
# ---------------- buildings selection
D=np.load(SC+'/ex/bld.npz'); cx,cz,area,lev,hgt,offs,C=[D[k] for k in('cx','cz','area','lev','hgt','offs','C')]
sel=np.where((cx>=nx0)&(cx<nx1)&(cz>=nz0)&(cz<nz1)&~((cx>=ox0)&(cx<ox1)&(cz>=oz0)&(cz<oz1))&(area>=15))[0]
print('new buildings',len(sel),flush=True)
CACHE=SC+'/gen/battr.npz'
if os.path.exists(CACHE):
    _c=np.load(CACHE); H,B5,B8,B7=_c['H'],_c['B5'],_c['B8'],_c['B7']
else:
  AT=cKDTree(np.stack([cx,cz],1)[np.where((cx>=nx0-200)&(cx<nx1+200)&(cz>=nz0-200)&(cz<nz1+200))[0]])
  dens=AT.query_ball_point(np.stack([cx[sel],cz[sel]],1),100,return_length=True,workers=4)
  print('density done',flush=True)
  # ---------------- attribute model
  HR=np.load(SC+'/work/hrows.npy')
  AB=np.array([0,40,80,150,300,600,1500,1e12]);DB=np.array([0,5,10,20,35,60,100,1e12]);HB=np.array([0,8,12,20,30,45,70,1e12])
  def bins(v,b): return np.clip(np.searchsorted(b,v,side='right')-1,0,len(b)-2)
  ra=bins(HR[:,0],AB); rd=bins(HR[:,1],DB); rh=bins(HR[:,3],HB)
  UNT=collections.defaultdict(list); TAG=collections.defaultdict(list)
  for i in range(len(HR)):
      if HR[i,2]==0: UNT[(ra[i],rd[i])].append(i)
      TAG[(ra[i],rh[i])].append(i)
  UNT={k:np.array(v) for k,v in UNT.items()}; TAG={k:np.array(v) for k,v in TAG.items()}
  rng=np.random.default_rng(20261103)
  sa=bins(area[sel],AB); sd=bins(np.asarray(dens),DB)
  H=np.zeros(len(sel),np.float32); B5=np.zeros(len(sel),np.uint8); B8=np.zeros(len(sel),np.uint8)
  for k in range(len(sel)):
      o=sel[k]
      if hgt[o]>0 or lev[o]>0:
          h=hgt[o] if hgt[o]>0 else lev[o]*3.3+0.8
          h=float(min(max(h,2.5),400)); hb=bins(np.array([h]),HB)[0]
          g=TAG.get((sa[k],hb))
          if g is None or len(g)==0: g=TAG.get((min(sa[k],5),hb))
          if g is None: g=np.arange(len(HR))
          j=g[rng.integers(len(g))]; H[k]=h; B5[k]=int(HR[j,4]); B8[k]=int(HR[j,5])
      else:
          g=UNT.get((sa[k],sd[k]))
          if g is None or len(g)<20:
              g=np.concatenate([UNT.get((sa[k],dd),np.array([],int)) for dd in range(len(DB)-1)])
          j=g[rng.integers(len(g))]; H[k]=HR[j,3]; B5[k]=int(HR[j,4]); B8[k]=int(HR[j,5])
  B7=rng.integers(0,256,len(sel)).astype(np.uint8)
  np.savez(CACHE,H=H,B5=B5,B8=B8,B7=B7)
print('attrs done',flush=True)
# ---------------- corridors (shapely geometries)
cor=[]
for e in RD['edges']:
    a=ALLN[e[0]];b=ALLN[e[1]]; pts=[a[:2]]+e[4]+[b[:2]]
    if e[2] in(0,4) and max(a[2],b[2])>3: continue   # elevated expressway: buildings may stand below? keep clear anyway small
    w=e[5]/10+e[8]/10+0.5
    if len(pts)>=2: cor.append(LineString(pts).buffer(w,cap_style='flat'))
for s,e2,hw,lf,mid,p0,p1 in RD['tiles']:
    pts=[p0]+mid+[p1]
    cor.append(LineString(pts).buffer(hw/10+0.4,cap_style='flat'))
nroad=len(cor)
RAILS=RS['rails']
oldR=W['rails']
def rail_new_parts(ri,r):
    """indices of path points that are new (not in old data)"""
    if ri>=len(oldR): return [(0,len(r['path']))]
    o=oldR[ri]; n=len(r['path']); m=len(o['path'])
    if n==m: return []
    # find where old path sits
    if r['path'][0]==o['path'][0]: return [(m-1,n)]
    if r['path'][-1]==o['path'][-1]: return [(0,n-m+1)]
    k=n-m  # both sides extended: locate
    for s in range(0,n-m+1):
        if r['path'][s]==o['path'][0] and r['path'][s+m-1]==o['path'][-1]: return [(0,s+1),(s+m-1,n)]
    return [(0,n)]
railcor=[]
for ri,r in enumerate(RAILS):
    if r['kind']=='sub': continue
    hw={'el':6.0,'tram':3.5,'ats':5.0,'mono':4.0}[r['kind']]+(1.5 if r.get('shin') else 0)
    for s0,s1 in rail_new_parts(ri,r):
        seg=[];
        for i in range(s0,s1):
            if r['ys'][i]>-1: seg.append(tuple(r['path'][i]))
            elif len(seg)>=2: railcor.append(LineString(seg).buffer(hw,cap_style='flat')); seg=[]
            else: seg=[]
        if len(seg)>=2: railcor.append(LineString(seg).buffer(hw,cap_style='flat'))
        for st in r['st']:
            if s0<=st['i']<s1 and r['ys'][st['i']]>-1 and r['kind']!='tram':
                a=max(0,st['i']-15);b=min(len(r['path']),st['i']+16)
                if b-a>=2: railcor.append(LineString(r['path'][a:b]).buffer(16 if r['kind']=='el' else 9,cap_style='flat'))
for s in RS['sites']:
    c,sn=math.cos(s['rot']),math.sin(s['rot']); w=s['w']/2+8; d=s['d']/2+8
    cor.append(Polygon([(s['x']+c*u-sn*v,s['z']+sn*u+c*v) for u,v in((-w,-d),(w,-d),(w,d),(-w,d))]))
cor+=railcor
print('corridors',len(cor),'rail',len(railcor),flush=True)
CT=shapely.STRtree(cor)
RCT=shapely.STRtree(railcor) if railcor else None
# ---------------- group by tile
tkey=lambda x,z:(math.floor(x/TILE),math.floor(z/TILE))
btile=collections.defaultdict(list)
for k,o in enumerate(sel): btile[tkey(cx[o],cz[o])].append(k)
stile=collections.defaultdict(list)
for k,(s,e2,hw,lf,mid,p0,p1) in enumerate(RD['tiles']):
    stile[tkey((p0[0]+p1[0])/2,(p0[1]+p1[1])/2)].append(k)
packs=set()
for (tx,tz) in list(btile)+list(stile): packs.add((math.floor(tx/PK),math.floor(tz/PK)))
oldpacks={tuple(map(int,f[:-4].split('_'))) for f in os.listdir(SRC)}
# old packs touched by new rail corridors
for g in railcor:
    x0_,z0_,x1_,z1_=g.bounds
    for px in range(math.floor(x0_/PS),math.floor(x1_/PS)+1):
        for pz in range(math.floor(z0_/PS),math.floor(z1_/PS)+1): packs.add((px,pz))
packs=sorted(p for p in packs|oldpacks)
if os.environ.get('PACKS'): packs=[tuple(map(int,x.split('_'))) for x in os.environ['PACKS'].split(',')]
print('packs',len(packs),flush=True)
def q16(v):
    v=int(round(v*10)); 
    if not -32768<=v<=32767: raise ValueError(v)
    return v
def do_tile(tx,tz,t,stats):
    gx=(tx+.5)*TILE; gz=(tz+.5)*TILE
    tb=sbox(tx*TILE-50,tz*TILE-50,(tx+1)*TILE+50,(tz+1)*TILE+50)
    # --- zero old buildings on new rail corridors
    if t['bld'] and RCT is not None:
        hits=RCT.query(tb)
        if len(hits):
            rc=shapely.union_all([railcor[i] for i in hits])
            xs=[];
            recs=t['bld']
            ctr=np.array([struct.unpack_from('<hh',r,0) for r in recs],float)/10+[gx,gz]
            ws=np.array([(r[5]/4,r[6]/4) for r in recs]); rot=np.array([r[4]/255*math.pi for r in recs])
            ca,sa_=np.cos(rot),np.sin(rot)
            polys=[]
            for i in range(len(recs)):
                w2,d2=ws[i]/2
                polys.append(Polygon([(ctr[i,0]+ca[i]*u-sa_[i]*v,ctr[i,1]+sa_[i]*u+ca[i]*v) for u,v in((-w2,-d2),(w2,-d2),(w2,d2),(-w2,d2))]))
            hit=shapely.intersects(np.array(polys,dtype=object),rc)
            kill=set()
            for i in np.flatnonzero(hit):
                if polys[i].intersection(rc).area>0.25*max(polys[i].area,1):
                    r=bytearray(recs[i]); r[5]=0;r[6]=0;r[8]=0;r[9]=0; recs[i]=bytes(r); kill.add(i)
            if kill:
                t['polys']=[p for p in t['polys'] if p[0] not in kill]; stats['oldkill']+=len(kill)
    # --- new streets
    sk=stile.get((tx,tz),[])
    if sk:
        lmap={}
        def ref(e):
            if e[0]=='g': return e[1]
            nid=e[1]
            if nid not in lmap:
                lmap[nid]=len(t['nodes']); t['nodes'].append((q16(e[2]-gx),q16(e[3]-gz)))
            return -1-lmap[nid]
        for k in sk:
            s,e2,hw,lf,mid,p0,p1=RD['tiles'][k]
            a=ref(s);b=ref(e2)
            t['edges'].append(((a,b,3,min(255,hw),lf,0,len(mid)),[(q16(x-gx),q16(z-gz)) for x,z in mid]))
        stats['streets']+=len(sk)
    # --- new buildings
    bk=btile.get((tx,tz),[])
    if bk:
        rings=[C[offs[sel[k]]:offs[sel[k]+1]] for k in bk]
        P0=np.empty(len(rings),dtype=object)
        for j,r in enumerate(rings):
            P0[j]=Polygon(r) if len(r)>=3 else Polygon([(0,0),(0,0),(0,0)])
        P0=shapely.make_valid(P0)
        hits=CT.query(tb)
        if len(hits):
            U=shapely.union_all([cor[i] for i in hits])
            inter=shapely.intersects(P0,U)
        else: U=None; inter=np.zeros(len(bk),bool)
        base_n=len(t['bld'])
        for j,k in enumerate(bk):
            g=P0[j]; a0=area[sel[k]]; clipped=False
            if inter[j]:
                g2=g.difference(U)
                if g2.is_empty or g2.area<0.5*a0: stats['drop']+=1; continue
                if g2.area<0.97*a0: clipped=True
                g=g2
            if g.geom_type!='Polygon':
                parts=[p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon']
                if not parts: stats['drop']+=1; continue
                g=max(parts,key=lambda p:p.area)
                if g.area<12: stats['drop']+=1; continue
            ar=g.area
            if ar<12: stats['drop']+=1; continue
            obb=g.minimum_rotated_rectangle
            cs=list(obb.exterior.coords)
            if len(cs)<5: stats['drop']+=1; continue
            e1=math.dist(cs[0],cs[1]); e2_=math.dist(cs[1],cs[2])
            if e1>=e2_: rot=math.atan2(cs[1][1]-cs[0][1],cs[1][0]-cs[0][0]); w,d=e1,e2_
            else: rot=math.atan2(cs[2][1]-cs[1][1],cs[2][0]-cs[1][0]); w,d=e2_,e1
            rot%=math.pi
            ob=w*d; rect=ar/ob if ob>0 else 1
            sc=math.sqrt(ar/ob) if ob>0 else 1
            cxo=(cs[0][0]+cs[2][0])/2; czo=(cs[0][1]+cs[2][1])/2
            w*=sc; d*=sc
            big=w>63.7 or d>63.7
            rec=struct.pack('<hhBBBBHBB',q16(cxo-gx),q16(czo-gz),min(255,int(round(rot/math.pi*255))),min(255,max(1,int(round(w*4)))),min(255,max(1,int(round(d*4)))),int(B5[k]),int(round(H[k]*10)),int(B7[k]),int(B8[k]))
            bi=len(t['bld']); t['bld'].append(rec)
            if clipped or rect<0.85 or big:
                sp=g.simplify(0.3)
                ext=list(sp.exterior.coords)[:-1]
                if 3<=len(ext)<=255:
                    if shapely.is_ccw(sp.exterior): pass
                    t['polys'].append((bi,len(ext),b''.join(struct.pack('<hh',q16(x-gx),q16(z-gz)) for x,z in ext)))
            stats['bld']+=1
        if bi_over(t): raise RuntimeError('too many buildings in tile')
    return t
def bi_over(t): return len(t['bld'])>=65535
def do_pack(pk):
    px,pz=pk
    fn=SRC+'/%d_%d.txt'%(px,pz)
    stats=collections.Counter()
    if os.path.exists(fn):
        _,_,tiles=pack.parse_raw(pack.load(fn)); stats['old']=1
    else:
        tiles=[dict(nodes=[],edges=[],bld=[],polys=[]) for _ in range(PK*PK)]
    changed=False
    for o in range(PK*PK):
        tx=px*PK+o//PK; tz=pz*PK+o%PK
        before=(len(tiles[o]['bld']),len(tiles[o]['edges']))
        b4=list(tiles[o]['bld'])
        do_tile(tx,tz,tiles[o],stats)
        if (len(tiles[o]['bld']),len(tiles[o]['edges']))!=before or tiles[o]['bld']!=b4: changed=True
    if not changed and stats['old']:
        raw=open(fn).read(); data=pack.load(fn)
        open(OUT+'/%d_%d.txt'%(px,pz),'w').write(raw); return (px,pz,len(data),dict(stats),False)
    if not stats['old'] and not any(t['bld'] or t['edges'] for t in tiles): return None
    data=pack.build(px,pz,tiles)
    gz=gzip.compress(data,9,mtime=0)
    open(OUT+'/%d_%d.txt'%(px,pz),'w').write(base64.b64encode(gz).decode())
    return (px,pz,len(data),dict(stats),True)
if __name__=='__main__':
    import multiprocessing as mp
    with mp.get_context('fork').Pool(4) as pool:
        res=[]
        for r in pool.imap_unordered(do_pack,packs):
            if r: res.append(r); print(r[0],r[1],r[2],r[3],r[4],flush=True)
    pickle.dump(res,open(SC+'/gen/packs_res.pkl','wb'))
    tot=collections.Counter()
    for r in res: tot.update(r[3])
    print('TOTAL',dict(tot),len(res))
