let callback = () => {};
let toastTimer;
let geometryData = {}, roomList = [], selectedRoom = null, evidenceRoom = 'all';
let planSource = 'drawing', planZoom = 'fit';
let studioView = 'living';
const state = { mode: 'dollhouse', dimensions: false, labels: true, furniture: true, walls: 'cutaway', height: 3, measuring: false, lighting: 'daylight' };
const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const emit = (action, value) => callback(value === undefined ? { action } : { action, value });
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const areaText = value => finite(value) ? (Math.round((Number(value)+1e-8)*10)/10).toFixed(1) : '—';
const metres = value => `${Number(value).toFixed(3)} m`;
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
  $('room-list').innerHTML = rooms.map(room => `<button class="room-row" data-room="${escape(room.id)}" aria-pressed="false" title="${escape(room.name)} · calculated model area ${areaText(room.area)} m²"><span class="room-dot" style="background:${escape(typeof room.color === 'number' ? '#' + room.color.toString(16).padStart(6, '0') : room.color || '#93a185')}"></span><span class="room-copy"><strong>${escape(room.name)}</strong><small lang="hy">${escape(room.armenian)}</small></span><span class="room-area">${areaText(room.area)}<small>m²</small></span>${icon('chevron')}</button>`).join('');
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
      if (state.measuring) setStatus('Select two points on the floor.');
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
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setPlanSource(planSource==='drawing'?'brochure':'drawing');document.querySelector(`[data-plan-source="${planSource}"]`).focus();}
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
    updateSettings(state);closeSettings();toast('Labels and dimensions hidden. Restore them in Display.');
  });
  $('ceiling-height').addEventListener('change', event => {
    const n = Number(event.target.value);
    if (!Number.isFinite(n) || n < 2.2 || n > 4.5) {
      event.target.value = state.height.toFixed(2);
      toast('Choose a ceiling height between 2.20 and 4.50 metres.');
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
    $('selected-room-name').textContent = 'Whole apartment';
    $('selected-room-area').textContent = `${areaText(modelArea())} m²`;
    $('selected-room-size').textContent = 'Select any room to see its model dimensions.';
    $('selected-room-basis').textContent = 'Calculated room outlines · includes balconies';
    $('selected-room-description').textContent = 'Click a room in the model or choose one above.';
    $('selected-room-description').classList.remove('has-source-note');
    $('selected-room-description').removeAttribute('title');
    $('selection-dot').style.display = 'none';
    $('mobile-room-label').textContent = 'Explore rooms';
    return;
  }
  $('selected-room-name').textContent = room.name;
  $('selected-room-area').textContent = `${areaText(room.area)} m²`;
  const w = Number(dimensions?.width), d = Number(dimensions?.depth);
  $('selected-room-size').textContent = Number.isFinite(w) && Number.isFinite(d) ? `~ ${w.toFixed(2)} × ${d.toFixed(2)} m · model bounds` : 'Dimensions interpreted from the drawing';
  $('selected-room-basis').textContent = finite(room.brochureArea) ? `Calculated area · brochure reference ${areaText(room.brochureArea)} m²` : 'Area calculated from the current room outline';
  $('selected-room-description').textContent = room.note || room.description || 'Select floor plan view to inspect this room.';
  $('selected-room-description').classList.toggle('has-source-note',!!room.note);
  if(room.note)$('selected-room-description').title=room.note;
  else $('selected-room-description').removeAttribute('title');
  const color = typeof room.color === 'number' ? '#' + room.color.toString(16).padStart(6, '0') : room.color;
  $('selection-dot').style.display = 'block';
  $('selection-dot').style.background = color || '#93a185';
  $('mobile-room-label').textContent = `${room.name} · ${areaText(room.area)} m²`;
}

export function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('stage-caption').textContent = mode === 'plan' ? 'Dimensions, made clear.' : mode === 'walk' ? 'A closer look at home.' : 'Your home, in detail.';
  $('walk-help').hidden = mode !== 'walk';
  $('viewport').setAttribute('aria-label', mode === 'walk' ? 'Inside view. Drag to look; use W A S D or arrow keys to move.' : mode === 'plan' ? 'Top-down floor plan. Drag to pan; pinch or scroll to zoom.' : '3D view. Drag to orbit; pinch or scroll to zoom.');
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
  planSource=source==='brochure'?'brochure':'drawing';
  const drawing=planSource==='drawing';
  const image=$('source-plan-image');image.src=drawing?'./assets/dimensioned-plan.jpeg':'./assets/source-plan.jpg';
  image.alt=drawing?'Dimensioned VV8 architectural drawing with room spans, wall offsets, door openings and balcony dimensions.':'Original VV8 furnished perspective brochure with printed room areas and furniture arrangement.';
  $('reference-source-heading').textContent=drawing?'The measurement reference':'The original furniture & area reference';
  $('reference-source-note').textContent=drawing?'Dimensions are read from the annotations. Unlabelled details are interpreted separately; image pixels are not treated as survey measurements.':'The perspective illustration informs room identity and arrangement. Its area labels remain reference figures alongside the dimensioned drawing.';
  $('reference-open-image').href=image.src;
  $('reference-open-image').setAttribute('aria-label',drawing?'Open dimensioned drawing at full size':'Open original brochure at full size');
  $('source-plan-panel').setAttribute('aria-labelledby',drawing?'source-tab-drawing':'source-tab-brochure');
  document.querySelectorAll('[data-plan-source]').forEach(button=>{const selected=button.dataset.planSource===planSource;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  setPlanZoom('fit');
}

function setStudioView(view) {
  const views={dollhouse:{name:'The whole apartment',alt:'Rendered dollhouse view of the apartment from its updated 3D model.'},living:{name:'The living room',alt:'Rendered interior view of the living room from the apartment model, showing the selected furniture and materials.'},primary:{name:'The primary bedroom',alt:'Rendered interior view of the primary bedroom from the apartment model, showing the selected bed, furniture and materials.'}};
  studioView=Object.hasOwn(views,view)?view:'dollhouse';
  const current=views[studioView],path=`./assets/render-${studioView}.jpg`;
  $('studio-view-image').src=path;$('studio-view-image').alt=current.alt;
  $('studio-view-name').textContent=current.name;$('studio-open-image').href=path;
  $('studio-view-panel').setAttribute('aria-labelledby',`studio-tab-${studioView}`);
  document.querySelectorAll('[data-studio-view]').forEach(button=>{const active=button.dataset.studioView===studioView;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
}

function renderEvidence() {
  const rows=checks().filter(check=>evidenceRoom==='all'||check.roomId===evidenceRoom);
  const currentRoom=roomList.find(room=>room.id===evidenceRoom);
  const sourceRoom=currentRoom||geometryData.rooms?.living;
  const sourceNote=sourceRoom?.note||geometryData.rooms?.[evidenceRoom]?.note||'';
  const zoneArea=roomList.filter(room=>room.id==='living'||room.id==='hall').reduce((sum,room)=>sum+Number(room.area||0),0);
  $('evidence-room-note').textContent=sourceNote ? `${evidenceRoom==='all'?`Living + hall: ${areaText(zoneArea)} m² combined. `:''}${sourceNote}` : '';
  $('evidence-room-note').hidden=!sourceNote;
  $('measurement-evidence-count').textContent=`${rows.length} dimension check${rows.length===1?'':'s'}`;
  $('evidence-room-filter').value=evidenceRoom;
  if(!rows.length){$('measurement-evidence').innerHTML='<p class="evidence-empty">No separate dimension checks are recorded for this selection. Open the source drawing to inspect the annotations.</p>';return;}
  $('measurement-evidence').innerHTML=`<table class="evidence-table"><thead><tr><th scope="col">Span</th><th scope="col">Drawing</th><th scope="col">Model</th><th scope="col">Basis</th></tr></thead><tbody>${rows.map(check=>{
    const source=finite(check.sourceMM)?Number(check.sourceMM)/1000:null;
    const model=check.id==='ceiling'?Number(state.height):finite(check.modelMetres)?Number(check.modelMetres):null;
    const difference=source!==null&&model!==null?Math.round((model-source)*1000):null;
    const hasDifference=difference!==null&&Math.abs(difference)>=1;
    const basis=basisOf(check),name=basis==='provided'?'User specified':basis[0].toUpperCase()+basis.slice(1);
    const ceilingEdited=check.id==='ceiling'&&finite(check.modelMetres)&&Math.abs(model-Number(check.modelMetres))>.0001;
    const note=[check.note,ceilingEdited?`The current display height has been edited to ${model.toFixed(2)} m; saved studio views retain the supplied 3.00 m ceiling.`:''].filter(Boolean).join(' ');
    return `<tr class="${hasDifference?'has-difference':''}"><th scope="row">${escape(check.label||check.id||'Dimension')}</th><td>${source===null?'—':metres(source)}</td><td>${model===null?'—':metres(model)}${hasDifference?`<small class="evidence-delta">${difference>0?'+':''}${difference} mm</small>`:''}</td><td><span class="basis-badge ${basis}">${name}</span></td></tr>${note?`<tr class="evidence-note-row"><td colspan="4">${escape(note)}</td></tr>`:''}`;
  }).join('')}</tbody></table>`;
}

export function updateMeasurementEvidence(data = {}) {
  geometryData=data||{};
  const filter=$('evidence-room-filter');
  filter.innerHTML='<option value="all">Whole apartment</option>'+roomList.map(room=>`<option value="${escape(room.id)}">${escape(room.name)}</option>`).join('');
  if(evidenceRoom!=='all'&&!roomList.some(room=>room.id===evidenceRoom))evidenceRoom='all';
  $('evidence-model-area').innerHTML=`${areaText(modelArea())} <small>m²</small>`;
  $('plan-status-text').textContent=checks().length?'Dimensions traced to your drawing':'Dimensioned drawing supplied';
  if(typeof geometryData.areaBasis==='string')$('evidence-area-basis').textContent=geometryData.areaBasis;
  const conflicts=Array.isArray(geometryData.dimensionalConflicts)?geometryData.dimensionalConflicts:[];
  const conflictNames={'kitchen-horizontal-chain':'Kitchen dimension chain','lower-horizontal-chain':'Lower dimension chain','living-east-glazing':'Living-room glazing','primary-east-glazing':'Primary-bedroom glazing'};
  $('drawing-conflicts').hidden=!conflicts.length;
  $('drawing-conflict-list').innerHTML=conflicts.map(conflict=>`<article class="drawing-conflict"><div><strong>${escape(conflict.label||conflictNames[conflict.id]||String(conflict.id||'Drawing interpretation').replaceAll('-',' '))}</strong>${finite(conflict.differenceMM)?`<span>${Math.abs(Number(conflict.differenceMM))} mm difference</span>`:''}</div><p>${escape(conflict.message||conflict.note||'Endpoints require clarification.')}</p></article>`).join('');
  renderEvidence();
}

export function showMeasurementEvidence(roomId = null) {
  evidenceRoom=roomId&&roomList.some(room=>room.id===roomId)?roomId:'all';
  renderEvidence();showDialog('accuracy-dialog');
}
