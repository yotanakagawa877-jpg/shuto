# v3.5: airfields (other than Haneda), racecourses, theme parks, ferris wheels, roller coasters from OSM
import osmium, json, sys, math
A9 = math.cos(35.64*math.pi/180)*111320; R9 = 110950
def xz(lo,la): return (round((lo-139.755)*A9,1), round(-(la-35.64)*R9,1))
B=(139.43,35.30,140.07,35.93)
HND=(139.74,35.52,139.83,35.57)
out={'ways':[], 'nodes':[], 'areas':[]}
def inb(lo,la,b=B): return b[0]<lo<b[2] and b[1]<la<b[3]
class H(osmium.SimpleHandler):
    def node(self,n):
        t=n.tags; a=t.get('attraction',''); ae=t.get('aeroway','')
        if a in ('big_wheel','roller_coaster','carousel','drop_tower','pirate_ship') or t.get('tourism')=='theme_park' or ae in ('aerodrome','parking_position') or t.get('leisure')=='water_park':
            lo,la=n.location.lon,n.location.lat
            if not inb(lo,la) or (ae and inb(lo,la,HND)): return
            out['nodes'].append({'id':n.id,'a':a,'ae':ae,'tour':t.get('tourism',''),'name':t.get('name',''),'h':t.get('height',''),'d':t.get('diameter',''),'p':xz(lo,la)})
    def way(self,w):
        t=w.tags; a=t.get('attraction',''); ae=t.get('aeroway',''); sp=t.get('sport',''); le=t.get('leisure','')
        keep = a in ('big_wheel','roller_coaster','water_slide','summer_toboggan','train','river_rafting') or ae in ('runway','taxiway','apron','helipad') \
            or (le in ('track','raceway') and 'horse' in sp) or (t.get('railway')=='miniature')
        if not keep: return
        try: pts=[(nd.lon,nd.lat) for nd in w.nodes]
        except Exception: return
        if not pts: return
        lo=sum(p[0] for p in pts)/len(pts); la=sum(p[1] for p in pts)/len(pts)
        if not inb(lo,la) or (ae and inb(lo,la,HND)): return
        out['ways'].append({'id':w.id,'a':a,'ae':ae,'le':le,'sp':sp,'name':t.get('name',''),'ref':t.get('ref',''),'w':t.get('width',''),'surf':t.get('surface',''),'h':t.get('height',''),'p':[xz(*q) for q in pts]})
    def area(self,a):
        t=a.tags
        kind = 'park' if t.get('tourism')=='theme_park' else 'zoo' if t.get('tourism')=='zoo' else 'aerodrome' if t.get('aeroway')=='aerodrome' else 'race' if ('horse' in t.get('sport','') and t.get('leisure') in ('sports_centre','stadium','track','raceway')) or '競馬場' in t.get('name','') else 'water' if t.get('leisure')=='water_park' else None
        if not kind: return
        for ring in a.outer_rings():
            pts=[(n.lon,n.lat) for n in ring]
            lo=sum(p[0] for p in pts)/len(pts); la=sum(p[1] for p in pts)/len(pts)
            if not inb(lo,la): continue
            p=[xz(*q) for q in pts]
            ar=0.5*abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p))))
            out['areas'].append({'id':a.orig_id(),'kind':kind,'name':t.get('name',''),'a':round(ar),'p':p,'mil':t.get('military','') or t.get('aerodrome:type','') or t.get('operator','')})
H().apply_file(sys.argv[1], locations=True)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
import collections
print('ways',collections.Counter((w['a'] or w['ae'] or w['le']) for w in out['ways']))
print('nodes',collections.Counter((w['a'] or w['ae'] or w['tour']) for w in out['nodes']))
for a in sorted(out['areas'],key=lambda a:-a['a']):
    if a['a']>20000: print(a['kind'],a['name'],a['a'],a['mil'],a['p'][0])
