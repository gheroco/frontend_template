export const SOURCE='https://ikfia.ysn.ru/wp-content/uploads/2018/01/EinsteinInfeld1965ru.pdf';
export const $=id=>document.getElementById(id);
export function clampPage(v,total){const n=Number(v);return Math.max(1,Math.min(total,Number.isFinite(n)?Math.trunc(n):1));}
export function normalize(s){return String(s??'').normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();}
export function findSnippet(text,query){
 const q=normalize(query);if(!q)return null;
 let t='';const starts=[],ends=[];
 for(const {segment,index} of new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(text)){
  for(const character of segment.normalize('NFKC').toLocaleLowerCase('ru')){
   const c=/\s/.test(character)?' ':character;
   if(c===' '&&t.endsWith(' '))continue;
   t+=c;for(let k=0;k<c.length;k++){starts.push(index);ends.push(index+segment.length);}
  }
 }
 const i=t.indexOf(q);if(i<0)return null;
 const a=starts[Math.max(0,i-55)],b=ends[Math.min(t.length,i+q.length+115)-1];
 return `${a?'…':''}${text.slice(a,b)}${b<text.length?'…':''}`;
}
export function safeProgress(raw,total){return {page:clampPage(raw?.page??1,total),bookmarks:[...new Set((Array.isArray(raw?.bookmarks)?raw.bookmarks:[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=total))].sort((a,b)=>a-b)};}
export async function fingerprint(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function readStorage(k,f){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}}
export function writeStorage(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}
export function escapeHTML(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Images and JSON must remain same-origin, even if a source manifest is malformed.
export function assetPath(path){const p=String(path??'').replace(/^\.\//,'');return /^(?:content|images|assets)\/[a-zA-Z0-9_./()\-]+$/.test(p)&&!p.includes('..')?'./'+p:'';}
export function sectionForPage(book,n){const p=book.pages.find(p=>Number(p.number)===Number(n));return book.sections.find(s=>s.id===p?.sectionId)||book.sections.find(s=>Number(n)>=Number(s.startPage)&&Number(n)<=Number(s.endPage));}
let timer;export function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.hidden=false;clearTimeout(timer);timer=setTimeout(()=>el.hidden=true,4500);}
const paths={home:'<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3z"/>',atlas:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="m7 6 10-1M6 8l5 9m7-10-5 10"/>',lab:'<path d="M9 3h6m-5 0v7l-6 9a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-6-9V3M7 15h10"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',down:'<path d="M12 4v15m-6-6 6 6 6-6"/>',external:'<path d="M6 18 18 6M6 6h12v12"/>',book:'<path d="M12 6c-4-3-8-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-1-1-5-2-9 1v14"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',source:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',focus:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',pause:'<path d="M9 5v14M15 5v14"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 5 5 3-3 4 4"/>',check:'<path d="m5 12 4 4L19 6"/>',type:'<path d="m4 20 6-16 6 16M6 15h8M17 8h6m-3 0v12"/>',return:'<path d="M20 4v8H5m6-6-6 6 6 6"/>'};
export function icon(name){return `<i class="icon"><svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||''}</svg></i>`;}
export function fillIcons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[e.dataset.icon]||''}</svg>`);}
export function toggleTheme(){const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;writeStorage('evolution-theme',next);document.querySelector('meta[name="theme-color"]').content=next==='dark'?'#060b13':'#f1f3f1';}
