"""Independent axis-aligned polygon audit for the dimension-first VV8 plan."""
from pathlib import Path
import json,itertools,math
b=json.loads((Path(__file__).parent/'dist/geometry.json').read_text())

def inside(x,z,p):
    result=False
    for a,c in zip(p,p[1:]+p[:1]):
        if (a[1]>z)!=(c[1]>z) and x<(c[0]-a[0])*(z-a[1])/(c[1]-a[1])+a[0]: result=not result
    return result

def rect_inside(x,z,r):return r[0]<x<r[2] and r[1]<z<r[3]

def overlap(p,q=None,rect=None):
    ps=[p]+([q] if q else [])
    xs=sorted(set(v[0] for pp in ps for v in pp)|({rect[0],rect[2]} if rect else set()))
    zs=sorted(set(v[1] for pp in ps for v in pp)|({rect[1],rect[3]} if rect else set()))
    total=0
    for x0,x1 in zip(xs,xs[1:]):
        for z0,z1 in zip(zs,zs[1:]):
            x,z=(x0+x1)/2,(z0+z1)/2
            if inside(x,z,p) and (inside(x,z,q) if q else rect_inside(x,z,rect)):
                total+=(x1-x0)*(z1-z0)
    return total

errors=[]
for id,r in b['rooms'].items():
    p=r['polygon']
    for v,w in zip(p,p[1:]+p[:1]):
        if abs(v[0]-w[0])>1e-8 and abs(v[1]-w[1])>1e-8:errors.append(('not orthogonal',id,v,w))
    if not inside(*r['labelAnchor'],p):errors.append(('label outside',id))
    if not inside(*r['walkAnchor'][:2],p):errors.append(('walk anchor outside',id))
    for pier in b['structuralPiers']:
        n=overlap(p,rect=pier['bounds'])
        if n>1e-7:errors.append(('pier overlap',id,pier['name'],n))
    for wall in b['structuralWalls']:
        p0,p1=wall['start'],wall['end'];length=math.dist(p0,p1);d=wall['thickness']/2
        if p0[1]==p1[1]:
            rct=[min(p0[0],p1[0]),p0[1]-d,max(p0[0],p1[0]),p0[1]+d]
        else:rct=[p0[0]-d,min(p0[1],p1[1]),p0[0]+d,max(p0[1],p1[1])]
        n=overlap(p,rect=rct)
        for op in wall['openings']:
            if p0[1]==p1[1]:cut=[p0[0]+op['from'],p0[1]-d,p0[0]+op['to'],p0[1]+d]
            else:cut=[p0[0]-d,p0[1]+op['from'],p0[0]+d,p0[1]+op['to']]
            n-=overlap(p,rect=cut)
        if n>1e-7:errors.append(('wall overlap',id,wall['name'],n))
for (id,a),(jd,c) in itertools.combinations(b['rooms'].items(),2):
    n=overlap(a['polygon'],c['polygon'])
    if n>1e-7:errors.append(('room overlap',id,jd,n))
print(json.dumps({'rooms':len(b['rooms']),'modelAreaSum':b['modelAreaSum'],'sourceAreaSum':b['listedAreaSum'],'errors':errors,'dimensionChecks':len(b['dimensionChecks'])},indent=2))
raise SystemExit(bool(errors))
