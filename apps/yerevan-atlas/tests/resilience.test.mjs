import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalogueFiles} from '../src/catalogue-loader.js';
import {evidenceSummary} from '../src/evidence.js';
import {projectBounds} from '../src/geo.js';

test('optional asset failures preserve the catalogue, while required catalogue failures stop loading',async()=>{
 const catalogue={metadata:{checkedAt:'2026-10-13'},projects:[{id:'p'}]};
 const result=await loadCatalogueFiles(async path=>{if(path.includes('projects.json'))return {ok:true,json:async()=>catalogue};throw Error('offline');});
 assert.deepEqual(result.catalogue,catalogue);assert.deepEqual(result.presets,[]);assert.deepEqual(result.geometry,{records:{}});assert.equal(result.failures.length,2);
 await assert.rejects(loadCatalogueFiles(async()=>({ok:false})),/Cannot load/);
});

test('evidence health ages checks, preserves unknowns and deduplicates footprint identities',()=>{
 const now=Date.parse('2026-10-17T12:00:00Z');
 const project={catalogueCheckedAt:'2026-10-13T12:00:00Z',coordinates:[44.5,40.2],spatial:{footprints:[{id:'one'}]},offers:[{rooms:null,checkedAt:'2026-09-01'},{rooms:2,checkedAt:'2030-01-01'}]};
 const stats=evidenceSummary([project,{...project,offers:[]}],now);
 assert.equal(stats.projectChecks.recent,2);assert.equal(stats.unitChecks.stale,1);assert.equal(stats.unitChecks.unknown,1);assert.equal(stats.missing.rooms,1);assert.equal(stats.footprints,1);
});

test('fit-to-results includes full geometry beyond source pin centres',()=>{
 const p={coordinates:[44.5,40.2],spatial:{footprints:[{geometry:{type:'Polygon',coordinates:[[[44.4,40.1],[44.7,40.1],[44.7,40.4],[44.4,40.1]]]}}]}};
 assert.deepEqual(projectBounds([p]),[[44.4,40.1],[44.7,40.4]]);assert.equal(projectBounds([]),null);
});
