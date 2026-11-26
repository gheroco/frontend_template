const KEY = 'fluent30.progress.v1';
const clean = () => ({ version: 1, updatedAt: null, lastDay: 1, lastStep: 'recall', settings: { difficulty: 'standard' }, days: {}, phrases: {}, activity: {}, grammar: {} });
let available = true;
const numeric = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
const text = v => typeof v === 'string' ? v.slice(0, 10000) : '';
const steps = new Set(['recall', 'listen', 'language', 'conversation', 'transfer', 'record']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const grammarIds = new Set(['be','present-simple','present-continuous','questions','past-simple','present-perfect','future-plans','modals','articles','comparisons','conditionals','passive']);
function grammarRecord(value) {
  const v=record(value)?value:{}, answers={};
  for(const [key,answer] of Object.entries(record(v.answers)?v.answers:{})) if(/^[0-3]$/.test(key)) answers[key]=text(answer).slice(0,400);
  return {answers,checked:!!v.checked,practised:!!v.practised,saved:!!v.saved};
}

export function validateState(raw) {
  if (!record(raw) || raw.version !== 1 || !record(raw.days)) throw new Error('This is not a Fluent /30 progress backup.');
  const next = clean();
  next.lastDay = Math.round(numeric(raw.lastDay, 1, 1, 30));
  next.lastStep = steps.has(raw.lastStep) ? raw.lastStep : 'recall';
  next.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  next.settings.difficulty = ['standard','easier','harder'].includes(raw.settings?.difficulty) ? raw.settings.difficulty : 'standard';
  for (let n=1; n<=30; n++) {
    const d=raw.days[n]; if (!record(d)) continue;
    const answers={};
    for(const [k,v] of Object.entries(record(d.answers) ? d.answers : {})) if (/^(input|drill)-[0-2]$/.test(k)) answers[k]=text(v);
    const completed=Array.isArray(d.steps) ? [...new Set(d.steps.filter(s=>steps.has(s)))] : [];
    next.days[n]={steps:completed,answers,notes:text(d.notes),reflection:text(d.reflection),minutes:numeric(d.minutes,0,0,10000),scores:Array.from({length:4},(_,i)=>Math.round(numeric(d.scores?.[i],0,0,3))),completedAt:completed.length===6 && typeof d.completedAt==='string'?d.completedAt:null};
  }
  for(const [k,v] of Object.entries(record(raw.phrases) ? raw.phrases : {})) if (/^([1-9]|[12][0-9]|30)-[0-4]$/.test(k) && record(v)) next.phrases[k]={saved:!!v.saved,known:!!v.known};
  for(const [k,v] of Object.entries(record(raw.activity) ? raw.activity : {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) next.activity[k]=numeric(v,0,0,100000);
  for(const [id,v] of Object.entries(record(raw.grammar)?raw.grammar:{})) if(grammarIds.has(id)&&record(v)) next.grammar[id]=grammarRecord(v);
  return next;
}

function read() { try { const raw=localStorage.getItem(KEY); return raw?validateState(JSON.parse(raw)):clean(); } catch { available=false; return clean(); } }
let state=read();
export const getState=()=>state;
export const isPersistent=()=>available;
export function dayState(n) { return state.days[n] || {steps:[],answers:{},notes:'',reflection:'',minutes:0,scores:[0,0,0,0],completedAt:null}; }
export function save() {
  state.updatedAt=new Date().toISOString();
  try {localStorage.setItem(KEY,JSON.stringify(state)); available=true; return true;} catch {available=false; return false;}
}
export function setDay(n, patch) { state.days[n]={...dayState(n),...patch}; return save(); }
export function setAnswer(n,key,value) {return setDay(n,{answers:{...dayState(n).answers,[key]:value.slice(0,10000)}});}
export function setLast(n,step) {state.lastDay=n;state.lastStep=step;return save();}
export function setDifficulty(value) {if(['standard','easier','harder'].includes(value)){state.settings.difficulty=value;return save();}return false;}
export function setPhrase(key,patch) {state.phrases[key]={...state.phrases[key],...patch};return save();}
export function grammarState(id) {return state.grammar[id]||grammarRecord({});}
export function setGrammar(id,patch) {if(!grammarIds.has(id))return false;state.grammar[id]=grammarRecord({...grammarState(id),...patch});return save();}
export function setStep(n,step,complete=true) {
  const d=dayState(n);const done=new Set(d.steps);complete?done.add(step):done.delete(step);
  const date=new Date();const localDate=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  if(complete&&!d.steps.includes(step)) state.activity[localDate]=(state.activity[localDate]||0)+1;
  return setDay(n,{steps:[...done],completedAt:done.size===6?(d.completedAt||new Date().toISOString()):null});
}
export function replaceState(raw) {state=validateState(raw);return save();}
export function resetState() {state=clean();return save();}
export function stats() {
  const days=Object.values(state.days);
  const completed=days.filter(d=>d.steps.length===6).length;
  const blocks=days.reduce((n,d)=>n+d.steps.length,0);
  const minutes=days.reduce((n,d)=>n+Number(d.minutes||0),0);
  const saved=Object.values(state.phrases).filter(p=>p.saved).length;
  const known=Object.values(state.phrases).filter(p=>p.known).length;
  return {completed,blocks,minutes,saved,known,percent:Math.round(blocks/180*100)};
}
