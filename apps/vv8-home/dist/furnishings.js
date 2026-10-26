import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSurfaceMaterial, setPhysicalUV } from './materials.js';

/** VV8 furniture plan. Sourced shapes are schematic; custom pieces are planning allowances.
 * Room geometry and source-plan layout remain unchanged. One unit = one metre. */
export function createFurnishings(data) {
  const root = new THREE.Group();
  root.name = 'VV8 · Furnishings';
  const a = data.axes;
  const mats = {};
  const geometryCache = new Map();
  const material = (name, color, roughness = 0.7, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.name = name; mats[name] = m; return m;
  };
  const surface = (kind,name,color,roughness,metalness=0) => {
    const m=createSurfaceMaterial(kind,{name,color,roughness,metalness});mats[name]=m;return m;
  };
  const oak = surface('oak','Warm smoked oak veneer', '#9c8267', .64);
  const darkOak = surface('oak','Smoked oak joinery', '#74614e', .62);
  const paleOak = surface('oak','Natural oak and mango wood', '#c0a886', .65);
  const ivory = surface('paint','Warm ivory cabinetry', '#ebe7dc', .55);
  const stone = surface('stone','Honed ivory marble', '#f1eee5', .33);
  const ceramic = surface('paint','White porcelain', '#faf8f0', .2);
  const black = material('Black powder coated steel', '#29302e', .5, .2);
  const screen = material('Television glass', '#17211f', .16, .35);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#c6e5e0', transparent: true, opacity: .15, roughness: .05, metalness: .1, depthWrite: false, side: THREE.DoubleSide }); glass.name = 'Clear shower glass';
  const chrome = surface('metal','Brushed chrome', '#abb4b2', .25, .85);
  const brass = surface('metal','Brushed warm bronze hardware', '#a18b6d', .38, .7);
  const charcoal = surface('fabric','Charcoal upholstery', '#454b45', .97);
  const dove = surface('fabric','Dove grey upholstery', '#a7aaa5', 1);
  const doveCushion = surface('fabric','Dove grey cushion fabric', '#b9bbb5', 1);
  const boucle = surface('fabric','Ivory oat boucle upholstery', '#ded7c9', 1);
  const boucleSeat = surface('fabric','Ivory oat seat fabric', '#ece6d9', 1);
  const cream = surface('linen','Cream linen', '#eeebe2', 1);
  const taupe = surface('linen','Taupe linen', '#bdb4a4', 1);
  const accent = surface('linen','Muted olive linen accent', '#9a9c85', 1);
  const whiteLinen = surface('linen','Ivory bed linen', '#f2efe6', 1);
  const rugMat = surface('rug','Lucerne wool blend rug', '#d5cec1', 1);
  const livingRugMat = surface('rug','Rypestarr woven polypropylene rug', '#c6c1b3', 1);
  const soil = material('Potting soil', '#3b3a2d', 1);
  const leaf = material('Plant leaves', '#4b7143', .85);
  const leafLight = material('Young leaves', '#6b8d55', .85);
  leaf.side=leafLight.side=THREE.DoubleSide;
  const mirror = material('Mirror', '#b9c5bf', .12, .97);
  const recess = material('Sink and appliance shadow', '#65736e', .4, .3);
  const warmGlow = new THREE.MeshStandardMaterial({ color:'#f3ebd3', emissive:'#e5b66b', emissiveIntensity:.12, roughness:.75 }); warmGlow.name='Linen lampshade';

  function mesh(parent, geo, mat, name, x=0, y=0, z=0) {
    const o = new THREE.Mesh(geo, mat); o.name = name; o.position.set(x,y,z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
  }
  function box(parent, name, x,y,z,w,h,d,mat, radius=0) {
    const r=Math.min(radius,w/2.1,h/2.1,d/2.1),segments=r>.028?2:1;
    const key=['box',w,h,d,r,segments,mat.userData.surface?.family,mat.userData.surface?.grain].join(':');
    let geo=geometryCache.get(key),fresh=!geo;
    if(!geo){geo=r?new RoundedBoxGeometry(w,h,d,segments,r):new THREE.BoxGeometry(w,h,d);geometryCache.set(key,geo);}
    const o=mesh(parent,geo,mat,name,x,y,z);
    if(fresh&&mat.userData.surface)setPhysicalUV(o,{clone:false});
    return o;
  }
  function cyl(parent,name,x,y,z,r,h,mat,rt=r,segments=24){
    const key=['cylinder',r,rt,h,segments,mat.userData.surface?.family].join(':');
    let geo=geometryCache.get(key),fresh=!geo;
    if(!geo){geo=new THREE.CylinderGeometry(rt,r,h,segments);geometryCache.set(key,geo);}
    const o=mesh(parent,geo,mat,name,x,y,z);if(fresh&&mat.userData.surface)setPhysicalUV(o,{clone:false,projection:'cylinder'});return o;
  }
  function sphere(parent,name,x,y,z,sx,sy,sz,mat){const o=mesh(parent,new THREE.SphereGeometry(1,20,14),mat,name,x,y,z);o.scale.set(sx,sy,sz);return o;}
  function group(parent,name,x=0,y=0,z=0,rotation=0){const g=new THREE.Group();g.name=name;g.position.set(x,y,z);g.rotation.y=rotation;parent.add(g);return g;}
  function item(o,id,dimensions,kind='custom planning size',model){
    o.userData.budgetItemId=id;
    if(dimensions)o.userData.furnitureDimensionsMetres={width:dimensions[0],depth:dimensions[1],height:dimensions[2]};
    o.userData.sizeBasis=kind;
    if(model)o.userData.productModel=model;
    o.userData.geometryRepresentation='Schematic model, not manufacturer CAD';
    return o;
  }
  function rod(parent,name,start,end,r,mat){const p1=new THREE.Vector3(...start),p2=new THREE.Vector3(...end);const o=mesh(parent,new THREE.CylinderGeometry(r,r,p1.distanceTo(p2),10),mat,name);o.position.copy(p1).add(p2).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),p2.sub(p1).normalize());return o;}
  function beam(parent,name,start,end,w,d,mat){const p1=new THREE.Vector3(...start),p2=new THREE.Vector3(...end);const o=box(parent,name,0,0,0,w,p1.distanceTo(p2),d,mat,.003);o.position.copy(p1).add(p2).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),p2.sub(p1).normalize());return o;}
  function tube(parent,name,points,r,mat){return mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,8,false),mat,name);}
  function ring(parent,name,x,y,z,r,t,mat,rx=Math.PI/2){const o=mesh(parent,new THREE.TorusGeometry(r,t,7,28),mat,name,x,y,z);o.rotation.x=rx;return o;}
  function legs(parent,w,d,height,mat=darkOak,th=.035,y0=0){for(const x of [-1,1])for(const z of [-1,1])box(parent,'Furniture leg',x*(w/2-.055),height/2+y0,z*(d/2-.055),th,height,th,mat,.007);}
  function softBox(parent,name,x,y,z,w,h,d,mat,seed=1,piping=true){
    const thin=[w,h,d].indexOf(Math.min(w,h,d)),dims=[w,h,d],other=[0,1,2].filter(v=>v!==thin);
    const loose=/pillow|accent cushion|Soft cushion/i.test(name);
    const bedPillow=name==='Filled head pillow';
    const subdivisions=[16,12,14];subdivisions[thin]=4;
    // RoundedBox keeps a large flat centre. Loose pillows need an evenly sampled
    // fabric surface so that loft and central compression exist in the geometry.
    const geo=loose?new THREE.BoxGeometry(w,h,d,...subdivisions):new RoundedBoxGeometry(w,h,d,3,Math.min(w,h,d)*.32);
    geo.type='BufferGeometry';
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){
      const v=[p.getX(i),p.getY(i),p.getZ(i)],u=v[other[0]]/(dims[other[0]]/2),t=v[other[1]]/(dims[other[1]]/2);
      const puff=Math.max(0,Math.cos(u*Math.PI/2)*Math.cos(t*Math.PI/2));
      const sign=v[thin]<0?-1:1;
      if(loose){
        v[thin]*=bedPillow
          ? (sign>0?.55+.45*Math.pow(puff,.65):.86+.14*Math.pow(puff,.65))
          : .12+.88*Math.pow(puff,.55);
        const cornerPinch=.025*Math.pow(Math.abs(u*t),2);
        v[other[0]]*=(1-cornerPinch)*Math.sqrt(1-.08*t*t);v[other[1]]*=(1-cornerPinch)*Math.sqrt(1-.08*u*u);
        if(sign>0)v[thin]-=dims[thin]*(bedPillow?.02:.085)*Math.exp(-((u-.08)**2+(t+.07)**2)/.16);
        v[thin]+=sign*dims[thin]*.006*Math.sin(u*17+seed)*Math.sin(t*11-seed);
      }else v[thin]=v[thin]*.77+sign*dims[thin]*(.13*puff+.012*Math.sin(u*19+seed)*Math.sin(t*13-seed));
      const waist=Math.exp(-Math.pow(v[thin]/(dims[thin]*.13),2));
      v[other[0]]*=1-.018*waist;v[other[1]]*=1-.018*waist;
      if(thin===1&&!bedPillow)v[1]-=h*.055*Math.exp(-((u-.2)**2+(t+.18)**2)/.19);
      p.setXYZ(i,...v);
    }
    geo.computeBoundingBox();const size=geo.boundingBox.getSize(new THREE.Vector3()),center=geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-center.x,-center.y,-center.z);geo.scale(w/size.x,h/size.y,d/size.z);geo.computeVertexNormals();
    const o=mesh(parent,geo,mat,name,x,y,z);setPhysicalUV(o,{clone:false});
    o.userData.renderDetail='Pillowed fabric surface with a compressed stitched edge';
    if(piping){
      const aw=dims[other[0]]*.485,ah=dims[other[1]]*.485,corner=Math.min(aw,ah)*.18,points=[];
      for(let c=0;c<4;c++){
        const sx=c===0||c===3?1:-1,sy=c<2?1:-1;
        for(let j=0;j<6;j++){
          const angle=c*Math.PI/2+j/5*Math.PI/2;
          const q=[0,0,0];q[other[0]]=sx*(aw-corner)+Math.cos(angle)*corner;q[other[1]]=sy*(ah-corner)+Math.sin(angle)*corner;points.push(new THREE.Vector3(...q));
        }
      }
      // Follow the inset perimeter; the welt remains inside the stated furniture envelope.
      const curve=new THREE.CatmullRomCurve3(points,true,'centripetal');
      mesh(o,new THREE.TubeGeometry(curve,48,.0018,4,true),mat,'Fine stitched upholstery welt');
    }
    return o;
  }
  function pillow(parent,x,y,z,w,d,mat,rotation=0){const o=softBox(parent,'Soft cushion with stitched edge',x,y,z,w,.115,d,mat,2);o.rotation.y=rotation;return o;}
  function combine(parent,objects,name,mat){
    if(!objects.length)return null;
    const arrays={position:[],normal:[],uv:[]};
    for(const o of objects){o.updateMatrix();const geo=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrix);for(const key of Object.keys(arrays)){const attr=geo.attributes[key];if(attr)arrays[key].push(attr.array);}geo.dispose();parent.remove(o);}
    const geo=new THREE.BufferGeometry();
    for(const [key,chunks]of Object.entries(arrays)){if(!chunks.length)continue;const out=new Float32Array(chunks.reduce((n,v)=>n+v.length,0));let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}geo.setAttribute(key,new THREE.BufferAttribute(out,key==='uv'?2:3));}
    return mesh(parent,geo,mat,name);
  }
  function flutedPanel(parent,name,x,y,z,w,h,mat,pitch=.035,facing=1){
    const segments=Math.max(16,Math.ceil(w/pitch)*6),pos=[],uv=[],indices=[];
    for(let i=0;i<=segments;i++){
      const u=i/segments,xx=(u-.5)*w,zz=.002*Math.cos(u*Math.PI*2*Math.round(w/pitch));
      pos.push(xx,-h/2,zz,xx,h/2,zz);uv.push(xx/.28,0,xx/.28,h/1.4);
      if(i<segments){const k=i*2;indices.push(...(facing>0?[k,k+2,k+1,k+2,k+3,k+1]:[k,k+1,k+2,k+2,k+1,k+3]));}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    geo.userData.physicalUV=true;return mesh(parent,geo,mat,name,x,y,z);
  }
  function stoneDisc(parent,name,x,top,z,r,thickness){
    const bevel=.003,points=[[0,top-thickness],[r-bevel,top-thickness],[r,top-thickness+bevel],[r,top-bevel],[r-bevel,top],[0,top]].map(p=>new THREE.Vector2(...p));
    const o=mesh(parent,new THREE.LatheGeometry(points,64),stone,name,x,0,z);setPhysicalUV(o,{clone:false});return o;
  }
  function plant(parent,x,z,h=.85,r=.19,y=0){
    const g=item(group(parent,'Potted plant',x,y,z),'whole-decor');
    const profile=[[r*.62,0],[r*.70,.018],[r*.91,r*1.45],[r,r*1.49],[r,r*1.54],[r*.92,r*1.54],[r*.87,r*1.43]].map(v=>new THREE.Vector2(...v));
    const pot=mesh(g,new THREE.LatheGeometry(profile,32),ivory,'Turned ceramic planter with fine rim');setPhysicalUV(pot,{projection:'cylinder',clone:false});
    cyl(g,'Soil',0,r*1.43,0,r*.87,.012,soil);
    const stems=[],leaves=[],young=[];
    for(let i=0;i<11;i++){
      const theta=i*2.39996,reach=h*(.11+.035*(i%3)),height=h*(.42+.043*i);
      const ex=Math.cos(theta)*reach,ez=Math.sin(theta)*reach;
      stems.push(rod(g,'Plant stem',[0,r*1.3,0],[ex,height,ez],.0045,leaf));
      const length=h*(.20+.03*(i%3)),width=h*.115,positions=[],uv=[],indices=[];
      for(let j=0;j<=8;j++)for(let k=0;k<3;k++){
        const t=j/8,u=k-1,spread=Math.pow(Math.sin(t*Math.PI),.72);
        positions.push(u*width/2*spread,.04*length*Math.sin(t*Math.PI)-Math.abs(u)*length*.06*spread-length*.30*t*t,t*length);
        uv.push((u+1)/2,t);if(j<8&&k<2){const n=j*3+k;indices.push(n,n+3,n+1,n+1,n+3,n+4);}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
      const l=mesh(g,geo,i%3===0?leafLight:leaf,'Curved botanical leaf',ex,height,ez);l.rotation.set(-.35+.08*(i%3),theta+.6,.22*Math.cos(theta));
      (i%3===0?young:leaves).push(l);
    }
    combine(g,stems,'Fine branching plant stems',leaf);combine(g,leaves,'Organic mature foliage',leaf);combine(g,young,'Organic young foliage',leafLight);
    return g;
  }
  function vase(parent,x,y,z,scale=1){
    const g=item(group(parent,'Ceramic vase and branch',x,y,z),'whole-decor');
    cyl(g,'Vase body',0,.07*scale,0,.055*scale,.14*scale,ceramic,.035*scale);
    for(let i=0;i<3;i++){rod(g,'Branch',[0,.1*scale,0],[Math.sin(i*2)*.055*scale,.35*scale+i*.035,Math.cos(i*2)*.06*scale],.004,leaf);const l=sphere(g,'Sprig',Math.sin(i*2)*.055*scale,.32*scale+i*.035,Math.cos(i*2)*.06*scale,.025*scale,.065*scale,.012*scale,leaf);l.rotation.z=i*.7;}
  }
  function lamp(parent,x,z,y=.48,budgetId){
    const g=group(parent,'Bedside lamp',x,y,z);
    cyl(g,'Lamp base',0,.014,0,.09,.028,brass);
    cyl(g,'Lamp stem',0,.115,0,.016,.2,brass);
    cyl(g,'Linen lampshade',0,.23,0,.115,.16,warmGlow,.09);
    if(budgetId)item(g,budgetId,[.23,.23,.31]);
    return g;
  }
  function chair(parent,x,z,rotation=0,upholstery=cream,scale=1){
    const g=group(parent,'Dining chair',x,0,z,rotation);g.scale.setScalar(scale);
    legs(g,.46,.48,.43,darkOak,.028);
    box(g,'Upholstered seat',0,.455,0,.47,.09,.47,upholstery,.045);
    const back=box(g,'Curved upholstered chair back',0,.73,.195,.47,.47,.095,upholstery,.045);back.rotation.x=-.09;
    return g;
  }
  function armchair(parent,x,z,rotation=0){
    const g=item(group(parent,'Ashley Novelda accent chair · schematic',x,0,z,rotation),'living-chairs',[.65,.84,.81],'retailer exterior dimensions','Ashley Novelda');
    for(const s of [-1,1]){
      const shape=new THREE.Shape();shape.moveTo(-.42,.065);shape.quadraticCurveTo(0,-.065,.42,.065);shape.lineTo(.42,.105);shape.quadraticCurveTo(0,-.025,-.42,.105);shape.closePath();
      const rocker=mesh(g,new THREE.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:false,curveSegments:24}),paleOak,'Novelda curved timber rocker',s*.305-.02,0,0);rocker.rotation.y=Math.PI/2;setPhysicalUV(rocker,{grain:'x',clone:false});
      beam(g,'Novelda exposed front timber leg',[s*.3,.045,-.245],[s*.3,.565,-.24],.045,.045,paleOak);
      beam(g,'Novelda inclined back timber leg',[s*.3,.055,.27],[s*.3,.765,.32],.045,.045,paleOak);
      box(g,'Novelda timber armrest',s*.3,.58,-.095,.05,.045,.57,paleOak,.01);
    }
    box(g,'Novelda upper timber back rail',0,.785,.32,.60,.05,.045,paleOak,.006);
    box(g,'Novelda seat support',0,.335,-.055,.56,.035,.55,paleOak,.004);
    softBox(g,'Novelda attached seat cushion',0,.425,-.07,.53,.14,.59,doveCushion,2);
    const back=softBox(g,'Novelda attached back cushion',0,.595,.235,.53,.40,.14,doveCushion,5);back.rotation.x=.14;
    g.userData.formReference='Retailer description: exposed light-wood rocking frame with attached seat and back cushions';
    return g;
  }
  function patioChair(parent,x,z,rotation=0,budgetId){
    const g=item(group(parent,'Ashley Oriengo outdoor chair · schematic',x,0,z,rotation),budgetId,[.62,.56,.75],'retailer exterior dimensions, W62 × L56 × H75 cm','Ashley Oriengo grey');
    legs(g,.56,.49,.41,black,.025);
    box(g,'Grey outdoor seat',0,.445,-.02,.56,.075,.52,dove,.045);
    box(g,'Outdoor chair back',0,.61,.2425,.62,.28,.075,dove,.045);
    for(const s of [-1,1]){
      rod(g,'Metal arm support',[s*.2975,.41,-.20],[s*.2975,.60,-.20],.0125,black);
      rod(g,'Metal armrest',[s*.2975,.60,-.20],[s*.2975,.60,.225],.0125,black);
    }
    for(const x of [-.20,-.10,0,.10,.20])box(g,'Outdoor back seam',x,.61,.201,.003,.21,.003,taupe);
    return g;
  }
  function wardrobe(parent,x,z,w,h,d,rotation=0,mat=darkOak,budgetId){
    const g=item(group(parent,'Fitted wardrobe · custom',x,0,z,rotation),budgetId,[w,d,h]);
    box(g,'Wardrobe carcass',0,h/2,.03,w,h,d-.06,mat,.003);
    box(g,'Recessed shadow behind door reveals',0,h/2,-d/2+.054,w-.018,h-.055,.006,black);
    const doors=Math.max(2,Math.round(w/.5));
    const sliding=budgetId==='bedroom-wardrobe';
    g.userData.doorOperation=sliding?'Sliding fronts to avoid a swing conflict in the compact bedroom':'Hinged fronts';
    for(let i=0;i<doors;i++){
      const dx=sliding?(i===0?-1:1)*(w/4-.01):-w/2+(i+.5)*w/doors;
      const offset=sliding&&i===1?.018:0,doorWidth=sliding?w/2+.02:w/doors-.004;
      box(g,'Wardrobe door',dx,h/2,-d/2+.039+offset,doorWidth,h-.07,.03,mat,.002);
      flutedPanel(g,'Continuous fine oak fluting',dx,h/2,-d/2+.020+offset,doorWidth-.02,h-.10,mat,.035,-1);
      box(g,'Fine bronze wardrobe pull',dx+w/doors*.3,1.12,-d/2+.01+offset,.012,.28,.02,brass,.004);
    }
    box(g,'Recessed wardrobe plinth',0,.045,-.01,w-.08,.09,d-.05,black);
    return g;
  }
  function cloth(parent,x,y,z,w,d,mat,throwStyle=false){
    const nx=40,nz=throwStyle?24:36,positions=[],uvs=[],indices=[];
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const u=i/nx,v=j/nz,xx=(u-.5)*w,zz=(v-.5)*d;
      const edge=Math.max(0,(Math.abs(u-.5)-.39)/.11),foot=Math.max(0,(.095-v)/.095);
      const fold=.009*Math.sin(v*(throwStyle?18:27)+u*7)+.006*Math.sin(v*(throwStyle?32:47)-u*13)+.007*Math.sin(u*25+v*3)*Math.pow(Math.abs(u-.5)*2,3);
      const yy=y+.018*Math.sin(v*Math.PI)*Math.sin(u*Math.PI)+fold-edge*edge*(throwStyle?.14:.17)-foot*foot*(throwStyle?.01:.115);
      positions.push(xx,yy,zz);uvs.push(xx/.20,zz/.20);
      if(i<nx&&j<nz){const k=j*(nx+1)+i;indices.push(k,k+nx+1,k+1,k+1,k+nx+1,k+nx+2);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
    geo.userData.physicalUV=true;
    const clothMaterial=mat.clone();clothMaterial.side=THREE.DoubleSide;clothMaterial.name=mat.name+' · draped cloth';
    const o=mesh(parent,geo,clothMaterial,throwStyle?'Naturally folded linen throw':'Continuous draped duvet',x,0,z);return o;
  }
  function bed(parent,x,z,w=1.6,l=2,bedId,mattressId){
    const g=item(group(parent,'Compact channelled upholstered bed · custom',x,0,z),bedId,[w+.17,2.11,1.19]);
    box(g,'Recessed bed feet',0,.08,0,w-.13,.16,l-.12,darkOak,.025);
    box(g,'Upholstered bed frame',0,.25,0,w+.08,.29,l+.07,boucle,.06);
    const mattress=item(box(g,'DUSON Opera Diva mattress · schematic height',0,.46,0,w,.22,l,whiteLinen,.085),mattressId,[w,l,.22],'retailer width and length; height is a schematic estimate','DUSON Opera Diva');
    mattress.userData.verifiedDimensions=['width','depth'];
    box(g,'Full width upholstered headboard',0,.65,l/2+.025,w+.17,1.08,.10,boucle,.045);
    const channels=Math.round((w+.07)/.18);
    for(let i=0;i<channels;i++)box(g,'Soft vertical headboard channel',-(w+.07)/2+(i+.5)*(w+.07)/channels,.66,l/2-.033,(w+.07)/channels-.012,1.015,.028,boucleSeat,.013);
    const bedding=item(group(g,'Ivory bed linen and accent throw'),bedId.replace('-bed','-bedding'));
    for(const s of [-1,1]){
      const p=softBox(bedding,'Filled head pillow',s*w*.235,.65,l*.32,w*.43,.18,.46,cream,s<0?3:6);p.rotation.y=s*.035;
    }
    cloth(bedding,0,.64,-l*.15,w+.08,l*.69,whiteLinen);
    cloth(bedding,0,.674,-l*.31,w+.05,.45,accent,true);
    return g;
  }
  function bedside(parent,x,z,budgetId,lampId){
    const g=item(group(parent,'Fluted oak and stone bedside · custom',x,0,z),budgetId,[.41,.41,.4775]);
    const geo=new THREE.CylinderGeometry(.2,.2,.46,176,1,true),positions=geo.attributes.position;
    for(let i=0;i<positions.count;i++){const angle=Math.atan2(positions.getX(i),positions.getZ(i)),r=.197+.003*Math.cos(angle*44);positions.setX(i,Math.sin(angle)*r);positions.setZ(i,Math.cos(angle)*r);}geo.computeVertexNormals();
    const body=mesh(g,geo,darkOak,'Continuous fluted oak bedside drum',0,.23,0);setPhysicalUV(body,{projection:'cylinder',clone:false});
    cyl(g,'Recessed bedside bronze foot',0,.018,0,.18,.036,brass);
    stoneDisc(g,'Bevelled stone bedside top',0,.4775,0,.205,.035);
    lamp(parent,x,z,.48,lampId);
    return g;
  }
  function rug(parent,name,x,z,w,d,mat,budgetId,model){
    const r=item(box(parent,name,x,.015,z,w,.025,d,mat,.012),budgetId,[w,d,.025],'retailer nominal rug size; thickness schematic',model);
    return r;
  }
  function shelterLamp(parent,x,z,y){
    const g=item(group(parent,'Normann Copenhagen Shelter table lamp · schematic',x,y,z),'living-lamp',[.41,.41,.41],'retailer exterior dimensions','Normann Copenhagen Shelter');
    cyl(g,'Shelter lamp base',0,.01,0,.09,.02,ivory);
    cyl(g,'Shelter lamp stem',0,.145,0,.016,.27,ivory);
    const profile=[[0,.41],[.06,.405],[.12,.386],[.166,.35],[.194,.31],[.205,.278],[.197,.268],[.03,.28]].map(p=>new THREE.Vector2(...p));
    mesh(g,new THREE.LatheGeometry(profile,40),ivory,'Shelter curved mushroom shade');
    return g;
  }
  const roomGroups={};
  for(const id of Object.keys(data.rooms)){const g=group(root,id+' · Furniture');g.userData.roomId=id;roomGroups[id]=g;}

  // Kitchen: the straight run, four-ring hob, sink, open shelves and refrigerator.
  const k=roomGroups.kitchen;
  const counterStart=a.bathX+.18,counterEnd=a.balX-1.13,cw=counterEnd-counterStart;
  const center=(counterStart+counterEnd)/2;
  box(k,'Kitchen dark recessed plinth',center,.06,.49,cw,.12,.56,black);
  box(k,'Base cabinet body',center,.46,.49,cw,.79,.62,ivory,.012);
  box(k,'Kitchen cabinet shadow reveals',center,.47,.805,cw-.015,.735,.006,black);
  box(k,'Stone kitchen worktop',center,.89,.49,cw+.025,.055,.66,stone,.012);
  box(k,'Matching splashback',center,1.08,.135,cw,.34,.018,stone);
  const count=6;
  for(let i=0;i<count;i++){
    const x=counterStart+(i+.5)*cw/count;
    box(k,'Kitchen cabinet front',x,.47,.812,cw/count-.004,.735,.023,ivory,.002);
    box(k,'Kitchen cabinet pull',x,.73,.833,cw/count*.6,.014,.016,brass,.004);
    if(i<2)box(k,'Drawer joint',x,.59,.827,cw/count-.015,.007,.005,darkOak);
    if(i===0||i===5)flutedPanel(k,'Kitchen fluted oak door detail',x,.44,.827,cw/count-.03,.59,oak);
  }
  const hobX=counterStart+.48;
  box(k,'Black ceramic hob',hobX,.926,.48,.64,.025,.5,screen,.018);
  for(const dx of [-.155,.155])for(const dz of [-.125,.125]){
    ring(k,'Hob burner',hobX+dx,.942,.48+dz,.085,.007,chrome);
    ring(k,'Hob burner inner ring',hobX+dx,.942,.48+dz,.056,.004,chrome);
  }
  cyl(k,'Saucepan',hobX-.155,1.005,.355,.072,.12,chrome);
  box(k,'Saucepan handle',hobX-.27,1.04,.355,.16,.018,.026,black,.008);
  const sinkX=counterStart+1.57;
  box(k,'Sink stainless steel rim',sinkX,.925,.48,.62,.02,.46,chrome,.04);
  box(k,'Sink basin',sinkX,.937,.48,.53,.025,.37,recess,.05);
  box(k,'Sink basin bottom',sinkX,.94,.48,.44,.009,.28,chrome,.04);
  cyl(k,'Sink drain',sinkX,.95,.48,.027,.006,recess);
  tube(k,'Swan neck kitchen tap',[[sinkX,.92,.25],[sinkX,1.19,.25],[sinkX,1.24,.36],[sinkX,1.11,.42]],.018,chrome);
  cyl(k,'Tap lever',sinkX+.1,.975,.25,.016,.11,chrome);
  box(k,'Wooden chopping board',sinkX+.63,.935,.38,.34,.035,.22,paleOak,.02);
  vase(k,sinkX+.89,.93,.3,.67);
  const shelfX=counterEnd-.14;
  for(const y of [1.25,1.52]){
    box(k,'Open oak display shelf',shelfX,y,.285,.48,.045,.3,oak,.007);
    for(let i=0;i<3;i++)cyl(k,'Pantry ceramic jar',shelfX-.15+i*.15,y+.09,.27,.045,.14,i===1?taupe:ceramic);
  }
  const fridgeX=a.balX-.54;
  box(k,'Tall refrigerator furniture housing',fridgeX,1.09,.49,.72,2.16,.7,ivory,.035);
  box(k,'Refrigerator upper door',fridgeX,1.38,.851,.695,1.53,.026,ceramic,.012);
  box(k,'Refrigerator freezer drawer',fridgeX,.32,.855,.695,.54,.032,ivory,.01);
  box(k,'Fridge handle',fridgeX-.23,1.25,.884,.018,.31,.026,chrome,.007);
  box(k,'Freezer handle',fridgeX,.57,.884,.43,.018,.026,chrome,.006);
  box(k,'Fridge information display',fridgeX-.05,1.55,.87,.16,.045,.008,screen,.004);
  const kt=item(group(k,'Kitchen breakfast table · custom',5.12,0,a.dividerY-.39),'kitchen-breakfast',[1.28,.56,.7925]);
  box(kt,'Breakfast tabletop',0,.765,0,1.28,.055,.56,stone,.045);
  legs(kt,1.16,.46,.73,paleOak,.045);
  for(const x of [4.79,5.45])item(chair(k,x,a.dividerY-1.08,Math.PI,cream,.86),'kitchen-breakfast',[.4042,.42517,.82927]);
  vase(kt,.28,.8,0,.82);
  plant(k,a.balX-.65,a.dividerY-.60,.65,.115);
  // North wall was at 0.12 m in the old illustration fit; it is measured at 0.35 m.
  // Shift the complete worktop/appliance assembly together, preserving service alignment.
  const kitchenNorthShift=(a.northClearY??.35)-.12;
  for(const o of k.children)if(o.position.z<1.2)o.position.z+=kitchenNorthShift;

  // Living room: compact ivory seating and sourced furniture at its listed exterior size.
  const l=roomGroups.living;
  const sofaX=5.10,sofaZ=a.livingY-.55,coffeeZ=sofaZ-.43-.40-.415,chairZ=coffeeZ-.43;
  rug(l,'JYSK RYPESTARR 200 × 300 cm · schematic',sofaX,4.90,3,2,livingRugMat,'living-rug','JYSK RYPESTARR 200 × 300 cm');
  const sofa=item(group(l,'Ivory oat three-seat sofa · custom',sofaX,0,sofaZ),'living-sofa',[2.26,.86,.94]);
  legs(sofa,2.2,.83,.13,black,.04);
  box(sofa,'Sofa upholstered base',0,.255,0,2.26,.29,.86,boucle,.06);
  box(sofa,'Sofa back',0,.65,.335,2.26,.58,.19,boucle,.065);
  for(const s of [-1,1])box(sofa,'Sofa arm',s*1.03,.51,0,.2,.44,.86,boucle,.055);
  for(let i=0;i<3;i++){
    softBox(sofa,'Plump seat cushion',-.65+i*.65,.445,-.045,.64,.14,.64,boucleSeat,i+1);
    const c=softBox(sofa,'Tailored back cushion',-.65+i*.65,.67,.19,.62,.38,.15,boucleSeat,i+4);c.rotation.x=-.09;
  }
  for(const s of [-1,1]){const p=softBox(sofa,'Linen accent cushion',s*.7,.69,-.03,.33,.32,.12,s<0?accent:taupe,s<0?8:9);p.rotation.set(-.18,0,s*.16);}
  armchair(l,4.0,chairZ,Math.PI+.36);
  armchair(l,6.0,chairZ,Math.PI-.36);
  const coffee=item(group(l,'Ashley Isanti round coffee table · schematic',5.0,0,coffeeZ),'living-coffee',[.83,.83,.46],'retailer exterior dimensions','Ashley Isanti');
  stoneDisc(coffee,'Bevelled pale marble coffee tabletop',0,.46,0,.415,.05);
  for(const angle of [Math.PI/4,-Math.PI/4]){const base=box(coffee,'Crossed mango-wood pedestal',0,.205,0,.57,.41,.07,paleOak,.008);base.rotation.y=angle;}
  const coffeeDecor=item(group(l,'Coffee table accessories',5.0,.46,coffeeZ),'whole-decor');
  box(coffeeDecor,'Coffee table book',-.11,.014,-.035,.2,.028,.16,taupe,.006);
  cyl(coffeeDecor,'Small candle',.1,.041,.06,.045,.082,ceramic);
  const side=item(group(l,'Ashley Isanti round end table · schematic',6.58,0,sofaZ),'living-side',[.56,.56,.57],'retailer exterior dimensions','Ashley Isanti');
  stoneDisc(side,'Bevelled pale marble end tabletop',0,.57,0,.28,.05);
  for(const angle of [Math.PI/4,-Math.PI/4]){const base=box(side,'Crossed mango-wood end-table base',0,.26,0,.36,.52,.055,paleOak,.006);base.rotation.y=angle;}
  shelterLamp(l,6.58,sofaZ,.57);
  const tv=item(group(l,'Floating oak media joinery · custom',5.12,0,a.dividerY+.32),'living-media',[2.37,.4595,1.96]);
  tv.userData.topHeightAboveFloorMetres=2.13;
  box(tv,'Timber television feature panel',0,1.15,-.23,2.35,1.96,.045,darkOak,.012);
  box(tv,'Ivory floating media console',0,.43,0,2.37,.32,.4,ivory,.018);
  flutedPanel(tv,'Fine fluted media-console front',0,.43,.204,2.24,.27,oak);
  for(const x of [-.79,0,.79])box(tv,'Console drawer joint',x,.43,.205,.006,.28,.004,taupe);
  box(tv,'Television frame',0,1.25,-.065,1.65,.97,.065,black,.025);
  box(tv,'Television screen',0,1.25,-.026,1.56,.87,.009,screen,.018);
  box(tv,'Television bottom edge',0,.78,-.016,1.61,.023,.018,charcoal,.005);
  vase(tv,-.97,.6,.02,.75);
  box(tv,'Stack of books',.92,.62,.03,.25,.065,.18,taupe,.005);
  const dining=item(group(l,'Four-seat stone and oak dining table · custom',7.69,0,4.625),'living-dining',[1.23,.8,.795]);
  box(dining,'White dining tabletop',0,.765,0,1.23,.06,.8,stone,.075);
  legs(dining,1.11,.68,.735,paleOak,.045);
  for(const x of [7.38,8.0]){item(chair(l,x,3.985,Math.PI,cream,.88),'living-dining',[.4136,.43506,.84856]);item(chair(l,x,5.265,0,cream,.88),'living-dining',[.4136,.43506,.84856]);}
  vase(dining,.14,.8,-.02,.92);
  for(const x of [-.35,.35]){
    cyl(dining,'Dining place setting',x,.803,0,.125,.012,ceramic);
    ring(dining,'Plate rim',x,.813,0,.103,.003,taupe);
  }
  plant(l,8.08,5.85,1.14,.23);

  // Entry hall furniture is kept against the western wall to preserve the narrow route.
  const h=roomGroups.hall;
  const hc=item(group(h,'Entry console and mirror · custom',.59,0,5.56),'hall-console',[.45,1.16,2.0]);
  box(hc,'Entry console oak carcass',0,.49,0,.42,.25,1.12,darkOak,.025);
  box(hc,'Entry console stone top',.015,.63,0,.45,.04,1.16,stone,.018);
  for(const zz of [-.48,.48])box(hc,'Console side support',0,.25,zz,.35,.5,.055,darkOak,.006);
  box(hc,'Mirror dark frame',-.19,1.4,0,.04,1.2,.64,darkOak,.055);
  box(hc,'Hall mirror',-.164,1.4,0,.012,1.1,.55,mirror,.045);
  plant(h,.62,5.22,.38,.085,.65);
  box(hc,'Entry key tray',.05,.675,.32,.18,.018,.13,brass,.015);
  wardrobe(h,2.30,5.975,1.15,2.12,.43,-Math.PI/2,ivory,'hall-storage');

  // Smaller bedroom: south headboard and the wardrobe in the south-west corner.
  const b=roomGroups.bedroom;
  rug(b,'JYSK LUCERNE 160 × 230 cm · schematic',5.35,7.65,2.30,1.60,rugMat,'bedroom-rug','JYSK LUCERNE 160 × 230 cm');
  bed(b,5.35,8.025,1.6,2,'bedroom-bed','bedroom-mattress');
  bedside(b,4.27,8.77,'bedroom-bedsides','bedroom-lamps');
  bedside(b,6.47,8.77,'bedroom-bedsides','bedroom-lamps');
  wardrobe(b,3.80,8.61,.95,2.12,.5,-Math.PI/2,darkOak,'bedroom-wardrobe');

  // Primary bedroom: larger south-facing headboard, west wardrobe and east dressing table.
  const p=roomGroups.primary;
  rug(p,'JYSK LUCERNE 200 × 300 cm · schematic',5.18,10.45,3,2,rugMat,'primary-rug','JYSK LUCERNE 200 × 300 cm');
  bed(p,5.2,10.825,1.8,2,'primary-bed','primary-mattress');
  bedside(p,3.99,11.60,'primary-bedsides','primary-lamps');
  bedside(p,6.42,11.60,'primary-bedsides','primary-lamps');
  wardrobe(p,2.61,10.80,1.7,2.2,.64,-Math.PI/2,darkOak,'primary-wardrobe');
  const vanity=item(group(p,'Stone and oak dressing table with mirror · custom',7.90,0,11.58),'primary-vanity',[1.14,.48,1.64]);
  box(vanity,'Dressing table top',0,.76,0,1.14,.065,.48,stone,.045);
  box(vanity,'Dressing table drawer',0,.65,.015,1.08,.15,.42,ivory,.012);
  box(vanity,'Drawer pull',0,.65,-.205,.26,.014,.02,brass,.004);
  legs(vanity,1.03,.39,.73,paleOak,.037);
  ring(vanity,'Circular mirror frame',0,1.32,.222,.303,.017,brass,0);
  const vm=mesh(vanity,new THREE.CircleGeometry(.285,48),mirror,'Dressing mirror',0,1.32,.229);vm.rotation.y=Math.PI;
  vase(vanity,.38,.8,0,.65);
  cyl(vanity,'Jewellery dish',-.35,.81,-.02,.075,.025,ceramic);
  const vanityChair=item(group(p,'HAY Layout chair · schematic',7.90,0,10.94,Math.PI),'primary-chair',[.475,.55,.79],'retailer exterior dimensions','HAY Layout');
  for(const sx of [-1,1])for(const sz of [-1,1]){
    beam(vanityChair,'Layout aluminium four-star base',[0,.125,0],[sx*.20,.022,sz*.245],.025,.025,black);
    cyl(vanityChair,'Layout floor glide',sx*.20,.0075,sz*.245,.022,.015,black,.022,12);
  }
  cyl(vanityChair,'Layout swivel column',0,.275,0,.025,.29,black);
  cyl(vanityChair,'Layout under-seat swivel mounting plate',0,.425,0,.06,.018,black,.06,20);
  box(vanityChair,'Layout plywood seat',0,.445,-.025,.475,.035,.50,paleOak,.017);
  for(const s of [-1,1])beam(vanityChair,'Layout shell-to-seat connection',[s*.20,.455,.205],[s*.205,.525,.25],.032,.03,ivory);
  const backShape=new THREE.Shape();backShape.moveTo(-.205,.50);backShape.quadraticCurveTo(-.2345,.56,-.2345,.70);backShape.quadraticCurveTo(-.2345,.787,-.17,.787);backShape.lineTo(.17,.787);backShape.quadraticCurveTo(.2345,.787,.2345,.70);backShape.quadraticCurveTo(.2345,.56,.205,.50);backShape.closePath();
  const opening=new THREE.Path();opening.absellipse(0,.574,.138,.045,0,Math.PI*2,true);backShape.holes.push(opening);
  const shell=mesh(vanityChair,new THREE.ExtrudeGeometry(backShape,{depth:.022,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:2,curveSegments:14}),ivory,'Layout curved shell with open back',0,0,.25);setPhysicalUV(shell,{clone:false});
  vanityChair.userData.formReference='Retailer description: backrest opening, plywood seat and aluminium four-star swivel base';

  // Bathroom fittings. Toilet position is inferred because the source obscures this corner.
  const bath=roomGroups.bathroom;
  const shower=group(bath,'Shower enclosure',.915,0,.915);
  box(shower,'Low porcelain shower tray',0,.035,0,1.03,.07,1.03,ceramic,.035);
  box(shower,'Shower tray inset',0,.078,0,.91,.015,.91,stone,.025);
  cyl(shower,'Shower drain',.28,.091,.28,.035,.007,chrome);
  box(shower,'Shower glass side',.505,1.05,0,.009,2.06,1.02,glass);
  box(shower,'Fixed shower glass front',-.26,1.05,.505,.49,2.06,.009,glass);
  for(const x of [-.505,.505])rod(shower,'Shower glass trim',[x,.06,.505],[x,2.08,.505],.009,chrome);
  rod(shower,'Shower vertical riser',[-.27,.88,-.49],[-.27,2.14,-.49],.013,chrome);
  rod(shower,'Rain shower arm',[-.27,2.14,-.49],[-.27,2.14,-.17],.015,chrome);
  cyl(shower,'Rain shower head',-.27,2.115,-.13,.115,.035,chrome);
  cyl(shower,'Shower mixer',-.27,.94,-.46,.035,.16,chrome);
  box(shower,'Shower niche',-.27,1.28,-.49,.32,.2,.025,ivory,.012);
  cyl(shower,'Shampoo bottle',-.32,1.27,-.46,.023,.13,taupe);
  const sink=item(group(bath,'Bathroom furniture and contextual basin',1.75,0,.72),'bathroom-vanity',[.5425,.64,1.54]);
  sink.userData.planningComponentsMetres={cabinet:{width:.49,depth:.61,height:.43},top:{width:.52,depth:.64,height:.045},mirrorTopAboveFloor:1.915};
  box(sink,'Floating vanity cabinet',0,.59,0,.49,.43,.61,ivory,.025);
  box(sink,'Bathroom vanity surface',0,.82,0,.52,.045,.64,stone,.03);
  sphere(sink,'Oval porcelain washbasin',-.025,.86,0,.205,.07,.25,ceramic);
  sphere(sink,'Washbasin hollow',-.025,.91,-.005,.155,.012,.2,recess);
  cyl(sink,'Basin drain',-.035,.925,0,.023,.005,chrome);
  tube(sink,'Basin mixer tap',[[.16,.83,.1],[.16,1.03,.1],[.055,1.03,.1],[.055,.99,.1]],.013,chrome);
  box(sink,'Bathroom mirror frame',.265,1.48,0,.035,.87,.57,ivory,.035);
  box(sink,'Bathroom mirror',.24,1.48,0,.009,.8,.5,mirror,.025);
  const toilet=group(bath,'Inferred toilet position',1.69,0,2.15,Math.PI/2);
  toilet.userData.inferred=true;
  box(toilet,'Wall-hung toilet cistern',0,.55,.285,.4,.81,.14,ivory,.025);
  sphere(toilet,'Porcelain toilet bowl',0,.33,-.025,.205,.19,.29,ceramic);
  const seat=ring(toilet,'Toilet seat',0,.49,-.06,.16,.027,ceramic);seat.scale.set(1,1.38,1);
  sphere(toilet,'Toilet bowl interior',0,.487,-.06,.13,.012,.19,recess);
  box(toilet,'Flush button',0,.85,.205,.12,.065,.008,chrome,.008);
  const towel=group(bath,'Folded bathroom towel',1.98,0,1.50);
  rod(towel,'Towel rail',[0,1.2,-.17],[0,1.2,.17],.012,chrome);
  box(towel,'Cotton towel',-.028,.99,0,.035,.39,.27,cream,.016);

  // Both balconies retain one chair and their original compact round table footprint.
  const bk=roomGroups['balcony-kitchen'];
  patioChair(bk,8.28,.82,-.15,'balcony-kitchen-chair');
  const bkt=item(group(bk,'Kitchen-balcony side table · custom',7.72,0,1.55),'balcony-kitchen-table',[.44,.44,.5525]);
  cyl(bkt,'Stone patio table top',0,.53,0,.22,.045,stone);
  cyl(bkt,'Patio table pedestal',0,.265,0,.07,.51,black);
  cyl(bkt,'Patio table foot',0,.0175,0,.15,.035,black);
  item(cyl(bk,'Tea cup',7.72,.585,1.55,.043,.065,ceramic),'whole-decor');
  const bb=roomGroups['balcony-bedroom'];
  patioChair(bb,8.25,7.42,-.12,'balcony-bedroom-chair');
  const bbt=item(group(bb,'Bedroom-balcony side table · custom',7.76,0,8.12),'balcony-bedroom-table',[.42,.42,.5425]);
  cyl(bbt,'Stone patio table top',0,.52,0,.21,.045,stone);
  cyl(bbt,'Patio table pedestal',0,.26,0,.065,.49,black);
  cyl(bbt,'Patio table foot',0,.0175,0,.14,.035,black);
  vase(bb,7.76,.55,8.12,.54);

  // Explicit furniture scope: appliances and sanitaryware remain visual context only.
  const joinery=item(group(k,'Fitted kitchen joinery and worktop · custom'),'kitchen-cabinetry');
  joinery.userData.planningComponentsMetres={
    baseCarcass:{width:cw,depth:.62,height:.79},
    worktop:{width:cw+.025,depth:.66,height:.055,topLevel:.9175},
    tallHousing:{width:.72,depth:.70,height:2.16},
    note:'Retain fitted run and appliance positions; final fabrication requires a measured survey.'
  };
  const joineryNames=new Set(['Kitchen dark recessed plinth','Base cabinet body','Kitchen cabinet shadow reveals','Stone kitchen worktop','Kitchen cabinet front','Kitchen cabinet pull','Drawer joint','Kitchen fluted oak door detail','Open oak display shelf','Tall refrigerator furniture housing']);
  for(const o of [...k.children]){
    if(joineryNames.has(o.name))joinery.add(o);
    else if(/hob|Hob|Saucepan|Sink|sink|tap|Tap|Refrigerator|Freezer|Fridge|splashback/.test(o.name)){
      o.userData.budgetExcluded=true;
      o.userData.budgetExclusionReason='Existing appliance, sanitary fitting or building finish; outside the furniture budget';
    }
  }
  for(const o of tv.children)if(/^Television /.test(o.name)){
    o.userData.budgetExcluded=true;o.userData.budgetExclusionReason='Television excluded; media furniture is priced separately';
  }
  for(const o of sink.children)if(/washbasin|Washbasin|Basin drain|mixer tap/.test(o.name)){
    o.userData.budgetExcluded=true;o.userData.budgetExclusionReason='Sanitary fitting excluded; vanity furniture is priced separately';
  }
  shower.userData.budgetExcluded=true;
  toilet.userData.budgetExcluded=true;
  towel.userData.budgetExcluded=true;

  for(const [id,g] of Object.entries(roomGroups))g.traverse(o=>{
    o.userData.roomId=id;
    if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
  });
  root.userData.units='metres';
  root.userData.note='Furniture-only plan: listed retail dimensions and estimated custom sizes are distinguished in item metadata. Furnishings fit the supplied dimensioned plan without scaling retail products. Forms are reference-informed reconstructions, not manufacturer CAD. Mattress heights and sanitary positions remain estimates.';
  return root;
}
