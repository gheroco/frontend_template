"""Fit shared orthogonal topology to the brochure's eight room areas.

This is geometric reconstruction, not a survey. Pixel proportions provide a
regularizer; only brochure areas are hard numerical evidence.
"""
import json
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

names = ['bathX','stepX','hallX','balX','rightX','dividerY','livingY','stepY','masterDoorY','smallBottomY','bottomY','foyerY','balconyStartY','rail1X','rail2X']
initial = np.array([2.12,2.03,3.48,6.95,8.62,2.83,6.35,6.72,8.22,9.36,12.25,4.20,0.46,8.36,8.36])
targets = {'living':23.6,'kitchen':11.4,'primary':18.6,'bedroom':9.9,'hall':7.2,'bathroom':4.3,'balcony-kitchen':3.1,'balcony-bedroom':3.5}

def polygons(v):
    B,S,H,P,R,D,L,E,M,Q,Z,F,U,R1,R2 = v
    e=.12; i=.07
    return {
      'living':[[e,D+i],[R-e,D+i],[R-e,L-i],[S+e,L-i],[S+e,F],[e,F]],
      'kitchen':[[B+i,e],[P-e,e],[P-e,D-i],[B+i,D-i]],
      'primary':[[S+e,M+i],[H-i,M+i],[H-i,Q+i],[R-e,Q+i],[R-e,Z-e],[S+e,Z-e]],
      'bedroom':[[H+i,L+i],[P-e,L+i],[P-e,Q-i],[H+i,Q-i]],
      'hall':[[e,F],[S+e,F],[S+e,L-i],[H-i,L-i],[H-i,M-i],[S+e,M-i],[S+e,E-e],[e,E-e]],
      'bathroom':[[e,e],[B-i,e],[B-i,D-i],[e,D-i]],
      'balcony-kitchen':[[P+e,U],[R1,U],[R1,D-i],[P+e,D-i]],
      'balcony-bedroom':[[P+e,L+e],[R2,L+e],[R2,Q-i],[P+e,Q-i]]
    }

def area(poly):
    p=np.array(poly)
    return abs(np.dot(p[:,0],np.roll(p[:,1],-1))-np.dot(p[:,1],np.roll(p[:,0],-1)))/2

def lengths(v):
    B,S,H,P,R,D,L,E,M,Q,Z,F,U,R1,R2=v
    return np.array([B,S,H-S,P-H,R-P,D,L-D,E-L,M-L,Q-M,Q-L,Z-Q,F-D,U,R1-P,R2-P,R-R1,R-R2])

def objective(v):
    # Regularize the lengths between adjacent anchors, rather than absolute
    # coordinates. This prevents the optimizer collapsing the hallway.
    ref=lengths(initial)
    return np.sum(((lengths(v)-ref)/np.maximum(abs(ref),.7))**2)

def exact_areas(v):
    ps=polygons(v)
    return np.array([area(ps[k])-a for k,a in targets.items()])

def realistic(v):
    B,S,H,P,R,D,L,E,M,Q,Z,F,U,R1,R2=v
    return np.array([H-S-1.19,Q-M-.85,E-L-.22,.6-(E-L),U-.2,.8-U,R1-P-1.2,R2-P-1.15,R+.05-R1,R+.05-R2,F-D-.5,M-E-.8])

fit=minimize(objective,initial,method='SLSQP',constraints=[{'type':'eq','fun':exact_areas},{'type':'ineq','fun':realistic}],options={'maxiter':2000,'ftol':1e-12})
assert fit.success,fit.message
axes={k:round(float(x),8) for k,x in zip(names,fit.x)}
ps=polygons(fit.x)
payload={'units':'metres','source':'supplied VV8 residence image','sourceReportedTotal':81.4,'listedAreaSum':81.6,'wallHeight':2.8,'exteriorWallThickness':.24,'interiorWallThickness':.14,'axes':axes,'rooms':{k:{'targetArea':targets[k],'modelArea':area(p),'polygon':p} for k,p in ps.items()},'accuracy':'Room polygons fitted to printed areas. Linear dimensions, heights, wall thicknesses, openings and furnishings are estimates from a perspective illustration. Balcony area assignments inferred.'}
path=Path(__file__).parent/'dist'/'geometry.json'
path.write_text(json.dumps(payload,indent=2))
print(json.dumps({'axes':axes,'areas':{k:round(area(p),6) for k,p in ps.items()},'maxAreaError':max(abs(area(p)-targets[k]) for k,p in ps.items())},indent=2))
