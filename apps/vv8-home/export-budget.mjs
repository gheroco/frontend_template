import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBudgetTotals } from './dist/budget-ui.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(root,'dist/budget.json'),'utf8'));
const totals = getBudgetTotals(data);
if (totals.unallocated < 0) throw new Error('Furniture plan exceeds the budget ceiling.');
if (new Set(data.items.map(i=>i.id)).size !== data.items.length) throw new Error('Duplicate budget item ID.');
const sources = new Map(data.sources.map(s=>[s.id,s]));
const rooms = new Map(data.rooms.map(r=>[r.id,r.name]));
for (const item of data.items) {
  if (!(Number.isFinite(item.unitAMD) && item.unitAMD >= 0 && Number.isFinite(item.qty) && item.qty > 0)) throw new Error('Invalid quantity or price: '+item.id);
  if (!rooms.has(item.room)) throw new Error('Unknown budget room: '+item.room);
  if (!['retail','allowance'].includes(item.kind)) throw new Error('Unknown price basis: '+item.id);
  if (item.kind === 'retail' && !sources.has(item.sourceId)) throw new Error('Retail price has no source: '+item.id);
}
const header=['Record','Room','Item','Quantity','Unit AMD','Total AMD','Approx total USD','Price basis','Supplier','Dimensions','Availability','Price checked','Source','Notes'];
const rows=data.items.map(item=>['Item',rooms.get(item.room),item.name,item.qty,item.unitAMD,item.qty*item.unitAMD,(item.qty*item.unitAMD/data.usdToAmd).toFixed(2),item.kind==='retail'?'Online listed price':'Planning allowance - not a supplier quote',item.supplier,item.dimensions,item.availability,data.asOf,sources.get(item.sourceId)?.url||'',item.note]);
for (const [label,value] of [['Budget ceiling',totals.cap],['Planned furniture and services',totals.planned],['Retail listings subtotal',totals.retail],['Planning allowances subtotal',totals.allowances],['Contingency reserve',totals.reserve],['Unallocated balance',totals.unallocated]]) {
  rows.push(['Summary','',label,'','',value,(value/data.usdToAmd).toFixed(2),'','','','',data.asOf,'','Reference rate: 1 USD = '+data.usdToAmd+' AMD']);
}
rows.push(['Scope','',data.scope]);
for (const note of data.notes) rows.push(['Note','',note]);
const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const csv='\ufeff'+[header,...rows].map(row=>Array.from({length:header.length},(_,i)=>cell(row[i])).join(',')).join('\r\n')+'\r\n';
const output=path.join(root,'dist/assets/VV8-furniture-budget.csv');
fs.writeFileSync(output,csv);
console.log(JSON.stringify({file:output,items:data.items.length,retailRows:data.items.filter(i=>i.kind==='retail').length,totalsAMD:totals,totalsUSD:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,+(value/data.usdToAmd).toFixed(2)])),roomTotalsAMD:Object.fromEntries(data.rooms.map(room=>[room.name,data.items.filter(i=>i.room===room.id).reduce((n,i)=>n+i.qty*i.unitAMD,0)]))},null,2));
