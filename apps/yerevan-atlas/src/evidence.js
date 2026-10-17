import {ageDays,hasSourceConflict,offerEvidenceGaps,unavailable} from './filters.js';
import {hasCoordinates} from './model.js';

export function evidenceSummary(projects,now=Date.now()){
 const units=projects.flatMap(p=>p.offers||[]);
 const checks=values=>values.reduce((out,value)=>{const age=ageDays(value,now);out[age==null?'unknown':age>7?'stale':'recent']++;return out;},{recent:0,stale:0,unknown:0});
 const stamps=units.map(o=>o.checkedAt).filter(v=>ageDays(v,now)!=null).sort((a,b)=>Date.parse(a)-Date.parse(b));
 return {
  projects:projects.length,units:units.length,
  projectChecks:checks(projects.map(p=>p.catalogueCheckedAt||p.checkedAt)),unitChecks:checks(units.map(o=>o.checkedAt)),
  oldestUnitCheck:stamps[0]||null,newestUnitCheck:stamps.at(-1)||null,
  conflicts:projects.filter(hasSourceConflict).length,
  failedRefreshes:projects.filter(p=>p.catalogueRefresh?.status==='failed'||p.inventoryRefresh?.status==='failed'||p.sourceFailures?.length).length,
  mapped:projects.filter(hasCoordinates).length,
  withFootprints:projects.filter(p=>p.spatial?.footprints?.length).length,
  footprints:new Set(projects.flatMap(p=>(p.spatial?.footprints||[]).map(f=>f.id))).size,
  priceReview:units.filter(o=>o.priceQuality?.status==='review_required'||o.priceVariants?.some(v=>v.priceQuality?.status==='review_required')).length,
  unavailable:units.filter(unavailable).length,
  missing:offerEvidenceGaps(units)
 };
}

export function evidenceReport(projects,metadata,now=Date.now()){
 return {generatedAt:new Date(now).toISOString(),sourceSnapshotAt:metadata.snapshotAt||metadata.checkedAt,summary:evidenceSummary(projects,now),records:projects.map(p=>({id:p.id,name:p.name,catalogueCheckedAt:p.catalogueCheckedAt||p.checkedAt||null,inventoryCheckedAt:p.inventoryRefresh?.checkedAt||null,sourceConflict:hasSourceConflict(p),priceReview:p.priceQuality?.status==='review_required',missing:offerEvidenceGaps(p.offers||[]),sourceUrls:(p.sources||[]).map(s=>s.url)}))};
}
