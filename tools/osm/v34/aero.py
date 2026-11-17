import osmium, json, sys, math
A9 = math.cos(35.64*math.pi/180)*111320; R9 = 110950
def xz(lo,la): return (round((lo-139.755)*A9,1), round(-(la-35.64)*R9,1))
out=[]
B=(139.70,35.50,139.85,35.59)
class H(osmium.SimpleHandler):
    def way(self,w):
        a=w.tags.get('aeroway'); b=w.tags.get('building')
        if not a and b not in ('terminal','hangar') : return
        try: pts=[(nd.lon,nd.lat) for nd in w.nodes]
        except Exception: return
        if not pts: return
        lo=sum(p[0] for p in pts)/len(pts); la=sum(p[1] for p in pts)/len(pts)
        if not (B[0]<lo<B[2] and B[1]<la<B[3]): return
        out.append({'id':w.id,'a':a or '','b':b or '','ref':w.tags.get('ref',''),'name':w.tags.get('name',''),'w':w.tags.get('width',''),'p':[xz(*p) for p in pts],'lv':w.tags.get('building:levels',''),'h':w.tags.get('height','')})
    def node(self,n):
        a=n.tags.get('aeroway')
        if not a: return
        lo,la=n.location.lon,n.location.lat
        if not (B[0]<lo<B[2] and B[1]<la<B[3]): return
        out.append({'id':n.id,'a':a,'node':1,'ref':n.tags.get('ref',''),'name':n.tags.get('name',''),'p':[xz(lo,la)]})
H().apply_file(sys.argv[1], locations=True)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
import collections
print(collections.Counter((o['a'],o['b']) for o in out))
