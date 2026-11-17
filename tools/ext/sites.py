import sys,os;sys.path.insert(0,os.path.dirname(__file__))
import numpy as np,pickle,json,math,re,collections
from geo import *
from shapely.geometry import Polygon
import pykakasi
KK=pykakasi.kakasi()
def roma(s): 
    r=''.join(x['hepburn'] for x in KK.convert(s)); return r[:1].upper()+r[1:]
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
W=json.load(open(SC+'/work/world.json'))
R=pickle.load(open(SC+'/gen/rails_all.pkl','rb'))
RAILS=R['rails']
# fill missing english station names
for r in RAILS:
    for s in r['st']:
        if not s.get('en'): s['en']=roma(s['ja'])
    if not r.get('en'): r['en']=roma(r['ja'])
ox0,oz0,ox1,oz1=box(OLD); nx0,nz0,nx1,nz1=box(NEW)
def ring(x,z): return nx0<x<nx1 and nz0<z<nz1 and not(ox0<x<ox1 and oz0<z<oz1)
POI=pickle.load(open(SC+'/ex/poi.pkl','rb'))
cand=collections.defaultdict(list)
for it in POI:
    if it[0]!='a': continue
    _,oid,isw,t,rings=it
    nm=t.get('name','')
    typ=None
    am=t.get('amenity')
    if am=='school' or t.get('building')=='school':
        if '小学校' in nm: typ='elem'
        elif '中学校' in nm and '高等' not in nm: typ='jhs'
        elif re.search('高等学校|高校',nm): typ='high'
    elif am=='university' and '大学' in nm: typ='univ'
    if not typ: continue
    a=np.frombuffer(rings[0][0],dtype=np.float64).reshape(-1,2)
    pts=[P(*q) for q in a]
    try: pg=Polygon(pts).buffer(0)
    except Exception: continue
    if pg.is_empty: continue
    c=pg.centroid
    if not ring(c.x,c.y): continue
    if am!='school' and am!='university': continue
    cand[typ].append((pg.area,nm,c.x,c.y,pg))
SP={'elem':3000,'jhs':3800,'high':6500,'univ':6000}
CAP={'elem':(50,120),'jhs':(60,130),'high':(70,150),'univ':(150,380)}
MINA={'elem':6000,'jhs':8000,'high':10000,'univ':60000}
sites=[];n=0
taken=[(s['x'],s['z']) for s in W['sites']]
for typ in('univ',):
    L=sorted(cand[typ],key=lambda x:-x[0]); acc=[]
    for ar,nm,x,z,pg in L:
        if ar<MINA[typ]: continue
        if any(math.hypot(x-a,z-b)<SP[typ] for a,b in acc): continue
        if any(math.hypot(x-a,z-b)<200 for a,b in taken): continue
        obb=pg.minimum_rotated_rectangle; cs=list(obb.exterior.coords)
        e1=math.dist(cs[0],cs[1]); e2=math.dist(cs[1],cs[2])
        if e1>=e2: rot=math.atan2(cs[1][1]-cs[0][1],cs[1][0]-cs[0][0]); w,d=e1,e2
        else: rot=math.atan2(cs[2][1]-cs[1][1],cs[2][0]-cs[1][0]); w,d=e2,e1
        rot=rot%math.pi
        lo,hi=CAP[typ]; s=min(1,hi/max(w,1)); w=max(lo,w*s*0.8); d=max(lo*0.8,min(d*s*0.8,w))
        acc.append((x,z)); taken.append((x,z))
        sites.append({'key':'xs%d'%n,'name':nm,'type':typ,'x':round(x,1),'z':round(z,1),'w':round(w),'d':round(d),'rot':round(rot,3)}); n+=1
print(collections.Counter(s['type'] for s in sites))
# districts from new stations
old=set(d[0] for d in W['ext']['districts'])
cnt=collections.Counter(); pos={}; en={}
for r in RAILS[:]:
    for s in r['st']:
        x,z=r['path'][s['i']]
        if not ring(x,z): continue
        cnt[s['ja']]+=1; pos.setdefault(s['ja'],(x,z)); en[s['ja']]=s['en']
BIG={'千葉','八王子','立川','本厚木','海老名','久喜','春日部','所沢','平塚','茅ヶ崎','横須賀中央','横須賀','蘇我','守谷','牛久','鴻巣','坂戸','東松山','入間市','狭山市','本川越','橋本','飯能','上尾','佐倉','木更津','五井','拝島','青梅','厚木','逗子','京急久里浜','久里浜','三崎口','龍ケ崎市','取手','岩槻','野田市','東武動物公園','加須','伊勢原','相模原'}
dist=[]
for nm,c in cnt.items():
    if nm in old: continue
    lv=min(4,c)
    if nm in BIG: lv=max(lv,3)
    x,z=pos[nm]
    dist.append([nm,re.sub(r'[^A-Z0-9\- ]','',(en[nm] or roma(nm)).upper().replace('Ō','O').replace('Ū','U')),round(x),round(z),lv])
print('districts',len(dist))
pickle.dump(dict(rails=RAILS,svc=R['svc'],sites=sites,districts=dist),open(SC+'/gen/rails_sites.pkl','wb'))
