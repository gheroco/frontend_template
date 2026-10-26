import * as THREE from 'three';
import { polygonMesh } from './architecture.js';

/** Presentation lighting and contact shadows. These do not alter the measured model. */
export function createSceneQuality({ scene, renderer, data, furnishings }) {
  const studio = new THREE.Group(); studio.name = 'Viewer light rig'; scene.add(studio);
  const hemi = new THREE.HemisphereLight('#eef5ff', '#b9a38c', .8); studio.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2d9', 3.4);
  sun.position.set(15, 13, 5.2); sun.target.position.set(3, 0, 5.4); sun.castShadow = true;
  sun.shadow.mapSize.set(viewportIsSmall() ? 2048 : 4096, viewportIsSmall() ? 2048 : 4096);
  Object.assign(sun.shadow.camera, {left:-10,right:10,top:10,bottom:-10,near:.5,far:42});
  sun.shadow.normalBias = .015; sun.shadow.bias = -.00012; sun.shadow.radius = 3;
  studio.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#dceaff', .45); fill.position.set(-6,8,10); studio.add(fill);
  const bounce = new THREE.DirectionalLight('#f0d6b7', .23); bounce.position.set(4,2,-4); studio.add(bounce);
  const practical = [];
  furnishings.updateMatrixWorld(true);
  const seen = new Set();
  furnishings.traverse(object => {
    if (!object.isGroup || !/^(Bedside lamp|Normann Copenhagen Shelter)/i.test(object.name)) return;
    const p = new THREE.Vector3(); object.getWorldPosition(p);
    const key = [p.x.toFixed(2),p.z.toFixed(2)].join(':'); if (seen.has(key)) return; seen.add(key);
    const light = new THREE.PointLight('#ffd99e', 0, 3.6, 2); light.position.copy(p).add(new THREE.Vector3(0,.22,0));
    light.castShadow = false; studio.add(light); practical.push({light,object});
  });
  const ceilings = new THREE.Group(); ceilings.name = 'Assumed ceiling surfaces'; scene.add(ceilings);
  const ceilingMat = new THREE.MeshStandardMaterial({color:'#f3efe6',roughness:.94,side:THREE.DoubleSide});
  for (const [id, room] of Object.entries(data.rooms)) {
    if (id.startsWith('balcony')) continue;
    const ceiling = polygonMesh(room.polygon, ceilingMat, data.wallHeight || 3);
    ceiling.name = id + ' ceiling · user-specified height'; ceiling.castShadow = false; ceilings.add(ceiling);
  }
  const contactData = makeContactShadows(furnishings), contacts=contactData.group; scene.add(contacts);
  function refreshLayout(){
    furnishings.updateMatrixWorld(true);
    for(const {light,object} of practical){object.getWorldPosition(light.position);light.position.y+=.22;}
    contactData.refresh();
    renderer.invalidate?.();
  }
  let currentLighting;
  function update(state) {
    ceilings.visible = state.mode === 'walk' && state.walls === 'full';
    for (const ceiling of ceilings.children) ceiling.position.y = state.height;
    contacts.visible = state.furniture && state.mode !== 'plan';
    const evening = state.lighting === 'evening';
    hemi.intensity = evening ? .24 : .8;
    sun.intensity = evening ? .25 : 3.4;
    sun.color.set(evening ? '#e6ebff' : '#fff2d9');
    fill.intensity = evening ? .16 : .45;
    bounce.intensity = evening ? .28 : .23;
    for (const {light} of practical) light.intensity = evening ? 38 : 1.2;
    scene.environmentIntensity = evening ? .35 : .62;
    renderer.toneMappingExposure = evening ? 1.05 : .96;
    if (currentLighting !== state.lighting) {
      const materials = new Set();
      furnishings.traverse(o => { if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m)); });
      for (const m of materials) {
        if (!m.emissive || !/lampshade|lamp diffuser|lamp glow/i.test(m.name)) continue;
        m.emissive.set('#f4c77a'); m.emissiveIntensity = evening ? .7 : .1;
      }
      renderer.setLighting?.(state.lighting);
      currentLighting = state.lighting;
    }
    renderer.invalidate?.();
  }
  return { update, refreshLayout, studio, ceilings, contacts };
}
function viewportIsSmall(){ return typeof window !== 'undefined' && window.innerWidth < 700; }

function makeContactShadows(root) {
  const group = new THREE.Group(); group.name = 'Soft furniture contact shadows';
  const bindings=[];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const image = ctx.createImageData(128,128);
  for (let y=0;y<128;y++) for (let x=0;x<128;x++) {
    const dx=Math.abs((x-63.5)/63.5),dy=Math.abs((y-63.5)/63.5);
    const falloff=Math.exp(-Math.pow(dx*1.28,6)-Math.pow(dy*1.28,6));
    const i=(y*128+x)*4; image.data[i]=41;image.data[i+1]=34;image.data[i+2]=25;image.data[i+3]=Math.round(falloff*46);
  }
  ctx.putImageData(image,0,0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  root.updateMatrixWorld(true);
  root.traverse(object=>{
    if (!object.userData.budgetItemId || !object.isGroup || !/(sofa|accent chair|upholstered.*bed|wardrobe|dining table|breakfast table|entry console|bedside|coffee table|end table)/i.test(object.name)) return;
    let ancestor=object.parent; while(ancestor&&ancestor!==root){if(ancestor.userData.budgetItemId===object.userData.budgetItemId)return;ancestor=ancestor.parent;}
    const b = new THREE.Box3().setFromObject(object),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.x) || size.x < .2 || b.min.y > .6) return;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
    plane.scale.set(size.x+.16,size.z+.16,1);
    plane.rotation.x=-Math.PI/2;plane.position.set(center.x,.012,center.z);
    plane.name='Contact shadow';plane.userData.kind='contact-shadow';plane.renderOrder=1;group.add(plane);bindings.push({plane,object});
  });
  function refresh(){
    root.updateMatrixWorld(true);
    for(const {plane,object} of bindings){
      const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      plane.position.set(center.x,.012,center.z);plane.scale.set(size.x+.16,size.z+.16,1);
    }
  }
  return {group,refresh};
}
