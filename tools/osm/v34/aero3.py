import osmium, json, sys, math
A9 = math.cos(35.64*math.pi/180)*111320; R9 = 110950
def xz(lo,la): return (round((lo-139.755)*A9,1), round(-(la-35.64)*R9,1))
out=[]
B=(139.77,35.535,139.80,35.565)
class H(osmium.SimpleHandler):
    def area(self,a):
        if a.from_way(): return
        if 'building' not in a.tags and 'aeroway' not in a.tags: return
        for ring in a.outer_rings():
            pts=[(n.lon,n.lat) for n in ring]
            lo=sum(p[0] for p in pts)/len(pts); la=sum(p[1] for p in pts)/len(pts)
            if not (B[0]<lo<B[2] and B[1]<la<B[3]): continue
            p=[xz(*q) for q in pts]
            ar=0.5*abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p))))
            out.append({'id':a.orig_id(),'n':a.tags.get('name',''),'b':a.tags.get('building',''),'ae':a.tags.get('aeroway',''),'a':round(ar),'p':p,'h':a.tags.get('height',''),'lv':a.tags.get('building:levels','')})
H().apply_file(sys.argv[1], locations=True)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
for o in sorted(out,key=lambda o:-o['a'])[:30]: print(o['id'],o['n'],o['b'],o['ae'],o['a'],o['h'],o['lv'],o['p'][0])
