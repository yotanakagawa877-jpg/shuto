import osmium, json, sys, math
A9 = math.cos(35.64*math.pi/180)*111320; R9 = 110950
def xz(lo,la): return ((lo-139.755)*A9, -(la-35.64)*R9)
out=[]
class H(osmium.SimpleHandler):
    def way(self,w):
        if w.tags.get('railway') not in ('rail',): return
        n=w.tags.get('name','')
        if '新幹線' not in n: return
        try: pts=[xz(nd.lon,nd.lat) for nd in w.nodes]
        except Exception: return
        out.append({'id':w.id,'n':n,'p':pts,'br':w.tags.get('bridge',''),'tu':w.tags.get('tunnel',''),'ly':w.tags.get('layer','0'),'svc':w.tags.get('service','')})
H().apply_file(sys.argv[1], locations=True)
json.dump(out,open(sys.argv[2],'w'))
print(len(out), sorted(set(o['n'] for o in out)))
