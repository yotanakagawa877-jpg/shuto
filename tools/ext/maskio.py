import base64,numpy as np
def varint_read(b,i):
    v=0;s=0
    while True:
        c=b[i];i+=1;v|=(c&127)<<s;s+=7
        if not c&128: return v,i
def decode(m):
    b=base64.b64decode(m['rle']); W,H=m['W'],m['H']; out=np.zeros(W*H,np.uint8); o=0;i=0
    while o<W*H and i<len(b):
        v,i=varint_read(b,i); c,i=varint_read(b,i)
        if v: out[o:o+c]=v
        o+=c
    return out.reshape(H,W)
def varint(v):
    o=bytearray()
    while True:
        c=v&127; v>>=7
        if v: o.append(c|128)
        else: o.append(c); return bytes(o)
def encode(a):
    f=a.ravel(); out=bytearray()
    ch=np.flatnonzero(np.diff(f))+1
    st=np.concatenate([[0],ch]); en=np.concatenate([ch,[len(f)]])
    for s,e in zip(st,en): out+=varint(int(f[s]))+varint(int(e-s))
    return base64.b64encode(bytes(out)).decode()
