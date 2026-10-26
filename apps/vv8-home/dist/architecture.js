import * as THREE from 'three';
import { createSurfaceMaterial, setPhysicalUV } from './materials.js';

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const temp = new THREE.Vector3();
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, ...extra });

// Vertical proportions are a design interpretation of the supplied facade render.
// The measured plan owns the bay widths, positions and retained structural piers.
export const DEFAULT_FACADE_PROFILE = Object.freeze({
  sill: .03,
  headClearance: .07,
  transomHeight: 2.10,
  mullionWidth: .045,
  mullionDepth: .075,
  frameColor: '#2d3333',
  verticalBasis: 'Visual interpretation of the supplied exterior render; not a measured window schedule'
});

function seededRandom(seed = 143) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}

function texture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(25);
  if (kind === 'wood') {
    ctx.fillStyle = '#b69c7d'; ctx.fillRect(0, 0, 1024, 1024);
    const width = 128, length = 512;
    for (let col = 0; col < 8; col++) {
      const offset = col % 3 * 171;
      for (let row = -1; row < 3; row++) {
        const y = row * length + offset, light = 63 + rand() * 9;
        ctx.fillStyle = `hsl(31 24% ${light}%)`; ctx.fillRect(col * width + 1, y + 1, width - 2, length - 2);
        for (let n = 0; n < 50; n++) {
          const x = col * width + 3 + rand() * 122;
          ctx.strokeStyle = `rgba(85,61,38,${.015 + rand() * .055})`;
          ctx.lineWidth = .4 + rand(); ctx.beginPath(); ctx.moveTo(x, y + 3);
          ctx.bezierCurveTo(x + 6, y + 150, x - 3, y + 300, x + rand() * 6, y + length - 3); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(65,47,28,.18)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(col * width + 1, y + 1, width - 2, length - 2);
      }
    }
  } else {
    ctx.fillStyle = kind === 'tile' ? '#c9c8c0' : '#e4e0d6'; ctx.fillRect(0, 0, 1024, 1024);
    for (let n = 0; n < 7000; n++) {
      const v = rand() > .5 ? 255 : 20;
      ctx.fillStyle = `rgba(${v},${v},${v},.025)`;
      ctx.fillRect(rand() * 1024, rand() * 1024, 1 + rand() * 3, 1 + rand() * 3);
    }
    if (kind === 'stone') {
      for (let n = 0; n < 22; n++) {
        ctx.strokeStyle = `rgba(123,123,111,${.07 + rand() * .08})`; ctx.lineWidth = .5 + rand() * 2;
        ctx.beginPath(); const a = rand() * 1024, b = rand() * 1024;
        ctx.moveTo(a, b); ctx.bezierCurveTo(a + 120, b - 140, a - 160, b - 330, a + 400, b - 600); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(82,82,75,.20)'; ctx.lineWidth = 2;
    for (let n = 0; n <= 4; n++) {
      ctx.beginPath(); ctx.moveTo(n * 256, 0); ctx.lineTo(n * 256, 1024); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, n * 256); ctx.lineTo(1024, n * 256); ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function shapeFrom(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath(); return shape;
}

export function polygonMesh(points, mat, y = .006) {
  const geo = new THREE.ShapeGeometry(shapeFrom(points)); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2.4, pos.getZ(i) / 2.4);
  const mesh = new THREE.Mesh(geo, mat); mesh.position.y = y; mesh.receiveShadow = true;
  return mesh;
}

export function polygonArea(points) {
  return Math.abs(points.reduce((sum, [x, z], i) => {
    const next = points[(i + 1) % points.length]; return sum + x * next[1] - next[0] * z;
  }, 0)) / 2;
}

export function pointInPolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function boundsOf(points) {
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return {minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2};
}

export function createArchitecture(data, options = {}) {
  const facadeProfile = {...DEFAULT_FACADE_PROFILE,...data.facadeProfile,...options.facadeProfile};
  const referenceHeight = Number(data.wallHeight) || 3;
  const facadeHead = height => Math.max(facadeProfile.sill + .25, height - facadeProfile.headClearance);
  const transomHead = height => Math.min(facadeProfile.transomHeight,facadeHead(height)-.025);
  const root = new THREE.Group(); root.name = 'VV8 Residence | metres';
  root.userData = {source:data.source, reportedArea:data.sourceReportedTotal, brochureRoomAreaSum:data.listedAreaSum, modelAreaSum:data.modelAreaSum, dimensionStatus:'dimension-first with disclosed endpoint conflicts', units:'metres', dimensionalConflicts:data.dimensionalConflicts, assumptions:data.assumptions};
  root.userData.facadeProfile = {...facadeProfile,referenceImage:'assets/exterior-building.jpg',head:facadeHead(referenceHeight),horizontalBasis:'Existing dimensioned plan coordinates; unchanged'};
  const a = data.axes;
  const B = a.bathX, S = a.stepX, H = a.hallX, P = a.balX, R = a.rightX;
  const D = a.dividerY, L = a.livingY, E = a.stepY, M = a.masterDoorY, Q = a.smallBottomY, Z = a.bottomY;
  const floorGroup = new THREE.Group(); floorGroup.name = 'Dimension-first clear room polygons'; root.add(floorGroup);
  const structure = new THREE.Group(); structure.name = 'Walls, columns, doors and glazing'; root.add(structure);
  const trim = new THREE.Group(); trim.name = 'Balcony railings'; root.add(trim);
  const doorArcs = new THREE.Group(); doorArcs.name = 'Door swing plan notation'; root.add(doorArcs);
  const walls = [], floors = [], doors = [], windows = [], collision = [];

  const white = createSurfaceMaterial('plaster',{color:'#efede6',name:'Warm ivory plaster',roughness:.92});
  const cut = material('#333734');
  const wallMats = [white, white, cut, white, white, white];
  const dark = material('#353a37', {roughness: .52});
  const frame = createSurfaceMaterial('metal',{color:facadeProfile.frameColor,name:'Facade reference · slim charcoal aluminium frames',metalness:.52,roughness:.32});
  const oak = createSurfaceMaterial('oak',{color:'#85705a',name:'Warm oak interior doors',roughness:.62,grain:'y',tile:[.28,1.4]});
  const brass = createSurfaceMaterial('metal',{color:'#9b8050',name:'Brushed brass door hardware',metalness:.75,roughness:.28});
  const glass = new THREE.MeshPhysicalMaterial({color:'#e6eef0',metalness:0,roughness:.055,transmission:.88,ior:1.50,thickness:.012,transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false});
  glass.name='Clear architectural glass · IOR 1.50';
  const gasket=material('#202622',{roughness:.82});gasket.name='Window glazing gaskets';
  const floorMats = {
    wood: createSurfaceMaterial('oak',{color:'#ffffff',name:'Natural oak plank floor',map:texture('wood'),roughness:.78,normalStrength:.10}),
    tile: createSurfaceMaterial('stone',{color:'#ffffff',name:'Matte warm grey porcelain floor',map:texture('tile'),roughness:.80,normalStrength:.025}),
    stone: createSurfaceMaterial('stone',{color:'#ffffff',name:'Pale balcony stone',map:texture('stone'),roughness:.70,normalStrength:.045})
  };
  const outline = data.outline;
  const slabGeo = new THREE.ExtrudeGeometry(shapeFrom(outline), {depth:.23,bevelEnabled:true,bevelThickness:.016,bevelSize:.014,bevelSegments:2,steps:1});
  slabGeo.rotateX(-Math.PI/2);
  const slab = new THREE.Mesh(slabGeo, material('#d1d0c7')); slab.position.y = -.245;
  slab.name = 'Continuous apartment slab'; slab.castShadow = true; slab.receiveShadow = true; root.add(slab);

  for (const [id, room] of Object.entries(data.rooms)) {
    const kind = id === 'kitchen' || id === 'bathroom' ? 'tile' : id.startsWith('balcony') ? 'stone' : 'wood';
    const mesh = polygonMesh(room.polygon, floorMats[kind]); mesh.name = `${id} | ${room.modelArea.toFixed(3)} computed square metres`;
    mesh.userData = {roomId:id,area:room.modelArea,brochureArea:room.brochureArea,areaBasis:room.areaBasis,kind:'floor'}; floorGroup.add(mesh); floors.push(mesh);
  }

  function box(parent, name, x, y, z, w, h, d, mat, rotation = 0) {
    const mesh = new THREE.Mesh(boxGeometry, mat); mesh.name = name;
    mesh.scale.set(w,h,d); mesh.position.set(x,y,z); mesh.rotation.y = rotation;
    mesh.castShadow = true; mesh.receiveShadow = true;
    if((Array.isArray(mat)?mat[0]:mat)?.userData?.surface)setPhysicalUV(mesh,{clone:true});
    parent.add(mesh); return mesh;
  }
  function windowBounds(mesh,bottom,top) {
    mesh.userData.verticalBasis=facadeProfile.verticalBasis;
    windows.push({mesh,bottom,top});
    return mesh;
  }
  function windowLevel(mesh,center) {
    mesh.userData.verticalBasis=facadeProfile.verticalBasis;
    windows.push({mesh,center,thickness:mesh.scale.y});
    return mesh;
  }
  function segment(start, end, thickness, bottom = 0, top = null, name = 'Wall', mats = wallMats, collidable = true) {
    const dx = end[0]-start[0], dz = end[1]-start[1], length = Math.hypot(dx,dz);
    if (length < .004) return;
    const mesh = box(structure,name,(start[0]+end[0])/2,0,(start[1]+end[1])/2,length,1,thickness,mats,-Math.atan2(dz,dx));
    const rec = {mesh,start,end,thickness,bottom,top}; walls.push(rec);
    if (collidable) collision.push(rec);
    // A quiet skirting strip on both faces survives cutaway mode.
    if (bottom === 0 && thickness >= .09 && name.includes('Wall') && !name.endsWith(' sill')) {
      const skirt = box(structure,'Painted skirting',mesh.position.x,.055,mesh.position.z,length,.11,thickness+.016,white,mesh.rotation.y);
      skirt.castShadow = false;
    }
    return mesh;
  }
  function wall(start, end, thickness = .14, openings = [], name = 'Wall') {
    const dx=end[0]-start[0], dz=end[1]-start[1], length=Math.hypot(dx,dz);
    const p = t => [start[0]+dx*t/length,start[1]+dz*t/length];
    let cursor = 0;
    for (const opening of openings.sort((a,b)=>a.from-b.from)) {
      if (opening.from > cursor) segment(p(cursor),p(opening.from),thickness,0,null,name);
      if (opening.sill) segment(p(opening.from),p(opening.to),thickness,0,opening.sill,name+' sill');
      segment(p(opening.from),p(opening.to),thickness,opening.head || 2.15,null,name+' lintel');
      cursor = opening.to;
    }
    if (cursor < length) segment(p(cursor),p(length),thickness,0,null,name);
  }
  function door(x,z,width,closedAngle,openAngle,name,glassDoor=false) {
    const group = new THREE.Group(); group.position.set(x,0,z); group.rotation.y = closedAngle;
    group.name = name; structure.add(group);
    if(!glassDoor){
      for(const xx of [-.045,width+.045])box(group,name+' timber architrave',xx,1.055,0,.07,2.11,.135,oak);
      box(group,name+' timber head trim',width/2,2.135,0,width+.16,.07,.135,oak);
    }
    const hinge = new THREE.Group(); group.add(hinge); hinge.rotation.y = openAngle;
    const doorMat = glassDoor ? glass : oak;
    const leaf = box(hinge,name+' leaf',width/2,1.04,0,width-.03,2.08,.045,doorMat);
    leaf.userData.kind = 'door';
    if (glassDoor) {
      for (const xx of [.025,width-.025]) box(hinge,'Glass door stile',xx,1.045,0,.04,2.09,.055,frame);
      for (const yy of [.025,1.02,2.065]) box(hinge,'Glass door rail',width/2,yy,0,width,.04,.055,frame);
    } else {
      box(hinge,'Door inset panel',width/2,1.10,-.027,width-.17,1.73,.012,oak);
    }
    box(hinge,'Brushed brass door handle',width-.13,1.0,-.065,.12,.025,.03,brass);
    box(hinge,'Brushed brass door handle',width-.13,1.0,.065,.12,.025,.03,brass);
    const rec={group,hinge,openAngle,target:openAngle,width,closedAngle,x,z}; doors.push(rec);
    group.traverse(obj => {obj.userData.doorIndex=doors.length-1;});
    // Plan arc; no cardinal orientation is inferred from the source.
    const pts=[];
    for(let i=0;i<=30;i++){
      const ang=closedAngle+openAngle*i/30;
      pts.push(new THREE.Vector3(x+width*Math.cos(ang),.03,z-width*Math.sin(ang)));
    }
    const arc=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:'#6f756b',dashSize:.06,gapSize:.045,transparent:true,opacity:.55}));
    arc.computeLineDistances(); doorArcs.add(arc);
  }
  /** A complete measured bay, with only fixed glass included in the collision mask. */
  function glazedOpening(spec) {
    const {start,end,name,opening=null,panels=2}=spec;
    const sill=facadeProfile.sill,head=facadeHead(referenceHeight);
    const dx=end[0]-start[0],dz=end[1]-start[1],length=Math.hypot(dx,dz),rotation=-Math.atan2(dz,dx);
    const at=t=>[start[0]+dx*t/length,start[1]+dz*t/length];
    const first=walls.length;
    wall(start,end,.10,[{from:0,to:length,sill,head}],name+' Wall');
    for(const rec of walls.slice(first)){
      rec.facadeHead=rec.bottom===head;
      rec.mesh.userData.verticalBasis=facadeProfile.verticalBasis;
      rec.mesh.userData.horizontalBasis=spec.basis;
    }
    const fixed=opening?[[0,opening.from],[opening.to,length]]:[[0,length]];
    const stiles=new Set([0,length]);
    if(opening){stiles.add(opening.from);stiles.add(opening.to);}
    function pane(from,to,bottom,top,part='fixed glazing'){
      if(to-from<.005)return;
      const bottomY=typeof bottom==='function'?bottom(referenceHeight):bottom;
      const topY=typeof top==='function'?top(referenceHeight):top;
      const p=at((from+to)/2);
      const m=box(structure,name+' '+part,p[0],(bottomY+topY)/2,p[1],to-from,topY-bottomY,.024,glass,rotation);
      m.castShadow=false;m.userData.dimensionBasis=spec.basis;m.userData.glazingBay=name;
      windowBounds(m,bottom,top);
    }
    for(const [from,to] of fixed){
      if(to-from<.005)continue;
      const n=Math.max(1,Math.ceil((to-from)/Math.max(.75,length/panels)));
      for(let i=0;i<n;i++){
        const lo=from+(to-from)*i/n,hi=from+(to-from)*(i+1)/n;
        pane(lo+.025,hi-.025,sill+.025,h=>facadeHead(h)-.025);stiles.add(lo);stiles.add(hi);
      }
      collision.push({start:at(from),end:at(to),thickness:.07,bottom:0,top:head});
      // The render shows a continuous horizontal frame band near the door heads.
      const p=at((from+to)/2);
      const rail=box(structure,name+' fixed transom rail',p[0],transomHead(referenceHeight),p[1],to-from,.035,.065,frame,rotation);
      windowLevel(rail,transomHead);
    }
    if(opening){
      pane(opening.from+.025,opening.to-.025,h=>transomHead(h)+.02,h=>facadeHead(h)-.025,'door transom');
      const p=at((opening.from+opening.to)/2);
      const m=box(structure,name+' door transom rail',p[0],transomHead(referenceHeight),p[1],opening.to-opening.from,.04,.065,frame,rotation);
      windowLevel(m,transomHead);
    }
    for(const t of stiles){
      const p=at(t),m=box(structure,name+' mullion',p[0],(sill+head)/2,p[1],facadeProfile.mullionWidth,head-sill+.04,facadeProfile.mullionDepth,frame,rotation);
      windowBounds(m,sill-.02,h=>facadeHead(h)+.02);
      // Thin recessed seals on both faces make the clear glazing readable without tinting it.
      for(const side of [-1,1]){
        const gx=p[0]-dz/length*.042*side,gz=p[1]+dx/length*.042*side;
        const seal=box(structure,name+' dark vertical gasket',gx,(sill+head)/2,gz,.012,head-sill,.008,gasket,rotation);
        windowBounds(seal,sill,facadeHead);
      }
    }
    const mid=at(length/2);
    for(const upper of [false,true]){
      const y=upper?head:sill,level=upper?facadeHead:sill;
      const m=box(structure,name+' perimeter rail',mid[0],y,mid[1],length,.045,.075,frame,rotation);
      windowLevel(m,level);
      for(const side of [-1,1]){
        const seal=box(structure,name+' horizontal gasket',mid[0]-dz/length*.042*side,y+(upper?-.018:.018),mid[1]+dx/length*.042*side,length-.045,.009,.008,gasket,rotation);
        windowLevel(seal,upper?h=>facadeHead(h)-.018:sill+.018);
      }
    }
  }
  function curtain(x,z0,z1){
    const fabric=createSurfaceMaterial('linen',{color:'#ece9df',name:'Continuous pleated linen drapery',roughness:.96,side:THREE.DoubleSide});
    const length=z1-z0,width=THREE.MathUtils.clamp(length*.16,.30,.48),top=referenceHeight-.06,bottom=.028,height=top-bottom;
    const track=box(structure,'Slim ceiling curtain track',x-.14,top+.028,(z0+z1)/2,.022,.026,length+.08,white);
    windowLevel(track,h=>h-.032);
    for(const [index,start] of [z0,z1-width].entries()){
      const columns=48,rows=30,positions=[],uvs=[],indices=[],folds=5;
      for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
        const u=col/columns,v=row/rows;
        const flare=.035*Math.pow(v,4)*Math.sin(Math.PI*(u-.5));
        const fold=.028*Math.cos(u*Math.PI*2*folds)*(1+.13*v);
        const drift=.010*Math.sin(v*Math.PI*1.6+u*2.3)*Math.sin(Math.PI*v);
        const yy=top-height*v+.014*Math.pow(v,10)*Math.sin(Math.PI*u);
        positions.push(x-.15+fold+drift,yy,start+u*width+flare);
        uvs.push(u*width*1.8/.20,(1-v)*height/.20);
        if(col<columns&&row<rows){const k=row*(columns+1)+col;indices.push(k,k+columns+1,k+1,k+1,k+columns+1,k+columns+2);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
      const panel=new THREE.Mesh(geometry,fabric);panel.name=`Gathered linen curtain · ${index?'right':'left'} continuous panel`;
      panel.castShadow=true;panel.receiveShadow=true;
      panel.userData.dimensionBasis='Design allowance; fabric drops and track height require site measurement';
      panel.userData.verticalBasis=facadeProfile.verticalBasis;
      structure.add(panel);windows.push({mesh:panel,curtain:true,referenceBottom:bottom,referenceTop:top});
      // Small carriers sit in the track, above every gathered pleat.
      for(let i=0;i<=folds;i++){
        const clip=box(structure,'Curtain track carrier',x-.15,top+.006,start+width*i/folds,.015,.026,.018,white);
        windowLevel(clip,h=>h-.054);
      }
    }
  }

  // The data file owns all plan coordinates and records the source of every opening.
  for(const spec of data.structuralWalls){
    const first=walls.length;
    wall(spec.start,spec.end,spec.thickness,spec.openings,spec.name);
    for(const rec of walls.slice(first))rec.mesh.userData.dimensionBasis=spec.basis;
  }
  for(const spec of data.structuralPiers){
    const [x0,z0,x1,z1]=spec.bounds;
    const m=segment([x0,(z0+z1)/2],[x1,(z0+z1)/2],z1-z0,0,null,spec.name,wallMats);
    m.userData.dimensionBasis=spec.basis;m.userData.planBounds=spec.bounds;
  }
  for(const spec of data.glazing)glazedOpening(spec);
  for(const spec of data.doors){
    door(spec.x,spec.z,spec.width,spec.closedAngle,spec.openAngle,spec.name,spec.glass);
    const rec=doors[doors.length-1];
    rec.group.userData.openingWidthMetres=spec.width;
    rec.group.userData.dimensionBasis=spec.sourceMM?'Printed door opening':'Inferred leaf within measured complete bay';
    rec.group.userData.heightBasis='Assumed 2.08 m leaf height';
    const threshold=box(floorGroup,spec.name+' threshold',spec.x+Math.cos(spec.closedAngle)*spec.width/2,.004,spec.z-Math.sin(spec.closedAngle)*spec.width/2,spec.width,.008,spec.glass?.20:.12,spec.glass?floorMats.stone:floorMats.wood,spec.closedAngle);
    threshold.userData.kind='threshold';
  }
  curtain(8.80,2.50,5.70);
  curtain(8.80,9.90,11.90);
  curtain(7.25,6.91,8.59);
  function railing(start,end) {
    const dx=end[0]-start[0],dz=end[1]-start[1],len=Math.hypot(dx,dz),rot=-Math.atan2(dz,dx);
    for(const y of [.07,1.05])box(trim,'Powder-coated balcony rail',(start[0]+end[0])/2,y,(start[1]+end[1])/2,len,.035,.035,frame,rot);
    const n=Math.ceil(len/.115);
    for(let i=0;i<=n;i++)box(trim,'Vertical balcony baluster',start[0]+dx*i/n,.56,start[1]+dz*i/n,.018,.98,.018,frame);
    collision.push({start,end,thickness:.04,bottom:0,top:1.05});
  }
  for(const spec of data.balconyGuards)railing(spec.start,spec.end);

  function update({walls:mode='cutaway',height=data.wallHeight ?? 3.0,mode:view='dollhouse'}) {
    structure.visible=mode!=='hidden'; trim.visible=mode!=='hidden'; doorArcs.visible=view==='plan';
    const cutHeight = mode==='cutaway' ? .82 : height;
    for(const rec of walls){
      const top=Math.min(rec.top ?? height,cutHeight);
      const bottom=rec.facadeHead?facadeHead(height):rec.bottom>2?Math.min(rec.bottom,height-.12):rec.bottom;
      rec.mesh.visible=top>bottom+.002;
      rec.mesh.scale.y=Math.max(.001,top-bottom);rec.mesh.position.y=(top+bottom)/2;
      if(rec.mesh.geometry.userData.physicalUV)setPhysicalUV(rec.mesh,{clone:false});
    }
    const value=v=>typeof v==='function'?v(height):v;
    for(const rec of windows){
      const mesh=rec.mesh;
      if(rec.curtain){
        const factor=(height-.06-rec.referenceBottom)/(rec.referenceTop-rec.referenceBottom);
        mesh.scale.y=factor;mesh.position.y=rec.referenceBottom*(1-factor);
      }else if(rec.center!==undefined){
        mesh.position.y=value(rec.center);mesh.scale.y=rec.thickness;
      }else{
        const bottom=value(rec.bottom),top=value(rec.top);
        mesh.visible=top>bottom+.002;
        mesh.position.y=(top+bottom)/2;mesh.scale.y=Math.max(.001,top-bottom);
      }
    }
    // Glazing and door leaves use clipping so cutaway remains legible.
    const clipping = mode==='cutaway' ? [new THREE.Plane(new THREE.Vector3(0,-1,0),1.10)] : [];
    const clipMaterials=new Set();
    structure.traverse(obj=>{
      if(obj.material)(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>clipMaterials.add(m));
    });
    for(const mat of clipMaterials) {mat.clippingPlanes=clipping;mat.needsUpdate=true;}
    root.userData.ceilingHeight=height;
    root.userData.facadeProfile.head=facadeHead(height);
    root.userData.facadeProfile.transomHeight=transomHead(height);
    root.userData.ceilingHeightBasis=height===data.wallHeight ? (data.wallHeightBasis || 'provided') : 'viewer adjustment';
    root.userData.ceilingHeightSource=data.wallHeightSource || 'User specified a 3.00 m ceiling in this conversation.';
  }
  function blocked(x,z,radius=.18){
    if(!pointInPolygon(x,z,outline))return true;
    for(const rec of collision){
      if(rec.bottom>1.55 || (rec.top??data.wallHeight??3.0)<.6)continue;
      const p=rec.start,q=rec.end,dx=q[0]-p[0],dz=q[1]-p[1],l2=dx*dx+dz*dz;
      const t=THREE.MathUtils.clamp(((x-p[0])*dx+(z-p[1])*dz)/l2,0,1);
      const distance=Math.hypot(x-(p[0]+t*dx),z-(p[1]+t*dz));
      if(distance<rec.thickness/2+radius)return true;
    }
    return false;
  }
  update({});
  return {root,floors,structure,trim,walls,doors,outline,update,blocked,floorMats,doorArcs,facadeProfile};
}
