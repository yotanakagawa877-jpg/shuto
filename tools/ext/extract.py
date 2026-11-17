import osmium,pickle,sys,array
src,out=sys.argv[1],sys.argv[2]
HWK=('highway','name','oneway','lanes','layer','bridge','tunnel','width','ref','junction','name:en','access','service','area')
RK=('railway','service','usage','name','tunnel','bridge','layer','name:en','highspeed','electrified','covered')
def T(tags,keys):
    return {k:tags[k] for k in keys if k in tags}
class H(osmium.SimpleHandler):
    def __init__(s):
        super().__init__()
        s.hw=[];s.rw=[];s.coast=[];s.rel=[];s.stn=[];s.stops=[];s.bld=[];s.land=[];s.poi=[];s.waterways=[]
    def node(s,n):
        t=n.tags
        if not len(t): return
        r=t.get('railway'); pt=t.get('public_transport')
        if r in ('station','halt','stop','tram_stop') or pt in('station','stop_position') :
            s.stn.append((n.id,n.location.lon,n.location.lat,dict(t)))
        if t.get('highway')=='bus_stop' or (pt=='platform' and t.get('bus')=='yes'):
            s.stops.append((n.id,n.location.lon,n.location.lat,t.get('name',''),t.get('name:en','')))
        if 'name' in t and any(k in t for k in('tourism','amenity','leisure','historic','shop','building','man_made','aeroway')):
            s.poi.append(('n',n.id,n.location.lon,n.location.lat,dict(t)))
    def way(s,w):
        t=w.tags
        hw=t.get('highway')
        try:
            if hw:
                ids=array.array('q',[x.ref for x in w.nodes]); ll=array.array('d')
                for x in w.nodes: ll.append(x.lon); ll.append(x.lat)
                s.hw.append((w.id,T(t,HWK),ids,ll))
            r=t.get('railway')
            if r in ('rail','subway','light_rail','monorail','tram','narrow_gauge','construction','preserved','funicular'):
                ids=array.array('q',[x.ref for x in w.nodes]); ll=array.array('d')
                for x in w.nodes: ll.append(x.lon); ll.append(x.lat)
                s.rw.append((w.id,T(t,RK),ids,ll))
            if t.get('natural')=='coastline':
                ll=array.array('d')
                for x in w.nodes: ll.append(x.lon); ll.append(x.lat)
                s.coast.append((w.id,ll))
            ww=t.get('waterway')
            if ww in('river','canal','stream') and ww!='stream':
                ll=array.array('d')
                for x in w.nodes: ll.append(x.lon); ll.append(x.lat)
                s.waterways.append((w.id,ww,t.get('name',''),t.get('name:en',''),t.get('width',''),ll))
        except osmium.InvalidLocationError:
            pass
    def relation(s,r):
        t=r.tags
        if t.get('type') in('route','route_master') and t.get('route') in('train','subway','light_rail','monorail','tram','bus','railway'):
            s.rel.append((r.id,dict(t),[(m.type,m.ref,m.role) for m in r.members]))
    def area(s,a):
        t=a.tags
        b=t.get('building') or t.get('building:part')
        kind=None
        if t.get('building'): kind='b'
        elif t.get('natural') in('water','wetland','bay') or t.get('waterway') in('riverbank','dock') or t.get('landuse') in('reservoir','basin'): kind='w'
        elif t.get('leisure') in('park','garden','golf_course','pitch','stadium','nature_reserve','playground','common') or t.get('landuse') in('grass','recreation_ground','cemetery','village_green','meadow','farmland','orchard','allotments'): kind='p'
        elif t.get('landuse') in('forest',) or t.get('natural') in('wood','scrub','heath'): kind='f'
        elif t.get('aeroway') in('aerodrome','runway','apron','taxiway'): kind='a'
        elif t.get('landuse') in ('industrial','commercial','retail','residential','railway','port','military','construction'): kind='l'
        named='name' in t and any(k in t for k in('tourism','amenity','leisure','historic','shop','building','man_made','aeroway','landuse'))
        if not kind and not named: return
        try:
            rings=[]
            for o in a.outer_rings():
                ll=array.array('d')
                for x in o: ll.append(x.lon); ll.append(x.lat)
                inn=[]
                if kind in('w','p','f','l'):
                    for i in a.inner_rings(o):
                        il=array.array('d')
                        for x in i: il.append(x.lon); il.append(x.lat)
                        inn.append(il)
                rings.append((ll,inn))
        except osmium.InvalidLocationError:
            return
        if not rings: return
        oid=a.orig_id(); isw=a.from_way()
        if kind=='b':
            s.bld.append((oid,isw,T(t,('building','building:levels','height','name','roof:shape','min_height','building:min_level','amenity','shop','layer','location')),rings))
        elif kind:
            s.land.append((oid,kind,T(t,('natural','water','waterway','leisure','landuse','name','aeroway','tidal','intermittent','layer','covered')),rings))
        if named:
            s.poi.append(('a',oid,isw,dict(t),rings))
h=H()
h.apply_file(src,locations=True,idx='flex_mem')
for k in ('hw','rw','coast','rel','stn','stops','bld','land','poi','waterways'):
    v=getattr(h,k); print(k,len(v),flush=True)
    pickle.dump(v,open(out+'/'+k+'.pkl','wb'),protocol=5)
