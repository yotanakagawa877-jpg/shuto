import sys,os;sys.path.insert(0,os.path.dirname(__file__))
import numpy as np,pickle,json,math,collections,re,copy
from geo import *
from scipy.spatial import cKDTree
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
W=json.load(open(SC+'/work/world.json'))
RAILS=copy.deepcopy(W['rails']); SVC=copy.deepcopy(W['svc'])
ox0,oz0,ox1,oz1=box(OLD); nx0,nz0,nx1,nz1=box(NEW)
RW=pickle.load(open(SC+'/ex/rw.pkl','rb'))
REL=pickle.load(open(SC+'/ex/rel.pkl','rb'))
STN=pickle.load(open(SC+'/ex/stn.pkl','rb'))
RD=pickle.load(open(SC+'/gen/roads.pkl','rb'))
stnode={nid:(P(lo,la),t) for nid,lo,la,t in STN}
# ---- rail graph
OKR=('rail','subway','light_rail','monorail','tram','narrow_gauge')
adj=collections.defaultdict(list); xy={}; wtag={}
for wid,t,ids,ll in RW:
    if t.get('railway') not in OKR: continue
    if t.get('service') in('yard','siding','spur','crossover') : continue
    if t.get('usage') in('industrial','military','test'): continue
    a=np.frombuffer(ll,dtype=np.float64).reshape(-1,2)
    wtag[wid]=t
    for k,nid in enumerate(ids):
        xy[int(nid)]=P(a[k,0],a[k,1])
    for k in range(len(ids)-1):
        u,v=int(ids[k]),int(ids[k+1]); adj[u].append((v,wid)); adj[v].append((u,wid))
way_rels=collections.defaultdict(set); relinfo={}
for rid,t,mem in REL:
    if t.get('type')!='route' or t.get('route') not in('train','subway','light_rail','monorail','tram'): continue
    relinfo[rid]=(t,mem)
    for ty,ref,role in mem:
        if ty=='w': way_rels[ref].add(rid)
# sample points on graph for nearest lookup
sp=[];sinfo=[]
for u,lst in adj.items():
    for v,wid in lst:
        if u<v:
            (ax,az),(bx,bz)=xy[u],xy[v]; L=math.hypot(bx-ax,bz-az); n=max(1,int(L/4))
            for s in range(n+1): sp.append((ax+(bx-ax)*s/n,az+(bz-az)*s/n)); sinfo.append((u,v,wid))
ST=cKDTree(np.array(sp))
def ang(a,b): return math.atan2(b[1]-a[1],b[0]-a[0])
def adiff(a,b): return abs((a-b+math.pi)%(2*math.pi)-math.pi)
def tokens(ja):
    s=re.sub(r'\(.*?\)|（.*?）','',ja); s=re.sub(r'^(JR|東京メトロ|都営|東急|京王|小田急|西武|東武|京成|京急|相鉄|横浜市営地下鉄)','',s)
    return [x for x in re.split(r'[・→]',s) if len(x)>=2]
def inbox(p): return nx0<=p[0]<=nx1 and nz0<=p[1]<=nz1
def inold(p): return ox0<p[0]<ox1 and oz0<p[1]<oz1
EXPRESS=re.compile(r'列車|特急|ライナー|ふじさん|踊り子|しおさい|さざなみ|ちちぶ|スカイライナー|あずさ|かいじ|ひたち|ときわ|わかしお|成田エクスプレス|むさし|快速アクティー|湘南ライナー|はやて|こまち|とき|つばさ|あさま|やまびこ|なすの|かがやき|はくたか|ロマンスカー|きぬ|りょうもう|スペーシア')
def walk(path,ja,maxlen=90000):
    """extend from path[-1] following path direction"""
    E=path[-1]; back=path[max(0,len(path)-12)]
    d0=ang(back,E)
    # relations near the last 600m
    near=collections.Counter()
    for p in path[-75::5]:
        for j in ST.query_ball_point(p,6):
            u,v,wid=sinfo[j]
            a=ang(xy[u],xy[v])
            if min(adiff(a,d0),adiff(a+math.pi,d0))<0.5:
                for r in way_rels.get(wid,()): near[r]+=1
    tk=tokens(ja)
    R0=[r for r in near if any(x in relinfo[r][0].get('name','') for x in tk)]
    if not R0: R0=list(near)
    allowed=set()
    for r in R0:
        for ty,ref,role in relinfo[r][1]:
            if ty=='w': allowed.add(ref)
    # start: nearest graph edge aligned with direction
    best=None
    for d,j in zip(*ST.query(E,k=40,distance_upper_bound=40)):
        if j>=len(sinfo): break
        u,v,wid=sinfo[j]
        for (a,b) in((u,v),(v,u)):
            dd=adiff(ang(xy[a],xy[b]),d0)
            if dd<0.6:
                sc=d+dd*30+(0 if wid in allowed else 15)
                if best is None or sc<best[0]: best=(sc,a,b,wid)
    if not best: return [],R0,0
    _,a,b,wid=best
    out=[];cur_prev,cur=a,b;L=0;onallowed=wid in allowed;left_old=False
    # start from projection of E onto segment
    out.append(E)
    visited=set()
    while True:
        p=xy[cur]
        # stop conditions
        if not inbox(p):
            # clip at box
            q=out[-1]
            t=1.0
            for lim,i,lo in((nx0,0,1),(nx1,0,0),(nz0,1,1),(nz1,1,0)):
                if (q[i]-lim)*(p[i]-lim)<0: t=min(t,(lim-q[i])/(p[i]-q[i]))
            out.append((q[0]+(p[0]-q[0])*t,q[1]+(p[1]-q[1])*t)); break
        if not inold(p): left_old=True
        # ensure we move forward (project): skip points behind E
        if len(out)==1:
            if ( (p[0]-E[0])*math.cos(d0)+(p[1]-E[1])*math.sin(d0) )>0: out.append(p)
        else: out.append(p)
        L+=math.hypot(p[0]-out[-2][0],p[1]-out[-2][1]) if len(out)>1 else 0
        if L>maxlen or cur in visited: break
        visited.add(cur)
        qq=None
        for q in reversed(out):
            if math.hypot(q[0]-p[0],q[1]-p[1])>3: qq=q; break
        din=ang(qq,p) if (qq is not None and len(out)>2 and math.hypot(xy[cur_prev][0]-p[0],xy[cur_prev][1]-p[1])<3) else ang(xy[cur_prev],p)
        cands=[]
        for v,w2 in adj[cur]:
            if v==cur_prev: continue
            t=adiff(ang(p,xy[v]),din)
            if t>0.9: continue
            pen=t*57 + (0 if w2 in allowed else 25)
            cands.append((pen,v,w2))
        if not cands:
            # bridge small topology gaps: nearest graph node ahead within 25m
            jb=None
            for d,j in zip(*ST.query(p,k=30,distance_upper_bound=25)):
                if j>=len(sinfo): break
                u,v,w2=sinfo[j]
                for c in (u,v):
                    if c==cur or c in visited: continue
                    q=xy[c]; 
                    if math.hypot(q[0]-p[0],q[1]-p[1])<3:
                        if len(adj[c])==1: jb=(c,w2); break
                        continue
                    if adiff(ang(p,q),din)<0.5 and (w2 in allowed or not allowed): jb=(c,w2); break
                if jb: break
            if not jb: break
            cands=[(0,jb[0],jb[1])]
        cands.sort()
        pen,v,w2=cands[0]
        if onallowed and allowed and w2 not in allowed and not any(c[2] in allowed for c in cands): break
        if w2 in allowed: onallowed=True
        cur_prev,cur=cur,v
    return out,R0,L
def resample(pts,step=8.0):
    out=[pts[0]];carry=0.0
    for a,b in zip(pts,pts[1:]):
        L=math.hypot(b[0]-a[0],b[1]-a[1]); 
        if L<1e-6: continue
        s=step-carry
        while s<=L:
            out.append((a[0]+(b[0]-a[0])*s/L,a[1]+(b[1]-a[1])*s/L)); s+=step
        carry=L-(s-step)
    if math.hypot(out[-1][0]-pts[-1][0],out[-1][1]-pts[-1][1])>2: out.append(pts[-1])
    return out
def stops_of(R0):
    res={}
    for r in R0:
        t,mem=relinfo[r]
        for ty,ref,role in mem:
            if ty=='n' and ref in stnode and (role.startswith('stop') or role in('','station')):
                (x,z),tg=stnode[ref]
                nm=tg.get('name','')
                if not nm: continue
                nm=re.sub(r'駅$','',nm)
                res.setdefault(nm,[]).append(((x,z),tg.get('name:en','') or tg.get('name:ja-Latn','') or tg.get('name:ja_rm','')))
    return res
# station positions by name (railway=station nodes)
stn_by_name=collections.defaultdict(list)
for nid,lo,la,t in STN:
    if t.get('railway') in('station','halt') or t.get('public_transport')=='station':
        nm=re.sub(r'駅$','',t.get('name',''))
        if nm: stn_by_name[nm].append((P(lo,la),t.get('name:en','')))
def pick_stations(newpath,R0,existing_names,maxd=70):
    T=cKDTree(np.array(newpath)); found={}
    cand=stops_of(R0)
    if not cand:
        for nm,l in stn_by_name.items(): cand[nm]=l
    for nm,lst in cand.items():
        if nm in existing_names: continue
        for (x,z),en in lst+stn_by_name.get(nm,[]):
            d,i=T.query((x,z))
            if d<maxd and (nm not in found or d<found[nm][0]): found[nm]=(d,int(i),en or found.get(nm,(0,0,''))[2])
    st=sorted(((i,nm,en) for nm,(d,i,en) in found.items()))
    # drop stations closer than 300m to each other along path (keep first)
    out=[]
    for i,nm,en in st:
        if out and abs(i-out[-1][0])*8<250: continue
        out.append((i,nm,en))
    return out
def en_of(nm,en):
    if en: return re.sub(r' Station$','',en)
    return ''
# ---------- heights
XS=[]  # expressway segments for bumps (x1,z1,x2,z2,y)
ON=W['nodes']
allnodes=ON+RD['nodes']
for e in W['edges']+RD['edges']:
    if e[2] in(0,4):
        a=allnodes[e[0]];b=allnodes[e[1]]
        pts=[a[:2]]+e[4]+[b[:2]]; y=max(a[2],b[2],e[9]/10)
        if y<5: continue
        for p,q in zip(pts,pts[1:]): XS.append((p[0],p[1],q[0],q[1],y))
XA=np.array(XS); XT=cKDTree((XA[:,0:2]+XA[:,2:4])/2)
def seg_x(p,q,r,s):
    d=(q[0]-p[0])*(s[1]-r[1])-(q[1]-p[1])*(s[0]-r[0])
    if abs(d)<1e-9: return False
    t=((r[0]-p[0])*(s[1]-r[1])-(r[1]-p[1])*(s[0]-r[0]))/d; u=((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0]))/d
    return 0<=t<=1 and 0<=u<=1
tun_pts=[];
for wid,t,ids,ll in RW:
    if t.get('tunnel') in('yes','building_passage','covered') or (t.get('layer','0').lstrip('-').isdigit() and int(t.get('layer','0'))<0 and t.get('tunnel')):
        a=np.frombuffer(ll,dtype=np.float64).reshape(-1,2)
        for k in range(len(a)-1):
            p=P(*a[k]);q=P(*a[k+1]);L=math.hypot(q[0]-p[0],q[1]-p[1]);n=max(1,int(L/6))
            for s in range(n+1): tun_pts.append((p[0]+(q[0]-p[0])*s/n,p[1]+(q[1]-p[1])*s/n))
TT=cKDTree(np.array(tun_pts))
SL=0.035
def heights(path,kind,shin,y0=None):
    n=len(path)
    if kind=='sub': base=np.full(n,-16.0)
    elif kind=='tram': base=np.full(n,0.2)
    elif kind in('ats','mono'): base=np.full(n,10.0)
    else:
        base=np.full(n,13.0 if shin else 8.0)
        d,_=TT.query(np.array(path)); base[d<5]=-16.0
    # tunnel ramps: y=min_j(t_j+SL*dist)
    y=base.copy()
    idx=np.arange(n)*8.0
    lowi=np.where(base<0)[0]
    if len(lowi) and kind not in('sub',):
        for i in range(n):
            pass
        # forward/backward pass for min envelope
        for i in range(1,n): y[i]=min(y[i],y[i-1]+SL*8)
        for i in range(n-2,-1,-1): y[i]=min(y[i],y[i+1]+SL*8)
    # bumps over expressways
    if kind in('el',) :
        bump=np.full(n,-99.0)
        for i in range(n-1):
            p,q=path[i],path[i+1]
            for j in XT.query_ball_point(((p[0]+q[0])/2,(p[1]+q[1])/2),60):
                x1,z1,x2,z2,yy=XS[j]
                if seg_x(p,q,(x1,z1),(x2,z2)) and y[i]>0:
                    for k in range(max(0,i-3),min(n,i+5)): bump[k]=max(bump[k],yy+7.5)
        for i in range(1,n): bump[i]=max(bump[i],bump[i-1]-SL*8)
        for i in range(n-2,-1,-1): bump[i]=max(bump[i],bump[i+1]-SL*8)
        y=np.maximum(y,bump)
    if y0 is not None:
        for i in range(n): 
            lim=SL*8*(i+1)
            y[i]=min(max(y[i],y0-lim),y0+lim)
    return [round(float(v),2) for v in y]
# ---------- extensions
EXT={1:None}
names_all=collections.Counter(s['ja'] for r in RAILS for s in r['st'])
def bd(p): return min(abs(p[0]-ox0),abs(p[0]-ox1),abs(p[1]-oz0),abs(p[1]-oz1))
SKIP={(9,'end'),(78,'end'),(75,'start'),(75,'end'),(11,'start'),(1,'start'),(1,'end')}
report=[]
ext_done={}
PEND=[]
for ri,r in enumerate(RAILS):
    if r['code']=='x' or r.get('loop'): continue
    for side in('end','start'):
        p=r['path'] if side=='end' else r['path'][::-1]
        if bd(p[-1])>1300 or (ri,side) in SKIP: continue
        ext,R0,L=walk(p,r['ja'])
        if len(ext)<2 or L<300: report.append((ri,r['ja'],side,'noext',L)); continue
        newp=resample(ext)[1:]
        if len(newp)<5: continue
        exist=set(s['ja'] for s in r['st'])
        if r['code'] in('TK','TH') or r.get('shin'): sts=[]
        else:
            lasti=(r['st'][-1]['i'] if side=='end' else len(r['path'])-1-r['st'][0]['i']) if r['st'] else 0
            tail=[tuple(q) for q in p[lasti+30:]]
            sts=pick_stations(tail+newp,R0,exist)
            sts=[(i-len(tail),nm,en) for i,nm,en in sts]
        ys=heights(newp,r['kind'],bool(r.get('shin')) or r['code'] in('TK','TH'),y0=r['ys'][-1] if side=='end' else r['ys'][0])
        add=len(newp)
        arc=sum(math.hypot(b[0]-a[0],b[1]-a[1]) for a,b in zip([p[-1]]+newp,newp))
        oldlen=sum(math.hypot(b[0]-a[0],b[1]-a[1]) for a,b in zip(r['path'],r['path'][1:]))
        newst=[]
        if side=='end':
            n0=len(r['path'])
            r['path']=r['path']+[[round(x,1),round(z,1)] for x,z in newp]; r['ys']=r['ys']+ys
            for i,nm,en in sts: newst.append({'ja':nm,'en':en_of(nm,en),'i':n0+i})
            r['st']=r['st']+newst
            # svc legs
            for s in SVC:
                for li,lg in enumerate(s['legs']):
                    if lg[0]!=ri: continue
                    hit=None
                    if abs(lg[2]-oldlen)<2: lg[2]=round(oldlen+arc,1); hit=li
                    elif abs(lg[1]-oldlen)<2: lg[1]=round(oldlen+arc,1); hit=li
                    if hit is not None:
                        k0=len(r['st'])-len(newst)
                        exp=bool(re.search(r'特急|特別快速|快特|ライナー|通勤快速',s['type'])) or s['model'].startswith('s:') or s['model'].startswith('l:')
                        for k,st in enumerate(newst):
                            PEND.append((s,li,k0+k,st['ja'],exp,k==len(newst)-1))
        else:
            newp=newp[::-1]; ys=ys[::-1]; sts=[(len(newp)-1-i,nm,en) for i,nm,en in sts][::-1]
            r['path']=[[round(x,1),round(z,1)] for x,z in newp]+r['path']; r['ys']=ys+r['ys']
            for s in r['st']: s['i']+=add
            for i,nm,en in sts: newst.append({'ja':nm,'en':en_of(nm,en),'i':i})
            r['st']=newst+r['st']
            for s in SVC:
                hits=[]
                for li,lg in enumerate(s['legs']):
                    if lg[0]!=ri: continue
                    a0,a1=lg[1],lg[2]
                    lg[1]=0.0 if abs(a0)<2 else round(a0+arc,1)
                    lg[2]=0.0 if abs(a1)<2 else round(a1+arc,1)
                    if abs(a0)<2 or abs(a1)<2: hits.append(li)
                # shift station indices of stops on this rail
                for stp in s['stops']:
                    if s['legs'][stp[0]][0]==ri: stp[1]+=len(newst)
                for li in hits:
                    exp=bool(re.search(r'特急|特別快速|快特|ライナー|通勤快速',s['type'])) or s['model'].startswith('s:') or s['model'].startswith('l:')
                    for k,st in enumerate(newst):
                        PEND.append((s,li,k,st['ja'],exp,k==0))
        report.append((ri,r['ja'],side,round(arc),[x['ja'] for x in newst]))
        ext_done[(ri,side)]=len(newp)
cnt=collections.Counter(st['ja'] for r in RAILS for st in r['st'])
for s_,li,k,nm,exp,term in PEND:
    if exp and cnt[nm]<2 and not term: continue
    s_['stops'].append([li,k])
for x in report: print(x)
pickle.dump(dict(rails=RAILS,svc=SVC,report=report),open(SC+'/gen/rails_ext.pkl','wb'))
