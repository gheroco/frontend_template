import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBudgetTotals } from './dist/budget-ui.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(root,'dist/budget.json'),'utf8'));
const totals = getBudgetTotals(data);
if (totals.unallocated < 0) throw new Error('Կահույքի նախահաշիվը գերազանցում է բյուջեի սահմանաչափը։');
if (new Set(data.items.map(i=>i.id)).size !== data.items.length) throw new Error('Կահույքի դիրքի նույնացուցիչը կրկնվում է։');
const sources = new Map(data.sources.map(s=>[s.id,s]));
const rooms = new Map(data.rooms.map(r=>[r.id,r.name]));
for (const item of data.items) {
  if (!(Number.isFinite(item.unitAMD) && item.unitAMD >= 0 && Number.isFinite(item.qty) && item.qty > 0)) throw new Error('Անվավեր քանակ կամ գին՝ '+item.id);
  if (!rooms.has(item.room)) throw new Error('Բյուջեի անհայտ սենյակ՝ '+item.room);
  if (!['retail','allowance'].includes(item.kind)) throw new Error('Գնի անհայտ հիմք՝ '+item.id);
  if (item.kind === 'retail' && !sources.has(item.sourceId)) throw new Error('Մանրածախ գնի աղբյուրը բացակայում է՝ '+item.id);
}
const header=['Գրառման տեսակ','Սենյակ','Անվանում','Քանակ','Միավորի գին, դրամ','Ընդհանուր գումար, դրամ','Մոտավոր ընդհանուր գումար, ԱՄՆ դոլար','Գնի հիմք','Մատակարար','Չափեր','Առկայություն','Ստուգման ամսաթիվ','Աղբյուր','Նշումներ'];
const rows=data.items.map(item=>['Դիրք',rooms.get(item.room),item.name,item.qty,item.unitAMD,item.qty*item.unitAMD,(item.qty*item.unitAMD/data.usdToAmd).toFixed(2),item.kind==='retail'?'Կայքում նշված գին':'Նախահաշվային գումար․ մատակարարի գնային առաջարկ չէ',item.supplier,item.dimensions,item.availability,data.asOf,sources.get(item.sourceId)?.url||'',item.note]);
for (const [label,value] of [['Բյուջեի սահմանաչափ',totals.cap],['Նախատեսված կահույք և ծառայություններ',totals.planned],['Կայքում նշված գների հանրագումար',totals.retail],['Նախահաշվային գումարների հանրագումար',totals.allowances],['Պահուստ',totals.reserve],['Չբաշխված գումար',totals.unallocated]]) {
  rows.push(['Ամփոփում','',label,'','',value,(value/data.usdToAmd).toFixed(2),'','','','',data.asOf,'','Հաշվարկային փոխարժեք՝ 1 ԱՄՆ դոլար = '+data.usdToAmd+' դրամ']);
}
rows.push(['Ընդգրկում','',data.scope]);
for (const note of data.notes) rows.push(['Նշում','',note]);
const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const csv='\ufeff'+[header,...rows].map(row=>Array.from({length:header.length},(_,i)=>cell(row[i])).join(',')).join('\r\n')+'\r\n';
const output=path.join(root,'dist/assets/VV8-furniture-budget.csv');
fs.writeFileSync(output,csv);
console.log(JSON.stringify({file:output,items:data.items.length,retailRows:data.items.filter(i=>i.kind==='retail').length,totalsAMD:totals,totalsUSD:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,+(value/data.usdToAmd).toFixed(2)])),roomTotalsAMD:Object.fromEntries(data.rooms.map(room=>[room.name,data.items.filter(i=>i.room===room.id).reduce((n,i)=>n+i.qty*i.unitAMD,0)]))},null,2));
