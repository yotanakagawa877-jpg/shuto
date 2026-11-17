import sys,os;sys.path.insert(0,os.path.dirname(__file__))
exec(open(os.path.dirname(os.path.abspath(__file__))+'/rails.py').read().split('# ---------- extensions')[0])
E=pickle.load(open(SC+'/gen/rails_ext.pkl','rb')); RAILS=E['rails']; SVC=E['svc']
COL={'deepskyblue':'#00bfff','darkgreen':'#006400','blue':'#0000ff','green':'#008000','red':'#ff0000','orange':'#ffa500','navy':'#000080','purple':'#800080','gray':'#808080','grey':'#808080'}
OPCOL=[('東日本旅客鉄道','#3a9b3a'),('JR','#3a9b3a'),('東武','#1f4a9c'),('西武','#2b5aa8'),('京成','#1f3f8f'),('京急','#00a0e0'),('京浜急行','#00a0e0'),('小田急','#2a62b6'),('京王','#c8006e'),('東急','#da0442'),('相模鉄道','#1c3d8c'),('関東鉄道','#2c6fb5'),('千葉都市モノレール','#2c8a3e'),('多摩都市モノレール','#ef8200'),('埼玉新都市交通','#10a899'),('首都圏新都市鉄道','#000084'),('秩父','#8d5a2b'),('小湊','#c87d2a'),('いすみ','#2b8a3e')]
def col(t):
    c=(t.get('colour') or '').strip()
    if re.fullmatch(r'#?[0-9A-Fa-f]{6}',c): return ('#'+c.lstrip('#')).lower()
    if c.lower() in COL: return COL[c.lower()]
    op=(t.get('operator') or '')+(t.get('name') or '')
    for k,v in OPCOL:
        if k in op: return v
    return '#7a7f8a'
cov=[]
for r in RAILS:
    cov+= [tuple(p) for p in r['path'][::2]]
def chain(mem):
    segs=[]
    for ty,ref,role in mem:
        if ty!='w' or role in('platform','platform_entry_only','platform_exit_only'): continue
        w=wtag_all.get(ref)
        if w is None: continue
        segs.append(w)
    if not segs: return []
    best=[];cur=list(segs[0])
    for s in segs[1:]:
        s=list(s)
        if math.dist(cur[-1],s[0])<3: cur+=s[1:]
        elif math.dist(cur[-1],s[-1])<3: cur+=s[::-1][1:]
        elif len(cur)==len(segs[0]) and math.dist(cur[0],s[0])<3: cur=cur[::-1]+s[1:]
        elif len(cur)==len(segs[0]) and math.dist(cur[0],s[-1])<3: cur=cur[::-1]+s[::-1][1:]
        else:
            if len(cur)>len(best): best=cur
            cur=s
    if len(cur)>len(best): best=cur
    return best
wtag_all={}
for wid,t,ids,ll in RW:
    a=np.frombuffer(ll,dtype=np.float64).reshape(-1,2)
    wtag_all[wid]=[P(x,y) for x,y in a]
cands=[]
for rid,(t,mem) in relinfo.items():
    nm=t.get('name','')
    if EXPRESS.search(nm) or t.get('service') in('long_distance','high_speed'): continue
    if t.get('route')=='tram' and 'さくら' in nm: pass
    nstop=sum(1 for ty,ref,role in mem if ty=='n' and role.startswith('stop'))
    if nstop<3: continue
    ch=chain(mem)
    if len(ch)<2: continue
    pts=resample(ch)
    cands.append((rid,t,pts))
print('cands',len(cands),flush=True)
newr=[]
while True:
    CT=cKDTree(np.array(cov))
    best=None
    for rid,t,pts in cands:
        d,_=CT.query(np.array(pts))
        unc=(d>30)&np.array([inbox(p) for p in pts])
        # runs
        runs=[];s=None
        for i,u in enumerate(unc):
            if u and s is None: s=i
            if (not u or i==len(unc)-1) and s is not None:
                e=i if u else i-1; runs.append((s,e)); s=None
        for s0,e0 in runs:
            L=(e0-s0)*8
            ring=sum(1 for p in pts[s0:e0+1] if not inold(p))*8
            if L>=3000 and ring>=0.5*L and (best is None or L>best[0]):
                best=(L,rid,t,pts,s0,e0,d)
    if not best: break
    L,rid,t,pts,s0,e0,d=best
    while s0>0 and d[s0-1]>5: s0-=1
    while e0<len(pts)-1 and d[e0+1]>5: e0+=1
    if s0>0: s0-=1
    if e0<len(pts)-1: e0+=1
    path=pts[s0:e0+1]
    cov+=path
    newr.append((rid,t,path))
    cands=[c for c in cands if c[0]!=rid]
    print('new',t.get('name'),t.get('ref'),round(L),flush=True)
def clean(nm):
    nm=re.sub(r'\s*[\(（:：].*$','',nm); nm=re.sub(r'(各駅停車|普通|上り|下り|線路)$','',nm).strip()
    return nm
base=len(RAILS)
for rid,t,path in newr:
    r=t.get('route'); nm=clean(t.get('name',''))
    kind={'subway':'sub','monorail':'mono','tram':'tram'}.get(r,'el')
    if r=='light_rail': kind='ats' if re.search(r'ニューシャトル|新都市交通|ユーカリ|シーサイド|山口線|レオライナー',nm) else 'tram'
    ref=(t.get('ref') or '').strip()
    code=ref if re.fullmatch(r'[A-Za-z]{1,3}',ref) else ''
    en=clean(t.get('name:en','') or '')
    if '湘南新宿' in nm: nm='JR高崎線'; code='JU'; t=dict(t); t['colour']=RAILS[2]['color']; en='JR Takasaki Line'
    shin=bool(re.search(r'新幹線|たにがわ',nm))
    if 'たにがわ' in nm: nm='上越新幹線'; en='Joetsu Shinkansen'
    if shin: code='TH'; t=dict(t); t['colour']=RAILS[21]['color']
    if re.search(r'ユーカリ|ニューシャトル|新都市交通',nm): kind='ats'
    sts=[] if shin else pick_stations(path,[rid],set(),maxd=70)
    if not shin and len(sts)<len(path)*8/4000:
        have={x[1] for x in sts}
        T2=cKDTree(np.array(path))
        for nm2,lst in stn_by_name.items():
            if nm2 in have: continue
            for (x,z),e2 in lst:
                dd,ii=T2.query((x,z))
                if dd<35: sts.append((int(ii),nm2,e2)); have.add(nm2); break
        sts.sort()
    ys=heights(path,kind,shin)
    if re.search(r'小湊|いすみ|関東鉄道|新幹線',nm) or any(x[1] in('安房勝山','明覚','吾野') for x in sts):
        print('skip far line',nm); continue
    ri=len(RAILS)
    RAILS.append({'code':code,'ja':nm,'en':en,'color':col(t),'kind':kind,'loop':False,'path':[[round(x,1),round(z,1)] for x,z in path],'ys':ys,'st':[{'ja':s,'en':en_of(s,e),'i':i} for i,s,e in sts]})
    if shin: RAILS[-1]['shin']=1
    Ltot=len(path)*8
    cars=1 if kind=='tram' else 6 if kind in('ats','mono') else (4 if Ltot<8000 else 8)
    SVC.append({'k':'def%d'%ri,'line':nm,'type':'各駅停車','tc':'#5a6270','names':None,'model':'c','cars':cars,'n':max(1,min(8,round(Ltot/5000))),'vm':1,'dest':None,'alt':None,'loop':0,
                'legs':[[ri,0,round(sum(math.dist(a,b) for a,b in zip(path,path[1:])),1)]],'stops':[[0,k] for k in range(len(sts))]})
    print(ri,code,nm,kind,RAILS[-1]['color'],round(Ltot),[s for _,s,_ in sts])
pickle.dump(dict(rails=RAILS,svc=SVC),open(SC+'/gen/rails_all.pkl','wb'))
