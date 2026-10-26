/** Editable furniture poses only. Existing walls, structural footprints and openings are immutable. */
const EPS=1e-6,AREA_TOL=.00035;
const clone=value=>JSON.parse(JSON.stringify(value));
const round=value=>Math.round(value*1e6)/1e6;
const isPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const angle=value=>((value%360)+360)%360;
function samePose(a,b){return Math.abs(a.x-b.x)<1e-5&&Math.abs(a.z-b.z)<1e-5&&angle(a.rotation)===angle(b.rotation);}
function inside(x,z,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function area(p){return Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;}
function bounds(p){return {minX:Math.min(...p.map(q=>q[0])),maxX:Math.max(...p.map(q=>q[0])),minZ:Math.min(...p.map(q=>q[1])),maxZ:Math.max(...p.map(q=>q[1]))};}
function intersection(a,b){return Math.max(0,Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX))*Math.max(0,Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ));}
function transformRect(r,p){const t=p.rotation*Math.PI/180,c=Math.cos(t),s=Math.sin(t),points=[[r.minX,r.minZ],[r.maxX,r.minZ],[r.maxX,r.maxZ],[r.minX,r.maxZ]].map(([x,z])=>[p.x+c*x+s*z,p.z-s*x+c*z]);return {...bounds(points),minY:r.minY,maxY:r.maxY};}
function footprint(item,p){return transformRect({minX:-item.width/2,maxX:item.width/2,minZ:-item.depth/2,maxZ:item.depth/2},p);}
function clippedArea(poly,r){
  let out=poly;
  for(const [axis,value,sign] of [[0,r.minX,1],[0,r.maxX,-1],[1,r.minZ,1],[1,r.maxZ,-1]]){
    const input=out;out=[];if(!input.length)break;
    for(let i=0;i<input.length;i++){
      const a=input[i],b=input[(i+1)%input.length],ia=(a[axis]-value)*sign>=-EPS,ib=(b[axis]-value)*sign>=-EPS;
      if(ia)out.push(a);
      if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    }
  }
  return out.length>=3?area(out):0;
}
function uncovered(r,polys){
  const xs=[r.minX,r.maxX],zs=[r.minZ,r.maxZ];
  for(const p of polys)for(const [x,z] of p){if(x>r.minX&&x<r.maxX)xs.push(x);if(z>r.minZ&&z<r.maxZ)zs.push(z);}
  xs.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);let n=0;
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++)if(!polys.some(p=>inside((xs[i]+xs[i+1])/2,(zs[j]+zs[j+1])/2,p)))n+=(xs[i+1]-xs[i])*(zs[j+1]-zs[j]);
  return n;
}
function overlapParts(a,b){
  if(intersection(a.rect,b.rect)<=AREA_TOL)return 0;let result=0;
  for(const p of a.parts)for(const q of b.parts){if(Math.min(p.maxY,q.maxY)-Math.max(p.minY,q.minY)<.025)continue;result=Math.max(result,intersection(p,q));}
  return result;
}
function doorSector(door){const poly=[[door.x,door.z]],r=door.width+.025;for(let i=0;i<=32;i++){const t=door.closedAngle+door.openAngle*i/32;poly.push([door.x+r*Math.cos(t),door.z-r*Math.sin(t)]);}return poly;}
function wallRect(w,from,to){const [x,z]=w.start,dx=w.end[0]-x,dz=w.end[1]-z,len=Math.hypot(dx,dz),h=w.thickness/2,a=[x+dx*from/len,z+dz*from/len],b=[x+dx*to/len,z+dz*to/len];return Math.abs(dx)>Math.abs(dz)?{minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minZ:z-h,maxZ:z+h}:{minX:x-h,maxX:x+h,minZ:Math.min(a[1],b[1]),maxZ:Math.max(a[1],b[1])};}
function obstacles(data){
  const out=(data.structuralPiers||[]).map(p=>({minX:p.bounds[0],minZ:p.bounds[1],maxX:p.bounds[2],maxZ:p.bounds[3]}));
  for(const w of data.structuralWalls||[]){const length=Math.hypot(w.end[0]-w.start[0],w.end[1]-w.start[1]);let from=0;for(const o of [...(w.openings||[])].sort((a,b)=>a.from-b.from)){if(o.from>from)out.push(wallRect(w,from,o.from));from=o.to;}if(from<length)out.push(wallRect(w,from,length));}
  return out;
}
/** API consumed by app.js and the plan-editor UI. No renderer, DOM or persistent-storage dependency. */
export function createLayoutModel({data,furnishings}){
  if(!data?.rooms||!furnishings?.traverse)throw new Error('Հատակագծի կամ կահույքի տվյալները բացակայում են։');
  const objects=new Map(),items=[];
  furnishings.traverse(o=>{if(o.userData?.layoutItem){const item=clone(o.userData.layoutItem);items.push(item);objects.set(item.id,o);}});
  if(!items.length)throw new Error('Խմբագրվող կահույքի հավաքածուները չեն գտնվել։');
  const itemMap=new Map(items.map(i=>[i.id,i])),fixed=obstacles(data),sectors=(data.doors||[]).map(doorSector);
  const original={preset:'original',placements:Object.fromEntries(items.map(i=>[i.id,clone(i.original)]))};
  const proposed=clone(original);proposed.preset='proposed';
  const set=(id,x,z,rotation=0)=>{if(proposed.placements[id])proposed.placements[id]={x,z,rotation};};
  set('hall-storage',2.20,3.21,270);
  set('living-sofa',5.15,5.68);set('living-coffee',5.15,4.42);set('living-side',6.70,5.79);
  set('living-chair-1',3.65,4.10);set('living-chair-2',7.90,3.55,270);
  set('living-dining',7.75,4.75,90);set('living-rug',5.25,4.95);
  set('primary-bed',3.85,10.845);set('primary-bedside-1',2.64,11.60);set('primary-bedside-2',5.07,11.60);
  set('primary-wardrobe',5.75,9.60,270);set('primary-workspace',7.91,10.70,90);set('primary-rug',3.85,10.60);
  set('bedroom-bed',5.425,8.045);set('bedroom-wardrobe',3.80,8.00);set('bedroom-bedside-1',4.30,8.80);set('bedroom-bedside-2',6.53,8.80);set('bedroom-rug',5.42,7.65);
  const presets=[
    {id:'original',name:'Նախնական դասավորություն',description:'Առկա մոդելի կահույքը՝ նույն դիրքերով, չափերով և քանակով։',state:clone(original)},
    {id:'proposed',name:'Առաջարկվող դասավորություն',description:'Մուտքի ազատ անցում, շրջված ճաշասեղան, պատուհանի մոտ ընթերցանության տեղ և հիմնական ննջասենյակում աշխատանքային անկյուն։ Նույն կահույքն է․ պատերը չեն փոխվել։',state:clone(proposed)}
  ];
  const represented=state=>new Map(items.map(i=>{const p=state.placements[i.id];return [i.id,{item:i,rect:footprint(i,p),parts:i.collisionParts.map(r=>transformRect(r,p))}];}));
  const baseline=represented(original);
  const baseOverlap=new Map();for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];baseOverlap.set(a.id+'|'+b.id,overlapParts(baseline.get(a.id),baseline.get(b.id)));}
  const limitations=['Առկա պատերը, կրող ելուստներն ու բացվածքները չեն խմբագրվում։ Պատերի կառուցվածքային դերը պետք է հաստատվի համապատասխան նախագծով։','Անցումների հարմարավետությունն ու կահույքի ամրացումները վերջնականապես ճշտեք տեղում։'];
  furnishings.userData.layoutLimitations=limitations;
  let current=clone(original);
  function normalise(next){
    if(!isPlain(next)||!isPlain(next.placements))return null;
    const placements={};for(const item of items){const p=next.placements[item.id];if(!isPlain(p)||!['x','z','rotation'].every(k=>Number.isFinite(p[k]))||Math.abs(p.rotation/90-Math.round(p.rotation/90))>EPS)return null;placements[item.id]={x:round(p.x),z:round(p.z),rotation:angle(p.rotation)};}
    if(Object.keys(next.placements).some(id=>!itemMap.has(id)))return null;
    return {preset:['original','proposed','custom'].includes(next.preset)?next.preset:'custom',placements};
  }
  function validate(next){
    const n=normalise(next),errors=[],warnings=[];if(!n)return {valid:false,errors:['Դասավորության տվյալները սխալ են։ Պահպանեք բոլոր կահույքի նույնացուցիչները և օգտագործեք վերջավոր կոորդինատներ ու 90°-ի բազմապատիկ անկյուններ։'],warnings};
    const poses=represented(n);
    for(const item of items){
      const p=n.placements[item.id],old=original.placements[item.id],moved=!samePose(p,old),entry=poses.get(item.id);
      if(item.locked){if(moved)errors.push(item.name+'․ այս հավաքածուն ամրացված է և չի տեղափոխվում։');continue;}
      const polys=item.allowedRoomIds.map(id=>data.rooms[id]?.polygon).filter(Boolean);
      if(uncovered(entry.rect,polys)>.0005){const message=item.name+'․ ամբողջ հավաքածուն պետք է մնա թույլատրված սենյակի ներսում։';(moved?errors:warnings).push(message);}
      if(item.kind==='rug'||item.kind==='decor')continue;
      const hitsFixed=fixed.some(r=>entry.parts.some(part=>part.maxY>.08&&intersection(part,r)>AREA_TOL));
      if(hitsFixed){const message=item.name+'․ հատվում է առկա պատի կամ կրող ելուստի հետ։';(moved?errors:warnings).push(message);}
      const hitsDoor=sectors.some(poly=>entry.parts.some(part=>part.minY<2.08&&part.maxY>.08&&clippedArea(poly,part)>AREA_TOL));
      if(hitsDoor){const message=item.name+'․ զբաղեցնում է դռան բացման տարածքը։';(moved?errors:warnings).push(message);}
    }
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i],b=items[j];if(['rug','decor'].includes(a.kind)||['rug','decor'].includes(b.kind)||(a.locked&&b.locked))continue;
      const hit=overlapParts(poses.get(a.id),poses.get(b.id));if(hit<=AREA_TOL)continue;
      const retained=hit<=(baseOverlap.get(a.id+'|'+b.id)||0)+AREA_TOL;
      (retained?warnings:errors).push(a.name+' / '+b.name+'․ հավաքածուները հատվում են'+(retained?' նախնական մոդելի սահմաններում։':'։'));
    }
    // A concrete75 cm entry route, checked against furniture only. Existing walls are never altered.
    const route=[{minX:.975,maxX:1.725,minZ:5.15,maxZ:6.65},{minX:1.35,maxX:3.0,minZ:4.775,maxZ:5.525},{minX:2.625,maxX:3.375,minZ:5.15,maxZ:7.75}];
    const blockers=items.filter(i=>!i.locked&&!['rug','decor'].includes(i.kind)&&route.some(r=>intersection(poses.get(i.id).rect,r)>.002));
    if(blockers.length)warnings.push('Մուտքի 75 սմ անցումը նեղացնում է՝ '+blockers.map(i=>i.name).join(', ')+'։');
    return {valid:errors.length===0,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
  }
  function apply(next){const n=normalise(next);if(!n||!validate(n).valid)return false;for(const item of items){const p=n.placements[item.id],o=objects.get(item.id);o.position.x=p.x;o.position.z=p.z;o.rotation.y=p.rotation*Math.PI/180;o.userData.layoutPose=clone(p);}furnishings.updateMatrixWorld(true);current=clone(n);return clone(current);}
  function findItem(id){const item=itemMap.get(typeof id==='string'?id:id?.userData?.layoutItemId);return item?{...item,object:objects.get(item.id)}:null;}
  return {items,presets,limitations,getState:()=>clone(current),validate,apply,findItem};
}
