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
    return dict(polygon=poly, brochureArea=brochure, targetArea=brochure, modelArea=value, area=value, labelAnchor=label, walkAnchor=walk, areaBasis='Հաշվարկված է գծագրի չափերով կառուցված եզրագծից․ բրոշյուրի մակերեսին համապատասխանեցնելու համար չափերը չեն փոփոխվել։', note=note)

a=dict(bathX=2.21, stepX=2.15, hallX=3.50, balX=7.05, balconyGlazingX=7.25, rightX=8.80,
       outerRightX=9.0, dividerY=2.90, livingY=6.30, stepY=6.75, masterDoorY=8.10,
       smallBottomY=9.20, bottomY=12.05, foyerY=4.95, balconyStartY=.15,
       rail1X=8.95, rail2X=8.90, clearWestX=.35, lowerClearWestX=2.25,
       clearEastX=8.75, kitchenWestX=2.37, bedroomWestX=3.55, pierWestX=6.75,
       pierEastX=7.35, northClearY=.35, bottomClearY=11.95)
rooms={
 'living':room([[.75,2.95],[6.75,2.95],[6.75,3.15],[7.35,3.15],[7.35,2.45],[8.75,2.45],[8.75,5.75],[8.55,5.75],[8.55,6.20],[7.05,6.20],[7.05,6.25],[2.25,6.25],[2.25,4.95],[.35,4.95],[.35,3.15],[.75,3.15]],23.6,[5.15,4.7],[5.3,5.4,0], 'Հյուրասենյակի և միջանցքի սահմանը պայմանական գոտևորում է․ գծագրում դրանք միացած են բաց անցումով։ Արևելյան ճակատում կա 450 մմ խորությամբ հետընկած հատված։'),
 'kitchen':room([[2.37,.35],[7.05,.35],[7.05,.90],[7.20,.90],[7.20,2.35],[6.75,2.35],[6.75,2.85],[2.37,2.85]],11.4,[4.65,1.55],[4.4,1.6,0], '4.68 մ-ը հիմնական հեռավորությունն է մինչև վարագույրի հաշվարկային գիծը՝ X7.05։ Ապակեպատման խորշը հասնում է մինչև X7.20, իսկ 600 × 800 մմ կրող սյունը զբաղեցնում է հարավարևելյան անկյան մի մասը։'),
 'primary':room([[2.25,8.15],[3.45,8.15],[3.45,9.25],[6.75,9.25],[6.75,9.45],[7.35,9.45],[7.35,9.10],[8.55,9.10],[8.55,9.85],[8.75,9.85],[8.75,11.95],[2.25,11.95]],18.6,[5.5,10.7],[6.7,10.4,0], '6.50 մ-ը ստորին հատվածի մաքուր լայնությունն է։ 2.70 մ-ը հիմնական կենտրոնական հատվածի խորությունն է։ Մուտքի նեղ հատվածը, պատշգամբի կրող սյունը և ճակատային պատի ելուստը սենյակին տալիս են անկանոն եզրագիծ։'),
 'bedroom':room([[3.55,6.35],[7.05,6.35],[7.05,6.85],[7.20,6.85],[7.20,8.65],[6.75,8.65],[6.75,9.15],[3.55,9.15]],9.9,[5.15,7.75],[4.1,7.1,0], 'Պատի ստորին մաքուր երկարությունը մինչև կրող սյան եզրը 3.20 մ է։ Սա սենյակի առավելագույն լայնությունը չէ․ վերին և միջին հատվածները շարունակվում են դեպի պատշգամբի ապակեպատման խորշը։'),
 'hall':room([[.35,4.95],[2.25,4.95],[2.25,6.25],[3.45,6.25],[3.45,8.05],[2.25,8.05],[2.25,6.65],[.35,6.65]],7.2,[2.9,6.9],[2.85,7.1,0], 'Միջանցքը բաց անցումով միանում է հյուրասենյակին։ Դրա հաշվարկված մակերեսը կախված է այս պայմանական գոտևորումից․ հատակի բաժանման գիծը միջնապատ չի նշանակում։'),
 'bathroom':room([[.35,.35],[2.05,.35],[2.05,2.85],[.75,2.85],[.75,2.35],[.35,2.35]],4.3,[1.23,1.35],[1.35,1.75,0], 'Ստորին ձախ կրող սյունը զբաղեցնում է պայմանական 1.70 × 2.50 մ ուղղանկյան մի մասը։ Սանհանգույցի և խոհանոցի միջև հաղորդակցությունների հատվածը վերակառուցված է որպես 320 մմ հաստությամբ համակցված գոտի։'),
 'balcony-kitchen':room([[7.50,.15],[8.85,.15],[8.85,2.30],[7.30,2.30],[7.30,.90],[7.50,.90]],3.1,[8.08,1.27],[8.05,1.3,0], 'Գծագրի 1.35 մ լայնությունը վերաբերում է հյուսիսային նեղ հատվածին՝ պատի ելուստի և արևելյան բազրիքի միջև։ Ելուստից հետո պատշգամբը լայնանում է։ Բազրիքի բարձրությունը ենթադրված է։'),
 'balcony-bedroom':room([[7.45,6.65],[8.55,6.65],[8.55,6.90],[8.75,6.90],[8.75,8.55],[8.55,8.55],[8.55,9.00],[7.40,9.00],[7.40,8.65],[7.30,8.65],[7.30,6.85],[7.45,6.85]],3.5,[8.05,7.7],[8.05,7.6,0], '1.10/1.15 մ չափերը վերաբերում են հյուսիսային և հարավային խորշերի տարբեր եզրերին։ Արևելյան բազրիքի 1.65 մ հատվածը և արևմտյան ապակեպատման 1.80 մ բացվածքը տարբեր ծայրակետեր ունեն։ Խորշերի միացման հատվածներում մնում է 50–100 մմ անորոշություն։')
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
check('outer-main','Հյուսիսային արտաքին հիմնական երկարություն',None,7500,[0,0],[7.5,0])
check('outer-balcony','Պատշգամբի հյուսիսային արտաքին հատված', 'balcony-kitchen',1500,[7.5,0],[9,0])
check('outer-width','Արտաքին ընդհանուր լայնություն',None,None,[0,0],[9,0],'derived','7500 + 1500 մմ։ Պատկերը չի չափագրվել պիքսելների մեկ ընդհանուր մասշտաբով։')
check('kitchen-width','Խոհանոցի հիմնական լայնությունը մինչև վարագույրի հաշվարկային գիծը','kitchen',4680,[2.37,1.8],[7.05,1.8],note='X7.05-ը կրող սյան միջով անցնող հաշվարկային գիծն է։ Ապակեպատումը գտնվում է X7.25-ում, իսկ դրա ներքին եզրը՝ X7.20-ում։')
check('kitchen-depth','Խոհանոցի կենտրոնական մաքուր խորություն','kitchen',2500,[4.6,.35],[4.6,2.85],note='Գծագրում այս խորությունը ներկայացված է նաև 2000 + 500 մմ հատվածներով։')
check('bath-width','Սանհանգույցի վերին մաքուր լայնություն','bathroom',1700,[.35,1.1],[2.05,1.1],note='Ստորին ձախ հատվածում կրող սյան 400 մմ ելուստը զբաղեցնում է պայմանական ուղղանկյան մի մասը։')
check('living-depth','Հյուրասենյակի կենտրոնական մաքուր խորություն','living',3300,[6.25,2.95],[6.25,6.25])
check('bedroom-width','Երկրորդ ննջասենյակի ստորին լայնությունը մինչև կրող սյան եզրը','bedroom',3200,[3.55,9.15],[6.75,9.15],note='Չի ներառում արևելյան ապակեպատման խորշը։')
check('bedroom-depth','Երկրորդ ննջասենյակի կենտրոնական մաքուր խորություն','bedroom',2800,[4.25,6.35],[4.25,9.15])
check('primary-width','Հիմնական ննջասենյակի ստորին մաքուր լայնություն','primary',6500,[2.25,11.60],[8.75,11.60])
check('primary-depth','Հիմնական ննջասենյակի կենտրոնական խորություն','primary',2700,[4.0,9.25],[4.0,11.95])
check('bath-door','Սանհանգույցի դռան բացվածք','bathroom',800,[.75,2.9],[1.55,2.9])
check('kitchen-door','Խոհանոցի դռան բացվածք','kitchen',900,[2.85,2.9],[3.75,2.9])
check('entrance-door','Մուտքի դռան բացվածք','hall',1000,[.85,6.75],[1.85,6.75])
check('bedroom-door','Երկրորդ ննջասենյակի դռան բացվածք','bedroom',900,[3.50,6.55],[3.50,7.45])
check('primary-door','Հիմնական ննջասենյակի դռան բացվածք','primary',900,[2.55,8.1],[3.45,8.1])
check('entry-depth','Մուտքի հատվածի խորությունը՝ կրող սյունից','hall',3500,[.85,3.15],[.85,6.65],note='Չափման սկիզբը կրող սյան հարավային եզրն է, ոչ թե հյուրասենյակի հյուսիսային պատը։')
check('hall-corridor','Միջանցքի մաքուր երկարությունը մինչև հիմնական ննջասենյակի մուտքի պատը','hall',1400,[2.85,6.65],[2.85,8.05])
check('primary-leg','Հիմնական ննջասենյակի մուտքի նեղ հատվածի խորություն','primary',1000,[2.85,8.15],[2.85,9.15])
check('kitchen-opening','Խոհանոցի պատշգամբի ամբողջ բացվածք','kitchen',1450,[7.25,.90],[7.25,2.35],note='Ամբողջ բացվածքի ներսում բացվող փեղկի 800 մմ լայնությունը ենթադրված է։')
check('bedroom-opening','Երկրորդ ննջասենյակից պատշգամբ տանող ամբողջ բացվածք','bedroom',1800,[7.25,6.85],[7.25,8.65])
check('upper-balcony-inset','Խոհանոցի պատշգամբի հյուսիսային խորշի լայնություն','balcony-kitchen',1350,[7.50,.40],[8.85,.40])
check('lower-balcony-inset','Ննջասենյակի պատշգամբի հարավային խորշի լայնություն','balcony-bedroom',1150,[7.40,8.85],[8.55,8.85])
check('lower-balcony-north','Ննջասենյակի պատշգամբի հյուսիսային խորշի լայնություն','balcony-bedroom',1100,[7.45,6.70],[8.55,6.70])
check('pier-width','Պատշգամբի կրող սյան լայնություն','living',600,[6.75,2.70],[7.35,2.70])
check('pier-depth','Խոհանոցի պատշգամբի կրող սյան խորություն','living',800,[7.00,2.35],[7.00,3.15])
check('kitchen-chain-conflict','Խոհանոցի դռան դիրքը՝ ընդհանուր չափաշղթայով','kitchen',1500,[1.55,2.9],[2.85,2.9],'derived','Հակասություն․ 400+800+1500 ընդհանուր չափաշղթան դռան այս եզրը տեղադրում է X3.05-ում, իսկ 480+900 տեղային չափերն ու 4680 լայնությունը՝ X2.85-ում։ Մոդելի հատվածը 1300 մմ է՝ 200 մմ-ով ավելի կարճ։ Անհրաժեշտ է տեղում չափագրում։')
check('living-glazing-conflict','Հյուրասենյակի արևելյան ապակեպատման երկարություն','living',3000,[8.80,2.45],[8.80,5.75],'derived','Գծագրի ներքին չափը 3000 է, իսկ արտաքին չափաշղթայինը՝ 3400․ դրանց ծայրակետերը տարբեր են կամ անորոշ։ Մոդելում ապակեպատման երկարությունը 3300 մմ է, և 300 մմ տարբերությունը բացահայտ նշված է։')
check('primary-glazing-conflict','Հիմնական ննջասենյակի արևելյան ապակեպատման երկարություն','primary',2150,[8.80,9.85],[8.80,11.95],'derived','Գծագրի կենտրոնական խորություններն ու ճակատի արտաքին չափաշղթան կիրառելիս ստացվում է 2100 մմ՝ 50 մմ-ով պակաս, քան 2150-ը։ Խորշի ծայրակետը պետք է ճշտել տեղում։')
check('lower-right-chain','Ննջասենյակի պատշգամբի արևելյան մաքուր հատված','balcony-bedroom',1650,[8.75,6.90],[8.75,8.55])
check('primary-facade-pier','Հիմնական ննջասենյակի արևելյան կրող սյան արտաքին երկարություն','primary',1300,[9,8.55],[9,9.85])
check('ceiling','Առաստաղի բարձրություն',None,None,[0,0],[0,3.0],'provided','Այս զրույցում Դուք նշել եք առաստաղի 3.00 մ բարձրություն։ Սա Ձեր նշած ուղղահայաց չափն է, ոչ թե հատակագծում նշված չափը։')
for c in checks:c['from']=c.pop('from_')
source_dimensions=[
 {'group':'Հյուսիսային արտաքին չափեր','millimetres':[7500,1500]},
 {'group':'Արևելյան արտաքին չափաշղթա','millimetres':[2350,3400,1150,1650,1300],'note':'Այս չափերը վերաբերում են ճակատի հաջորդական անկյուններին և կրող սյուներին, ոչ թե սենյակների բարձրություններին։'},
 {'group':'Վերին ներքին հորիզոնական չափաշղթա','millimetres':[400,800,1500,900,2800,600,1400],'note':'Նույն հաշվարկային կետերն ընդունելիս 1500 հատվածը խոհանոցի 4680/480 տեղային չափերի հետ տալիս է 200 մմ անհամապատասխանություն։'},
 {'group':'Ստորին ներքին հորիզոնական չափաշղթա','millimetres':[300,900,100,3200,600,1300],'note':'6400 մմ գումարը տարբերվում է ստորին 6500 մմ մաքուր լայնությունից․ չափման եզրերը տարբեր են, կամ մնում է չճշտված 100 մմ տարբերություն։'},
 {'group':'Մուտքի հորիզոնական չափաշղթա','millimetres':[350,500,1000,200]},
 {'group':'Սանհանգույցի վերին հատվածի և խորշի չափեր','millimetres':[1700,2000,1300,650,550,800,500],'note':'1300/650/550 չափերը վերաբերում են հաղորդակցությունների, պահարանի և դռան հատվածներին։ Դրանք պահպանված են առանձին․ յուրաքանչյուր նշում չի դիտարկվում որպես սենյակի մաքուր եզրագծի մաս։'},
 {'group':'Խոհանոցի տեղային չափեր','millimetres':[4680,2500,2000,500,480,900]},
 {'group':'Հյուրասենյակի և միջանցքի տեղային չափեր','millimetres':[3500,2450,1350,3300,3000,1100,3700,1400,450,1400,1000]},
 {'group':'Երկրորդ ննջասենյակի տեղային չափեր','millimetres':[3200,2800,200,900,800,1800,500,400]},
 {'group':'Հիմնական ննջասենյակի տեղային չափեր','millimetres':[6500,2700,2400,2150,300,1300,550]},
 {'group':'Խոհանոցի պատշգամբ','millimetres':[750,1350,1450,2350]},
 {'group':'Ննջասենյակի պատշգամբ','millimetres':[350,1100,450,1650,1150,400,550,1800]}
]
data=dict(units='metres',source='Ձեր տրամադրած չափագրված ճարտարապետական հատակագիծը՝ e3e507fe-2afd-4f5f-8c77-245715029f08.jpeg',
    sourceReportedTotal=81.4,listedAreaSum=81.6,modelAreaSum=round(sum(r['modelArea'] for r in rooms.values()),6),
    wallHeight=3.0,wallHeightBasis='provided',wallHeightSource='Այս զրույցում Դուք նշել եք առաստաղի 3.00 մ բարձրություն։',exteriorWallThickness=.35,interiorWallThickness=.10,
    wallThicknesses={'westExterior':.35,'northExteriorAssumed':.35,'lowerWestExterior':.20,'southExteriorAssumed':.20,'partitions':.10,'bathroomServiceZoneDerived':.32,'balconyPierWidth':.60},
    axes=a,rooms=rooms,outline=[[0,0],[9,0],[9,12.15],[2.05,12.15],[2.05,6.85],[0,6.85]],
    structuralWalls=walls,structuralPiers=piers,glazing=glazing,doors=doors,
    balconyGuards=[{'start':[7.50,.10],'end':[8.95,.10]},{'start':[8.95,.10],'end':[8.95,2.35]},{'start':[8.90,6.90],'end':[8.90,8.55]}],
    dimensionChecks=checks,drawingDimensions=source_dimensions,
    sourceAreaNote='Սկզբնական բրոշյուրում ընդհանուր մակերեսը նշված է 81.4 մ²։ Ութ հատվածների մակերեսների գումարը 81.6 մ² է։ Գծագրի չափերով վերակառուցված մոդելը չի հարմարեցվել այս թվերից որևէ մեկին։',
    dimensionalConflicts=[
      {'id':'kitchen-horizontal-chain','severity':'survey-required','differenceMM':200,'message':'Գծագրի խոհանոցի 4680 մմ լայնությունն ու պատի 480 մմ հատվածը 900 մմ դուռը տեղադրում են 200 մմ ավելի արևմուտք, քան ստացվում է 400/800/1500 ընդհանուր չափաշղթայով։ Առաջնահերթ են սենյակի և դռան տեղային չափերը․ երկու ընթերցումներն էլ պահպանված են։'},
      {'id':'lower-horizontal-chain','severity':'survey-required','differenceMM':100,'message':'300+900+100+3200+600+1300 գումարը 6400 մմ է, իսկ ստորին մաքուր լայնությունը՝ 6500 մմ։ Ամենաաջ նշումները, հավանաբար, վերաբերում են վարագույրի կամ կրող սյան տարբեր եզրերին, ոչ թե մեկ ընդհանուր ծայրակետի։'},
      {'id':'living-east-glazing','severity':'survey-required','differenceMM':300,'message':'Ապակեպատման ներքին 3000 մմ նշման և արտաքին 3400 մմ չափաշղթայի ծայրակետերը ճշտված չեն։ Մոդելում ընդունված ապակեպատման երկարությունը 3300 մմ է։'},
      {'id':'primary-east-glazing','severity':'survey-required','differenceMM':50,'message':'Սենյակների խորություններն ու աջ արտաքին չափաշղթան կիրառելիս ապակեպատման բաց հատվածը ստացվում է 2100 մմ՝ գծագրի 2150 մմ-ի փոխարեն։'}],
    assumptions=['Դռան փեղկի 2.08 մ բարձրությունը, ապակեպատ բացվածքների վերին եզրերի 2.35/2.50 մ բարձրություններն ու բազրիքի 1.05 մ բարձրությունը գծագրում նշված չեն։',
      'Գծագրի չափերը կարդացվել են միլիմետրերով և վերածվել մետրերի։ Պատկերի համար մեկ ընդհանուր մասշտաբ չի կիրառվել։',
      'Սանհանգույցի հաղորդակցությունների գոտու 320 մմ հաստությունը և պատշգամբի շրջանակների ու խորշերի մի քանի շեղումները հաշվարկային համադրումներ են, ոչ թե գծագրում նշված պատերի հաստություններ։',
      'Մուտքի և հյուրասենյակի հատակի գոտիների սահմանը պայմանական է․ այդտեղ նոր պատ չի ավելացվել։',
      'Պատշգամբների ապակե դռների փեղկերի բաժանումը ենթադրված է գծագրի ամբողջ բացվածքների ներսում։ Դռների բացման ուղղությունները համապատասխանում են գծագրի նշաններին։',
      'Սենյակների մակերեսները հաշվարկված են վերակառուցված մաքուր եզրագծերից և կարող են տարբերվել բրոշյուրի նշումներից։'],
    accuracy='Վերակառուցման հիմքը գծագրի չափերն են՝ տեղային երկարություններն ու դռների լայնությունները։ Չճշտված ծայրակետերը, խորշերի ենթադրված շեղումներն ու բացվածքների ենթադրված բարձրությունները բացահայտ նշված են։ Սա տեղում կատարված շինարարական չափագրում չէ։')
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
