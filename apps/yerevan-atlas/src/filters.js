import {rateAMD, targetEnd, hasCoordinates, validDate, normalizePreferences} from './model.js';
import {EARTH_RADIUS} from './geo.js';

export const FILTER_DEFAULTS = Object.freeze({mode:'projects',districts:[],statuses:[],developers:[],rooms:[],finishes:[],hasBalcony:false,useBudget:false,useArea:false,floorMin:null,floorMax:null,excludeGround:false,excludeTop:false,rateMax:null,completionBefore:'',availability:'unbooked',freshnessDays:null,location:'all',radiusKm:null,hideConflicts:false,budgetBasis:'purchase',bounds:null});
const positive = n => typeof n==='number' && Number.isFinite(n) && n>0;
const optional = (n,min,max) => n==null||n===''?null:Number.isFinite(Number(n))&&Number(n)>=min&&Number(n)<=max?Number(n):null;
export function normalizeFilters(raw={}) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
 const f={...FILTER_DEFAULTS};
 for(const k of ['districts','statuses','developers','rooms','finishes'])f[k]=Array.isArray(raw[k])?[...new Set(raw[k].filter(v=>typeof v==='string').map(v=>v.slice(0,160)))].slice(0,160):[];
 f.statuses=f.statuses.filter(x=>['completed','under_construction','unknown'].includes(x));f.rooms=f.rooms.filter(x=>['1','2','3','4+'].includes(x));
 for(const k of ['useBudget','useArea','excludeGround','excludeTop','hideConflicts','hasBalcony'])f[k]=raw[k]===true;
 f.finishes=f.finishes.filter(x=>['5','6','7'].includes(x));
 for(const [k,min,max]of [['floorMin',0,150],['floorMax',0,150],['rateMax',1,100000000],['radiusKm',.1,100],['freshnessDays',1,365]])f[k]=optional(raw[k],min,max);
 f.mode=raw.mode==='units'?'units':'projects';f.availability=raw.availability==='all'?'all':'unbooked';f.location=['mapped','footprint'].includes(raw.location)?raw.location:'all';f.budgetBasis=raw.budgetBasis==='total'?'total':'purchase';
 f.bounds=validBounds(raw.bounds)?[...raw.bounds]:null;
 f.completionBefore=validDate(raw.completionBefore)?raw.completionBefore:'';return f;
}
export function validBounds(b){return Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]>=-180&&b[2]<=180&&b[1]>=-90&&b[3]<=90&&b[0]<b[2]&&b[1]<b[3];}
export function normalizeSearch(value){return String(value||'').normalize('NFKC').toLocaleLowerCase().replaceAll('ё','е').replaceAll('և','եւ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function searchMatches(p,query){const hay=normalizeSearch([p.name,p.nameHy,p.nameRu,p.address,p.addressHy,p.addressRu,p.developer,p.developerHy,p.developerRu,p.district,p.districtHy,p._searchText].join(' '));return normalizeSearch(query).split(' ').filter(Boolean).every(word=>hay.includes(word));}
export function ageDays(value,now=Date.now()){const stamp=Date.parse(value);if(!Number.isFinite(stamp)||stamp>now+300000)return null;return Math.max(0,(now-stamp)/86400000);}
export function checkedRecently(value,days,now=Date.now()){const age=ageDays(value,now);return age!==null&&age<=days;}
export function hasSourceConflict(p){return !!p.soldOut&&(p.offers||[]).some(o=>!o.isBooked)||!!p.dataQuality?.conflicts?.length||!!p.sourceComparisons?.some(s=>(s.status&&s.status!==p.status)||(s.completion&&p.completion&&s.completion!==p.completion)||(s.price?.min&&p.price?.min&&s.price.currency===p.price.currency&&s.price.min!==p.price.min))||!!p.spatial?.issues?.some(x=>/conflict|mismatch|other_structure/.test(x));}
export function unavailable(o){return o.isBooked===true||o.availabilityStatus==='sold'||o.sourceIsActive===false||['booked','sold','reserved','unavailable'].includes(String(o.availability||'').toLowerCase());}
export function distanceFrom(a,b){if(!a||!b)return null;const r=Math.PI/180,dy=(b[1]-a[1])*r,dx=(b[0]-a[0])*r,h=Math.sin(dy/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dx/2)**2;return EARTH_RADIUS/1000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function needsUnit(f){return f.mode==='units'||f.rooms.length>0||f.finishes.length>0||f.hasBalcony||f.floorMin!=null||f.floorMax!=null||f.excludeGround||f.excludeTop;}
export function plannedTotal(price,area,prefs){return price*(1+Math.max(0,Number(prefs.feePercent)||0)/100)+area*Math.max(0,Number(prefs.renovation)||0)+Math.max(0,Number(prefs.parking)||0)*1e6;}
export function matchingOfferEntries(p,prefs,raw={},now=Date.now()) {
 const f=normalizeFilters(raw);
 if(p.soldOut&&f.availability!=='all')return [];
 return (p.offers||[]).flatMap(o=>{
  if(f.availability!=='all'&&unavailable(o))return [];
  if(o.priceQuality?.status==='review_required')return [];
  if(f.hasBalcony&&!(o.balconies>0||o.balconyAreaM2>0))return [];
  if(!positive(o.area))return [];
  if(f.useArea&&(o.area<prefs.areaMin||o.area>prefs.areaMax))return [];
  if(f.rooms.length&&!f.rooms.some(r=>r==='4+'?o.rooms>=4:o.rooms===Number(r)))return [];
  if((f.floorMin!=null||f.floorMax!=null||f.excludeGround||f.excludeTop)&&!Number.isFinite(o.floor))return [];
  if(f.floorMin!=null&&o.floor<f.floorMin||f.floorMax!=null&&o.floor>f.floorMax)return [];
  if(f.excludeGround&&o.floor<=1)return [];
  // A complex's maximum floor count cannot establish this apartment's top floor.
  if(f.excludeTop&&(!positive(o.buildingFloors)||o.floor>=o.buildingFloors))return [];
  if(f.freshnessDays!=null&&(!checkedRecently(o.checkedAt,f.freshnessDays,now)||p.inventoryRefresh?.status==='failed'))return [];
  const variants=(o.priceVariants?.length?o.priceVariants:[{totalAMD:o.totalAMD,basis:o.priceBasis||'',conditionId:o.pricingConditionId}]).filter(v=>positive(v.totalAMD)&&v.priceQuality?.status!=='review_required'&&(!f.finishes.length||f.finishes.includes(String(v.conditionId))));
  const prices=variants.map(v=>({...v,budgetPrice:f.budgetBasis==='total'?plannedTotal(v.totalAMD,o.area,prefs):v.totalAMD})).filter(v=>(!f.useBudget||v.budgetPrice>=prefs.budgetMin*1e6&&v.budgetPrice<=prefs.budgetMax*1e6)&&(f.rateMax==null||v.totalAMD/o.area<=f.rateMax)).sort((a,b)=>a.budgetPrice-b.budgetPrice);
  if(!prices.length)return [];return [{offer:o,price:prices[0].totalAMD,budgetPrice:prices[0].budgetPrice,priceBasis:prices[0].basis||o.priceBasis||'',rate:prices[0].totalAMD/o.area,conditionId:prices[0].conditionId,variants:prices}];
 });
}
export function projectScenarioMatches(p,prefs,f){
 if(f.availability!=='all'&&p.soldOut)return false;
 const areaMin=f.useArea?Math.max(prefs.areaMin,p.area?.min||0):p.area?.min,areaMax=f.useArea?Math.min(prefs.areaMax,p.area?.max||Infinity):p.area?.max;
 if(f.useArea&&(!positive(p.area?.min)||!positive(p.area?.max)||areaMin>areaMax))return false;
 const rate=rateAMD(p,prefs),maxRate=p.price?.max?rate*p.price.max/p.price.min:rate;
 if(f.rateMax!=null&&(!rate||rate>f.rateMax))return false;
 if(!f.useBudget)return true;
 if(!rate||!positive(areaMin)||!positive(areaMax))return prefs.includeUnknown===true;
 let min=rate*areaMin,max=maxRate*areaMax;if(f.budgetBasis==='total'){min=plannedTotal(min,areaMin,prefs);max=plannedTotal(max,areaMax,prefs);}
 return min<=prefs.budgetMax*1e6&&max>=prefs.budgetMin*1e6;
}
export function projectPasses(p,state,prefs,raw={},now=Date.now(),entryCache=null){
 const f=normalizeFilters(raw);
 if(!prefs.nearby&&!p.inYerevan||state.view==='saved'&&!state.saved?.has(p.id))return false;
 if(!searchMatches(p,state.query))return false;
 if(f.districts.length&&!f.districts.includes(p.district)||f.statuses.length&&!f.statuses.includes(p.status)||f.developers.length&&!f.developers.includes(p.developer||''))return false;
 if(f.availability!=='all'&&p.soldOut)return false;
 if(f.completionBefore){const deadline=Date.parse(f.completionBefore+'T23:59:59Z'),end=targetEnd(p.completion);if(p.status!=='completed'&&(!Number.isFinite(end)||end>deadline))return false;}
 if(f.location==='mapped'&&!hasCoordinates(p)||f.location==='footprint'&&!p.spatial?.footprints?.length)return false;
 if(f.bounds&&(!hasCoordinates(p)||p.coordinates[0]<f.bounds[0]||p.coordinates[0]>f.bounds[2]||p.coordinates[1]<f.bounds[1]||p.coordinates[1]>f.bounds[3]))return false;
 if(f.hideConflicts&&hasSourceConflict(p))return false;
 if(f.radiusKm!=null){const d=hasCoordinates(p)?distanceFrom(state.reference,p.coordinates):null;if(d==null||d>f.radiusKm)return false;}
 if(f.freshnessDays!=null&&(!checkedRecently(p.catalogueCheckedAt||p.checkedAt,f.freshnessDays,now)||p.catalogueRefresh?.status==='failed'))return false;
 if(entryCache&&!entryCache.has(p.id))entryCache.set(p.id,matchingOfferEntries(p,prefs,f,now));
 const units=entryCache?entryCache.get(p.id):matchingOfferEntries(p,prefs,f,now);
 return needsUnit(f)?units.length>0:units.length>0||projectScenarioMatches(p,prefs,f);
}
export function searchProjects(projects,state,prefs,raw={},now=Date.now(),cache=new Map()){
 const f=normalizeFilters(raw),out=projects.filter(p=>projectPasses(p,state,prefs,f,now,cache));
 const entries=p=>{if(!cache.has(p.id))cache.set(p.id,matchingOfferEntries(p,prefs,f,now));return cache.get(p.id);};
 const price=p=>{const u=entries(p);return u.length?Math.min(...u.map(x=>x.budgetPrice)):Infinity;};
 out.sort((a,b)=>{
  let delta=0;
  if(state.sort==='unitPrice')delta=price(a)-price(b);
  else if(state.sort==='price')delta=(rateAMD(a,prefs)??Infinity)-(rateAMD(b,prefs)??Infinity);
  else if(state.sort==='date')delta=(a.status==='completed'?0:targetEnd(a.completion)||Infinity)-(b.status==='completed'?0:targetEnd(b.completion)||Infinity);
  else if(state.sort==='distance')delta=(distanceFrom(state.reference,a.coordinates)??Infinity)-(distanceFrom(state.reference,b.coordinates)??Infinity);
  else if(state.sort==='freshness')delta=(Date.parse(b.catalogueCheckedAt||b.checkedAt)||0)-(Date.parse(a.catalogueCheckedAt||a.checkedAt)||0);
  else if(state.sort!=='name')delta=Number(entries(b).length>0)-Number(entries(a).length>0)||price(a)-price(b);
  return (Number.isFinite(delta)?delta:delta===-Infinity?-1:delta===Infinity?1:0)||a.name.localeCompare(b.name);
 });return out;
}
export function facetCounts(projects,state,prefs,raw,key,now=Date.now()){
 const f=normalizeFilters(raw);f[key]=[];const result={};
 for(const p of projects.filter(p=>projectPasses(p,state,prefs,f,now))){
  const entries=matchingOfferEntries(p,prefs,f,now);
  const values=key==='finishes'?[...new Set(entries.flatMap(x=>x.variants.map(v=>String(v.conditionId))).filter(x=>['5','6','7'].includes(x)))]:key==='rooms'?[...new Set(entries.map(x=>x.offer.rooms>=4?'4+':String(x.offer.rooms)).filter(x=>['1','2','3','4+'].includes(x)))]:[p[{districts:'district',statuses:'status',developers:'developer'}[key]]];
  for(const value of values)if(value)result[value]=(result[value]||0)+1;
 }return result;
}
export function searchPayload(state,prefs,filters){return {v:1,query:String(state.query||'').slice(0,200),sort:state.sort,reference:state.reference,filters:normalizeFilters(filters),prefs:Object.fromEntries(['budgetMin','budgetMax','areaMin','areaMax','fx','nearby','includeUnknown','renovation','parking','feePercent'].map(k=>[k,prefs[k]]))};}
export function validFilterInput(raw={}) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
 const f=normalizeFilters(raw);
 if(raw.bounds!=null&&!validBounds(raw.bounds))return false;
 for(const key of ['floorMin','floorMax','rateMax','radiusKm','freshnessDays'])if(raw[key]!=null&&raw[key]!==''&&(typeof raw[key]!=='number'||f[key]!==raw[key]))return false;
 for(const key of ['floorMin','floorMax','freshnessDays'])if(f[key]!=null&&!Number.isInteger(f[key]))return false;
 if(f.floorMin!=null&&f.floorMax!=null&&f.floorMin>f.floorMax)return false;
 if(raw.completionBefore&&!validDate(raw.completionBefore))return false;
 for(const key of ['districts','statuses','developers','rooms','finishes'])if(raw[key]!==undefined&&(!Array.isArray(raw[key])||raw[key].some(v=>typeof v!=='string'||!f[key].includes(v))))return false;
 for(const key of ['useBudget','useArea','excludeGround','excludeTop','hideConflicts','hasBalcony'])if(raw[key]!==undefined&&typeof raw[key]!=='boolean')return false;
 for(const key of ['mode','availability','location','budgetBasis'])if(raw[key]!==undefined&&raw[key]!==f[key])return false;
 return true;
}
export function parseSearch(value){
 try {
  if(typeof value==='string'&&value.length>32000)return null;
  const raw=typeof value==='string'?JSON.parse(value):value;
  if(!raw||raw.v!==1||!raw.prefs||!validFilterInput(raw.filters))return null;
  const prefs=normalizePreferences(raw.prefs);if(!prefs)return null;
  if(raw.reference!=null&&!hasCoordinates({coordinates:raw.reference}))return null;
  const filters=normalizeFilters(raw.filters),reference=raw.reference||null;
  if(filters.radiusKm!=null&&!reference)return null;
  return {v:1,query:String(raw.query||'').slice(0,200),sort:['match','price','unitPrice','date','distance','freshness','name'].includes(raw.sort)?raw.sort:'match',prefs,filters,reference};
 }catch{return null;}
}

export function searchMatchInfo(p,prefs,raw={},entries=null){
 const f=normalizeFilters(raw),units=entries||matchingOfferEntries(p,prefs,f);
 if(p.soldOut)return {level:'unavailable',label:'Source marks sold out'};
 if(units.length)return {level:'offer',label:f.useBudget?'Published apartments match':'Published apartments · budget not filtered'};
 if(needsUnit(f))return {level:'outside',label:'Does not match current apartment filters'};
 if(!rateAMD(p,prefs))return {level:'unknown',label:'Price to confirm'};
 return projectScenarioMatches(p,prefs,f)?{level:'potential',label:'Project price scenario only'}:{level:'outside',label:'Does not match current apartment filters'};
}

export function offerEvidenceGaps(offers){
 const gaps={rooms:0,floor:0,buildingFloors:0,finish:0,balcony:0,checkedAt:0};
 for(const o of offers){
  if(!positive(o.rooms))gaps.rooms++;
  if(!Number.isFinite(o.floor))gaps.floor++;
  if(!positive(o.buildingFloors))gaps.buildingFloors++;
  if(!(o.priceVariants?.length?o.priceVariants:[{conditionId:o.pricingConditionId}]).some(v=>['5','6','7'].includes(String(v.conditionId))))gaps.finish++;
  if(o.balconies==null&&o.balconyAreaM2==null)gaps.balcony++;
  if(ageDays(o.checkedAt)==null)gaps.checkedAt++;
 }return gaps;
}
