import sys,os;sys.path.insert(0,os.path.dirname(__file__))
import json,pickle,gzip,base64,numpy as np,re
import maskio
from geo import NEW
SC=os.path.dirname(os.path.abspath(__file__))+'/..'
W=json.load(open(SC+'/work/world.json'))
RD=pickle.load(open(SC+'/gen/roads.pkl','rb'))
RS=pickle.load(open(SC+'/gen/rails_sites.pkl','rb'))
PR=pickle.load(open(SC+'/gen/packs_res.pkl','rb'))
A=np.load(SC+'/gen/mask.npy'); MM=json.load(open(SC+'/gen/mask_meta.json'))
out={}
for k in W:
    if k=='nodes': out[k]=W['nodes']+RD['nodes']
    elif k=='edges': out[k]=W['edges']+RD['edges']
    elif k=='roadNames': out[k]=RD['names']
    elif k=='rails': out[k]=RS['rails']
    elif k=='svc': out[k]=RS['svc']
    elif k=='sites': out[k]=W['sites']+RS['sites']
    elif k=='ext':
        e=dict(W['ext']); e['bounds']={k2:NEW[k2] for k2 in('lat0','lat1','lng0','lng1')}
        e['mask']=dict(X0=MM['X0'],Z0=MM['Z0'],W=MM['W'],H=MM['H'],cell=16,rle=maskio.encode(A))
        e['districts']=W['ext']['districts']+RS['districts']
        out[k]=e
    elif k=='tiles':
        t=dict(W['tiles']); t['packs']=[[p[0],p[1],p[2]] for p in sorted(PR,key=lambda r:(r[0],r[1]))]
        out[k]=t
    else: out[k]=W[k]
# key order check: ext bounds etc
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
print('json MB',len(s.encode())/1e6)
gz=gzip.compress(s.encode(),9,mtime=0)
b=base64.b64encode(gz).decode()
os.makedirs(SC+'/out/data',exist_ok=True)
open(SC+'/out/data/world.b64.0.txt','w').write(b)
print('b64 MB',len(b)/1e6)
# bus -> game.js
BUS=json.load(open(SC+'/gen/bus.json'))
g=open('/tmp/claude-0/-home-user-shuto/d6d742ba-4800-50fe-b3b3-a208396ee356/scratchpad/oldsite/game.js',encoding='utf8').read()
i=g.index('Qo={'); j=g.index('X5=[')
def close(s,start,o,c):
    d=0;q=None
    for k in range(start,len(s)):
        ch=s[k]
        if q:
            if ch=='\\': continue
            if ch==q and s[k-1]!='\\': q=None
            continue
        if ch in '"\'`': q=ch; continue
        if ch==o: d+=1
        elif ch==c:
            d-=1
            if d==0: return k
qe=close(g,i+3,'{','}'); xe=close(g,j+3,'[',']')
qadd=''.join(','+json.dumps(k)+':'+json.dumps(v) for k,v in BUS['Q'].items())
xadd=''.join(','+json.dumps(x) for x in BUS['X'])
assert qe<j
g2=g[:qe]+qadd+g[qe:xe]+xadd+g[xe:]
open(SC+'/out/game.js','w',encoding='utf8').write(g2)
print('game.js',len(g),'->',len(g2))
