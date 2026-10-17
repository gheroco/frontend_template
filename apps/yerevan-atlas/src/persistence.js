import {normalizePreferences,hasCoordinates} from './model.js';
import {parseSearch,normalizeFilters,validFilterInput} from './filters.js';

const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const safeKey=key=>typeof key==='string'&&key.length<=160&&!['__proto__','constructor','prototype'].includes(key);
const ids=value=>Array.isArray(value)&&value.length<=5000&&value.every(safeKey);
const CHECKS=new Set(['unit','handover','permit','technical','costs','visit']);

/** Validate an entire import before mutating existing research. */
export function parseResearchBackup(value) {
 try {
  const raw=typeof value==='string'?JSON.parse(value):value;
  if(!record(raw)||raw.version!=null&&![1,2,3].includes(raw.version)||!ids(raw.saved))return null;
  const prefs=normalizePreferences(raw.prefs);if(!prefs||!validFilterInput(raw.filters))return null;
  if(raw.compare!=null&&!ids(raw.compare)||raw.reference!=null&&!hasCoordinates({coordinates:raw.reference}))return null;
  if(raw.notes!=null&&!record(raw.notes)||raw.checks!=null&&!record(raw.checks))return null;
  const notes={},checks={};
  for(const [key,text]of Object.entries(raw.notes||{})){
   if(!safeKey(key)||typeof text!=='string'||text.length>50000)return null;
   notes[key]=text;
  }
  for(const [key,values]of Object.entries(raw.checks||{})){
   if(!safeKey(key)||!record(values)||Object.values(values).some(v=>typeof v!=='boolean'))return null;
   checks[key]=Object.fromEntries(Object.entries(values).filter(([name])=>CHECKS.has(name)));
  }
  if(raw.savedSearches!=null&&!Array.isArray(raw.savedSearches))return null;
  const savedSearches=[];
  for(const item of (raw.savedSearches||[]).slice(0,20)){
   const search=parseSearch(item?.search);
   if(!search||!safeKey(item.id)||typeof item.name!=='string'||!item.name.trim())return null;
   savedSearches.push({id:item.id,name:item.name.slice(0,60),search});
  }
  return {prefs,saved:[...new Set(raw.saved)],compare:[...new Set(raw.compare||[])].slice(0,4),notes,checks,savedSearches,filters:normalizeFilters(raw.filters),reference:raw.reference||null,locale:['hy','ru','en'].includes(raw.locale)?raw.locale:'hy'};
 }catch{return null;}
}
