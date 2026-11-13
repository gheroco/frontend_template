import {initField} from './orbit.mjs';
import {$,icon,fillIcons,toggleTheme,readStorage,escapeHTML as esc,assetPath,normalize,findSnippet,sectionForPage,toast} from './core.mjs';
import {createReader,getProgress,ANCHOR_STORAGE} from './reader.mjs';
import {createObservatory,loadCompanion} from './observatory.mjs';
fillIcons();
document.documentElement.dataset.theme=readStorage('evolution-theme','dark')==='light'?'light':'dark';
initField();
let book,reader,observatory,lastNonFigureHash='#',searchIndex,searchPromise,searchTimer,searchSerial=0,routeSerial=0;
const chapterNames=['Расцвет механистического воззрения','Упадок механистического воззрения','Поле и относительность','Кванты'];
const chapterDisplay=['Механика','Пределы механики','Поле и время','Кванты'];
const chapterRoman=['I','II','III','IV'];
const chapterArt=[
 '<circle cx="104" cy="82" r="44"/><ellipse cx="104" cy="82" rx="84" ry="29" transform="rotate(-28 104 82)"/><path d="M24 138 184 28M105 16v132M38 82h132" stroke-dasharray="2 5"/><circle cx="149" cy="44" r="4" class="art-dot"/>',
 '<path d="M22 95C42 20 62 20 82 95S122 170 142 95 182 20 202 95M22 95C42 145 62 145 82 95S122 45 142 95 182 145 202 95"/><path d="M16 95h194" stroke-dasharray="2 5"/><circle cx="111" cy="95" r="49" opacity=".45"/>',
 '<path d="M20 35Q110 95 200 35M20 57Q110 117 200 57M20 79Q110 139 200 79M20 101Q110 161 200 101M20 123Q110 183 200 123M20 35v88M50 48v89M80 56v90M110 60v91M140 56v90M170 48v89M200 35v88"/><circle cx="110" cy="74" r="26" class="art-orb"/>',
 '<circle cx="110" cy="88" r="57" stroke-dasharray="1 9"/><circle cx="110" cy="88" r="38"/><circle cx="110" cy="88" r="18"/><path d="M36 145 184 31M35 31l150 114" stroke-dasharray="2 5"/><circle cx="151" cy="48" r="4" class="art-dot"/><circle cx="81" cy="111" r="3" class="art-dot"/><circle cx="116" cy="72" r="2" class="art-dot"/>'
];
function chapterNumber(section){if(Number(section?.chapterNumber)>=1&&Number(section.chapterNumber)<=4)return Number(section.chapterNumber);const v=section?.chapter;if(Number(v)>=1&&Number(v)<=4)return Number(v);const t=String(v||'').toLowerCase();if(t.includes('расцвет'))return 1;if(t.includes('упадок'))return 2;if(t.includes('поле'))return 3;if(t.includes('квант'))return 4;return chapterRoman.indexOf(String(v))+1||0;}
function pageLabel(n){const p=book?.pages.find(p=>Number(p.number)===Number(n));return p?.printedPage!=null&&p.printedPage!==''?`стр. ${p.printedPage}`:`лист ${n}`;}
function updateResume(progress){const p=progress||getProgress(book.totalPages);if(p.page<=1)return;$('resume-reading').hidden=false;$('resume-reading').innerHTML=`<span class="resume-dot"></span><a href="#resume">Продолжить с ${esc(pageLabel(p.page))} ${icon('arrow')}</a>`;}
function figureHTML(f,index,small=false){const src=assetPath(f.src);if(!src)return '';return `<button class="${small?'figure-preview':'gallery-card'}" data-figure="${index}" aria-label="Рассмотреть: ${esc(f.caption||`иллюстрация, ${pageLabel(f.page)}`)}"><span class="figure-image"><img src="${src}" alt="${esc(f.caption||`Иллюстрация, ${pageLabel(f.page)}`)}" loading="lazy" decoding="async" ${f.width?`width="${Number(f.width)}"`:''} ${f.height?`height="${Number(f.height)}"`:''}><span class="figure-plus">${icon('plus')}</span></span><span class="figure-caption"><span>${esc(f.caption||'Иллюстрация из книги')}</span><small>${esc(pageLabel(f.page))}</small></span></button>`;}
function renderLanding(){
 $('page-stat').textContent=book.totalPages;$('figure-stat').textContent=book.figures.length;
 $('chapter-cards').innerHTML=chapterNames.map((title,i)=>{const sections=book.sections.filter(s=>chapterNumber(s)===i+1),start=sections[0]?.startPage;return `<a class="chapter-card" href="#section/${sections[0]?.id||'title-pages'}"><div class="chapter-top"><span>ГЛАВА ${chapterRoman[i]}</span><span>${sections.length} РАЗДЕЛОВ</span></div><svg class="chapter-art" viewBox="0 0 220 180" aria-hidden="true">${chapterArt[i]}</svg><span class="chapter-title">${chapterDisplay[i]}</span><span class="chapter-original">${esc(title)}</span><div class="chapter-bottom"><small>${start?esc(pageLabel(start)):'Открыть'}</small><span>${icon('arrow')}</span></div></a>`;}).join('');
 $('full-contents').innerHTML=book.sections.map(s=>`<a href="#section/${s.id}"><span>${esc(s.title)}</span><span>${esc(pageLabel(s.startPage))}</span>${icon('arrow')}</a>`).join('');
 const select=[];for(const n of [1,2,3,4]){const i=book.figures.findIndex(f=>chapterNumber(sectionForPage(book,Number(f.page)))===n&&Number(f.width||1)/Number(f.height||1)<4);if(i>=0&&!select.includes(i))select.push(i);}for(let i=0;select.length<4&&i<book.figures.length;i++)if(!select.includes(i))select.push(i);
 $('figure-previews').innerHTML=select.map(i=>figureHTML(book.figures[i],i,true)).join('');$('illustrations-preview').hidden=!book.figures.length;
 updateResume();
}
function renderGallery(){
 const el=$('gallery-page');el.innerHTML=`<header class="gallery-header wrap"><a class="brand" href="#"><img src="./favicon.svg" width="34" height="34" alt=""><span>ЭВОЛЮЦИЯ<small>ФИЗИКИ</small></span></a><a class="quiet-link" href="#read/${getProgress(book.totalPages).page}">${icon('book')} Вернуться к чтению</a><button class="icon-button theme-button" aria-label="Сменить тему">${icon('sun')}</button></header><div class="wrap gallery-main"><div class="section-heading"><div><span class="eyebrow">ВИЗУАЛЬНЫЙ АТЛАС / ${book.figures.length} ИЛЛЮСТРАЦИЙ</span><h1>Увидеть<br><em>идею.</em></h1></div><p>Оригинальные изображения из книги.<br>Откройте рисунок, чтобы рассмотреть детали.</p></div><div class="gallery-filters"><label class="gallery-search">${icon('search')}<input type="search" id="gallery-search" placeholder="Название или номер страницы" aria-label="Найти иллюстрацию"></label><label class="gallery-select"><span class="sr-only">Глава</span><select id="gallery-chapter"><option value="all">Вся книга</option value="1">I · Расцвет механистического воззрения</option><option value="2">II · Упадок механистического воззрения</option><option value="3">III · Поле и относительность</option><option value="4">IV · Кванты</option><option value="0">Материалы издания</option></select></label></div><div id="gallery-count" class="gallery-count" role="status"></div><div id="gallery-grid" class="gallery-grid"></div></div>`;
 const filter=()=>{const query=normalize($('gallery-search').value),chapter=$('gallery-chapter').value;let count=0;$('gallery-grid').innerHTML=book.figures.map((f,i)=>{if(chapter!=='all'&&Number(chapter)!==chapterNumber(sectionForPage(book,Number(f.page))))return '';if(query&&!normalize(`${f.caption||''} ${pageLabel(f.page)} ${f.page}`).includes(query))return '';count++;return figureHTML(f,i);}).join('')||'<p class="gallery-empty">Ничего не найдено. Измените запрос или выберите другую главу.</p>';$('gallery-count').textContent=`Показано ${count} из ${book.figures.length}`;};
 $('gallery-search').addEventListener('input',filter);$('gallery-chapter').addEventListener('change',filter);filter();
}
function showDialog(id){const dialog=$(id);if(!dialog.open)dialog.showModal();}
function openSearch(){showDialog('search-dialog');setTimeout(()=>$('book-search').focus(),20);}
function provenance(){
 const v=book.verification||{},s=book.source||{},reviewed=book.stats?.reviewedPages??v.manuallyProofreadPages?.length??v.reviewedPages,compared=book.stats?.visuallyComparedPages??v.wholePageComparisonPages?.length;
 const link=(url,title)=>{try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return '';return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(title)} ${icon('external')}</a>`;}catch{return '';}};
 $('provenance-content').innerHTML=`<p class="provenance-intro">Эта цифровая версия представляет текст и изображения русского издания «Эволюции физики» 1965 года.</p><dl class="provenance-stats"><div><dt>Листы исходного файла</dt><dd>${book.totalPages}</dd></div><div><dt>Разделы</dt><dd>${book.sections.length}</dd></div><div><dt>Иллюстрации</dt><dd>${book.figures.length}</dd></div>${compared!=null?`<div><dt>Листы, сверенные целиком</dt><dd>${esc(compared)}</dd></div>`:''}${reviewed!=null?`<div><dt>Из них: ручная транскрипция</dt><dd>${esc(reviewed)}</dd></div>`:''}</dl><h3>Как читать и сверять</h3><p>Основной текст представлен как веб-текст. Метки страниц сохраняют связь с печатным изданием. Кнопка «Сверить с оригиналом» открывает исходный скан рядом с текстом. Изображения книги показываются отдельно с масштабированием и перемещением.</p><h3>Статус транскрипции</h3>${compared!=null?'<p>Сверка целого листа означает визуальное сопоставление текста и скана. Ручная транскрипция входит в общее число сверенных листов. В счётчиках учтены повторные листы исходного файла. После одного прохода могут оставаться ошибки.</p>':''}<p>${esc(v.summary||v.note||v.statusText||'Текст распознан со сканов. Автоматическое распознавание может ошибаться в буквах, знаках, формулах и переносах. Наличие всех страниц не означает посимвольную ручную вычитку. Исходный скан остаётся контрольным источником.')}</p>${Array.isArray(v.notes)?v.notes.map(n=>`<p>${esc(n)}</p>`).join(''):''}<h3>Источники</h3><div class="provenance-links">${link(s.pdfUrl||'https://ikfia.ysn.ru/wp-content/uploads/2018/01/EinsteinInfeld1965ru.pdf','Исходное издание (PDF)')}${link(s.webUrl||'https://alexandr4784.narod.ru/historyei.htm','Сопоставительная веб-транскрипция')}</div>${s.sha256?`<details class="source-fingerprint"><summary>Отпечаток исходного файла</summary><code>${esc(s.sha256)}</code></details>`:''}<a class="coverage-link" href="./companion/coverage-report.html" target="_blank" rel="noopener noreferrer">Постраничный отчёт: покрытие и проверка ↗</a><h3>Объяснения и эксперименты</h3><p>60 редакционных объяснений хранятся отдельно от оригинального текста. Шесть учебных моделей показывают зависимости и явно указывают ограничения. Атлас добавляет ссылки между понятиями, не изменяя порядок книги.</p><h3>Ваше место в книге</h3><p>Прогресс, закладки, размер шрифта и тема сохраняются в этом браузере. Они не синхронизируются между устройствами.</p>`;
 showDialog('provenance-dialog');
}
async function search(){
 const query=$('book-search').value.trim(),serial=++searchSerial;
 if(!query){$('search-results').innerHTML='';$('search-status').textContent='Введите слово или фразу. Поиск охватывает все страницы.';return;}
 $('search-status').textContent='Ищем по всей книге…';
 try{
  searchPromise??=fetch('./content/search.json').then(r=>{if(!r.ok)throw Error('Индекс поиска не загружен.');return r.json();}).catch(e=>{searchPromise=null;throw e;});
  searchIndex??=await searchPromise;if(serial!==searchSerial)return;
  const entries=Array.isArray(searchIndex)?searchIndex:searchIndex.pages||[],q=normalize(query),hits=[],scope=document.querySelector('[name=search-scope]:checked')?.value||'all';
  if(scope!=='companion')for(const entry of entries){if(normalize(entry.text).includes(q))hits.push(entry);}
  const companion=await loadCompanion().catch(()=>({entries:[],unavailable:true}));if(serial!==searchSerial)return;
  const notes=scope==='original'?[]:companion.entries.map(e=>({...e,text:[e.title,e.summary,...e.reasoning,e.misconception,e.question].join(' ')})).filter(e=>normalize(e.text).includes(q));
  $('search-status').textContent=(hits.length||notes.length)?`Текст книги: ${hits.length} стр. · Объяснения: ${notes.length}${hits.length>80?' · показаны первые 80 страниц':''}`:'Ничего не найдено. Попробуйте более короткую фразу.';if(companion.unavailable)$('search-status').textContent+=' Объяснения временно недоступны.';
  $('search-results').innerHTML=hits.slice(0,80).map(entry=>{const n=Number(entry.page??entry.number),section=sectionForPage(book,n),snippet=findSnippet(String(entry.text),query)||String(entry.text).slice(0,180);return `<a class="search-result" href="#read/${n}" data-search-result><span class="search-kind">ТЕКСТ КНИГИ</span><span>${esc(pageLabel(n))}<small>${esc(section?.title||'Материалы издания')}</small></span><p>${esc(snippet)}</p>${icon('arrow')}</a>`;}).join('')+notes.map(entry=>`<a class="search-result companion-result" href="#learn/${entry.id}" data-search-result><span class="search-kind">ОБЪЯСНЕНИЕ · ДОБАВЛЕНО РЕДАКЦИЕЙ</span><span>${esc(entry.title)}<small>${esc(pageLabel(entry.source.page))}</small></span><p>${esc(findSnippet(entry.text,query)||entry.summary)}</p>${icon('arrow')}</a>`).join('');
 }catch(e){$('search-status').textContent=e.message+' Попробуйте снова.';}
}
document.querySelectorAll('[name=search-scope]').forEach(input=>input.addEventListener('change',search));
$('book-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,180);});
$('search-form').addEventListener('submit',event=>{event.preventDefault();clearTimeout(searchTimer);search();});
// The same interaction handles both untouched original figure crops and optional source scans.
const imageDialog=$('image-dialog'),stage=$('image-stage'),zoomImage=$('zoom-image');
let imageScale=1,imageFit=1,imageX=0,imageY=0,imagePage=null,imageNatural={w:1,h:1},dragState=null,pinchState=null;const pointers=new Map();
function imageTransform(){zoomImage.style.transform=`translate(-50%, -50%) translate(${imageX}px, ${imageY}px) scale(${imageFit*imageScale})`;$('image-reset').textContent=Math.round(imageScale*100)+'%';$('image-minus').disabled=imageScale<=1.001;$('image-plus').disabled=imageScale>=12;}
function fitImage(){if(!imageDialog.open||!zoomImage.naturalWidth)return;imageNatural={w:zoomImage.naturalWidth,h:zoomImage.naturalHeight};const r=stage.getBoundingClientRect();imageFit=Math.min((r.width-40)/imageNatural.w,(r.height-36)/imageNatural.h);imageFit=Math.max(.01,imageFit);zoomImage.style.width=imageNatural.w+'px';zoomImage.style.height=imageNatural.h+'px';imageScale=1;imageX=imageY=0;imageTransform();}
function zoomImageAt(next,x=0,y=0){next=Math.min(12,Math.max(1,next));const ratio=next/imageScale;imageX=x-(x-imageX)*ratio;imageY=y-(y-imageY)*ratio;imageScale=next;if(next===1)imageX=imageY=0;imageTransform();}
function openImage(item){
 const src=assetPath(item.src);if(!src){toast('Путь к исходному изображению не найден.');return;}
 imagePage=item.page;imageScale=1;imageX=imageY=0;pointers.clear();dragState=pinchState=null;
 $('image-title').textContent=item.title||item.caption||'Иллюстрация из книги';$('image-kicker').textContent=item.kind==='source'?'СВЕРКА С ИСХОДНЫМ ИЗДАНИЕМ':'ОРИГИНАЛ ИЛЛЮСТРАЦИИ';$('image-caption').textContent=item.caption|| (item.page?pageLabel(item.page):'');
 const compare=$('compare-text');compare.hidden=item.kind!=='source';imageDialog.classList.toggle('with-comparison',item.kind==='source');compare.replaceChildren();
 if(item.kind==='source'){const h=document.createElement('h3');h.textContent='Веб-текст этой страницы';compare.append(h);for(const text of String(item.compare||'На этой странице нет распознанного текста.').split('\n\n')){const p=document.createElement('p');p.textContent=text;compare.append(p);}}
 $('image-read').hidden=!item.page||item.kind==='source';$('image-error').hidden=true;zoomImage.hidden=true;zoomImage.alt=item.alt||item.title||item.caption||'Исходное изображение';zoomImage.onload=()=>{zoomImage.hidden=false;fitImage();};zoomImage.onerror=()=>{$('image-error').hidden=false;};showDialog('image-dialog');zoomImage.src=src;if(zoomImage.complete&&zoomImage.naturalWidth){zoomImage.hidden=false;fitImage();}
}
$('image-fullscreen').onclick=async()=>{imageDialog.classList.toggle('is-fullscreen');$('image-fullscreen').setAttribute('aria-pressed',String(imageDialog.classList.contains('is-fullscreen')));requestAnimationFrame(fitImage);};
imageDialog.addEventListener('close',()=>{imageDialog.classList.remove('is-fullscreen');$('image-fullscreen').setAttribute('aria-pressed','false');if(location.hash.startsWith('#figure/'))history.replaceState(null,'',lastNonFigureHash);});
$('image-plus').onclick=()=>zoomImageAt(imageScale*1.4);$('image-minus').onclick=()=>zoomImageAt(imageScale/1.4);$('image-reset').onclick=fitImage;
$('image-read').onclick=()=>{imageDialog.close();if(imagePage)location.hash=`read/${imagePage}`;};
stage.addEventListener('wheel',event=>{event.preventDefault();const r=stage.getBoundingClientRect();zoomImageAt(imageScale*Math.exp(-event.deltaY*.002),event.clientX-r.left-r.width/2,event.clientY-r.top-r.height/2);},{passive:false});
stage.addEventListener('dblclick',event=>{const r=stage.getBoundingClientRect();zoomImageAt(imageScale>1?1:2.5,event.clientX-r.left-r.width/2,event.clientY-r.top-r.height/2);});
stage.addEventListener('pointerdown',event=>{event.preventDefault();stage.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});stage.classList.add('dragging');if(pointers.size===1)dragState={x:event.clientX,y:event.clientY,tx:imageX,ty:imageY};else if(pointers.size===2){const [a,b]=[...pointers.values()];pinchState={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:imageScale};dragState=null;}});
stage.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2&&pinchState){const [a,b]=[...pointers.values()],r=stage.getBoundingClientRect();zoomImageAt(pinchState.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinchState.distance),(a.x+b.x)/2-r.left-r.width/2,(a.y+b.y)/2-r.top-r.height/2);}else if(pointers.size===1&&dragState){imageX=dragState.tx+event.clientX-dragState.x;imageY=dragState.ty+event.clientY-dragState.y;imageTransform();}});
function pointerEnd(event){pointers.delete(event.pointerId);pinchState=null;if(pointers.size===1){const p=[...pointers.values()][0];dragState={x:p.x,y:p.y,tx:imageX,ty:imageY};}else{dragState=null;stage.classList.remove('dragging');}}
stage.addEventListener('pointerup',pointerEnd);stage.addEventListener('pointercancel',pointerEnd);
imageDialog.addEventListener('keydown',event=>{if(event.key==='+'||event.key==='='){event.preventDefault();zoomImageAt(imageScale*1.4);}if(event.key==='-'){event.preventDefault();zoomImageAt(imageScale/1.4);}if(event.key==='0'){event.preventDefault();fitImage();}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();imageX+=event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0;imageY+=event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0;imageTransform();}});
new ResizeObserver(()=>{if(imageDialog.open)fitImage();}).observe(stage);
document.addEventListener('click',event=>{const el=event.target.closest('button,a');if(!el)return;if(el.matches('.theme-button'))toggleTheme();if(el.hasAttribute('data-search'))openSearch();if(el.hasAttribute('data-provenance'))book?provenance():toast('Сведения о книге загружаются.');if(el.hasAttribute('data-close-dialog'))el.closest('dialog').close();if(el.hasAttribute('data-search-result'))$('search-dialog').close();if(el.hasAttribute('data-figure')){const item=book?.figures[Number(el.dataset.figure)];if(item)location.hash='figure/'+item.id;}});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}));
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openSearch();}});
async function route(){
 const destination=location.hash==='#lab'?'lab':location.hash==='#atlas'?'atlas':/^#(?:read|resume|section|learn|experiment)/.test(location.hash)?'read':'home';
 document.querySelectorAll('[data-dock]').forEach(a=>{if(a.dataset.dock===destination)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 const serial=++routeSerial,hash=location.hash;
 if(!book)return;
 if(hash.startsWith('#figure/')){const item=book.figures.find(f=>f.id===hash.slice(8));if(item)openImage({...item,title:item.caption||'Иллюстрация из книги'});else toast('Иллюстрация не найдена.');return;}
 lastNonFigureHash=hash||'#';if(imageDialog.open)imageDialog.close();
 const teaching=hash.match(/^#(learn|experiment)\/(.+)$/);
 if(teaching){
  try{await observatory.ensureReady();let id=teaching[2];if(teaching[1]==='experiment'){const {EXPERIMENTS}=await import('./experiments.mjs');id=EXPERIMENTS[id]?.lesson;}const entry=observatory.getEntry(id);if(!entry)throw Error('Материал не найден.');if(serial!==routeSerial)return;
   $('landing').hidden=true;$('gallery-page').hidden=true;$('atlas-page').hidden=true;
   await reader.open(entry.source.page,entry.source.blockId);if(serial!==routeSerial)return;await observatory.open(id,teaching[1]==='experiment'?'experiment':'explain');history.replaceState(null,'',hash);document.title=entry.title+' — Эволюция физики';
  }catch(e){toast(e.message);}return;
 }
 if(/^#read(?:\/|$)/.test(hash)||hash==='#resume'||hash.startsWith('#section/')){
  observatory.close(false);
  $('landing').hidden=true;$('gallery-page').hidden=true;$('atlas-page').hidden=true;
  let blockId=null,n=Number(hash.split('/')[1]),saved=null;
  try{blockId=hash.split('/')[2]?decodeURIComponent(hash.split('/')[2]):null;}catch{}
  if(hash==='#resume'){saved=readStorage(ANCHOR_STORAGE,null);n=saved?.page||getProgress(book.totalPages).page;blockId=saved?.blockId||null;}
  if(hash.startsWith('#section/')){const section=book.sections.find(s=>s.id===hash.split('/')[1]);if(!section){toast('Раздел не найден.');return;}n=section.startPage;try{await observatory.ensureReady();blockId=observatory.getEntry(section.id)?.source.blockId||null;}catch{}if(serial!==routeSerial)return;}
  await reader.open(n||getProgress(book.totalPages).page,blockId);if(serial!==routeSerial)return;if(saved)requestAnimationFrame(()=>reader.restoreAnchor(saved));document.title='Эволюция физики — '+pageLabel(reader.currentPage);
 }else if(hash==='#atlas'||hash==='#lab'){
  observatory.close(false);reader.close();$('landing').hidden=true;$('gallery-page').hidden=true;
  try{await observatory.showAtlas();if(serial!==routeSerial)return;window.scrollTo(0,0);if(hash==='#lab')requestAnimationFrame(()=>$('laboratory').scrollIntoView());document.title='Атлас идей — Эволюция физики';}catch(e){$('landing').hidden=false;toast(e.message);}
 }else if(hash==='#gallery'){
  observatory.close(false);reader.close();$('landing').hidden=true;$('atlas-page').hidden=true;$('gallery-page').hidden=false;renderGallery();window.scrollTo(0,0);document.title='Иллюстрации — Эволюция физики';
 }else{
  observatory.close(false);reader.close();$('gallery-page').hidden=true;$('atlas-page').hidden=true;$('landing').hidden=false;document.title='Эволюция физики — Эйнштейн × Инфельд';
  if(hash==='#chapters'||hash==='#edition')requestAnimationFrame(()=>$(hash.slice(1)).scrollIntoView());else if(!hash)window.scrollTo(0,0);
 }
}
window.addEventListener('hashchange',route);
async function init(){try{const response=await fetch('./content/book.json');if(!response.ok)throw Error('Содержание книги не загружено.');book=await response.json();if(!Array.isArray(book.pages)||!Array.isArray(book.sections)||!book.sections.length)throw Error('Содержание книги недоступно.');book.figures??=[];book.totalPages??=book.pages.length;reader=createReader(book,{openSearch,openImage,openProvenance:provenance,onProgress:p=>{updateResume(p);observatory?.setContext(p.page);}});observatory=createObservatory(book,reader,{openImage});observatory.ready.catch(e=>toast(e.message));renderLanding();route();}catch(error){$('chapter-cards').innerHTML=`<div class="load-error"><h3>Не удалось открыть книгу.</h3><p>${esc(error.message)}</p><button class="button primary" id="retry-book">Повторить загрузку</button></div>`;$('retry-book').onclick=init;toast('Книга не загрузилась. Нажмите «Повторить загрузку» в содержании.');}}
init();
