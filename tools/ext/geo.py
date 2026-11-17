import math
Ay=math.cos(35.64*math.pi/180)*111320; QS=110950
def P(lon,lat): return ((lon-139.755)*Ay, -(lat-35.64)*QS)
def inv(x,z): return (35.64 - z/QS, 139.755 + x/Ay)  # lat,lon
OLD=dict(lat0=35.3,lat1=35.93,lng0=139.43,lng1=140.07)
NEW=dict(lat0=35.165,lat1=36.065,lng0=139.265,lng1=140.235)
def box(b):
    x0,z0=P(b['lng0'],b['lat1']); x1,z1=P(b['lng1'],b['lat0']); return x0,z0,x1,z1
