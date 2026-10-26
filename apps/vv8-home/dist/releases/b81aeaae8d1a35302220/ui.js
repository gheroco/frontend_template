let callback = () => {};
let toastTimer;
let geometryData = {}, roomList = [], selectedRoom = null, evidenceRoom = 'all';
let planSource = 'drawing', planZoom = 'fit';
let studioView = 'living';
let studioRenderer = null;
export function setStudioRenderer(render) { studioRenderer = render; }
const state = { mode: 'dollhouse', dimensions: false, labels: false, furniture: true, walls: 'cutaway', height: 3, measuring: false, lighting: 'daylight' };
const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const emit = (action, value) => callback(value === undefined ? { action } : { action, value });
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const areaText = value => finite(value) ? (Math.round((Number(value)+1e-8)*10)/10).toFixed(1) : '—';
const metres = value => `${Number(value).toFixed(3)} մ`;
const checks = () => Array.isArray(geometryData.dimensionChecks) ? geometryData.dimensionChecks : [];
const basisOf = check => ['drawing','derived','assumed','provided'].includes(check.basis) ? check.basis : finite(check.sourceMM) ? 'drawing' : 'derived';
const polygonArea = points => Array.isArray(points) ? Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2 : 0;
function modelArea() {
  if (finite(geometryData.modelAreaSum)) return Number(geometryData.modelAreaSum);
  if (roomList.length) return roomList.reduce((sum,room)=>sum+(finite(room.area) ? Number(room.area) : polygonArea(room.polygon)),0);
  return Object.values(geometryData.rooms||{}).reduce((sum,room)=>sum+polygonArea(room.polygon),0);
}

function showDialog(id) {
  const dialog = $(id);
  closeSettings();closeSidebar();
  if (!dialog.open) dialog.showModal();
}
function closeSidebar() {
  $('sidebar').classList.remove('is-open');
  $('sidebar-backdrop').hidden = true;
  $('open-sidebar').setAttribute('aria-expanded', 'false');
}
function openSidebar() {
  $('sidebar').classList.add('is-open');
  $('sidebar-backdrop').hidden = false;
  $('open-sidebar').setAttribute('aria-expanded', 'true');
}
function closeSettings() {
  $('settings-panel').hidden = true;
  $('settings-button').setAttribute('aria-expanded', 'false');
}

export function initUI(rooms, onAction, data = {}) {
  callback = onAction;
  roomList = rooms;geometryData = data || {};
  $('room-list').innerHTML = rooms.map(room => `<button class="room-row" data-room="${escape(room.id)}" aria-pressed="false" title="${escape(room.name)} · մոդելի հաշվարկված մակերեսը՝ ${areaText(room.area)} մ²"><span class="room-dot" style="background:${escape(typeof room.color === 'number' ? '#' + room.color.toString(16).padStart(6, '0') : room.color || '#93a185')}"></span><span class="room-copy"><strong>${escape(room.name)}</strong></span><span class="room-area">${areaText(room.area)}<small>մ²</small></span>${icon('chevron')}</button>`).join('');
  document.querySelectorAll('.room-row svg').forEach(el => el.classList.add('room-chevron'));
  document.querySelectorAll('[data-room]').forEach(button => button.addEventListener('click', () => {
    emit('room', button.dataset.room);
    closeSidebar();
  }));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    setMode(mode);
    emit('mode', mode);
    closeSettings();
  }));
  document.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
    const name = button.dataset.toggle;
    state[name] = !state[name];
    button.setAttribute('aria-pressed', String(state[name]));
    emit('toggle', name);
  }));
  document.querySelectorAll('[data-toggle-input]').forEach(input => input.addEventListener('change', () => {
    state[input.dataset.toggleInput] = input.checked;
    emit('toggle', input.dataset.toggleInput);
  }));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    const value = button.dataset.value === undefined ? undefined : Number(button.dataset.value);
    if (action === 'measure') {
      state.measuring = !state.measuring;
      button.setAttribute('aria-pressed', String(state.measuring));
      if (state.measuring) setStatus('Ընտրեք հատակի երկու կետ։');
      else setStatus('');
    }
    if (action === 'clear-measure') setStatus('');
    emit(action, value);
  }));
  document.querySelectorAll('[data-reference]').forEach(button => button.addEventListener('click', () => {setPlanSource('drawing');showDialog('reference-dialog');}));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
    dialog.addEventListener('keydown',event=>event.stopPropagation());
  });
  $('open-accuracy').addEventListener('click', () => showMeasurementEvidence());
  $('selected-room-proof').addEventListener('click', () => showMeasurementEvidence(selectedRoom?.id));
  $('accuracy-to-reference').addEventListener('click', () => { $('accuracy-dialog').close(); setPlanSource('drawing');showDialog('reference-dialog'); });
  $('evidence-room-filter').addEventListener('change',event=>{evidenceRoom=event.target.value;renderEvidence();});
  document.querySelectorAll('[data-plan-source]').forEach(button=>{
    button.addEventListener('click',()=>setPlanSource(button.dataset.planSource));
    button.addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const sources=['drawing','brochure','facade'],step=event.key==='ArrowRight'?1:2;setPlanSource(sources[(sources.indexOf(planSource)+step)%3]);document.querySelector(`[data-plan-source="${planSource}"]`).focus();}
    });
  });
  document.querySelectorAll('[data-plan-zoom]').forEach(button=>button.addEventListener('click',()=>setPlanZoom(button.dataset.planZoom)));
  $('source-plan-image').addEventListener('load',()=>{$('reference-image-stage').style.setProperty('--image-native-width',`${$('source-plan-image').naturalWidth}px`);});
  $('open-studio').addEventListener('click',()=>{setStudioView(studioView);showDialog('studio-dialog');});
  document.querySelectorAll('[data-studio-view]').forEach(button=>{
    button.addEventListener('click',()=>setStudioView(button.dataset.studioView));
    button.addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const views=['dollhouse','living','primary'],next=(views.indexOf(studioView)+(event.key==='ArrowRight'?1:2))%3;setStudioView(views[next]);document.querySelector(`[data-studio-view="${studioView}"]`).focus();}
    });
  });
  $('settings-button').addEventListener('click', () => {
    const opening = $('settings-panel').hidden;
    $('settings-panel').hidden = !opening;
    $('settings-button').setAttribute('aria-expanded', String(opening));
  });
  $('close-settings').addEventListener('click', closeSettings);
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.stage-tools')) closeSettings(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeSettings(); closeSidebar(); }
  });
  $('wall-mode').addEventListener('change', event => { state.walls = event.target.value; emit('walls', state.walls); });
  $('lighting-mode').addEventListener('change',event=>{state.lighting=event.target.value;emit('lighting',state.lighting);});
  $('clean-view-button').addEventListener('click',()=>{
    for(const name of ['labels','dimensions'])if(state[name]){state[name]=false;emit('toggle',name);}
    updateSettings(state);closeSettings();toast('Պիտակներն ու չափերը թաքցված են։ Դրանք կարող եք միացնել «Տեսք» բաժնում։');
  });
  $('ceiling-height').addEventListener('change', event => {
    const n = Number(event.target.value);
    if (!Number.isFinite(n) || n < 2.2 || n > 4.5) {
      event.target.value = state.height.toFixed(2);
      toast('Ընտրեք առաստաղի բարձրություն՝ 2.20-ից 4.50 մետր։');
      return;
    }
    state.height = n;
    event.target.value = n.toFixed(2);
    emit('height', n);
  });
  $('open-sidebar').addEventListener('click', openSidebar);
  $('open-sidebar').setAttribute('aria-expanded', 'false');
  $('open-sidebar').setAttribute('aria-controls', 'sidebar');
  $('close-sidebar').addEventListener('click', closeSidebar);
  $('sidebar-backdrop').addEventListener('click', closeSidebar);
  updateSettings(state);updateMeasurementEvidence(geometryData);setPlanSource('drawing');
}

export function setSelectedRoom(room, dimensions) {
  selectedRoom = room || null;
  document.querySelectorAll('[data-room]').forEach(button => {
    const selected = !!room && button.dataset.room === room.id;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (!room) {
    $('selected-room-name').textContent = 'Ամբողջ բնակարանը';
    $('selected-room-area').textContent = `${areaText(modelArea())} մ²`;
    $('selected-room-size').textContent = 'Ընտրեք սենյակ՝ մոդելում դրա չափերը տեսնելու համար։';
    $('selected-room-basis').textContent = 'Հաշվարկված է ուրվագծերով · պատշգամբները ներառված են';
    $('selected-room-description').textContent = 'Սեղմեք սենյակին մոդելի վրա կամ ընտրեք այն ցանկից։';
    $('selected-room-description').classList.remove('has-source-note');
    $('selected-room-description').removeAttribute('title');
    $('selection-dot').style.display = 'none';
    $('mobile-room-label').textContent = 'Դիտել սենյակները';
    return;
  }
  $('selected-room-name').textContent = room.name;
  $('selected-room-area').textContent = `${areaText(room.area)} մ²`;
  const w = Number(dimensions?.width), d = Number(dimensions?.depth);
  $('selected-room-size').textContent = Number.isFinite(w) && Number.isFinite(d) ? `~ ${w.toFixed(2)} × ${d.toFixed(2)} մ · մոդելի եզրաչափեր` : 'Չափերը մեկնաբանված են ըստ գծագրի';
  $('selected-room-basis').textContent = finite(room.brochureArea) ? `Հաշվարկված մակերես · ըստ բուկլետի՝ ${areaText(room.brochureArea)} մ²` : 'Մակերեսը հաշվարկված է սենյակի ընթացիկ ուրվագծով';
  $('selected-room-description').textContent = room.note || room.description || 'Այս սենյակը մանրամասն դիտելու համար ընտրեք հատակագծի տեսքը։';
  $('selected-room-description').classList.toggle('has-source-note',!!room.note);
  if(room.note)$('selected-room-description').title=room.note;
  else $('selected-room-description').removeAttribute('title');
  const color = typeof room.color === 'number' ? '#' + room.color.toString(16).padStart(6, '0') : room.color;
  $('selection-dot').style.display = 'block';
  $('selection-dot').style.background = color || '#93a185';
  $('mobile-room-label').textContent = `${room.name} · ${areaText(room.area)} մ²`;
}

export function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('stage-caption').textContent = mode === 'plan' ? 'Չափերը՝ հստակ։' : mode === 'walk' ? 'Ձեր տունը՝ ներսից։' : 'Ձեր տունը՝ մանրամասն։';
  $('walk-help').hidden = mode !== 'walk';
  $('viewport').setAttribute('aria-label', mode === 'walk' ? 'Տեսք ներսից։ Քաշեք՝ նայելու համար, իսկ տեղաշարժվելու համար օգտագործեք W A S D կամ սլաքները։' : mode === 'plan' ? 'Հատակագիծ՝ վերևից։ Քաշեք՝ տեղաշարժելու, երկու մատով կամ մկնիկի անիվով՝ մասշտաբը փոխելու համար։' : '3D տեսք։ Քաշեք՝ պտտելու, երկու մատով կամ մկնիկի անիվով՝ մասշտաբը փոխելու համար։');
}

export function setStatus(message) {
  $('measurement-status').textContent = message || '';
  $('measurement-status').hidden = !message;
  $('clear-measure').hidden = !message;
}

export function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600);
}

export function setReady() {
  $('loader').classList.add('is-ready');
  setTimeout(() => { $('loader').hidden = true; }, 380);
}

export function updateSettings(settings = {}) {
  Object.assign(state, settings);
  document.querySelectorAll('[data-toggle]').forEach(button => button.setAttribute('aria-pressed', String(!!state[button.dataset.toggle])));
  document.querySelectorAll('[data-toggle-input]').forEach(input => { input.checked = !!state[input.dataset.toggleInput]; });
  $('wall-mode').value = state.walls;
  $('lighting-mode').value = state.lighting || 'daylight';
  $('ceiling-height').value = Number(state.height).toFixed(2);
  const profile=geometryData.facadeProfile||{},sill=Number(profile.sill??.03),head=Number(state.height)-Number(profile.headClearance??.07);
  if($('facade-evidence-note'))$('facade-evidence-note').textContent=`${Number(state.height).toFixed(2)} մ առաստաղի դեպքում ապակեպատման ընտրված միջակայքը ${sill.toFixed(2)}–${head.toFixed(2)} մ է։ Մուգ շրջանակներն ու բաժանումները մեկնաբանված են ճակատի պատկերից․ դրանք չափագրված բարձրություններ չեն։`;
  $('measure-button').setAttribute('aria-pressed', String(!!state.measuring));
  if (settings.mode) setMode(settings.mode);
}

function setPlanZoom(mode) {
  planZoom = mode === 'actual' ? 'actual' : 'fit';
  const stage=$('reference-image-stage');stage.classList.toggle('actual-size',planZoom==='actual');
  stage.style.setProperty('--image-native-width',`${$('source-plan-image').naturalWidth||719}px`);
  stage.scrollLeft=0;stage.scrollTop=0;
  document.querySelectorAll('[data-plan-zoom]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.planZoom===planZoom)));
}

function setPlanSource(source) {
  const sources={
    drawing:{path:'./assets/dimensioned-plan.jpeg',heading:'Չափերի սկզբնաղբյուրը',alt:'VV8-ի ճարտարապետական գծագիրը՝ սենյակների չափերով, պատերի ելուստներով, դռների բացվածքներով և պատշգամբների չափերով։',note:'Չափերը վերցված են գծագրի չափանշումներից։ Չնշված մանրամասները մեկնաբանվում են առանձին, իսկ պատկերի պիքսելները չեն ընդունվում որպես տեղում կատարված չափագրում։'},
    brochure:{path:'./assets/source-plan.jpg',heading:'Կահավորման և մակերեսների սկզբնական աղբյուրը',alt:'VV8-ի սկզբնական բուկլետը՝ կահավորված բնակարանի տարածական պատկերով և սենյակների մակերեսներով։',note:'Սկզբնական պատկերը պահպանված է որպես տեղեկանք։ Նոր կահավորման տարբերակը դիտեք «Դասավորություն» բաժնում։ Բուկլետի մակերեսները չեն փոխարինում չափերով գծագրին։'},
    facade:{path:'./assets/exterior-building.jpg',heading:'Ձեր տրամադրած շենքի արտաքին պատկերը',alt:'Շենքի արտաքին պատկեր՝ մուգ շրջանակներով, բարձր ապակեպատ ճակատներով և սպիտակ միջհարկային գոտիներով։',note:'Պատկերը հուշում է գրեթե հատակից առաստաղ ապակեպատում։ 3.00 մ առաստաղի համար ընտրված են 0.03 մ ստորին եզր և 2.93 մ վերին եզր։ Բացվածքների հորիզոնական չափերը վերցված են հատակագծից․ բարձրություններն ու շրջանակների բաժանումները տեսողական ենթադրություններ են։'}
  };
  planSource=Object.hasOwn(sources,source)?source:'drawing';
  const entry=sources[planSource],image=$('source-plan-image');image.src=entry.path;image.alt=entry.alt;
  $('reference-source-heading').textContent=entry.heading;$('reference-source-note').textContent=entry.note;
  $('reference-open-image').href=entry.path;$('reference-open-image').setAttribute('aria-label','Բացել սկզբնաղբյուրի պատկերը լրիվ չափով');
  $('source-plan-panel').setAttribute('aria-labelledby',`source-tab-${planSource}`);
  document.querySelectorAll('[data-plan-source]').forEach(button=>{const selected=button.dataset.planSource===planSource;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  setPlanZoom('fit');
}

function setStudioView(view) {
  const views={dollhouse:'Ամբողջ բնակարանը',living:'Հյուրասենյակ',primary:'Հիմնական ննջասենյակ'};
  studioView=Object.hasOwn(views,view)?view:'dollhouse';
  const image=$('studio-view-image'),link=$('studio-open-image');
  try {
    if(!studioRenderer) throw new Error('not-ready');
    const result=studioRenderer(studioView);
    image.src=result.url;image.hidden=false;image.alt=`${views[studioView]}՝ ընթացիկ կահավորմամբ և պատուհաններով։`;
    link.href=result.url;link.download=`VV8-${studioView}-current-plan.jpg`;link.textContent='Ներբեռնել պատկերը ↗';link.hidden=false;
    $('studio-render-note').textContent=result.note;
  } catch(error) {
    image.hidden=true;link.hidden=true;
    $('studio-render-note').textContent='Պատկերը դեռ պատրաստ չէ։ Սպասեք մոդելի բեռնմանը և կրկին ընտրեք դիտանկյունը։';
  }
  $('studio-view-name').textContent=views[studioView];
  $('studio-view-panel').setAttribute('aria-labelledby',`studio-tab-${studioView}`);
  document.querySelectorAll('[data-studio-view]').forEach(button=>{const active=button.dataset.studioView===studioView;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
}

function renderEvidence() {
  const rows=checks().filter(check=>evidenceRoom==='all'||check.roomId===evidenceRoom);
  const currentRoom=roomList.find(room=>room.id===evidenceRoom);
  const sourceRoom=currentRoom||geometryData.rooms?.living;
  const sourceNote=sourceRoom?.note||geometryData.rooms?.[evidenceRoom]?.note||'';
  const zoneArea=roomList.filter(room=>room.id==='living'||room.id==='hall').reduce((sum,room)=>sum+Number(room.area||0),0);
  $('evidence-room-note').textContent=sourceNote ? `${evidenceRoom==='all'?`Հյուրասենյակն ու միջանցքը՝ ընդհանուր ${areaText(zoneArea)} մ²։ `:''}${sourceNote}` : '';
  $('evidence-room-note').hidden=!sourceNote;
  $('measurement-evidence-count').textContent=`${rows.length} չափի ստուգում`;
  $('evidence-room-filter').value=evidenceRoom;
  if(!rows.length){$('measurement-evidence').innerHTML='<p class="evidence-empty">Այս ընտրության համար առանձին չափերի ստուգումներ գրանցված չեն։ Չափանշումները դիտելու համար բացեք սկզբնական գծագիրը։</p>';return;}
  $('measurement-evidence').innerHTML=`<table class="evidence-table"><thead><tr><th scope="col">Չափվող հատված</th><th scope="col">Գծագրից</th><th scope="col">Մոդելում</th><th scope="col">Հիմք</th></tr></thead><tbody>${rows.map(check=>{
    const source=finite(check.sourceMM)?Number(check.sourceMM)/1000:null;
    const model=check.id==='ceiling'?Number(state.height):finite(check.modelMetres)?Number(check.modelMetres):null;
    const difference=source!==null&&model!==null?Math.round((model-source)*1000):null;
    const hasDifference=difference!==null&&Math.abs(difference)>=1;
    const basis=basisOf(check),name={drawing:'Գծագրից',derived:'Հաշվարկված',assumed:'Ենթադրված',provided:'Ձեր նշած'}[basis];
    const ceilingEdited=check.id==='ceiling'&&finite(check.modelMetres)&&Math.abs(model-Number(check.modelMetres))>.0001;
    const note=[check.note,ceilingEdited?`Ցուցադրվող բարձրությունը փոխվել է ${model.toFixed(2)} մ-ի։ Պատկերներն ու արտահանվող մոդելը օգտագործում են ընթացիկ բարձրությունը։`:''].filter(Boolean).join(' ');
    return `<tr class="${hasDifference?'has-difference':''}"><th scope="row">${escape(check.label||check.id||'Չափ')}</th><td>${source===null?'—':metres(source)}</td><td>${model===null?'—':metres(model)}${hasDifference?`<small class="evidence-delta">${difference>0?'+':''}${difference} մմ</small>`:''}</td><td><span class="basis-badge ${basis}">${name}</span></td></tr>${note?`<tr class="evidence-note-row"><td colspan="4">${escape(note)}</td></tr>`:''}`;
  }).join('')}</tbody></table>`;
}

export function updateMeasurementEvidence(data = {}) {
  geometryData=data||{};
  const filter=$('evidence-room-filter');
  filter.innerHTML='<option value="all">Ամբողջ բնակարանը</option>'+roomList.map(room=>`<option value="${escape(room.id)}">${escape(room.name)}</option>`).join('');
  if(evidenceRoom!=='all'&&!roomList.some(room=>room.id===evidenceRoom))evidenceRoom='all';
  $('evidence-model-area').innerHTML=`${areaText(modelArea())} <small>մ²</small>`;
  $('plan-status-text').textContent=checks().length?'Չափերը համադրված են ձեր գծագրի հետ':'Չափերով գծագիրը տրամադրված է';
  if(typeof geometryData.areaBasis==='string')$('evidence-area-basis').textContent=geometryData.areaBasis;
  const conflicts=Array.isArray(geometryData.dimensionalConflicts)?geometryData.dimensionalConflicts:[];
  const conflictNames={'kitchen-horizontal-chain':'Խոհանոցի չափային շղթա','lower-horizontal-chain':'Ստորին չափային շղթա','living-east-glazing':'Հյուրասենյակի ապակեպատում','primary-east-glazing':'Հիմնական ննջասենյակի ապակեպատում'};
  $('drawing-conflicts').hidden=!conflicts.length;
  $('drawing-conflict-list').innerHTML=conflicts.map(conflict=>`<article class="drawing-conflict"><div><strong>${escape(conflict.label||conflictNames[conflict.id]||String(conflict.id||'Գծագրի մեկնաբանություն').replaceAll('-',' '))}</strong>${finite(conflict.differenceMM)?`<span>${Math.abs(Number(conflict.differenceMM))} մմ տարբերություն</span>`:''}</div><p>${escape(conflict.message||conflict.note||'Վերջնակետերը ճշտման կարիք ունեն։')}</p></article>`).join('');
  renderEvidence();
}

export function showMeasurementEvidence(roomId = null) {
  evidenceRoom=roomId&&roomList.some(room=>room.id===roomId)?roomId:'all';
  renderEvidence();showDialog('accuracy-dialog');
}
