import {$,icon,escapeHTML as esc,assetPath,readStorage,writeStorage,safeProgress,clampPage,sectionForPage,toggleTheme,toast} from './core.mjs';
const STORAGE='evolution-native-progress-v2';
export const ANCHOR_STORAGE='evolution-reading-anchor-v3';
const pageCache=new Map();
export function getProgress(total){return safeProgress(readStorage(STORAGE,null),total);}
export async function fetchPage(book,n){
 if(pageCache.has(n))return pageCache.get(n);
 const meta=book.pages.find(p=>Number(p.number)===Number(n));
 const path=assetPath(meta?.path||`content/pages/${String(n).padStart(3,'0')}.json`);
 if(!path)throw Error('Неверный путь страницы.');
 const promise=fetch(path).then(r=>{if(!r.ok)throw Error(`Страница ${n} не загружена (${r.status}).`);return r.json();}).then(page=>{if(!Array.isArray(page.blocks))throw Error(`Страница ${n}: отсутствует текст.`);return page;}).catch(e=>{pageCache.delete(n);throw e;});
 pageCache.set(n,promise);return promise;
}
function inlineHTML(block){
 if(!block.html)return esc(block.text??'');
 const doc=new DOMParser().parseFromString(String(block.html),'text/html');
 const allowed=new Set(['EM','STRONG','I','B','SUP','SUB','BR','SPAN','SMALL','TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','CAPTION','COLGROUP','COL']);
 if(block.type==='table'||block.type==='diagram'){allowed.add('P');allowed.add('DIV');}
 function clean(node){
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
  if(node.nodeType!==Node.ELEMENT_NODE)return document.createTextNode('');
  if(['SCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName))return document.createTextNode('');
  const el=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):document.createDocumentFragment();
  if(node.tagName==='SPAN'&&node.classList.contains('source-spaced'))el.className='source-spaced';
  if(['TH','TD'].includes(node.tagName)){for(const name of ['colspan','rowspan']){const value=node.getAttribute(name);if(value&&/^[1-9][0-9]?$/.test(value))el.setAttribute(name,value);}if(['row','col','rowgroup','colgroup'].includes(node.getAttribute('scope')))el.setAttribute('scope',node.getAttribute('scope'));}
  for(const child of node.childNodes)el.append(clean(child));
  return el;
 }
 const container=document.createElement('div');for(const child of doc.body.childNodes)container.append(clean(child));return container.innerHTML;
}
export function createReader(book,callbacks){
 const root=$('reader');let currentSection=null,currentPage=1,loadSerial=0,scrollFrame=0,pages=[],openState=false,scrollLock=false,sidebarTab='contents',anchorTimer=0;
 const comparedPages=new Set((book.verification?.wholePageComparisonPages||[]).map(Number));
 let progress=getProgress(book.totalPages),fontSize=Math.min(28,Math.max(16,Number(readStorage('evolution-font-size',21))||21));
 const sourceLabel=meta=>meta?.printedPage!=null&&meta.printedPage!==''?`Стр. ${meta.printedPage}`:`Лист ${meta?.number??''}`;
 function pageMeta(n){return book.pages.find(p=>Number(p.number)===Number(n));}
 function subsectionsFor(section){return (book.subsections||[]).filter(s=>s.sectionId===section.id||(s.sectionId==null&&Number(s.page)>=Number(section.startPage)&&Number(s.page)<=Number(section.endPage))).filter(s=>pageMeta(Number(s.page))).sort((a,b)=>Number(a.page)-Number(b.page));}
 function subsectionLink(s,side=false){const n=Number(s.page),blockId=String(s.blockId||''),hash=`#read/${n}${blockId?'/'+encodeURIComponent(blockId):''}`;return `<a href="${esc(hash)}" class="${side?'toc-subsection':'subsection-link'}" data-subsection-page="${n}" data-subsection-block="${esc(blockId)}"><span>${esc(s.title)}</span><small>${esc(pageMeta(n)?.printedPage??n)}</small></a>`;}
 root.innerHTML=`<header class="reader-header"><a class="reader-brand" href="#" aria-label="На главную"><img src="./favicon.svg" width="32" height="32" alt=""><span>ЭВОЛЮЦИЯ ФИЗИКИ<small>ЭЙНШТЕЙН × ИНФЕЛЬД</small></span></a><span id="reader-chapter" class="reader-chapter"></span><div class="reader-header-actions"><button class="icon-button" data-search-reader aria-label="Поиск по книге">${icon('search')}</button><a class="icon-button" href="#atlas" aria-label="Атлас идей">${icon('focus')}</a><button class="icon-button" data-motion aria-label="Отключить движение" aria-pressed="false">${icon('pause')}</button><a class="icon-button gallery-link" href="#gallery" aria-label="Иллюстрации">${icon('image')}</a><button class="icon-button" data-theme-reader aria-label="Сменить тему">${icon('sun')}</button><a class="icon-button" href="#" aria-label="Закрыть читальный зал">${icon('close')}</a></div></header><div class="reader-workspace"><button id="sidebar-scrim" aria-label="Закрыть содержание" hidden></button><aside id="sidebar" aria-label="Навигация по книге"><div class="sidebar-heading"><span class="eyebrow">КАРТА КНИГИ</span><button class="icon-button mobile-only" data-sidebar-close aria-label="Закрыть содержание">${icon('close')}</button></div><div class="sidebar-tabs" role="tablist" aria-label="Навигация"><button id="contents-tab" role="tab" aria-selected="true" aria-controls="side-content" data-side-tab="contents">Содержание</button><button id="bookmarks-tab" role="tab" aria-selected="false" aria-controls="side-content" data-side-tab="bookmarks">Закладки <span id="bookmark-count"></span></button></div><div id="side-content" role="tabpanel" aria-labelledby="contents-tab" class="side-content"></div><div class="sidebar-footer"><a class="quiet-link" href="#atlas">Атлас идей ${icon('arrow')}</a><span>${book.totalPages} ЛИСТОВ ИСХОДНОГО ФАЙЛА</span><button class="quiet-link" data-provenance-reader>Источники и транскрипция ${icon('external')}</button></div></aside><div class="reading-area"><div class="reader-toolbar"><div class="toolbar-group"><button class="icon-button" id="sidebar-toggle" aria-label="Показать или скрыть содержание" aria-expanded="true">${icon('menu')}</button><span class="toolbar-separator"></span><button class="type-control" id="font-minus" aria-label="Уменьшить шрифт">А−</button><button class="type-control" id="font-plus" aria-label="Увеличить шрифт">А+</button><button class="icon-button" id="focus-toggle" aria-label="Режим сосредоточенного чтения" aria-pressed="false">${icon('focus')}</button></div><div class="toolbar-group"><button id="explain-current" class="explain-button" aria-label="Открыть объяснение текущего раздела" aria-expanded="false" aria-controls="companion-panel">${icon('focus')}<span>Объяснение</span></button><button id="source-current" class="text-button" aria-label="Сравнить текущую страницу с оригиналом">${icon('source')}<span>Оригинал страницы</span></button><button id="bookmark-current" class="icon-button" aria-label="Добавить закладку" aria-pressed="false">${icon('bookmark')}</button></div></div><div id="reading-scroll" class="reading-scroll" tabindex="0" aria-label="Текст книги"><div id="reader-content" class="reader-content"></div></div><div class="reader-bottom"><button class="icon-button" id="previous-page" aria-label="Предыдущая страница">${icon('arrow')}</button><form id="page-jump" class="page-jump"><label for="page-number">Лист</label><input id="page-number" type="number" inputmode="numeric" min="1" max="${book.totalPages}" value="1" aria-label="Номер листа исходного издания"><span>/ ${book.totalPages}</span><button class="icon-button" type="submit" aria-label="Перейти к странице">${icon('return')}</button></form><button class="icon-button" id="next-page" aria-label="Следующая страница">${icon('arrow')}</button><span id="reading-percent" class="reading-percent">0%</span><div class="reading-progress" aria-hidden="true"><div id="reading-progress-fill"></div></div></div></div></div>`;
 const scroll=$('reading-scroll'),content=$('reader-content');content.style.setProperty('--reading-size',fontSize+'px');
 function captureAnchor(){
  const top=scroll.getBoundingClientRect().top;
  const blocks=[...content.querySelectorAll('.source-text>[id]')];
  const el=blocks.find(el=>el.getBoundingClientRect().bottom>top+24)||blocks.at(-1);
  if(!el)return null;
  const n=Number(el.closest('[data-page]').dataset.page);
  return {page:n,blockId:el.id.slice(('b-'+n+'-').length),offset:el.getBoundingClientRect().top-top};
 }
 function restoreAnchor(anchor){
  if(!anchor)return;const el=$('b-'+anchor.page+'-'+anchor.blockId);if(!el)return;
  scroll.scrollTop+=el.getBoundingClientRect().top-scroll.getBoundingClientRect().top-anchor.offset;
 }
 function remember(){if(!openState)return;const anchor=captureAnchor();if(anchor)writeStorage(ANCHOR_STORAGE,anchor);}
 function preserveLayout(change){
  if(!openState){change();return;}
  const anchor=captureAnchor();scrollLock=true;change();
  requestAnimationFrame(()=>{restoreAnchor(anchor);scrollLock=false;remember();});
 }
 function save(){progress.page=currentPage;writeStorage(STORAGE,progress);callbacks.onProgress?.(progress);}
 function updateProgress(n,replaceHash=true){
  currentPage=clampPage(n,book.totalPages);const meta=pageMeta(currentPage),section=sectionForPage(book,currentPage);$('page-number').value=currentPage;
  $('previous-page').disabled=currentPage<=1;$('next-page').disabled=currentPage>=book.totalPages;
  const pct=Math.round(currentPage/book.totalPages*100);$('reading-percent').textContent=pct+'%';$('reading-progress-fill').style.width=pct+'%';
  $('source-current').title=sourceLabel(meta)+' — сравнить с оригиналом';
  const bookmarked=progress.bookmarks.includes(currentPage);$('bookmark-current').setAttribute('aria-pressed',String(bookmarked));$('bookmark-current').setAttribute('aria-label',bookmarked?'Удалить закладку':'Добавить закладку');
  root.querySelectorAll('[data-toc-page]').forEach(a=>{const selected=a.dataset.section===section?.id;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
  if(replaceHash&&openState)history.replaceState(null,'',`#read/${currentPage}`);save();
 }
 function sidebar(){
  $('bookmark-count').textContent=progress.bookmarks.length||'';
  root.querySelectorAll('[data-side-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.sideTab===sidebarTab));b.tabIndex=b.dataset.sideTab===sidebarTab?0:-1;});
  $('side-content').setAttribute('aria-labelledby',sidebarTab==='contents'?'contents-tab':'bookmarks-tab');
  if(sidebarTab==='bookmarks'){
   $('side-content').innerHTML=progress.bookmarks.length?progress.bookmarks.map(n=>`<div class="bookmark-row"><a href="#read/${n}" class="bookmark-entry"><span>${esc(sourceLabel(pageMeta(n)))}</span><strong>${esc(sectionForPage(book,n)?.title||pageMeta(n)?.title||'Страница книги')}</strong></a><button class="icon-button" data-remove-bookmark="${n}" aria-label="Удалить закладку: ${esc(sourceLabel(pageMeta(n)))}">${icon('close')}</button></div>`).join(''):'<div class="empty-bookmarks">'+icon('bookmark')+'<h3>Сохраните мысль.</h3><p>Нажмите на значок закладки во время чтения, чтобы вернуться к странице.</p></div>';
  }else{
   let last='';$('side-content').innerHTML=book.sections.map(s=>{const group=s.chapter||'Материалы издания';let h='';if(group!==last){last=group;h=`<div class="toc-group">${esc(typeof group==='number'?`ГЛАВА ${group}`:group)}</div>`;}const topics=s.id===currentSection?.id?subsectionsFor(s):[];return h+`<a class="toc-entry${s.id===currentSection?.id?' active':''}" href="#read/${s.startPage}" data-toc-page="${s.startPage}" data-section="${esc(s.id)}"><span>${esc(s.title)}</span><small>${esc(pageMeta(Number(s.startPage))?.printedPage??s.startPage)}</small></a>`+(topics.length?`<div class="toc-subsections">${topics.map(t=>subsectionLink(t,true)).join('')}</div>`:'');}).join('');
  }
 }
 function setSidebar(visible){
  const mobile=matchMedia('(max-width: 900px)').matches;
  $('sidebar').inert=!visible;
  $('sidebar').setAttribute('role',mobile&&visible?'dialog':'complementary');
  if(mobile&&visible){$('sidebar').setAttribute('aria-modal','true');requestAnimationFrame(()=>$('contents-tab').focus());}else $('sidebar').removeAttribute('aria-modal');
root.classList.toggle('sidebar-closed',!visible);$('sidebar-toggle').setAttribute('aria-expanded',String(visible));$('sidebar-scrim').hidden=!visible||!matchMedia('(max-width: 900px)').matches;}
 function blockHTML(block,n,index){
  const id=`b-${n}-${esc(block.id||('block-'+index))}`;
  if(['figure','formula','ornament','diagram','plate','image'].includes(block.type)&&block.src){
   const src=assetPath(block.src);if(!src)return `<p class="content-error">Не удалось определить путь иллюстрации.</p>`;
   const caption=String(block.caption??''),alt=block.alt||caption|| (block.type==='formula'?'Формула из исходного издания':'Иллюстрация из исходного издания');
   return `<figure class="book-figure ${block.type==='formula'?'book-formula':''}" id="${id}"><button class="figure-open" data-block-image="${esc(block.id||'')}" data-source-page="${n}" aria-label="Увеличить: ${esc(alt)}"><img src="${src}" alt="${esc(alt)}" ${block.width?`width="${Number(block.width)}"`:''} ${block.height?`height="${Number(block.height)}"`:''} loading="lazy" decoding="async"><span class="figure-zoom">${icon('plus')}<span>Рассмотреть</span></span></button>${caption?`<figcaption>${esc(caption)}</figcaption>`:''}</figure>`;
  }
  let text=inlineHTML(block);if(!text)return '';
  if(block.printedPageTarget!=null){text=esc(block.text??'');const target=book.pages.find(p=>String(p.printedPage)===String(block.printedPageTarget)&&!p.duplicateOf);if(target)text=`<a class="source-reference" href="#read/${target.number}">${text}</a>`;}
  if(block.type==='table'){
   if(pageMeta(n)?.kind==='name_index'){
    const table=new DOMParser().parseFromString(text,'text/html');
    for(const cell of table.querySelectorAll('td')){
     const original=cell.textContent;cell.replaceChildren();let last=0;
     for(const match of original.matchAll(/\d+/g)){
      cell.append(document.createTextNode(original.slice(last,match.index)));
      const target=book.pages.find(p=>String(p.printedPage)===match[0]&&!p.duplicateOf);
      if(target){const a=document.createElement('a');a.className='source-reference';a.href=`#read/${target.number}`;a.textContent=match[0];a.title=`Перейти к печатной странице ${match[0]}`;cell.append(a);}else cell.append(document.createTextNode(match[0]));
      last=match.index+match[0].length;
     }
     cell.append(document.createTextNode(original.slice(last)));
    }
    text=table.body.innerHTML;
   }
   return `<div class="book-table" id="${id}" tabindex="0" aria-label="Таблица из книги">${text}</div>`;
  }
  if(block.type==='heading')return `<h3 class="source-heading" id="${id}">${text}</h3>`;
  if(block.type==='page-number')return `<div class="source-page-number" id="${id}">${text}</div>`;
  if(block.type==='note')return `<p class="source-note-text" id="${id}">${text}</p>`;
  return `<p id="${id}" class="${block.type==='formula'?'text-formula ':''}${block.align==='center'?'source-center':block.align==='right'?'source-right':''}">${text}</p>`;
 }
 function pageHTML(page){
  const n=Number(page.number),meta=pageMeta(n);const body=page.blocks.map((b,i)=>blockHTML(b,n,i)).join('');
  return `<section class="source-page" id="page-${n}" data-page="${n}" aria-label="${esc(sourceLabel(meta))}"><div class="page-marker"><span>${esc(sourceLabel(meta))}</span><b></b><button data-compare-page="${n}" aria-label="Сравнить с оригиналом: ${esc(sourceLabel(meta))}">${icon('source')}<span>Сверить с оригиналом</span></button></div><div class="page-verification">${page.kind==='blank'?'Пустая страница исходного файла':page.transcriptionStatus==='manually-proofread'?'Ручная транскрипция · возможны остаточные ошибки':page.transcriptionStatus==='source-compared'||comparedPages.has(n)?'Сверено со сканом · возможны остаточные ошибки':'Распознанный текст · возможны ошибки'}${page.duplicateOf?` · Повтор листа ${Number(page.duplicateOf)}`:''}</div>${n===268?'<aside class="transcription-uncertain"><strong>Примечание к транскрипции.</strong> В слове «независимо» повреждены буквы «ви». Существующая транскрипция восстановлена по контексту; точное чтение остаётся неподтверждённым. <button data-compare-page="268">Открыть скан</button></aside>':''}<div class="source-text">${Array.isArray(page.sourceHeader)&&page.sourceHeader.length?`<div class="source-running-header">${page.sourceHeader.map(h=>esc(h.text||'')).join('<br>')}</div>`:''}${body||'<p class="editorial-note">[Эта страница исходного издания не содержит текста.]</p>'}</div></section>`;
 }
 function scrollToPage(n,smooth=false,blockId=null){
  const target=(blockId&&$(`b-${n}-${blockId}`))||$(`page-${n}`);if(!target)return;scrollLock=true;scroll.scrollTo({top:Math.max(0,target.getBoundingClientRect().top-scroll.getBoundingClientRect().top+scroll.scrollTop-20),behavior:smooth?'smooth':'instant'});updateProgress(n,!blockId);if(blockId&&openState)history.replaceState(null,'',`#read/${n}/${encodeURIComponent(blockId)}`);setTimeout(()=>{scrollLock=false;remember();},smooth?600:50);if(blockId){content.querySelectorAll('.passage-target').forEach(el=>el.classList.remove('passage-target'));target.classList.add('passage-target');}
 }
 async function open(n,blockId=null){
  n=clampPage(n,book.totalPages);openState=true;root.hidden=false;document.body.classList.add('reading');
  const section=sectionForPage(book,n)||book.sections[0];if(!section){content.innerHTML='<div class="reader-error"><h2>Содержание ещё не доступно.</h2><p>Обновите страницу, чтобы попробовать снова.</p></div>';return;}
  if(currentSection?.id===section.id&&pages.length){scrollToPage(n,false,blockId);return;}
  const token=++loadSerial;currentSection=section;pages=[];sidebar();if(matchMedia('(max-width:900px)').matches)setSidebar(false);
  $('reader-chapter').textContent=typeof section.chapter==='number'?`ГЛАВА ${section.chapter}`:section.chapter||'МАТЕРИАЛЫ ИЗДАНИЯ';
  content.innerHTML='<div class="reader-loading" role="status"><span class="loader"></span><p>Открываем раздел…</p></div>';
  try{
   const metas=book.pages.filter(p=>p.sectionId===section.id||(Number(p.number)>=Number(section.startPage)&&Number(p.number)<=Number(section.endPage)));
   const loaded=await Promise.all(metas.map(p=>fetchPage(book,Number(p.number))));if(token!==loadSerial||!openState)return;pages=loaded;
   const idx=book.sections.findIndex(s=>s.id===section.id),prev=book.sections[idx-1],next=book.sections[idx+1],topics=subsectionsFor(section);
   const subnav=topics.length?`<details class="subsection-nav"><summary>Темы раздела <span>${topics.length}</span>${icon('plus')}</summary><nav aria-label="Темы раздела">${topics.map(t=>subsectionLink(t)).join('')}</nav></details>`:'';
   content.innerHTML=`<header class="chapter-heading"><span class="eyebrow">${esc(typeof section.chapter==='number'?`ГЛАВА ${section.chapter}`:section.chapter||'МАТЕРИАЛЫ ИЗДАНИЯ')}</span><h2>${esc(section.title)}</h2><p>${esc(sourceLabel(pageMeta(Number(section.startPage))))} — ${esc(sourceLabel(pageMeta(Number(section.endPage))))}</p><div class="reader-fidelity-note">Текст распознан со сканов и может содержать ошибки. Полная посимвольная сверка не завершена. <button data-provenance-reader>О транскрипции ${icon('external')}</button></div>${subnav}</header>${pages.map(pageHTML).join('')}<nav class="chapter-navigation" aria-label="Соседние разделы">${prev?`<a href="#read/${prev.startPage}"><small>ПРЕДЫДУЩИЙ РАЗДЕЛ</small><span>${esc(prev.title)}</span></a>`:'<span></span>'}${next?`<a href="#read/${next.startPage}"><small>ДАЛЕЕ</small><span>${esc(next.title)} ${icon('arrow')}</span></a>`:'<a href="#"><small>КНИГА ПРОЧИТАНА</small><span>Вернуться к началу '+icon('arrow')+'</span></a>'}</nav>`;
   content.querySelectorAll('.source-text>[id]').forEach(el=>{const page=Number(el.closest('[data-page]').dataset.page),blockId=el.id.slice(('b-'+page+'-').length);const link=document.createElement('a');link.className='passage-permalink';link.href='#read/'+page+'/'+encodeURIComponent(blockId);link.setAttribute('aria-label','Ссылка на этот фрагмент, лист '+page);link.innerHTML=icon('external');el.append(link);});
   content.style.setProperty('--reading-size',fontSize+'px');await document.fonts.ready;if(token!==loadSerial)return;
   updateProgress(n);requestAnimationFrame(()=>{if(token===loadSerial&&openState)scrollToPage(n,false,blockId);});
   content.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.closest('figure').classList.add('image-failed');img.alt+=' — изображение не загрузилось';}));
  }catch(error){
   if(token!==loadSerial)return;content.innerHTML=`<div class="reader-error"><span class="eyebrow">СТРАНИЦА НЕ ЗАГРУЖЕНА</span><h2>Попробуем ещё раз.</h2><p>${esc(error.message)}</p><button class="button primary" id="retry-section">Загрузить раздел</button></div>`;$('retry-section').onclick=()=>{currentSection=null;open(n);};
  }
 }
 function close(){remember();openState=false;loadSerial++;root.hidden=true;document.body.classList.remove('reading');}
 async function compare(n){const page=await fetchPage(book,n);const meta=pageMeta(n);callbacks.openImage({src:page.sourceImage||meta?.sourceImage,title:sourceLabel(meta),caption:`Исходная страница ${n} из ${book.totalPages}. ${meta?.printedPage!=null?`Печатная страница: ${meta.printedPage}.`:''}`,page:n,compare:page.blocks.filter(b=>b.text).map(b=>b.text).join('\n\n'),kind:'source'});}
 root.addEventListener('click',async event=>{
  const b=event.target.closest('button,a');if(!b)return;
  if(b.hasAttribute('data-search-reader'))callbacks.openSearch();
  if(b.hasAttribute('data-theme-reader'))toggleTheme();
  if(b.hasAttribute('data-provenance-reader'))callbacks.openProvenance();
  if(b.dataset.sideTab){sidebarTab=b.dataset.sideTab;sidebar();}
  if(b.hasAttribute('data-sidebar-close')||b.id==='sidebar-scrim'){setSidebar(false);$('sidebar-toggle').focus();}
  if(b.id==='sidebar-toggle')preserveLayout(()=>setSidebar(root.classList.contains('sidebar-closed')));
  if(b.id==='focus-toggle')preserveLayout(()=>{root.classList.toggle('focus-reading');b.setAttribute('aria-pressed',String(root.classList.contains('focus-reading')));});
  if(b.id==='font-plus'||b.id==='font-minus')preserveLayout(()=>{fontSize=Math.min(28,Math.max(16,fontSize+(b.id==='font-plus'?1:-1)));content.style.setProperty('--reading-size',fontSize+'px');writeStorage('evolution-font-size',fontSize);});
  if(b.id==='bookmark-current'){
   if(progress.bookmarks.includes(currentPage)){progress.bookmarks=progress.bookmarks.filter(n=>n!==currentPage);toast('Закладка удалена.');}else{progress.bookmarks.push(currentPage);progress.bookmarks.sort((a,b)=>a-b);toast('Страница сохранена в закладках.');}updateProgress(currentPage);sidebar();
  }
  if(b.dataset.removeBookmark){progress.bookmarks=progress.bookmarks.filter(n=>n!==Number(b.dataset.removeBookmark));save();sidebar();updateProgress(currentPage);}
  if(b.id==='previous-page')location.hash=`read/${currentPage-1}`;
  if(b.id==='next-page')location.hash=`read/${currentPage+1}`;
  if(b.dataset.comparePage||b.id==='source-current'){try{await compare(Number(b.dataset.comparePage||currentPage));}catch(e){toast(e.message);}}
  if(b.hasAttribute('data-block-image')){
   const page=pages.find(p=>Number(p.number)===Number(b.dataset.sourcePage)),block=page?.blocks.find(x=>String(x.id||'')===b.dataset.blockImage);if(block)callbacks.openImage({...block,page:Number(page.number),title:block.caption||'Иллюстрация из книги'});
  }
  if(b.hasAttribute('data-subsection-page')&&b.getAttribute('href')===location.hash)await open(Number(b.dataset.subsectionPage),b.dataset.subsectionBlock||null);
  if(b.matches('[data-toc-page],.bookmark-entry,[data-subsection-page]')&&matchMedia('(max-width:900px)').matches)setSidebar(false);
 });
 $('page-jump').addEventListener('submit',event=>{event.preventDefault();location.hash=`read/${clampPage($('page-number').value,book.totalPages)}`;});
 scroll.addEventListener('scroll',()=>{if(scrollFrame||scrollLock||!openState)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;let candidate=Number(currentSection?.startPage)||1;const threshold=scroll.getBoundingClientRect().top+Math.min(scroll.clientHeight*.25,160);for(const el of content.querySelectorAll('[data-page]')){if(el.getBoundingClientRect().top<=threshold)candidate=Number(el.dataset.page);else break;}if(candidate!==currentPage)updateProgress(candidate);clearTimeout(anchorTimer);anchorTimer=setTimeout(remember,180);});},{passive:true});
 root.querySelector('.sidebar-tabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();sidebarTab=sidebarTab==='contents'?'bookmarks':'contents';sidebar();$(sidebarTab==='contents'?'contents-tab':'bookmarks-tab').focus();}});
 root.addEventListener('keydown',event=>{
  if(matchMedia('(max-width:900px)').matches&&!root.classList.contains('sidebar-closed')){
   if(event.key==='Escape'){event.preventDefault();setSidebar(false);$('sidebar-toggle').focus();return;}
   if(event.key==='Tab'){const focusable=[...$('sidebar').querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(el=>el.offsetParent!==null&&el.tabIndex>=0);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  }
  if(event.target.closest('input,button,a'))return;if(event.key==='ArrowLeft'){event.preventDefault();location.hash=`read/${Math.max(1,currentPage-1)}`;}if(event.key==='ArrowRight'){event.preventDefault();location.hash=`read/${Math.min(book.totalPages,currentPage+1)}`;}if(event.key==='Escape'&&!document.querySelector('dialog[open]')){root.classList.remove('focus-reading');$('focus-toggle').setAttribute('aria-pressed','false');setSidebar(false);}});
 matchMedia('(max-width:900px)').addEventListener('change',event=>setSidebar(!event.matches));
 sidebar();setSidebar(!matchMedia('(max-width:900px)').matches);window.addEventListener('pagehide',remember);return {open,close,compare,preserveLayout,restoreAnchor,remember,collapseNav:()=>setSidebar(false),get currentPage(){return currentPage;}};
}
