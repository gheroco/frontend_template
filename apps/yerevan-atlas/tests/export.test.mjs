import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFER_COLUMNS,offerExportRows,rowsCSV} from '../src/export.js';
import {DEFAULT_PREFS} from '../src/model.js';
import {costScenario} from '../src/analysis.js';

test('apartment exports preserve the exact matching finish and planned total',()=>{
 const offer={id:'unit-1',area:90,rooms:3,totalAMD:60e6,priceVariants:[{conditionId:6,totalAMD:60e6,basis:'Not renovated'},{conditionId:5,totalAMD:72e6,basis:'Renovated'}],url:'https://example.com/1',checkedAt:'2026-10-13'};
 const prefs={...DEFAULT_PREFS,renovation:10000,parking:1,feePercent:1};
 const rows=offerExportRows([{id:'p',name:'Home',offers:[offer,{...offer,id:'booked',isBooked:true}]}],prefs,{mode:'units',finishes:['5'],useBudget:true,budgetBasis:'total'});
 assert.equal(rows.length,1);assert.equal(rows[0][8],'Renovated');assert.equal(rows[0][9],72e6);assert.equal(rows[0][10],74.62e6);assert.equal(rows[0][15],offer.url);assert.equal(rows[0].length,OFFER_COLUMNS.length);
 assert.ok(rowsCSV(['Name'],[[' \t=CMD()']]).includes("' \t=CMD()"));
});

test('total-cost comparison chooses the cheapest total rather than cheapest purchase',()=>{
 const project={offers:[{id:'large',area:100,totalAMD:50e6},{id:'small',area:50,totalAMD:55e6}]};
 const scenario=costScenario(project,{...DEFAULT_PREFS,renovation:200000},{budgetBasis:'total'});
 assert.equal(scenario.offer.id,'small');assert.equal(scenario.total,65e6);
});
