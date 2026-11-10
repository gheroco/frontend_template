import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wave,wavelength,relativeVelocity,photoelectric,gamma,fallDistance,electricField,H,C,E_CHARGE} from '../src/models.mjs';
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
test('wave transports its phase at v while marked material returns each period',()=>{
 for(const f of [.5,1,3])for(const t of [0,.2,1.7]){
  close(wave({x:2,t,frequency:f}),wave({x:6,t:t+1,frequency:f}));
  close(wave({x:2,t,frequency:f}),wave({x:2,t:t+1/f,frequency:f}));
  close(wavelength(f)*f,4);
 }
});
test('Galilean comoving observer sees rest, and reciprocal velocity reverses',()=>{
 close(relativeVelocity(3,3),0);close(relativeVelocity(3,-2),5);
 close(relativeVelocity(-2,3),-relativeVelocity(3,-2));
});
test('photoelectric cutoff and energy balance follow SI constants',()=>{
 const blue=photoelectric(450),red=photoelectric(700);
 assert.ok(blue.emits);assert.ok(!red.emits);assert.equal(red.kineticEv,0);
 close(blue.energyEv,2.7552044096,1e-8);close(blue.kineticEv+2.3,blue.energyEv);
 const threshold=H*C/(2.3*E_CHARGE)*1e9;
 assert.ok(photoelectric(threshold-.001).emits);assert.ok(!photoelectric(threshold+.001).emits);
});
test('light clock intervals satisfy the null light path, with no superluminal input',()=>{
 close(gamma(0),1);close(gamma(.6),1.25);
 for(const b of [0,.2,.6,.95]){const dt=gamma(b);close(dt**2-(b*dt)**2,1);}
 assert.throws(()=>gamma(1),RangeError);assert.throws(()=>gamma(NaN),RangeError);
});
test('local elevator model reaches the stated floor at the analytical time',()=>{
 for(const a of [1,9.8,15])close(fallDistance(Math.sqrt(4/a),a),2);
});
test('electric superposition respects symmetry and excludes singularities',()=>{
 close(electricField(0,0,1).x,0);close(electricField(0,0,1).y,0);
 close(electricField(0,0,-1).x,2);close(electricField(0,0,-1).y,0);
 assert.equal(electricField(-1,0),null);
 const up=electricField(0,1),down=electricField(0,-1);close(up.x,down.x);close(up.y,-down.y);
});
const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
test('every companion explanation resolves to a canonical original passage',()=>{
 const book=json('../src/content/book.json'),companion=json('../src/companion/companion.json');
 assert.equal(companion.entries.length,60);
 assert.equal(new Set(companion.entries.map(e=>e.id)).size,60);
 for(const section of book.sections)assert.ok(companion.entries.some(e=>e.sectionId===section.id),section.id);
 for(const entry of companion.entries){
  const page=json(`../src/content/pages/${String(entry.source.page).padStart(3,'0')}.json`);
  assert.ok(page.blocks.some(b=>b.id===entry.source.blockId),entry.id);
  assert.ok(entry.summary&&entry.reasoning.length>=1&&entry.misconception&&entry.attribution,entry.id);
 }
});
test('coverage ledger keeps uncertain transcription separate from proven image identity',()=>{
 const report=json('../src/companion/coverage-report.json');
 assert.ok(report.ok);assert.equal(report.pages.length,345);assert.equal(report.figures.length,86);
 assert.ok(report.pages.every(p=>p.destination&&p.scanHashMatchesExtraction&&!p.characterPerfect));
 assert.ok(report.figures.every(f=>f.originalPixelsMatch));
 assert.match(report.pages.find(p=>p.page===268).uncertainty,/p268-b004/);
});
