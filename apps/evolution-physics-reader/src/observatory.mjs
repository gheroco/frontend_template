import { $, icon, escapeHTML as esc, assetPath, sectionForPage, readStorage, toast } from './core.mjs';
import { motionEnabled, setMotion, subscribeMotion } from './motion.mjs';

let dataPromise;
export function loadCompanion(){
  dataPromise ??= fetch('./companion/companion.json').then(r=>{if(!r.ok)throw Error('Объяснения не загрузились.');return r.json();}).catch(e=>{dataPromise=null;throw e;});
  return dataPromise;
}
export const lessonLink = entry => `#read/${entry.source.page}${entry.source.blockId?'/'+encodeURIComponent(entry.source.blockId):''}`;
const conceptGroups = [
  { label:'I · МЕХАНИКА', title:'От движения к энергии', nodes:[['Инерция','section-02','Сила изменяет скорость'],['Векторы','section-03','Направление становится существенным'],['Энергия','section-07','Движение связано с нагревом']] },
  { label:'II · СВЕТ И ВОЛНЫ', title:'Пределы механической картины', nodes:[['Электричество','section-11','Заряды и взаимодействия'],['Волны','section-17','Перенос изменения состояния'],['Эфир','section-20','Граница механической аналогии']] },
  { label:'III · ПОЛЕ И ОТНОСИТЕЛЬНОСТЬ', title:'Новое описание пространства', nodes:[['Поле','section-21','Состояние в каждой точке'],['Пространство-время','section-27','Согласование часов и расстояний'],['Тяготение','section-31','Локальное сравнение с ускорением']] },
  { label:'IV · КВАНТЫ', title:'От непрерывности к вероятности', nodes:[['Кванты света','section-37','Порции энергии'],['Волны вещества','section-39','Дифракция частиц'],['Вероятность','section-40','Законы распределения результатов']] }
];
const connections=[['Векторы','Поле','Направление силы можно задать в каждой точке.','section-03','section-21'],['Волны','Кванты света','Волновые и корпускулярные свойства требуют общего объяснения.','section-17','section-37'],['Энергия','Кванты света','Обмен энергией получает порционный характер.','section-07','section-37'],['Пространство-время','Тяготение','Геометрия становится частью описания гравитации.','section-27','section-31'],['Волны вещества','Вероятность','Волновую величину связывают с распределением результатов.','section-39','section-40']];

export function createObservatory(book, reader, {openImage}) {
  let data=null,currentPage=1,selected=null,mode='explain',opened=false,disposeExperiment=null,renderSerial=0,lastFocus=null;
  const root=$('reader');
  const panel=document.createElement('aside');panel.id='companion-panel';panel.className='companion-panel';panel.hidden=true;panel.setAttribute('aria-label','Объяснения и эксперименты');
  panel.innerHTML=`<header class="companion-header"><span class="eyebrow">РЯДОМ С КНИГОЙ</span><button class="icon-button" id="close-companion" aria-label="Закрыть объяснение">${icon('close')}</button></header><nav class="companion-tabs" aria-label="Материал к разделу"><button data-companion-tab="explain" aria-current="page">Объяснение</button><button data-companion-tab="experiment" hidden>Эксперимент</button></nav><div id="companion-body" tabindex="0"></div>`;
  root.querySelector('.reader-workspace').append(panel);
  const ensureReady=async()=>{data=await loadCompanion();if(!$('atlas-page').children.length)renderAtlas();return data;};
  const ready=ensureReady();
  function entryFor(n){const section=sectionForPage(book,n),topics=data?.entries.filter(e=>e.sectionId===section?.id&&e.id!==section?.id&&n>=e.source.page&&n<=e.source.endPage);return topics?.[0]||data?.entries.find(e=>e.id===section?.id);}
  function choose(n){currentPage=n;const entry=entryFor(n);if(!entry)return;if(selected?.id!==entry.id){selected=entry;mode='explain';if(opened)render();}}
  async function render(){
    const serial=++renderSerial;disposeExperiment?.();disposeExperiment=null;
    const entry=selected,body=$('companion-body');if(!entry)return;
    panel.querySelector('[data-companion-tab="experiment"]').hidden=!entry.experiment;
    panel.querySelectorAll('[data-companion-tab]').forEach(b=>{if(b.dataset.companionTab===mode)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    body.scrollTop=0;
    if(mode==='experiment'&&entry.experiment){body.innerHTML='<p class="companion-loading" role="status">Открываем эксперимент…</p>';try{const {mountExperiment}=await import('./experiments.mjs');if(serial!==renderSerial)return;disposeExperiment=mountExperiment(body,entry.experiment,{sourceLink:lessonLink(entry),references:data.references});}catch{body.innerHTML='<p>Эксперимент не загрузился.</p><button class="button" data-retry-experiment>Повторить</button>';}return;}
    const figures=book.figures.filter(f=>Number(f.page)>=entry.source.page&&Number(f.page)<=entry.source.endPage).slice(0,2);
    body.innerHTML=`<div class="lesson-kicker"><span>ОБЪЯСНЕНИЕ</span><span>${esc(book.pages.find(p=>p.number===entry.source.page)?.printedPage!=null?'стр. '+book.pages.find(p=>p.number===entry.source.page).printedPage:'лист '+entry.source.page)}</span></div><h2 class="lesson-title">${esc(entry.title)}</h2><p class="lesson-summary">${esc(entry.summary)}</p><p class="companion-attribution">${esc(entry.attribution)}</p><a class="lesson-source" href="${lessonLink(entry)}">${icon('book')} Исходный фрагмент ${icon('arrow')}</a><details class="lesson-detail"><summary>Разобраться глубже ${icon('plus')}</summary>${entry.reasoning.map(p=>`<p>${esc(p)}</p>`).join('')}</details><div class="misconception"><span class="eyebrow">ТОЧНОСТЬ МЫСЛИ</span><p>${esc(entry.misconception)}</p></div>${entry.experiment?`<button class="experiment-launch" data-companion-tab="experiment"><span>${icon('focus')} ПРОВЕРИТЬ В ЭКСПЕРИМЕНТЕ</span><strong>Измените условие.<br>Посмотрите на результат.</strong>${icon('arrow')}</button>`:''}${figures.length?`<div class="lesson-figures"><span class="eyebrow">ОРИГИНАЛЬНЫЕ ИЛЛЮСТРАЦИИ</span>${figures.map(f=>`<a href="#figure/${esc(f.id)}"><img src="${assetPath(f.src)}" alt="${esc(f.caption)}" loading="lazy" width="${f.width}" height="${f.height}"><span>${esc(f.caption)} ${icon('plus')}</span></a>`).join('')}</div>`:''}<details class="reflection"><summary>Вопрос для себя ${icon('plus')}</summary><p>${esc(entry.question)}</p></details><a class="quiet-link" href="#atlas">Карта связей между идеями ${icon('arrow')}</a>`;
    // Modern mathematical notation is explicitly separate from original prose.
    if(entry.experiment){const refs=data.references.filter(r=>(entry.experiment==='waves'&&r.id==='waves')||(entry.experiment==='photoelectric'&&['photoelectric','constants'].includes(r.id)));if(refs.length){const aside=document.createElement('details');aside.className='modern-note';aside.innerHTML=`<summary>Современное примечание</summary><p>Формулы и обозначения в объяснении и опыте — современный учебный комментарий. Они не заменяют формулировки книги.</p>${refs.map(r=>`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)} ↗</a>`).join('')}`;body.append(aside);}}
  }
  async function open(id=null,newMode='explain'){
    lastFocus=document.activeElement;
    try{await ensureReady();}catch(e){toast(e.message+' Нажмите «Объяснение», чтобы повторить.');return;}
    selected=(id&&data.entries.find(e=>e.id===id))||entryFor(reader.currentPage);mode=newMode;
    if(!selected){toast('Объяснение этого раздела не найдено.');return;}
    reader.preserveLayout(()=>{if(innerWidth<1350)reader.collapseNav();root.classList.remove('focus-reading');$('focus-toggle').setAttribute('aria-pressed','false');opened=true;panel.hidden=false;root.classList.add('has-companion');$('explain-current')?.setAttribute('aria-expanded','true');});
    await render();$('close-companion').focus({preventScroll:true});
  }
  function close(restoreFocus=true){
    renderSerial++;disposeExperiment?.();disposeExperiment=null;
    if(!opened)return;reader.preserveLayout(()=>{opened=false;panel.hidden=true;root.classList.remove('has-companion');$('explain-current')?.setAttribute('aria-expanded','false');});
    if(restoreFocus&&(lastFocus?.isConnected))lastFocus.focus({preventScroll:true});
  }
  panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='close-companion')close();if(b.dataset.companionTab){mode=b.dataset.companionTab;render();}if(b.hasAttribute('data-retry-experiment'))render();});
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
  function renderAtlas(){
    const page=$('atlas-page');
    page.innerHTML=`<header class="gallery-header wrap"><a class="brand" href="#"><img src="./favicon.svg" width="34" height="34" alt=""><span>ЭВОЛЮЦИЯ<small>ФИЗИКИ</small></span></a><a class="quiet-link" href="#resume">${icon('book')} Вернуться к чтению</a></header><main class="atlas-main wrap"><div class="section-heading"><div><span class="eyebrow">АТЛАС ИДЕЙ · ЧЕТЫРЕ ГЛАВЫ</span><h1>У каждой идеи<br><em>есть продолжение.</em></h1></div><p>Выберите понятие и вернитесь к его<br>исходному рассуждению в книге.</p></div><div class="atlas-switch"><button data-atlas-view="map" aria-pressed="true">Карта</button><button data-atlas-view="list" aria-pressed="false">Список</button></div><div id="concept-map" class="concept-map">${conceptGroups.map((g,i)=>`<section class="concept-lane"><span class="eyebrow">${g.label}</span><h2>${g.title}</h2>${g.nodes.map(([title,id,desc],j)=>`<a class="concept-node" href="#learn/${id}"><span class="concept-index">${i+1}.${j+1}</span><div><h3>${title}</h3><p>${desc}</p></div>${icon('arrow')}</a>`).join('')}</section>`).join('')}</div><div id="concept-list" class="concept-list" hidden>${conceptGroups.map(g=>`<section><h2>${g.label}</h2>${g.nodes.map(([title,id,desc])=>`<a href="#learn/${id}"><strong>${title}</strong><span>${desc}</span>${icon('arrow')}</a>`).join('')}</section>`).join('')}</div><section class="concept-connections"><span class="eyebrow">МОСТЫ МЕЖДУ ГЛАВАМИ</span><div>${connections.map(([a,b,desc,aid,bid])=>`<article><p><a href="#learn/${aid}">${a}</a><span>→</span><a href="#learn/${bid}">${b}</a></p><small>${desc}</small></article>`).join('')}</div></section><section class="laboratory" id="laboratory"><div class="section-heading"><div><span class="eyebrow">ЛАБОРАТОРИЯ · ШЕСТЬ МЫСЛЕННЫХ ОПЫТОВ</span><h2>Понять —<br><em>изменив условие.</em></h2></div><p>Расчётные модели, связанные с текстом.<br>У каждого опыта есть границы применимости.</p></div><div class="lab-grid">${[['frames','01','Системы отсчёта','Два наблюдателя. Одна скорость?'],['waves','02','Волна','Что движется вместе с гребнем?'],['fields','03','Электрическое поле','Один знак меняет всю картину.'],['lightclock','04','Световые часы','Почему расходятся интервалы?'],['elevator','05','Лифт Эйнштейна','Тяготение или ускорение?'],['photoelectric','06','Кванты света','Когда яркости недостаточно.']].map(([id,n,title,desc])=>`<a class="lab-card" href="#experiment/${id}"><span class="eyebrow">ОПЫТ ${n}</span><h3>${title}</h3><p>${desc}</p>${icon('arrow')}</a>`).join('')}</div></section></main>`;
    page.querySelectorAll('[data-atlas-view]').forEach(button=>button.addEventListener('click',()=>{const list=button.dataset.atlasView==='list';$('concept-map').hidden=list;$('concept-list').hidden=!list;page.querySelectorAll('[data-atlas-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
  }
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.id==='explain-current')opened&&!root.classList.contains('focus-reading')?close():open();if(b?.matches('[data-motion]'))setMotion(!motionEnabled());});
  function motionLabels(){document.querySelectorAll('button[data-motion]').forEach(b=>{b.setAttribute('aria-pressed',String(!motionEnabled()));b.setAttribute('aria-label',motionEnabled()?'Отключить движение':'Включить движение');const s=b.querySelector('span');if(s)s.textContent=motionEnabled()?'Движение вкл.':'Движение выкл.';});}
  subscribeMotion(motionLabels);motionLabels();
  return {ready,ensureReady,open,close,setContext:choose,getEntry:id=>data?.entries.find(e=>e.id===id),getEntries:()=>data?.entries||[],showAtlas:async()=>{await ensureReady();$('atlas-page').hidden=false;},get isOpen(){return opened;}};
}
