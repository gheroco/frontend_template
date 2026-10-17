import {footprintHeight} from './geo.js';
export const DEFAULT_PREFS = Object.freeze({budgetMin:50,budgetMax:75,areaMin:80,areaMax:100,fx:361.73,nearby:false,includeUnknown:false});
export function validPreferences(p){return !!p&&[p.budgetMin,p.budgetMax,p.areaMin,p.areaMax,p.fx].every(Number.isFinite)&&p.budgetMin>=0&&p.budgetMax>0&&p.budgetMax<=100000&&p.budgetMin<=p.budgetMax&&p.areaMin>=15&&p.areaMax>=p.areaMin&&p.areaMax<=1500&&p.fx>0&&p.fx<=100000&&[['renovation',5000000],['parking',500],['feePercent',100]].every(([k,max])=>p[k]===undefined||Number.isFinite(p[k])&&p[k]>=0&&p[k]<=max)&&['nearby','includeUnknown'].every(k=>p[k]===undefined||typeof p[k]==='boolean');}
export function normalizePreferences(raw={}) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const defaults={...DEFAULT_PREFS,renovation:0,parking:0,feePercent:0};
 const p=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,Object.hasOwn(raw,k)?raw[k]:v]));
 return validPreferences(p)?p:null;
}
export function rateAMD(p,prefs){if(p.priceQuality?.status==='review_required'||!p.price||!Number.isFinite(p.price.min)||p.price.min<=0||p.price.basis==='total')return null;return p.price.min*(p.price.currency==='AMD'?1:p.price.currency==='USD'?prefs.fx:NaN)||null;}
export function estimate(p,prefs){const rate=rateAMD(p,prefs);if(!rate)return null;const upper=(p.price.max||p.price.min)*(p.price.currency==='USD'?prefs.fx:1);return {min:rate*prefs.areaMin,max:upper*prefs.areaMax,target:rate*(prefs.areaMin+prefs.areaMax)/2,rate};}
export function offerMatches(o,prefs){return o.priceQuality?.status!=='review_required'&&!o.isBooked&&o.sourceIsActive!==false&&!['booked','sold','reserved','unavailable'].includes(o.availability)&&o.availabilityStatus!=='sold'&&o.area>=prefs.areaMin&&o.area<=prefs.areaMax&&(o.priceVariants?.length?o.priceVariants:[{totalAMD:o.totalAMD}]).filter(v=>v.priceQuality?.status!=='review_required').map(v=>v.totalAMD).some(n=>Number.isFinite(n)&&n>0&&n>=prefs.budgetMin*1e6&&n<=prefs.budgetMax*1e6);}
export function matchInfo(p,prefs){
 if(p.soldOut)return {level:'unavailable',label:'Source marks sold out',score:5,reason:'A source marks this project sold out. Published prices do not establish current availability.'};
 const offers=(p.offers||[]).filter(o=>offerMatches(o,prefs));
 if(offers.length)return {level:'offer',label:'Published offer fits',score:100,reason:`${offers.length} advertised apartment${offers.length>1?'s':''} within your size and budget. Seller confirmation needed.`};
 if(p.soldOut)return {level:'unavailable',label:'Source marks sold out',score:5,reason:'A source marks this project sold out. Published prices do not establish current availability.'};
 const rate=rateAMD(p,prefs), minArea=Math.max(prefs.areaMin,p.area?.min||0),maxArea=Math.min(prefs.areaMax,p.area?.max||Infinity);
 if(maxArea<minArea)return {level:'outside',label:'Size outside range',score:0,reason:'The published area range does not overlap your preference.'};
 if(!rate)return {level:'unknown',label:'Price to confirm',score:15,reason:'No usable published rate. Budget fit is unknown.'};
 const rateMax=(p.price.max||p.price.min)*(p.price.currency==='USD'?prefs.fx:1);
 const min=rate*minArea,max=rateMax*maxArea;
 if(min>prefs.budgetMax*1e6)return {level:'outside',label:'Above budget',score:Math.max(0,10-(min/prefs.budgetMax/1e6-1)*10),reason:'Even the starting rate at your smallest size exceeds the maximum budget.'};
 if(max<prefs.budgetMin*1e6)return {level:'below',label:'Below budget range',score:35,reason:'The advertised rates suggest a lower purchase cost than your range. Exact apartments may differ.'};
 return {level:'potential',label:'Potential budget fit',score:70+(p.official?5:0),reason:'Advertised rates overlap your size and budget. This is a price scenario, not confirmed stock.'};
}
export function filterProjects(projects,state,prefs){
 const q=(state.query||'').toLocaleLowerCase();
 return projects.filter(p=>{
  if(!prefs.nearby&&!p.inYerevan)return false;
  if(state.view==='saved'&&!state.saved.has(p.id))return false;
  if(state.district&&p.district!==state.district)return false;
  if(state.status&&p.status!==state.status)return false;
  if(state.preferred&&!['Ajapnyak','Arabkir'].includes(p.district))return false;
  if(state.offers&&!(p.offers||[]).some(o=>offerMatches(o,prefs)))return false;
  if(q&&!`${p.name} ${p.nameHy} ${p.nameRu} ${p.address} ${p.addressHy} ${p.developer}`.toLocaleLowerCase().includes(q))return false;
  if(state.match){const m=matchInfo(p,prefs);if(!['offer','potential','below'].includes(m.level)&&!(prefs.includeUnknown&&m.level==='unknown'))return false;}
  return true;
 }).sort((a,b)=>{
  if(state.sort==='price')return (rateAMD(a,prefs)??Infinity)-(rateAMD(b,prefs)??Infinity);
  if(state.sort==='date')return (Date.parse(a.completion)||Infinity)-(Date.parse(b.completion)||Infinity);
  if(state.sort==='name')return a.name.localeCompare(b.name);
  return matchInfo(b,prefs).score-matchInfo(a,prefs).score || Number(b.official)-Number(a.official)||a.name.localeCompare(b.name);
 });
}
export function hasCoordinates(p){return Array.isArray(p.coordinates)&&p.coordinates.length===2&&p.coordinates.every(Number.isFinite)&&p.coordinates[0]>=43&&p.coordinates[0]<=47&&p.coordinates[1]>=38&&p.coordinates[1]<=42;}
export function features(projects,prefs,selectedId,matchResolver=null){
 const points=[],buildings=[];
 for(const p of projects){if(!hasCoordinates(p))continue;const fit=matchResolver?matchResolver(p):matchInfo(p,prefs);const selected=p.id===selectedId;const props={id:p.id,name:p.name,fit:fit.level,color:selected?'#dc8b55':['potential','offer','below'].includes(fit.level)?'#326351':'#7c8e98',selected:selected?1:0};
  points.push({type:'Feature',id:p.id,properties:props,geometry:{type:'Point',coordinates:p.coordinates}});
  // A source pin is a point, never an invented building footprint.
  for(const footprint of p.spatial?.footprints||[]){const height=footprintHeight(footprint);buildings.push({type:'Feature',id:p.id+':'+footprint.id,properties:{...props,buildingId:footprint.id,buildingLabel:footprint.label||'',height:height.height,heightBasis:height.basis,geometryKind:'mapped_footprint'},geometry:footprint.geometry});}

 }
 return {points:{type:'FeatureCollection',features:points},buildings:{type:'FeatureCollection',features:buildings}};
}
export function csvCell(v){let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function toCSV(projects,prefs){const keys=['Project','District','Address','Published min rate','Published max rate','Currency','Target completion','Status','Budget fit','Sources'];return '\uFEFF'+[keys,...projects.map(p=>[p.name,p.district,p.address,p.price?.min,p.price?.max,p.price?.currency,p.completion,p.status,matchInfo(p,prefs).label,(p.sources||[]).map(s=>s.url).join(' | ')])].map(r=>r.map(csvCell).join(',')).join('\r\n');}
export function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function safeURL(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const time=Date.parse(value+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;}
export function targetEnd(value){if(typeof value!=='string')return null;if(/^\d{4}$/.test(value))return validDate(value+'-12-31')?Date.parse(value+'-12-31T23:59:59Z'):null;if(/^\d{4}-\d{2}$/.test(value)){if(!validDate(value+'-01'))return null;const [y,m]=value.split('-').map(Number);return Date.UTC(y,m,1)-1;}return validDate(value)?Date.parse(value+'T23:59:59Z'):null;}
