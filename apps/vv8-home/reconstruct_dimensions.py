"""Reconstruct VV8 from the user's dimensioned drawing, without fitting brochure areas.

Coordinates: metres, X east and Z south, origin at exterior northwest corner.
Several dimensions in the raster refer to different curtain/column/frame faces.
The 200 mm kitchen-door chain conflict is deliberately retained and disclosed.
"""
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parent

def area(poly):
    return abs(sum(x*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*z for i,(x,z) in enumerate(poly)))/2

def room(poly, brochure, label, walk, note=''):
    value=round(area(poly),6)
    return dict(polygon=poly, brochureArea=brochure, targetArea=brochure, modelArea=value, area=value, labelAnchor=label, walkAnchor=walk, areaBasis='Computed from the dimension-first polygon; not fitted to the brochure area.', note=note)

a=dict(bathX=2.21, stepX=2.15, hallX=3.50, balX=7.05, balconyGlazingX=7.25, rightX=8.80,
       outerRightX=9.0, dividerY=2.90, livingY=6.30, stepY=6.75, masterDoorY=8.10,
       smallBottomY=9.20, bottomY=12.05, foyerY=4.95, balconyStartY=.15,
       rail1X=8.95, rail2X=8.90, clearWestX=.35, lowerClearWestX=2.25,
       clearEastX=8.75, kitchenWestX=2.37, bedroomWestX=3.55, pierWestX=6.75,
       pierEastX=7.35, northClearY=.35, bottomClearY=11.95)
rooms={
 'living':room([[.75,2.95],[6.75,2.95],[6.75,3.15],[7.35,3.15],[7.35,2.45],[8.75,2.45],[8.75,5.75],[8.55,5.75],[8.55,6.20],[7.05,6.20],[7.05,6.25],[2.25,6.25],[2.25,4.95],[.35,4.95],[.35,3.15],[.75,3.15]],23.6,[5.15,4.7],[5.3,5.4,0], 'The living/hall boundary is a semantic floor-zone split because the drawing shows an open connection, not a wall. The east facade has a 450 mm-deep return.'),
 'kitchen':room([[2.37,.35],[7.05,.35],[7.05,.90],[7.20,.90],[7.20,2.35],[6.75,2.35],[6.75,2.85],[2.37,2.85]],11.4,[4.65,1.55],[4.4,1.6,0], '4.68 m is the main span to the curtain/reference line at X7.05. The actual glazing recess extends to X7.20; the 600 × 800 mm pier cuts into the southeast corner.'),
 'primary':room([[2.25,8.15],[3.45,8.15],[3.45,9.25],[6.75,9.25],[6.75,9.45],[7.35,9.45],[7.35,9.10],[8.55,9.10],[8.55,9.85],[8.75,9.85],[8.75,11.95],[2.25,11.95]],18.6,[5.5,10.7],[6.7,10.4,0], 'The 6.50 m dimension is the clear bottom span. The 2.70 m dimension describes the main central depth; the entrance leg, balcony pier and facade return produce an irregular polygon.'),
 'bedroom':room([[3.55,6.35],[7.05,6.35],[7.05,6.85],[7.20,6.85],[7.20,8.65],[6.75,8.65],[6.75,9.15],[3.55,9.15]],9.9,[5.15,7.75],[4.1,7.1,0], 'The lower clear wall span is 3.20 m to the pier face, not the complete bounding-box width. Upper and middle portions extend into the balcony-glazing recess.'),
 'hall':room([[.35,4.95],[2.25,4.95],[2.25,6.25],[3.45,6.25],[3.45,8.05],[2.25,8.05],[2.25,6.65],[.35,6.65]],7.2,[2.9,6.9],[2.85,7.1,0], 'The hall shares an open boundary with the living room. Its computed area depends on this disclosed semantic split; no partition is implied by the floor-zone line.'),
 'bathroom':room([[.35,.35],[2.05,.35],[2.05,2.85],[.75,2.85],[.75,2.35],[.35,2.35]],4.3,[1.23,1.35],[1.35,1.75,0], 'The lower-left structural pier interrupts the nominal 1.70 × 2.50 m envelope. The bathroom/kitchen service partition is reconstructed as a 320 mm composite zone.'),
 'balcony-kitchen':room([[7.50,.15],[8.85,.15],[8.85,2.30],[7.30,2.30],[7.30,.90],[7.50,.90]],3.1,[8.08,1.27],[8.05,1.3,0], 'The printed 1.35 m width is the north inset between the upper wall stub and the east guard. The balcony widens below the stub. Guard height is assumed.'),
 'balcony-bedroom':room([[7.45,6.65],[8.55,6.65],[8.55,6.90],[8.75,6.90],[8.75,8.55],[8.55,8.55],[8.55,9.00],[7.40,9.00],[7.40,8.65],[7.30,8.65],[7.30,6.85],[7.45,6.85]],3.5,[8.05,7.7],[8.05,7.6,0], 'The 1.10/1.15 m dimensions refer to different north/south inset faces. A 1.65 m east guard run and a 1.80 m west glazing opening have different endpoints. Recess junctions retain 50–100 mm uncertainty.')
}
walls=[]
def wall(name,start,end,t,openings=None,basis='derived'):
    walls.append(dict(name=name,start=start,end=end,thickness=t,openings=openings or [],basis=basis))
def op(start,end,head=2.10): return dict(from_=start,to=end,head=head)
def opening(start,end,head=2.10):return {'from':start,'to':end,'head':head}
wall('Exterior north Wall',[0,.175],[7.5,.175],.35,basis='assumed thickness')
wall('Exterior west Wall',[.175,.35],[.175,6.85],.35,basis='drawing 350 mm')
wall('Entrance Wall',[.35,6.75],[2.25,6.75],.20,[opening(.50,1.50)],'drawing 500 + 1000 + 200 mm to the outside step')
wall('Lower exterior west Wall',[2.15,6.85],[2.15,12.15],.20,basis='drawing/derived 200 mm')
wall('Exterior south Wall',[2.05,12.05],[9,12.05],.20,basis='assumed thickness')
wall('Bathroom service partition Wall',[2.21,.35],[2.21,2.85],.32,basis='reconciled service/chase thickness; not a printed wall thickness')
wall('Bathroom entrance Wall',[.75,2.90],[2.37,2.90],.10,[opening(0,.8)],'drawing 800 mm opening')
wall('Kitchen living partition Wall',[2.37,2.90],[6.75,2.90],.10,[opening(.48,1.38)],'drawing local 480 + 900 mm; broad-chain conflict disclosed')
wall('Living bedroom partition Wall',[3.45,6.30],[7.05,6.30],.10,basis='drawing/derived 100 mm')
wall('Bedroom west Wall',[3.50,6.35],[3.50,9.25],.10,[opening(.20,1.10)],'drawing 200 + 900 mm opening')
wall('Bedroom south Wall',[3.55,9.20],[6.75,9.20],.10,basis='drawing 3200 mm clear length')
wall('Primary bedroom entrance Wall',[2.25,8.10],[3.45,8.10],.10,[opening(.30,1.20)],'drawing 300 + 900 mm')
# Structural blocks use exact rectangular footprints rather than one arbitrary wall thickness.
piers=[
 dict(name='Northwest 400 mm internal projection',bounds=[0,2.35,.75,3.15],basis='400 mm beyond 350 mm west wall; 800 mm structural depth'),
 dict(name='Upper balcony 600 × 800 mm structural pier',bounds=[6.75,2.35,7.35,3.15],basis='drawing 600 × 800 mm'),
 dict(name='Lower balcony 600 × 800 mm structural pier',bounds=[6.75,8.65,7.35,9.45],basis='drawing 600 mm width; repeated 800 mm depth inferred'),
 dict(name='Kitchen north balcony wall stub',bounds=[7.05,.35,7.50,.90],basis='derived from 750 mm balcony inset and 4.68 m kitchen reference'),
 dict(name='Bedroom upper balcony west return',bounds=[7.05,6.25,7.35,6.85],basis='500 mm drop below bedroom north clear line'),
 dict(name='Lower balcony north recessed beam',bounds=[7.35,6.25,8.55,6.65],basis='reconstructed stepped return; depth inferred'),
 dict(name='Living east facade stepped return',bounds=[8.55,5.75,9,6.90],basis='drawing 450 mm width / 1150 mm exterior chain'),
 dict(name='Living south facade shallow return',bounds=[7.05,6.20,8.55,6.25],basis='drawing 450 mm drop from 5.75 m facade corner'),
 dict(name='Primary east facade lower pier',bounds=[8.55,8.55,9,9.85],basis='drawing 1300 mm exterior chain; face offset inferred')
]
doors=[
 dict(name='Main entrance · 1000 mm',x=1.85,z=6.75,width=1.0,closedAngle=3.141592653589793,openAngle=-1.5707963267948966,glass=False,sourceMM=1000),
 dict(name='Bathroom door · 800 mm',x=.75,z=2.90,width=.8,closedAngle=0,openAngle=1.5707963267948966,glass=False,sourceMM=800),
 dict(name='Kitchen door · 900 mm',x=2.85,z=2.90,width=.9,closedAngle=0,openAngle=1.5707963267948966,glass=False,sourceMM=900),
 dict(name='Bedroom door · 900 mm',x=3.50,z=6.55,width=.9,closedAngle=-1.5707963267948966,openAngle=1.5707963267948966,glass=False,sourceMM=900),
 dict(name='Primary bedroom door · 900 mm',x=2.55,z=8.10,width=.9,closedAngle=0,openAngle=-1.5707963267948966,glass=False,sourceMM=900),
 dict(name='Kitchen balcony glass door',x=7.25,z=.90,width=.80,closedAngle=-1.5707963267948966,openAngle=-1.15,glass=True,sourceMM=None,note='1450 mm is the complete opening, not a verified single-leaf width.'),
 dict(name='Living balcony glass door',x=7.35,z=2.35,width=.80,closedAngle=0,openAngle=-.80,glass=True,sourceMM=None,note='Leaf split inferred from symbols; complete bay width1500 mm.'),
 dict(name='Bedroom balcony glass door',x=7.25,z=8.65,width=.90,closedAngle=1.5707963267948966,openAngle=1.15,glass=True,sourceMM=None,note='1800 mm is the whole opening; individual leaf width inferred.'),
 dict(name='Primary balcony glass door',x=7.40,z=9.05,width=.80,closedAngle=0,openAngle=-.80,glass=True,sourceMM=None,note='Individual leaf width inferred in the south balcony opening.')
]
glazing=[
 dict(name='Kitchen balcony opening · 1450 mm',start=[7.25,.90],end=[7.25,2.35],sill=.025,head=2.35,opening={'from':0,'to':.8},panels=2,basis='drawing whole opening; leaf division inferred'),
 dict(name='Living to upper balcony opening',start=[7.35,2.35],end=[8.85,2.35],sill=.025,head=2.35,opening={'from':0,'to':.8},panels=2,basis='derived complete bay'),
 dict(name='Living east facade glazing',start=[8.80,2.45],end=[8.80,5.75],sill=.10,head=2.50,panels=4,basis='reconciled facade: 3400 outer chain, 3000 marked inner span has ambiguous endpoints'),
 dict(name='Bedroom balcony opening · 1800 mm',start=[7.25,6.85],end=[7.25,8.65],sill=.025,head=2.35,opening={'from':.90,'to':1.80},panels=2,basis='drawing whole opening; leaf division inferred'),
 dict(name='Primary to lower balcony opening',start=[7.40,9.05],end=[8.55,9.05],sill=.025,head=2.35,opening={'from':0,'to':.8},panels=2,basis='1150 mm inset; leaf division inferred'),
 dict(name='Primary east facade glazing',start=[8.80,9.85],end=[8.80,11.95],sill=.10,head=2.50,panels=3,basis='2100 mm reconstructed; printed2150 mm differs50 mm under selected room depths')
]
checks=[]
def check(id,label,roomid,mm,p,q,basis='drawing',note=''):
    value=round(((q[0]-p[0])**2+(q[1]-p[1])**2)**.5,6)
    checks.append(dict(id=id,label=label,roomId=roomid,sourceMM=mm,modelMetres=value,basis=basis,from_=p,to=q,note=note))
check('outer-main','Exterior north main span',None,7500,[0,0],[7.5,0])
check('outer-balcony','Exterior north balcony bay', 'balcony-kitchen',1500,[7.5,0],[9,0])
check('outer-width','Overall exterior width',None,None,[0,0],[9,0],'derived','7500 + 1500 mm; not a uniform pixel scale.')
check('kitchen-width','Kitchen main span to curtain/reference line','kitchen',4680,[2.37,1.8],[7.05,1.8],note='X7.05 is the marked reference through the pier; physical glazing lies atX7.25, with its inner faceX7.20.')
check('kitchen-depth','Kitchen central clear depth','kitchen',2500,[4.6,.35],[4.6,2.85],note='The drawing also splits this depth into2000 +500 mm.')
check('bath-width','Bathroom clear upper width','bathroom',1700,[.35,1.1],[2.05,1.1],note='The lower-left400 mm pier projection interrupts the nominal rectangle.')
check('living-depth','Living central clear depth','living',3300,[6.25,2.95],[6.25,6.25])
check('bedroom-width','Bedroom lower span to pier face','bedroom',3200,[3.55,9.15],[6.75,9.15],note='Does not include the east glazing recess.')
check('bedroom-depth','Bedroom central clear depth','bedroom',2800,[4.25,6.35],[4.25,9.15])
check('primary-width','Primary bedroom bottom clear span','primary',6500,[2.25,11.60],[8.75,11.60])
check('primary-depth','Primary bedroom central depth','primary',2700,[4.0,9.25],[4.0,11.95])
check('bath-door','Bathroom opening','bathroom',800,[.75,2.9],[1.55,2.9])
check('kitchen-door','Kitchen opening','kitchen',900,[2.85,2.9],[3.75,2.9])
check('entrance-door','Main entrance opening','hall',1000,[.85,6.75],[1.85,6.75])
check('bedroom-door','Bedroom opening','bedroom',900,[3.50,6.55],[3.50,7.45])
check('primary-door','Primary bedroom opening','primary',900,[2.55,8.1],[3.45,8.1])
check('entry-depth','Entry depth from structural pier','hall',3500,[.85,3.15],[.85,6.65],note='Starts at the pier south face, not at the living-room north wall.')
check('hall-corridor','Hall clear run to primary entry wall','hall',1400,[2.85,6.65],[2.85,8.05])
check('primary-leg','Primary entry leg depth','primary',1000,[2.85,8.15],[2.85,9.15])
check('kitchen-opening','Kitchen whole balcony opening','kitchen',1450,[7.25,.90],[7.25,2.35],note='The 800 mm operable leaf is an assumption within this complete opening.')
check('bedroom-opening','Bedroom whole balcony opening','bedroom',1800,[7.25,6.85],[7.25,8.65])
check('upper-balcony-inset','Upper balcony north inset width','balcony-kitchen',1350,[7.50,.40],[8.85,.40])
check('lower-balcony-inset','Lower balcony south inset width','balcony-bedroom',1150,[7.40,8.85],[8.55,8.85])
check('lower-balcony-north','Lower balcony north inset width','balcony-bedroom',1100,[7.45,6.70],[8.55,6.70])
check('pier-width','Balcony structural pier width','living',600,[6.75,2.70],[7.35,2.70])
check('pier-depth','Upper balcony structural pier depth','living',800,[7.00,2.35],[7.00,3.15])
check('kitchen-chain-conflict','Kitchen broad-chain door position','kitchen',1500,[1.55,2.9],[2.85,2.9],'derived','Conflict: broad chain400+800+1500 places this jamb atX3.05; local480+900 and4680 span place it atX2.85. Model span is1300 mm,200 mm shorter. On-site measurement is required.')
check('living-glazing-conflict','Living east glazing span','living',3000,[8.80,2.45],[8.80,5.75],'derived','The drawing shows3000 internally and3400 in the exterior chain with different/unclear endpoints. Reconciled glass run3300 mm; discrepancy300 mm remains explicit.')
check('primary-glazing-conflict','Primary east glazing span','primary',2150,[8.80,9.85],[8.80,11.95],'derived','Selecting the printed central room depths yields2100 mm after the outer facade chain;50 mm shorter than2150. Recess endpoint needs survey.')
check('lower-right-chain','Lower balcony east clear run','balcony-bedroom',1650,[8.75,6.90],[8.75,8.55])
check('primary-facade-pier','Primary east pier outer run','primary',1300,[9,8.55],[9,9.85])
check('ceiling','Ceiling height',None,None,[0,0],[0,3.0],'provided','User specified a 3.00 m ceiling in this conversation. This is a vertical height, not a dimension printed in the floor plan.')
for c in checks:c['from']=c.pop('from_')
source_dimensions=[
 {'group':'Exterior north','millimetres':[7500,1500]},
 {'group':'Exterior east chain','millimetres':[2350,3400,1150,1650,1300],'note':'These refer to successive facade corners/piers, not room heights.'},
 {'group':'Upper interior horizontal chain','millimetres':[400,800,1500,900,2800,600,1400],'note':'The1500 segment conflicts with kitchen local4680/480 dimensions by200 mm under common anchors.'},
 {'group':'Lower interior horizontal chain','millimetres':[300,900,100,3200,600,1300],'note':'Sum6400 mm differs from6500 mm lower clear span; endpoint faces differ or100 mm remains unresolved.'},
 {'group':'Entry horizontal chain','millimetres':[350,500,1000,200]},
 {'group':'Bathroom upper/recess details','millimetres':[1700,2000,1300,650,550,800,500],'note':'1300/650/550 refer to service/cabinet and door-zone segments. They are recorded without treating every annotation as a clear room perimeter.'},
 {'group':'Kitchen local','millimetres':[4680,2500,2000,500,480,900]},
 {'group':'Living/hall local','millimetres':[3500,2450,1350,3300,3000,1100,3700,1400,450,1400,1000]},
 {'group':'Bedroom local','millimetres':[3200,2800,200,900,800,1800,500,400]},
 {'group':'Primary local','millimetres':[6500,2700,2400,2150,300,1300,550]},
 {'group':'Upper balcony','millimetres':[750,1350,1450,2350]},
 {'group':'Lower balcony','millimetres':[350,1100,450,1650,1150,400,550,1800]}
]
data=dict(units='metres',source='User-supplied dimensioned architectural floor plan, e3e507fe-2afd-4f5f-8c77-245715029f08.jpeg',
    sourceReportedTotal=81.4,listedAreaSum=81.6,modelAreaSum=round(sum(r['modelArea'] for r in rooms.values()),6),
    wallHeight=3.0,wallHeightBasis='provided',wallHeightSource='User specified a 3.00 m ceiling in this conversation.',exteriorWallThickness=.35,interiorWallThickness=.10,
    wallThicknesses={'westExterior':.35,'northExteriorAssumed':.35,'lowerWestExterior':.20,'southExteriorAssumed':.20,'partitions':.10,'bathroomServiceZoneDerived':.32,'balconyPierWidth':.60},
    axes=a,rooms=rooms,outline=[[0,0],[9,0],[9,12.15],[2.05,12.15],[2.05,6.85],[0,6.85]],
    structuralWalls=walls,structuralPiers=piers,glazing=glazing,doors=doors,
    balconyGuards=[{'start':[7.50,.10],'end':[8.95,.10]},{'start':[8.95,.10],'end':[8.95,2.35]},{'start':[8.90,6.90],'end':[8.90,8.55]}],
    dimensionChecks=checks,drawingDimensions=source_dimensions,
    sourceAreaNote='81.4 m² is the original marketing total. Its eight labels sum to81.6 m². Neither value is used to force the new dimension-first reconstruction.',
    dimensionalConflicts=[
      {'id':'kitchen-horizontal-chain','severity':'survey-required','differenceMM':200,'message':'The printed4680 mm kitchen span plus480 mm wall return places the900 mm door200 mm west of the jamb implied by the broad400/800/1500 chain. Local room/door dimensions take precedence; both readings are preserved.'},
      {'id':'lower-horizontal-chain','severity':'survey-required','differenceMM':100,'message':'300+900+100+3200+600+1300 totals6400 mm, while the lower clear span is6500 mm. The far-right annotations appear to use curtain/pier faces rather than one shared endpoint.'},
      {'id':'living-east-glazing','severity':'survey-required','differenceMM':300,'message':'The3000 mm inner glazing annotation and3400 mm exterior chain have unresolved endpoints. The selected physical glass run is3300 mm.'},
      {'id':'primary-east-glazing','severity':'survey-required','differenceMM':50,'message':'The room-depth reconstruction and right outer chain produce2100 mm exposed glazing instead of the printed2150 mm.'}],
    assumptions=['Door leaf height2.08 m, glazed opening heads2.35/2.50 m and guard height1.05 m are not specified in the drawing.',
      'Plan dimensions are read as millimetres and converted to metres. No uniform raster scale is applied.',
      '320 mm bathroom service-zone thickness and several balcony frame/reveal offsets are derived reconciliations, not printed wall thicknesses.',
      'The entry/living floor-zone boundary is semantic; no new wall is added there.',
      'Balcony glass-door leaf splits are inferred within the printed complete openings; door swing directions follow the visible plan symbols.',
      'Room areas are computed from the reconstructed clear polygons and can differ from the marketing labels.'],
    accuracy='Dimension-first reconstruction: labelled local spans and door widths govern; unresolved endpoint conflicts, inferred recess offsets and assumed opening heights remain explicit. Not a construction survey.')
def tidy(value,key=''):
    if isinstance(value,dict):return {k:tidy(v,k) for k,v in value.items()}
    if isinstance(value,list):return [tidy(v,key) for v in value]
    if isinstance(value,str) and key in {'note','message','label','basis','areaBasis','sourceAreaNote','accuracy','assumptions','name'}:
        value=re.sub(r'([a-z])(?=\d)',r'\1 ',value)
        value=re.sub(r'(\d)(?=[a-zA-Z])',r'\1 ',value)
        value=value.replace(' mm,',' mm, ').replace(' m,',' m, ')
        value=re.sub(' +',' ',value)
    return value

data=tidy(data)
(ROOT/'dist/geometry.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'computedTotal':data['modelAreaSum'],'rooms':{k:r['modelArea'] for k,r in rooms.items()},'conflicts':data['dimensionalConflicts']},indent=2))
