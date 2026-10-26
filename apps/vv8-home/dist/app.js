import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createArchitecture, polygonMesh, boundsOf, polygonArea, pointInPolygon } from './architecture.js';
import { createFurnishings } from './furnishings.js';
import * as ui from './ui.js';
import { initBudgetUI, setBudgetRoom } from './budget-ui.js';
import { attachFurnitureBudget } from './budget-model.js';
import { createSceneQuality } from './scene-quality.js';

const $ = id => document.getElementById(id);
const areaText = n => (Math.round((Number(n)+1e-8)*10)/10).toFixed(1);
const state = {mode:'dollhouse',dimensions:false,labels:true,furniture:true,walls:'cutaway',height:3,measuring:false,selected:null,lighting:'daylight'};
const viewport=$('viewport'), labelRoot=$('labels');
let renderer,scene,camera,ortho,perspective,controls,architecture,furnishings,model,data,rooms,budgetData,sceneQuality;
let dimGroup=new THREE.Group(),selectionGroup=new THREE.Group(),measurementGroup=new THREE.Group();
let labels=[],dimensionLabels=[],measurementLabels=[],measurementPoints=[];
let walkYaw=0,walkPitch=0,drag=null,previousTime=0,transition=null,frameHandle;
const downKeys=new Set(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.025);
const center=new THREE.Vector3();
const hasReducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const roomDescriptions={
  living:['Living room','Հյուրասենյակ','#97a98f','Lounge and dining zone with the drawing’s 3.30 m main depth, structural piers and recessed glazing.'],
  kitchen:['Kitchen','Խոհանոց','#b3aa90','Separate kitchen following the 4.68 m main span and 2.50 m depth in the dimensioned drawing.'],
  primary:['Primary bedroom','Ննջասենյակ','#baaa98','L-shaped bedroom with a 6.50 m main span, 2.70 m main depth and a separate entrance arm.'],
  bedroom:['Bedroom 2','Ննջասենյակ','#a6b4aa','2.80 m deep bedroom with a 3.20 m span to the column face and an additional glazing recess.'],
  hall:['Entrance & hall','Միջանցք','#c5b48e','Entrance, service recess and bedroom circulation reconstructed from the drawing’s door and wall chains.'],
  bathroom:['Bathroom','Սանհանգույց','#98b1b8','1.70 m main width, service recess and 0.80 m doorway. Fixture positions remain a design interpretation.'],
  'balcony-kitchen':['Kitchen balcony','Պատշգամբ','#b4ba9e','Inset balcony with structural stubs and the 1.35 m north span shown on the drawing.'],
  'balcony-bedroom':['Bedroom balcony','Պատշգամբ','#a2b9a1','Stepped balcony following the drawing’s piers, glazing, and local 1.10 / 1.15 m spans.']
};

function line(points,color='#678472',opacity=1,parent=dimGroup){
  const geometry=new THREE.BufferGeometry().setFromPoints(points);
  const object=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity,depthTest:false}));
  object.renderOrder=5;parent.add(object);return object;
}
function makeLabel(text,position,className='dimension-label'){
  const el=document.createElement('div');el.className=className;el.textContent=text;labelRoot.append(el);
  return {el,position:new THREE.Vector3(...position)};
}
function removeGroup(group){
  while(group.children.length){const c=group.children[0];group.remove(c);c.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});}
}
function removeLabels(list){for(const label of list)label.el.remove();list.length=0;}

async function start(){
  const response=await fetch('./geometry.json');if(!response.ok)throw new Error('The apartment geometry could not be loaded.');
  data=await response.json();
  const budgetResponse=await fetch('./budget.json');
  if(!budgetResponse.ok)throw new Error('The furniture budget could not be loaded.');
  budgetData=await budgetResponse.json();
  rooms=Object.entries(data.rooms).map(([id,r])=>{
    const [name,armenian,color,description]=roomDescriptions[id];
    return {...r,id,name,armenian,color,description,area:polygonArea(r.polygon),brochureArea:r.brochureArea??r.targetArea,bounds:boundsOf(r.polygon)};
  });
  data.modelAreaSum=rooms.reduce((n,r)=>n+r.area,0);
  ui.initUI(rooms,handleAction,data);
  initBudgetUI({data:budgetData,onRoom:id=>selectRoom(id)});
  scene=new THREE.Scene();scene.background=new THREE.Color('#eeece6');
  try {
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
  } catch (graphicsError) {
    const {SoftwareRenderer}=await import('./SoftwareRenderer.js');
    renderer=new SoftwareRenderer();
    console.info('Graphics acceleration unavailable; using the interactive geometry fallback.');
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.localClippingEnabled=true;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Interactive 3D apartment. Use the controls to explore rooms.');
  viewport.prepend(renderer.domElement);

  if(!renderer.isSoftwareRenderer){
    const environment=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
    scene.environment=pmrem.fromScene(environment,.04).texture;scene.environmentIntensity=.42;environment.dispose();pmrem.dispose();
  }
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#eeece6',roughness:1}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.28;ground.receiveShadow=true;ground.name='Studio background';scene.add(ground);
  const grid=new THREE.GridHelper(34,68,'#b8b8ac','#d2d1c8');grid.position.set(4,-.273,6);
  grid.material.transparent=true;grid.material.opacity=.21;grid.visible=!renderer.isSoftwareRenderer;scene.add(grid);

  architecture=createArchitecture(data);model=architecture.root;
  furnishings=createFurnishings(data);furnishings.name='Warm contemporary furniture · Armenian price plan';model.add(furnishings);scene.add(model);
  sceneQuality=createSceneQuality({scene,renderer,data,furnishings});
  attachFurnitureBudget(model,budgetData);
  scene.add(dimGroup,selectionGroup,measurementGroup);
  center.set(data.axes.rightX/2,0,data.axes.bottomY/2);
  ortho=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);perspective=new THREE.PerspectiveCamera(65,1,.06,100);
  camera=ortho;setDollhouseCamera(false);
  setupControls();resize();new ResizeObserver(resize).observe(viewport);
  createRoomLabels();bindCanvas();createWalkPad();rebuildDimensions();
  applySettings();ui.setSelectedRoom(null);ui.setReady();
  renderer.compile(scene,camera);
  window.__homeDiagnostics=()=>({ready:true,three:THREE.REVISION,renderer:renderer.isSoftwareRenderer?'software geometry fallback':'WebGL',mode:state.mode,selected:state.selected,measuring:state.measuring,dimensions:state.dimensions,furniture:state.furniture,walls:state.walls,height:state.height,lighting:state.lighting,modelArea:rooms.reduce((n,r)=>n+polygonArea(r.polygon),0),dimensionChecks:data.dimensionChecks||[],roomCount:rooms.length,meshes:countMeshes(model),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,camera:camera.position.toArray(),viewport:{width:viewport.clientWidth,height:viewport.clientHeight}});
  window.__homeModel={model,data,rooms};
  animate(0);
}

function countMeshes(root){let n=0;root.traverse(o=>{if(o.isMesh)n++;});return n;}
function setupControls(){
  controls?.dispose();controls=new OrbitControls(ortho,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.09;controls.target.copy(center);
  controls.maxPolarAngle=Math.PI*.475;controls.minPolarAngle=.01;
  controls.minZoom=.65;controls.maxZoom=4.6;controls.maxDistance=40;
  controls.screenSpacePanning=true;controls.enableRotate=state.mode!=='plan';
  controls.mouseButtons.LEFT=state.mode==='plan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
  controls.touches.ONE=state.mode==='plan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
  controls.addEventListener('start',()=>{transition=null;});controls.update();
}
function resize(){
  if(!renderer||!ortho)return;
  const w=viewport.clientWidth,h=viewport.clientHeight,aspect=w/Math.max(1,h);
  renderer.setSize(w,h,false);
  const vertical=aspect<.7?Math.max(22.5,10.8/aspect):aspect<1.1?18.5:16.0;
  ortho.left=-vertical*aspect/2;ortho.right=vertical*aspect/2;ortho.top=vertical/2;ortho.bottom=-vertical/2;ortho.updateProjectionMatrix();
  perspective.aspect=aspect;perspective.updateProjectionMatrix();
}
function targetCamera(position,target,zoom=1,animated=true){
  if(!animated||hasReducedMotion){ortho.position.copy(position);controls?.target.copy(target);ortho.lookAt(target);ortho.zoom=zoom;ortho.updateProjectionMatrix();return;}
  transition={from:ortho.position.clone(),to:position.clone(),targetFrom:controls.target.clone(),targetTo:target.clone(),zoomFrom:ortho.zoom,zoomTo:zoom,start:performance.now(),duration:650};
}
function setDollhouseCamera(animated=true){
  const target=center.clone().add(new THREE.Vector3(0,.15,0));
  const mobile=viewport.clientWidth<600;
  targetCamera(target.clone().add(mobile?new THREE.Vector3(1.6,21,12):new THREE.Vector3(9.3,18.5,14)),target,1,animated);
}
function setMode(mode){
  state.mode=mode;transition=null;
  if(mode==='walk'){
    camera=perspective;controls.enabled=false;
    state.walls='full';state.measuring=false;ui.setStatus('');
    teleportToRoom(state.selected||'living');
  }else{
    camera=ortho;controls.enabled=true;controls.enableRotate=mode!=='plan';
    controls.mouseButtons.LEFT=mode==='plan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
    controls.touches.ONE=mode==='plan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
    if(state.walls==='full')state.walls='cutaway';
    if(mode==='plan')targetCamera(center.clone().add(new THREE.Vector3(0,25,.001)),center,1);
    else setDollhouseCamera();
  }
  ui.setMode(mode);applySettings();
}
function applySettings(){
  architecture.update(state);furnishings.visible=state.furniture;
  sceneQuality?.update(state);
  dimGroup.visible=state.dimensions&&state.mode!=='walk';
  selectionGroup.visible=state.mode!=='walk';measurementGroup.visible=state.mode!=='walk';
  $('walk-pad')?.classList.toggle('visible',state.mode==='walk');
  viewport.classList.toggle('measuring',state.measuring);viewport.classList.toggle('walking',state.mode==='walk');
  ui.updateSettings(state);
  renderer.invalidate?.();
}

function createRoomLabels(){
  const a=data.axes;
  const locations={
    living:[5.0,.85,(a.dividerY+a.livingY)/2+.15],kitchen:[4.45,.85,1.55],primary:[5.3,.85,a.smallBottomY+1.45],bedroom:[5.16,.85,a.livingY+1.55],
    hall:[2.62,.85,a.livingY+.55],bathroom:[1.0,.85,1.4],
    'balcony-kitchen':[(a.balX+.12+a.rail1X)/2,.85,1.6],'balcony-bedroom':[(a.balX+.12+a.rail2X)/2,.85,a.livingY+1.65]
  };
  for(const room of rooms){
    const el=document.createElement('button');el.className='room-label';el.dataset.labelRoom=room.id;
    el.setAttribute('aria-label',`Select ${room.name}, ${areaText(room.area)} calculated square metres`);
    el.title='Area calculated from the current drawing-based model';
    el.innerHTML=`<span>${room.name}</span><strong>${areaText(room.area)} <small>m²</small></strong>`;
    el.addEventListener('click',event=>{event.stopPropagation();if(!state.measuring)selectRoom(room.id);});
    const anchor=room.labelAnchor;
    const location=anchor?[anchor[0],.85,anchor[1]]:locations[room.id];
    labelRoot.append(el);labels.push({el,position:new THREE.Vector3(...location),roomId:room.id});
  }
}
function projectLabels(){
  const rect=viewport.getBoundingClientRect(),width=rect.width,height=rect.height;
  const projected=new THREE.Vector3();
  function place(label,visible){
    if(!visible){label.el.style.display='none';return;}
    projected.copy(label.position);if(label.roomId&&state.mode==='plan')projected.y=.04;
    projected.project(camera);
    const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
    const inside=projected.z>-1&&projected.z<1&&x>24&&x<width-24&&y>38&&y<height-38;
    label.el.style.display=inside?'':'none';
    if(inside)label.el.style.transform=`translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  }
  for(const label of labels)place(label,state.labels&&state.mode!=='walk'&&!state.measuring);
  for(const label of dimensionLabels)place(label,state.dimensions&&state.mode!=='walk');
  for(const label of measurementLabels)place(label,state.mode!=='walk');
}
function selectRoom(id){
  state.selected=id;const room=rooms.find(r=>r.id===id);
  if(!room)return;
  ui.setSelectedRoom(room,{...room.bounds,area:room.area});
  setBudgetRoom(id);
  for(const label of labels)label.el.classList.toggle('selected',label.roomId===id);
  removeGroup(selectionGroup);
  const mat=new THREE.MeshBasicMaterial({color:room.color,transparent:true,opacity:.19,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  selectionGroup.add(polygonMesh(room.polygon,mat,.021));
  const pts=[...room.polygon,room.polygon[0]].map(([x,z])=>new THREE.Vector3(x,.035,z));
  line(pts,'#4c7864',.95,selectionGroup);
  rebuildDimensions();
  if(state.mode==='walk')teleportToRoom(id);
}
function dimension(p,q,offset,labelText,basis='derived'){
  const p1=new THREE.Vector3(p[0],.05,p[1]),p2=new THREE.Vector3(q[0],.05,q[1]);
  const d=p2.clone().sub(p1),len=d.length();if(len<.2)return;
  const n=new THREE.Vector3(-d.z,0,d.x).normalize().multiplyScalar(offset);
  const a=p1.clone().add(n),b=p2.clone().add(n);
  line([p1,a],'#789184',.48);line([p2,b],'#789184',.48);line([a,b],'#537d68',.88);
  const tick=new THREE.Vector3(-d.z,0,d.x).normalize().multiplyScalar(.075);
  line([a.clone().sub(tick),a.clone().add(tick)]);line([b.clone().sub(tick),b.clone().add(tick)]);
  const c=a.clone().add(b).multiplyScalar(.5);c.y=.08;
  const label=makeLabel(labelText||`${basis==='drawing'?'':'~ '}${len.toFixed(2)} m`,c.toArray());
  label.el.dataset.basis=basis;label.el.title=basis==='drawing'?'Dimension printed on the supplied drawing':'Derived distance in the model';
  dimensionLabels.push(label);
}
function rebuildDimensions(){
  removeGroup(dimGroup);removeLabels(dimensionLabels);
  const checks=(data.dimensionChecks||[]).filter(c=>c.id!=='ceiling'&&Array.isArray(c.from)&&Array.isArray(c.to));
  if(checks.length){
    const shown=checks.filter(c=>state.selected?(c.roomId===state.selected):(c.showOverview||c.overview||['kitchen-width','kitchen-depth','living-depth','bedroom-width','bedroom-depth','primary-width','primary-depth'].includes(c.id)));
    const fallback=shown.length?shown:checks.filter(c=>state.selected?c.roomId===state.selected:c.basis==='drawing').slice(0,state.selected?8:7);
    for(const c of fallback){const m=c.basis==='drawing'&&c.sourceMM!=null?Number(c.sourceMM)/1000:Number(c.modelMetres);dimension(c.from,c.to,c.offset??.17,`${c.basis==='drawing'?'':'~ '}${m.toFixed(2)} m`,c.basis||'derived');}
    dimGroup.visible=state.dimensions&&state.mode!=='walk';return;
  }
  const a=data.axes;
  dimension([-.12,a.bottomY+.12],[a.rightX+.12,a.bottomY+.12],.65,`~ ${(a.rightX+.24).toFixed(2)} m overall`);
  dimension([a.rightX+.12,-.12],[a.rightX+.12,a.bottomY+.12],-1.0,`~ ${(a.bottomY+.24).toFixed(2)} m overall`);
  if(state.selected){
    const room=rooms.find(r=>r.id===state.selected),p=room.polygon;
    for(let i=0;i<p.length;i++)dimension(p[i],p[(i+1)%p.length],.16);
  }else{
    for(const room of rooms){
      if(room.id==='hall'||room.id.startsWith('balcony'))continue;
      const b=room.bounds;
      const minZ=room.id==='primary'?a.smallBottomY+.07:b.minZ;
      dimension([b.minX,minZ],[b.maxX,minZ],.17);
      dimension([b.maxX,minZ],[b.maxX,b.maxZ],.17);
    }
  }
  dimGroup.visible=state.dimensions&&state.mode!=='walk';
}

function canvasPoint(event){
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  return raycaster.ray.intersectPlane(plane,new THREE.Vector3());
}
function snapPoint(point){
  let closest=point.clone(),dist=.16;
  for(const room of rooms){for(const [x,z] of room.polygon){const d=Math.hypot(point.x-x,point.z-z);if(d<dist){dist=d;closest.set(x,.035,z);}}}
  closest.y=.04;return closest;
}
function addMeasurement(point){
  if(measurementPoints.length===2)clearMeasurement(false);
  const p=snapPoint(point);measurementPoints.push(p);
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.055,12,8),new THREE.MeshBasicMaterial({color:'#2e6c50',depthTest:false}));dot.position.copy(p);dot.renderOrder=8;measurementGroup.add(dot);
  if(measurementPoints.length===1){ui.setStatus('Select the second point. Nearby corners snap automatically.');return;}
  const [p1,p2]=measurementPoints,dist=p1.distanceTo(p2);line([p1,p2],'#2e6c50',1,measurementGroup);
  const middle=p1.clone().add(p2).multiplyScalar(.5);middle.y=.12;
  measurementLabels.push(makeLabel(`${dist.toFixed(2)} m · model`,middle.toArray(),'measurement-label'));
  ui.setStatus(`${dist.toFixed(2)} m model distance · select two new points to measure again.`);
}
function clearMeasurement(stop=true){
  measurementPoints=[];removeGroup(measurementGroup);removeLabels(measurementLabels);
  if(stop){state.measuring=false;ui.setStatus('');applySettings();}
}

function bindCanvas(){
  renderer.domElement.addEventListener('pointerdown',event=>{
    drag={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY,moved:false,id:event.pointerId};
    if(state.mode==='walk')renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if(!drag)return;
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>6)drag.moved=true;
    if(state.mode==='walk'){
      walkYaw-=(event.clientX-drag.lastX)*.005;walkPitch=THREE.MathUtils.clamp(walkPitch-(event.clientY-drag.lastY)*.004,-1.15,1.15);
      updateWalkCamera();
    }
    drag.lastX=event.clientX;drag.lastY=event.clientY;
  });
  renderer.domElement.addEventListener('pointerup',event=>{
    const clicked=drag&&!drag.moved;drag=null;if(!clicked||state.mode==='walk')return;
    const point=canvasPoint(event);if(!point)return;
    if(state.measuring){if(pointInPolygon(point.x,point.z,architecture.outline))addMeasurement(point);return;}
    const room=rooms.find(r=>pointInPolygon(point.x,point.z,r.polygon));if(room)selectRoom(room.id);
  });
  renderer.domElement.addEventListener('pointercancel',()=>{drag=null;});
  addEventListener('keydown',event=>{
    if(event.target.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;
    if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){downKeys.add(event.key);if(state.mode==='walk')event.preventDefault();}
    if(event.key==='Escape'&&state.measuring)clearMeasurement();
  });
  addEventListener('keyup',event=>downKeys.delete(event.key));addEventListener('blur',()=>downKeys.clear());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)downKeys.clear();});
}

function teleportToRoom(id){
  const a=data.axes;
  const spots={living:[3.25,1.62,4.5,-1.1],kitchen:[3.9,1.62,1.9,.05],primary:[3.8,1.62,a.smallBottomY+.62,-2.4],bedroom:[4.05,1.62,a.livingY+.66,-2.1],hall:[2.87,1.62,a.livingY+.8,.1],bathroom:[1.0,1.62,2.0,.1],'balcony-kitchen':[(a.balX+a.rail1X)/2,1.62,2.12,Math.PI],'balcony-bedroom':[(a.balX+a.rail2X)/2,1.62,a.smallBottomY-.45,0]};
  const designedViews={living:[3.05,5.65,-1.07],primary:[7.2,9.63,2.15],bedroom:[4.1,7.1,-2.25]};
  const anchor=designedViews[id]||data.rooms[id]?.walkAnchor;
  const [x,y,z,yaw]=anchor?[anchor[0],1.62,anchor[1],anchor[2]??0]:(spots[id]||spots.living);
  perspective.position.set(x,Math.min(y,state.height-.3),z);walkYaw=yaw;walkPitch=-.13;updateWalkCamera();
}
function updateWalkCamera(){
  perspective.rotation.order='YXZ';perspective.rotation.set(walkPitch,walkYaw,0);
}
function moveWalk(forward,right,dt){
  const speed=2.0*dt,dx=(-Math.sin(walkYaw)*forward+Math.cos(walkYaw)*right)*speed,dz=(-Math.cos(walkYaw)*forward-Math.sin(walkYaw)*right)*speed;
  const p=perspective.position;
  if(!architecture.blocked(p.x+dx,p.z))p.x+=dx;
  if(!architecture.blocked(p.x,p.z+dz))p.z+=dz;
}
function createWalkPad(){
  const pad=document.createElement('div');pad.id='walk-pad';pad.className='walk-pad';pad.setAttribute('aria-label','Walk controls');
  const actions=[['ArrowUp','Move forward','↑'],['ArrowLeft','Step left','←'],['ArrowDown','Move backward','↓'],['ArrowRight','Step right','→']];
  for(const [key,label,txt] of actions){const b=document.createElement('button');b.textContent=txt;b.setAttribute('aria-label',label);b.dataset.walk=key;
    b.addEventListener('pointerdown',e=>{e.preventDefault();downKeys.add(key);b.setPointerCapture(e.pointerId);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>downKeys.delete(key));pad.append(b);}
  document.querySelector('.stage').append(pad);
}

function showExportDialog(url,size){
  let dialog=$('export-dialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='export-dialog';dialog.className='export-dialog';
    dialog.innerHTML='<div class="dialog-heading"><div><p class="eyebrow">TAKE YOUR HOME WITH YOU</p><h2>Your 3D model is ready.</h2></div><button class="icon-button" aria-label="Close export">×</button></div><div class="export-body"><p>Full-height walls, detailed furniture and embedded materials. One unit equals one metre.</p><p id="export-file-size"></p><a id="download-glb" class="primary-button" download="VV8-home-area-calibrated.glb">Download 3D model (.glb)</a><small>Room outlines follow the dimensioned drawing. The user-specified ceiling, derived recesses and conflicting dimension chains are documented in Dimensions & source.</small></div>';
    document.body.append(dialog);dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  }
  const link=$('download-glb');if(link.href.startsWith('blob:'))URL.revokeObjectURL(link.href);
  link.href=url;link.download='VV8-home-area-calibrated.glb';
  $('export-file-size').textContent=`GLB · ${(size/1048576).toFixed(1)} MB · ${state.height.toFixed(2)} m ceiling · 8 room outlines`;
  dialog.showModal();
}
async function exportModel(){
  ui.toast('Preparing your complete model in metres…');
  const exportButton=document.querySelector('[data-action="export"]');exportButton.disabled=true;
  try{
    if(Math.abs(state.height-3)<.0001){
      showExportDialog('./assets/VV8-home-area-calibrated.glb',11304372);
      return;
    }
    const full={...state,walls:'full',furniture:true,mode:'dollhouse'};architecture.update(full);furnishings.visible=true;
    architecture.doorArcs.visible=false;model.updateMatrixWorld(true);
    const exported=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true,maxTextureSize:1024});
    const blob=new Blob([exported],{type:'model/gltf-binary'}),url=URL.createObjectURL(blob);
    showExportDialog(url,blob.size);
  }catch(error){console.error(error);ui.toast('The export could not finish. Please try again.');}
  finally{applySettings();exportButton.disabled=false;}
}
function handleAction({action,value}){
  if(!architecture)return;
  switch(action){
    case 'mode':setMode(value);break;
    case 'room':selectRoom(value);break;
    case 'toggle':state[value]=!state[value];applySettings();break;
    case 'walls':state.walls=value;applySettings();break;
    case 'height':state.height=value;applySettings();break;
    case 'lighting':state.lighting=value;applySettings();break;
    case 'reset':state.selected=null;ui.setSelectedRoom(null);setBudgetRoom(null);removeGroup(selectionGroup);for(const l of labels)l.el.classList.remove('selected');rebuildDimensions();clearMeasurement();setMode('dollhouse');break;
    case 'zoom':
      if(state.mode==='walk')moveWalk(value,0,.35);
      else{ortho.zoom=THREE.MathUtils.clamp(ortho.zoom*(value>0?1.22:1/1.22),.65,4.6);ortho.updateProjectionMatrix();}
      break;
    case 'rotate':
      if(state.mode==='walk'){walkYaw-=Math.PI/4;updateWalkCamera();}
      else if(state.mode==='plan'){setMode('dollhouse');}
      else{const offset=ortho.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4);targetCamera(controls.target.clone().add(offset),controls.target,ortho.zoom);}
      break;
    case 'measure':
      state.measuring=!state.measuring;
      if(state.measuring){if(state.mode!=='plan')setMode('plan');state.measuring=true;ui.setStatus('Select two floor points. Nearby corners snap automatically.');}
      else ui.setStatus('');
      applySettings();break;
    case 'clear-measure':clearMeasurement();break;
    case 'export':exportModel();break;
  }
}

function animate(now){
  frameHandle=requestAnimationFrame(animate);const dt=Math.min((now-previousTime)/1000,.05);previousTime=now;
  if(document.hidden)return;
  if(transition){
    let t=Math.min(1,(now-transition.start)/transition.duration);t=1-Math.pow(1-t,3);
    ortho.position.lerpVectors(transition.from,transition.to,t);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,t);
    ortho.zoom=THREE.MathUtils.lerp(transition.zoomFrom,transition.zoomTo,t);ortho.updateProjectionMatrix();
    if(t>=1)transition=null;
  }
  if(state.mode==='walk'){
    const forward=Number(downKeys.has('w')||downKeys.has('ArrowUp'))-Number(downKeys.has('s')||downKeys.has('ArrowDown'));
    const right=Number(downKeys.has('d')||downKeys.has('ArrowRight'))-Number(downKeys.has('a')||downKeys.has('ArrowLeft'));
    if(forward||right)moveWalk(forward,right,dt/Math.max(1,Math.hypot(forward,right)));
  }else controls.update();
  renderer.render(scene,camera);projectLabels();
}

start().catch(error=>{
  console.error('Home model initialization failed:',error);
  $('loader').innerHTML=`<div class="load-error"><strong>The 3D view could not open.</strong><p>${error.message?.includes('WebGL')?'This browser could not create a WebGL view. Try opening the link in Safari or Chrome.':'Please reload the page to load the home model.'}</p><button onclick="location.reload()">Try again</button><button onclick="document.getElementById('reference-dialog').showModal()">See original plan</button></div>`;
});
