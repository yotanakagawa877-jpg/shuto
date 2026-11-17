import base64,gzip,struct
def load(path):
    raw=open(path).read().strip()
    b=base64.b64decode(raw)
    if b[:2]==b'\x1f\x8b': b=gzip.decompress(b)
    return b
def parse(b,P=5,T=1280):
    px,pz=struct.unpack_from('<ii',b,0)
    base=8+P*P*24
    tiles=[]
    for o in range(P*P):
        c,u4,h,l,f,d=struct.unpack_from('<6I',b,8+o*24)
        tx=px*P+o//P; tz=pz*P+o%P
        gx=(tx+.5)*T; gz=(tz+.5)*T
        t={'tx':tx,'tz':tz,'hdr':(c,u4,h,l,f,d)}
        x=base+c
        M,Y=struct.unpack_from('<II',b,x); x+=8
        nodes=[]
        for i in range(M):
            a,bb=struct.unpack_from('<hh',b,x); x+=4; nodes.append((gx+a/10,gz+bb/10))
        edges=[]
        for i in range(Y):
            ea,eb,k,hw,ln,sd,n=struct.unpack_from('<iiBBBBH',b,x); x+=14
            pts=[]
            for j in range(n):
                a,bb=struct.unpack_from('<hh',b,x); x+=4; pts.append((gx+a/10,gz+bb/10))
            edges.append((ea,eb,k,hw,ln,sd,pts))
        t['streets_end']=x-base
        t['nodes']=nodes;t['edges']=edges
        bl=[]
        x=base+h
        for i in range(l//12):
            v=struct.unpack_from('<hhBBBBHBB',b,x+i*12)
            bl.append(v)
        t['bld']=bl
        polys=[]
        if d>=2:
            x=base+f; E,=struct.unpack_from('<H',b,x); x+=2
            for i in range(E):
                bi,n=struct.unpack_from('<HB',b,x); x+=3
                pts=[struct.unpack_from('<hh',b,x+4*j) for j in range(n)]; x+=4*n
                polys.append((bi,pts))
            t['poly_end']=x-base
        t['polys']=polys
        tiles.append(t)
    return px,pz,tiles

def parse_raw(b,P=5):
    """parse into editable raw structures (bytes kept exactly)"""
    px,pz=struct.unpack_from('<ii',b,0)
    base=8+P*P*24; tiles=[]
    for o in range(P*P):
        c,u4,h,l,f,d=struct.unpack_from('<6I',b,8+o*24)
        x=base+c
        M,Y=struct.unpack_from('<II',b,x); x+=8
        nodes=[struct.unpack_from('<hh',b,x+4*i) for i in range(M)]; x+=4*M
        edges=[]
        for i in range(Y):
            hdr=struct.unpack_from('<iiBBBBH',b,x); n=hdr[-1]
            edges.append((hdr,[struct.unpack_from('<hh',b,x+14+4*j) for j in range(n)])); x+=14+4*n
        bld=[b[base+h+12*i:base+h+12*i+12] for i in range(l//12)]
        polys=[]
        if d>=2:
            x=base+f; E,=struct.unpack_from('<H',b,x); x+=2
            for i in range(E):
                bi,n=struct.unpack_from('<HB',b,x); pts=b[x+3:x+3+4*n]; x+=3+4*n; polys.append((bi,n,pts))
        tiles.append(dict(nodes=nodes,edges=edges,bld=bld,polys=polys,hdr=(c,u4,h,l,f,d),wc=d>=2))
    return px,pz,tiles
def build(px,pz,tiles,P=5):
    head=bytearray(struct.pack('<ii',px,pz)); body=bytearray(); idx=bytearray()
    for t in tiles:
        c=len(body)
        body+=struct.pack('<II',len(t['nodes']),len(t['edges']))
        for a,bb in t['nodes']: body+=struct.pack('<hh',a,bb)
        for hdr,pts in t['edges']:
            body+=struct.pack('<iiBBBBH',*hdr[:6],len(pts))
            for a,bb in pts: body+=struct.pack('<hh',a,bb)
        u4=len(body)-c
        h=len(body)
        for r in t['bld']: body+=r
        l=len(body)-h
        f=len(body)
        if t['polys'] or t.get('wc',bool(t['bld'])):
            body+=struct.pack('<H',len(t['polys']))
            for bi,n,pts in t['polys']: body+=struct.pack('<HB',bi,n)+pts
        d=len(body)-f
        idx+=struct.pack('<6I',c,u4,h,l,f,d)
    return bytes(head+idx+body)
