import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasCoordinates,matchInfo,DEFAULT_PREFS} from '../src/model.js';
const data=JSON.parse(readFileSync(new URL('../public/data/projects.json',import.meta.url)));
test('catalogue has traceable unique records and valid source locations',()=>{
 assert.ok(data.projects.length>=150);assert.equal(new Set(data.projects.map(p=>p.id)).size,data.projects.length);
 for(const p of data.projects){assert.ok(p.name,p.id+' name');assert.ok(p.sources?.length,p.id+' source');assert.ok(p.sources.every(s=>/^https?:\/\//.test(s.url)),p.id+' source url');if(p.coordinates)assert.ok(hasCoordinates(p),p.id+' coordinates');assert.ok(['completed','under_construction','unknown'].includes(p.status),p.id+' status');if(p.price?.min)assert.ok(p.price.min>0&&['AMD','USD'].includes(p.price.currency));}
});
test('source-specific dates and actual offers are preserved',()=>{const def=data.projects.find(p=>p.id==='karu-1');assert.ok(def);assert.equal(matchInfo(def,DEFAULT_PREFS).level,'offer');assert.equal(def.offers[0].totalAMD,54351000);const bed=data.projects.find(p=>p.id==='karu-66');assert.ok(bed.completion.startsWith('2028'));assert.ok(bed.sources.some(s=>s.url.includes('bedeck.am')));});
test('all published unit prices have identity and a source',()=>{for(const p of data.projects)for(const o of p.offers||[]){assert.ok(o.area>0&&o.totalAMD>0);assert.ok(o.url?.startsWith('https://'));assert.ok(o.checkedAt);assert.ok(o.floor!=null);assert.ok(o.unit);}});
