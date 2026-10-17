import {t,number,date} from './i18n.js';
import {evidenceSummary} from './evidence.js';

export function evidenceHTML(projects,metadata){
 const s=evidenceSummary(projects);
 const row=(label,values)=>`<tr><th scope="row">${t(label)}</th>${values.map(v=>`<td>${number(v,0)}</td>`).join('')}</tr>`;
 return `<p>${t('Evidence for the current results. Counts describe source records, not unique physical apartments.')}</p>
 <div class="coverage-stats"><div><strong>${number(s.projects,0)}</strong><small>${t('Project records')}</small></div><div><strong>${number(s.units,0)}</strong><small>${t('captured offers')}</small></div><div><strong>${number(s.withFootprints,0)}</strong><small>${t('Projects with footprints')}</small></div></div>
 <h3>${t('Source-check freshness')}</h3><p>${t('Research snapshot: {date}. This catalogue is not an exhaustive official building register.',{date:date(metadata.snapshotAt||metadata.checkedAt,true)})}</p>
 <div class="evidence-table-wrap"><table class="evidence-table"><thead><tr><th scope="col">${t('Records')}</th><th scope="col">${t('Within 7 days')}</th><th scope="col">${t('Older than 7 days')}</th><th scope="col">${t('Check date unavailable')}</th></tr></thead><tbody>${row('Project records',Object.values(s.projectChecks))}${row('captured offers',Object.values(s.unitChecks))}</tbody></table></div>
 <p>${t('A recent source check does not mean the publisher updated its price or availability.')}</p>
 <h3>${t('Evidence gaps')}</h3><div class="evidence-table-wrap"><table class="evidence-table"><tbody>${[['Source conflict',s.conflicts],['Latest refresh failed',s.failedRefreshes],['Prices requiring review',s.priceReview],['Rooms not published',s.missing.rooms],['Floor not published',s.missing.floor],['Building height not published',s.missing.buildingFloors],['Finish not published',s.missing.finish],['Balcony details not published',s.missing.balcony]].map(([label,n])=>row(label,[n])).join('')}</tbody></table></div>
 <p>${t('Conflict and failed-refresh counts are project records. Price-review and missing-detail counts are apartment records; these counts can overlap.')}</p>
 <h3>${t('Map evidence')}</h3><p>${t('{mapped} records have map positions; {projects} have {footprints} distinct mapped footprints.',{mapped:number(s.mapped,0),projects:number(s.withFootprints,0),footprints:number(s.footprints,0)})}</p><p>${t('Unmatched project locations remain points. Missing measurements are never invented.')}</p><button id="exportEvidence" class="button light">${t('Export evidence report')}</button>`;
}
