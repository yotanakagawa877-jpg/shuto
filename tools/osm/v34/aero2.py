import osmium, json, sys, math
A9 = math.cos(35.64*math.pi/180)*111320; R9 = 110950
def xz(lo,la): return (round((lo-139.755)*A9,1), round(-(la-35.64)*R9,1))
out=[]
B=(139.74,35.52,139.83,35.57)
class H(osmium.SimpleHandler):
    def way(self,w):
        if 'building' not in w.tags and w.tags.get('man_made')!='tower': return
        n=w.tags.get('name','')
        try: pts=[(nd.lon,nd.lat) for nd in w.nodes]
        except Exception: return
        if len(pts)<3: return
        lo=sum(p[0] for p in pts)/len(pts); la=sum(p[1] for p in pts)/len(pts)
        if not (B[0]<lo<B[2] and B[1]<la<B[3]): return
        p=[xz(*q) for q in pts]
        a=0.5*abs(sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p))))
        if a<3000 and not n: return
        out.append({'id':w.id,'n':n,'b':w.tags.get('building',''),'mm':w.tags.get('man_made',''),'a':round(a),'p':p,'lv':w.tags.get('building:levels',''),'h':w.tags.get('height','')})
H().apply_file(sys.argv[1], locations=True)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
print(len(out))
for o in sorted(out,key=lambda o:-o['a'])[:40]: print(o['n'],o['b'],o['mm'],o['a'],o['lv'],o['h'],o['p'][0])
