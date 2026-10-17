import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearch} from '../src/filters.js';
import {DEFAULT_PREFS,validDate,targetEnd} from '../src/model.js';
import {parseResearchBackup} from '../src/persistence.js';

test('shared searches reject impossible dates, inverted floors and invalid cost assumptions',()=>{
 const base={v:1,prefs:{...DEFAULT_PREFS},filters:{}};
 for(const filters of [{floorMin:20,floorMax:3},{floorMin:-1},{completionBefore:'2026-02-30'},{radiusKm:2},{rooms:['five']},{freshnessDays:2.5}])assert.equal(parseSearch({...base,filters}),null);
 for(const prefs of [{parking:-1},{feePercent:Infinity},{renovation:'1000'},{nearby:'false'}])assert.equal(parseSearch({...base,prefs:{...base.prefs,...prefs}}),null);
 assert.equal(parseSearch({...base,prefs:{...base.prefs,privateNote:'secret'}}).prefs.privateNote,undefined);
 assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);assert.equal(targetEnd('2026-13'),null);
});

test('backup import preserves research and refuses malformed state before replacement',()=>{
 const raw={version:3,prefs:DEFAULT_PREFS,saved:['karu-1'],compare:['karu-1'],notes:{'karu-1':'Visit at sunset'},checks:{'karu-1':{unit:true,technical:true}},filters:{}};
 const result=parseResearchBackup(JSON.stringify(raw));assert.deepEqual(result.notes,raw.notes);assert.deepEqual(result.checks,raw.checks);
 for(const changed of [{compare:{}},{notes:[]},{notes:{'karu-1':{bad:true}}},{checks:{'karu-1':{unit:'yes'}}},{version:99},{prefs:{...DEFAULT_PREFS,feePercent:-5}}])assert.equal(parseResearchBackup({...raw,...changed}),null);
 assert.equal(parseResearchBackup('{"saved":["__proto__"]}'),null);
 assert.deepEqual(raw.saved,['karu-1']);
});
