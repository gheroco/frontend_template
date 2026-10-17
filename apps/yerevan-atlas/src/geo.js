// Spherical Web Mercator uses MapLibre's mean Earth radius. Every model,
// hit volume and offset shares these conversions, preventing scale drift.
export const EARTH_RADIUS=6371008.8;
export const EARTH_CIRCUMFERENCE=2*Math.PI*EARTH_RADIUS;
const RAD=Math.PI/180;
export function mercatorPoint([lng,lat]){return [(lng+180)/360,(1-Math.log(Math.tan(Math.PI/4+lat*RAD/2))/Math.PI)/2];}
export function fromMercator([x,y]){return [x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))/RAD];}
export function meterScale(lat){return 1/(EARTH_CIRCUMFERENCE*Math.cos(lat*RAD));}
export function offsetCoordinate(center,east=0,north=0){const [x,y]=mercatorPoint(center),s=meterScale(center[1]);return fromMercator([x+east*s,y-north*s]);}
export function localMeters(point,center){const [x,y]=mercatorPoint(point),[cx,cy]=mercatorPoint(center),s=meterScale(center[1]);return [(x-cx)/s,(cy-y)/s];}
export function rotateGround(east,north,heading=0){const a=heading*RAD;return [east*Math.cos(a)+north*Math.sin(a),-east*Math.sin(a)+north*Math.cos(a)];}
// Three.js +Z is the front; north-facing heading needs a half-turn in
// the right-handed east/up/south model frame used by MapLibre.
export function headingRotation(heading=0){return Math.PI-heading*RAD;}
export function modelAnchor(record,coordinates){return offsetCoordinate(record.anchor||coordinates,record.offsetEast||0,record.offsetNorth||0);}
export function rectangleRing(center,width,depth,heading=0){return [[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2],[-width/2,-depth/2]].map(([e,n])=>offsetCoordinate(center,...rotateGround(e,n,heading)));}
export function pointInRing([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function pointInPolygon(point,rings){return pointInRing(point,rings[0])&&!rings.slice(1).some(r=>pointInRing(point,r));}
export function geometryBounds(geometry){const rings=geometry.type==='MultiPolygon'?geometry.coordinates.flat():geometry.coordinates;const vertices=rings.flat();return vertices.reduce((b,p)=>[[Math.min(b[0][0],p[0]),Math.min(b[0][1],p[1])],[Math.max(b[1][0],p[0]),Math.max(b[1][1],p[1])]],[[180,90],[-180,-90]]);}
export function footprintMetrics(geometry){const bounds=geometryBounds(geometry),center=[(bounds[0][0]+bounds[1][0])/2,(bounds[0][1]+bounds[1][1])/2],polys=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];let area=0;const points=[];for(const rings of polys){rings.forEach((ring,j)=>{const local=ring.map(p=>localMeters(p,center));let signed=0;for(let i=0;i<local.length-1;i++)signed+=local[i][0]*local[i+1][1]-local[i+1][0]*local[i][1];area+=(j===0?1:-1)*Math.abs(signed)/2;if(j===0)points.push(...local);});}
 // Smallest oriented bounding rectangle: dimensions describe footprint extents,
 // not usable apartment/floor area. Rotation has a 180-degree ambiguity.
 let box={area:Infinity};for(let i=0;i<points.length-1;i++){const dx=points[i+1][0]-points[i][0],dy=points[i+1][1]-points[i][1];if(Math.hypot(dx,dy)<.01)continue;const a=Math.atan2(dy,dx),c=Math.cos(a),s=Math.sin(a);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const [x,y]of points){const rx=x*c+y*s,ry=-x*s+y*c;minX=Math.min(minX,rx);maxX=Math.max(maxX,rx);minY=Math.min(minY,ry);maxY=Math.max(maxY,ry);}const w=maxX-minX,d=maxY-minY;if(w*d<box.area)box={area:w*d,width:w,depth:d,heading:((-a/RAD)%180+180)%180,center:[((minX+maxX)/2)*c-((minY+maxY)/2)*s,((minX+maxX)/2)*s+((minY+maxY)/2)*c]};}
 return {center,boxCenter:box.center?offsetCoordinate(center,...box.center):center,bounds,area:Math.max(0,area),width:box.width||0,depth:box.depth||0,heading:box.heading||0};}
export function footprintHeight(f){if(Number.isFinite(f.heightMeters)&&f.heightMeters>0&&f.heightMeters<=400)return {height:f.heightMeters,basis:'source_height'};if(Number.isFinite(f.levels)&&f.levels>0&&f.levels<=100)return {height:f.levels*3.2,basis:'floor_estimate'};return {height:0,basis:'unknown'};}
export function spatialStats(projects){return {records:projects.filter(p=>p.spatial?.footprints?.length).length,buildings:new Set(projects.flatMap(p=>(p.spatial?.footprints||[]).map(f=>f.id))).size,conflicts:projects.filter(p=>p.spatial?.issues?.length).length};}
export function applySpatialData(projects,data){return projects.map(p=>{const record=data.records?.[p.id];return {...p,sourceCoordinates:p.coordinates,spatial:record||{footprints:[],issues:[]},coordinates:record?.location?.coordinates||p.coordinates};});}
export function migrateModel(record,project){if(record.placementVersion>=2)return record;return {...record,anchor:record.anchor||project.sourceCoordinates||project.coordinates,placementVersion:2};}

export function destinationCoordinate([lng,lat],meters,bearing){const d=meters/EARTH_RADIUS,b=bearing*RAD,p=lat*RAD,l=lng*RAD,p2=Math.asin(Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(b)),l2=l+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(p2));return [l2/RAD,p2/RAD];}

export function projectBounds(projects){
 const points=[];
 for(const p of projects){if(p.coordinates?.length===2&&p.coordinates.every(Number.isFinite))points.push(p.coordinates);for(const f of p.spatial?.footprints||[])points.push(...geometryBounds(f.geometry));}
 return points.length?points.reduce((b,p)=>[[Math.min(b[0][0],p[0]),Math.min(b[0][1],p[1])],[Math.max(b[1][0],p[0]),Math.max(b[1][1],p[1])]],[[180,90],[-180,-90]]):null;
}
export function boundsGeoJSON(bounds){
 return {type:'FeatureCollection',features:bounds?[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]],[bounds[0],bounds[1]]]]}}]:[]};
}
