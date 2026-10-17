import {matchingOfferEntries,normalizeFilters} from './filters.js';
import {csvCell} from './model.js';

export const OFFER_COLUMNS=['Project','Project ID','Unit ID','Unit','Area · m²','Rooms','Floor','Building floors','Finish / payment basis','Apartment purchase · AMD','Budget amount · AMD','Budget basis','Source availability','Source checked at','Detail checked at','Source URL'];
export function offerExportRows(projects,prefs,raw={},projectName=p=>p.name){
 const f=normalizeFilters(raw);
 return projects.flatMap(p=>matchingOfferEntries(p,prefs,f).map(entry=>{
  const o=entry.offer;
  return [projectName(p),p.id,o.id,o.unit,o.area,o.rooms,o.floor,o.buildingFloors,entry.priceBasis,entry.price,entry.budgetPrice,f.budgetBasis,p.soldOut?'project_sold_out':o.isBooked?'booked':o.availability||'not_confirmed',o.checkedAt,o.detailCheckedAt,o.url];
 }));
}
export function rowsCSV(headers,rows){return '\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');}
