/* Editable furnishing layouts. All architectural geometry stays read-only. */
const copy = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite = n => Number.isFinite(Number(n));
const round = n => Math.round(Number(n) * 100) / 100;
const snap = n => round(Math.round(Number(n) / .05) * .05);
const degrees = n => ((Number(n) % 360) + 360) % 360;
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const roomNames = {living:'Հյուրասենյակ',kitchen:'Խոհանոց',primary:'Հիմնական ննջասենյակ',bedroom:'Երկրորդ ննջասենյակ',hall:'Մուտք և միջանցք',bathroom:'Սանհանգույց','balcony-kitchen':'Խոհանոցի պատշգամբ','balcony-bedroom':'Ննջասենյակի պատշգամբ'};
const ROOM_FILL = {living:'#ebe8dd',kitchen:'#eaeadd',primary:'#e8e4da',bedroom:'#e4e9e0',hall:'#eeebe0',bathroom:'#e3ebea','balcony-kitchen':'#edf0e4','balcony-bedroom':'#edf0e4'};

/**
 * Item poses use footprint-centre x/z coordinates in metres and degree rotations.
 * The caller validates poses and applies them to the existing Three.js objects.
 * Architecture is displayed from data and never enters the editable state.
 */
export function initPlanEditor(options) {
  const {data, getState, onChange, onMode, onSelect} = options;
  const items = Array.isArray(options.items) ? options.items : [];
  const byId = new Map(items.map(item => [item.id,item]));
  const storageKey = options.storageKey || 'vv8-furnishing-layout-v1';
  let state = copy(getState());
  let selected = items.find(item => !item.locked)?.id || items[0]?.id || null;
  let history = [copy(state)], historyIndex = 0, drag = null, isOpen = false, storageAvailable = true;
  let invalidPreview = null, saveTimer = null, destroyed = false;
  const presets = Array.isArray(options.presets)
    ? options.presets
    : Object.entries(options.presets || {}).map(([id, value]) => ({id, ...value, state:value.state || value}));
  const points = [...(data.outline || []), ...Object.values(data.rooms || {}).flatMap(room => room.polygon || [])];
  const extent = {minX:Math.min(...points.map(p=>p[0]),0),maxX:Math.max(...points.map(p=>p[0]),9),minZ:Math.min(...points.map(p=>p[1]),0),maxZ:Math.max(...points.map(p=>p[1]),12.15)};
  const view = {x:extent.minX-.5,z:extent.minZ-.6,w:extent.maxX-extent.minX+1,h:extent.maxZ-extent.minZ+1.1};
  const trigger = document.createElement('button');
  trigger.type='button';trigger.id='open-plan-editor';trigger.className='text-button plan-editor-trigger';
  trigger.setAttribute('aria-label','Փոխել բնակարանի դասավորությունը');trigger.setAttribute('aria-controls','plan-editor');trigger.setAttribute('aria-expanded','false');
  trigger.title='Փոխել դասավորությունը';trigger.innerHTML=`${icon('plan')}<span>Դասավորություն</span>`;
  const actions=document.querySelector('.topbar-actions');
  if(actions) actions.insertBefore(trigger,actions.querySelector('.export-button'));
  else document.body.append(trigger);

  const panel=document.createElement('aside');panel.id='plan-editor';panel.className='plan-editor';panel.hidden=true;
  panel.setAttribute('aria-labelledby','plan-editor-title');
  panel.innerHTML=`
    <header class="pe-header"><div><p class="pe-eyebrow">ՁԵՐ ՏՈՒՆԸ · ՁԵՐ ՏԱՐԲԵՐԱԿԸ</p><h2 id="plan-editor-title">Փոխեք դասավորությունը</h2></div><button type="button" class="icon-button" data-pe="close" aria-label="Փակել դասավորության խմբագրիչը">${icon('close')}</button></header>
    <div class="pe-body">
      <div class="pe-preset-row"><label for="pe-preset">Տարբերակ</label><select id="pe-preset" aria-label="Դասավորության տարբերակ"></select></div>
      <p class="pe-rationale" id="pe-rationale"></p>
      <div class="pe-lock-note"><span aria-hidden="true">▣</span><p>Պատերն ու մույթերը ֆիքսված են․ կրող համակարգը պետք է հաստատել կոնստրուկտիվ գծագրով։</p></div>
      <section class="pe-canvas-card" aria-label="Դասավորության խմբագրում">
        <div class="pe-canvas-heading"><strong>Չափերով հատակագիծ</strong><span>Քայլ՝ 5 սմ</span></div>
        <svg id="pe-plan" class="pe-plan" viewBox="${view.x} ${view.z} ${view.w} ${view.h}" role="group" aria-label="Խմբագրվող կահավորման հատակագիծ։ Ընտրեք տարր և քաշեք։ Սլաքներով՝ 5 սմ քայլ, R՝ պտտել։" tabindex="0"></svg>
        <div class="pe-legend"><span><i class="pe-legend-structure"></i>Ֆիքսված</span><span><i class="pe-legend-furniture"></i>Տեղափոխելի</span><span><i class="pe-legend-selected"></i>Ընտրված</span></div>
        <p class="pe-drag-hint">Քաշեք կահույքը կամ նշեք դիրքը ստորև։</p>
      </section>
      <div class="pe-selection-heading"><label for="pe-item">Խմբագրվող տարր</label><span id="pe-item-size"></span></div>
      <select id="pe-item" class="pe-item-select" aria-label="Ընտրել կահույք"></select>
      <p id="pe-item-room" class="pe-item-room"></p>
      <p id="pe-item-note" class="pe-item-note" hidden></p>
      <div class="pe-coordinate-grid">
        <label><span>Արևմուտքից, X</span><span class="pe-number"><input id="pe-x" type="number" step="0.05" inputmode="decimal" aria-label="Կահույքի կենտրոնի X դիրքը մետրերով"><small>մ</small></span></label>
        <label><span>Հյուսիսից, Z</span><span class="pe-number"><input id="pe-z" type="number" step="0.05" inputmode="decimal" aria-label="Կահույքի կենտրոնի Z դիրքը մետրերով"><small>մ</small></span></label>
        <label><span>Պտույտ</span><span class="pe-number"><input id="pe-rotation" type="number" min="0" max="359" step="90" inputmode="decimal" aria-label="Կահույքի պտույտը աստիճաններով"><small>°</small></span></label>
      </div>
      <div class="pe-adjust-row"><button type="button" data-pe="rotate">${icon('rotate')}Պտտել 90°</button><button type="button" data-pe="restore-item">${icon('reset')}Վերականգնել տարրը</button></div>
      <div id="pe-status" class="pe-status" role="status" aria-live="polite"></div>
      <details class="pe-help"><summary>Ի՞նչ է փոխվում այս տարբերակում</summary><p>Փոփոխվում են կահույքի դիրքն ու պտույտը։ Բնակարանի եզրագիծը, պատերը, մույթերը, բացվածքներն ու խոնավ գոտիները մնում են ֆիքսված։ Չափագրումը, բյուջեն և 3D արտահանումը շարունակում են աշխատել։</p><p>Դիրքերը ցույց են տալիս տարրի կենտրոնը՝ հատակագծի վերին ձախ անկյունից։ Սլաքները տեղափոխում են 5 սմ, Shift + սլաքը՝ 25 սմ, R-ը պտտում է 90°։</p></details>
      <div class="pe-file-actions"><button type="button" data-pe="export">${icon('download')}Պահել ֆայլը</button><button type="button" data-pe="import">${icon('plan')}Բեռնել ֆայլից</button><input type="file" id="pe-file-input" accept="application/json,.json" hidden></div>
    </div>
    <footer class="pe-footer"><div class="pe-history"><button type="button" data-pe="undo" aria-label="Հետարկել փոփոխությունը" title="Հետարկել">↶</button><button type="button" data-pe="redo" aria-label="Կրկնել փոփոխությունը" title="Կրկնել">↷</button><button type="button" data-pe="reset" aria-label="Վերականգնել սկզբնական դասավորությունը" title="Վերականգնել սկզբնականը">${icon('reset')}</button></div><button type="button" class="pe-view-3d" data-pe="view-3d">${icon('cube')}Դիտել 3D-ում</button><p id="pe-save-state">Փոփոխությունները պահվում են այս դիտարկիչում։</p></footer>`;
  document.body.append(panel);
  const $=id=>panel.querySelector(`#${id}`);
  const svg=$('pe-plan');

  function currentPose(item) {
    return state.placements?.[item.id] || {x:item.x||0,z:item.z||0,rotation:item.rotation||0};
  }
  function check(next) {
    try {
      const result=options.validate?.(copy(next));
      if(result===false) return {valid:false,errors:['Այս տեղադրությունը չի տեղավորվում թույլատրելի գոտում։']};
      if(result===true || result==null) return {valid:true,errors:[],warnings:[]};
      return {valid:result.valid!==false,errors:result.errors||[],warnings:result.warnings||[]};
    } catch {return {valid:false,errors:['Չհաջողվեց ստուգել այս փոփոխությունը։']};}
  }
  function message(text='',kind='') {
    const el=$('pe-status');el.textContent=text;el.dataset.kind=kind;el.hidden=!text;
  }
  function persist() {
    clearTimeout(saveTimer);
    try {localStorage.setItem(storageKey,JSON.stringify({format:'vv8-layout',version:1,state}));storageAvailable=true;}
    catch {storageAvailable=false;}
    $('pe-save-state').textContent=storageAvailable?'Պահված է այս դիտարկիչում։':'Այս դիտարկիչում պահել չհաջողվեց․ կարող եք ներբեռնել ֆայլը։';
  }
  function remember(next) {
    if(JSON.stringify(history[historyIndex])===JSON.stringify(next))return;
    history.splice(historyIndex+1);history.push(copy(next));
    if(history.length>60)history.shift();historyIndex=history.length-1;
  }
  function apply(next,{source='edit',rememberChange=true,save=true}={}) {
    const result=check(next);
    if(!result.valid){message(result.errors[0]||'Այս դիրքում տարրը հատում է պատը կամ այլ ֆիքսված տարր։','error');return false;}
    try {
      const accepted=onChange(copy(next),{source});
      if(accepted===false){message('Փոփոխությունը չկիրառվեց։','error');return false;}
      state=copy(accepted?.placements?accepted:next);
      invalidPreview=null;
      if(rememberChange)remember(state);
      if(save)persist();
      message(result.warnings[0]||'',result.warnings.length?'warning':'');
      render();return true;
    } catch {message('Չհաջողվեց կիրառել փոփոխությունը։ Նախորդ տարբերակը պահպանվել է։','error');return false;}
  }
  function editPose(change,{source='edit'}={}) {
    const item=byId.get(selected);if(!item||item.locked)return;
    const next=copy(state);next.preset='custom';next.placements||={};
    next.placements[selected]={...currentPose(item),...change};
    apply(next,{source});
  }
  function setSelected(id,notify=true) {
    if(!byId.has(id))return;
    selected=id;invalidPreview=null;renderMap();renderInspector();
    if(notify)onSelect?.(id);
  }
  function renderPresets() {
    const select=$('pe-preset');
    const choices=presets.length?presets:[{id:'original',name:'Սկզբնական դասավորություն'}];
    select.innerHTML=choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name||p.label||(p.id==='original'?'Սկզբնական դասավորություն':'Առաջարկվող դասավորություն'))}</option>`).join('')+'<option value="custom">Իմ տարբերակը</option>';
    select.value=state.preset||'custom';
    if(!select.value)select.value='custom';
    const preset=presets.find(p=>p.id===state.preset);
    $('pe-rationale').textContent=preset?.description||preset?.rationale||(state.preset==='custom'?'Ձեր փոփոխությունները միանգամից արտացոլվում են 3D մոդելում։':'Ընտրեք առաջարկվող տարբերակը կամ ստեղծեք ձեր սեփական դասավորությունը։');
  }
  function renderInspector() {
    const item=byId.get(selected),pose=item?currentPose(item):null;
    $('pe-item').value=selected||'';
    $('pe-item-size').textContent=item?`${Number(item.width||0).toFixed(2)} × ${Number(item.depth||0).toFixed(2)} մ`:'';
    $('pe-item-room').textContent=item?`${roomNames[item.roomId]||item.roomName||''}${item.locked?' · ֆիքսված տարր':' · դիրքը՝ տարրի կենտրոնով'}`:'';
    $('pe-item-note').textContent=item?.clearanceNote||'';$('pe-item-note').hidden=!item?.clearanceNote;
    for(const key of ['x','z','rotation']){
      const input=$(`pe-${key}`);input.disabled=!item||!!item.locked;
      input.value=pose?(key==='rotation'?degrees(pose[key]||0).toFixed(0):Number(pose[key]||0).toFixed(2)):'';
    }
    panel.querySelector('[data-pe="rotate"]').disabled=!item||!!item.locked;
    panel.querySelector('[data-pe="restore-item"]').disabled=!item||!!item.locked;
    panel.querySelector('[data-pe="undo"]').disabled=historyIndex===0;
    panel.querySelector('[data-pe="redo"]').disabled=historyIndex>=history.length-1;
  }
  function wallShapes() {
    const lines=[];
    for(const wall of data.structuralWalls||[]){
      const [x,z]=wall.start,[ex,ez]=wall.end,dx=ex-x,dz=ez-z,len=Math.hypot(dx,dz),t=wall.thickness||.1;
      if(!len)continue;const ux=dx/len,uz=dz/len,nx=-uz*t/2,nz=ux*t/2;
      let cursor=0;const spans=[];
      for(const opening of [...(wall.openings||[])].sort((a,b)=>a.from-b.from)){if(opening.from>cursor)spans.push([cursor,Math.min(opening.from,len)]);cursor=Math.max(cursor,opening.to);}
      if(cursor<len)spans.push([cursor,len]);
      for(const [from,to] of spans){if(to<=from)continue;const ax=x+ux*from,az=z+uz*from,bx=x+ux*to,bz=z+uz*to;lines.push(`<polygon points="${ax+nx},${az+nz} ${bx+nx},${bz+nz} ${bx-nx},${bz-nz} ${ax-nx},${az-nz}"/>`);}
    }
    for(const pier of data.structuralPiers||[]){const [x,z,x2,z2]=pier.bounds||[];if([x,z,x2,z2].every(finite))lines.push(`<rect x="${x}" y="${z}" width="${x2-x}" height="${z2-z}"/>`);}
    return lines.join('');
  }
  const lockedGeometry=wallShapes();
  function renderMap() {
    const roomPolygons=Object.entries(data.rooms||{}).map(([id,room])=>`<polygon class="pe-room" points="${(room.polygon||[]).map(p=>p.join(',')).join(' ')}" fill="${ROOM_FILL[id]||'#eeece4'}"/>`).join('');
    const glass=(data.glazing||[]).map(g=>`<line x1="${g.start[0]}" y1="${g.start[1]}" x2="${g.end[0]}" y2="${g.end[1]}"/>`).join('');
    const guards=(data.balconyGuards||[]).map(g=>`<line x1="${g.start[0]}" y1="${g.start[1]}" x2="${g.end[0]}" y2="${g.end[1]}"/>`).join('');
    const furniture=[...items].sort((a,b)=>(a.id===selected?1:0)-(b.id===selected?1:0)).map(item=>{
      const pose=invalidPreview?.id===item.id?invalidPreview.pose:currentPose(item),w=Number(item.width)||.35,d=Number(item.depth)||.35;
      const active=item.id===selected,invalid=invalidPreview?.id===item.id;
      const kind=String(item.kind||''),isRug=/rug|գորգ/i.test(kind+' '+item.name),isRound=/round|circular/i.test(kind);
      const body=isRound?`<ellipse cx="0" cy="0" rx="${w/2}" ry="${d/2}"/>`:`<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" rx="${Math.min(.07,w/8,d/8)}"/>`;
      const detail=/bed/i.test(kind)?`<path class="pe-item-detail" d="M${-w/2+.08},${-d/2+.42}H${w/2-.08}"/><rect class="pe-item-detail" x="${-w/2+.09}" y="${-d/2+.1}" width="${Math.max(.1,w-.18)}" height=".24" rx=".06"/>`:/sofa/i.test(kind)?`<path class="pe-item-detail" d="M${-w/2+.15},${d/2-.13}V${-d/2+.2}H${w/2-.15}V${d/2-.13}"/>`:'';
      return `<g class="pe-object${active?' is-selected':''}${item.locked?' is-locked':''}${isRug?' is-rug':''}${invalid?' is-invalid':''}" data-item-id="${esc(item.id)}" transform="translate(${Number(pose.x)||0} ${Number(pose.z)||0}) rotate(${-degrees(pose.rotation||0)})" role="button" tabindex="${active?'0':'-1'}" aria-label="${esc(item.name||item.id)}${item.locked?'՝ ֆիքսված':''}" aria-pressed="${active}"><title>${esc(item.name||item.id)} · ${w.toFixed(2)} × ${d.toFixed(2)} մ</title>${body}${detail}${active?`<circle class="pe-center-point" r=".055"/>`:''}</g>`;
    }).join('');
    const width=(extent.maxX-extent.minX).toFixed(2),depth=(extent.maxZ-extent.minZ).toFixed(2);
    svg.innerHTML=`<defs><pattern id="pe-grid" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M .5 0 H 0 V .5" fill="none" stroke="#788875" stroke-opacity=".12" stroke-width=".01"/></pattern><pattern id="pe-wall-hatch" width=".14" height=".14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".14" height=".14" fill="#69766d"/><line x1="0" y1="0" x2="0" y2=".14" stroke="#abb5a6" stroke-width=".04"/></pattern></defs><polygon class="pe-outline" points="${(data.outline||[]).map(p=>p.join(',')).join(' ')}"/>${roomPolygons}<rect x="${extent.minX}" y="${extent.minZ}" width="${extent.maxX-extent.minX}" height="${extent.maxZ-extent.minZ}" fill="url(#pe-grid)" pointer-events="none"/><g class="pe-walls">${lockedGeometry}</g><g class="pe-glazing">${glass}</g><g class="pe-guards">${guards}</g><g class="pe-furniture">${furniture}</g><g class="pe-overall-dimensions"><path d="M${extent.minX},-.29H${extent.maxX} M${extent.minX},-.37V-.21 M${extent.maxX},-.37V-.21"/><text x="${(extent.minX+extent.maxX)/2}" y="-.39">${width} մ</text><path d="M${extent.maxX+.27},${extent.minZ}V${extent.maxZ} M${extent.maxX+.19},${extent.minZ}H${extent.maxX+.35} M${extent.maxX+.19},${extent.maxZ}H${extent.maxX+.35}"/><text transform="translate(${extent.maxX+.41},${(extent.minZ+extent.maxZ)/2}) rotate(90)">${depth} մ</text></g>`;
  }
  function render() {renderPresets();renderMap();renderInspector();}
  function populateItems() {
    const grouped=new Map();for(const item of items){const room=item.roomId||'other';if(!grouped.has(room))grouped.set(room,[]);grouped.get(room).push(item);}
    $('pe-item').innerHTML=[...grouped].map(([room,list])=>`<optgroup label="${esc(roomNames[room]||'Այլ տարրեր')}">${list.map(item=>`<option value="${esc(item.id)}">${esc(item.name||item.id)}${item.locked?' · ֆիքսված':''}</option>`).join('')}</optgroup>`).join('');
  }
  function open() {
    if(destroyed)return;isOpen=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');document.body.classList.add('plan-editor-open');
    options.onOpen?.();render();panel.querySelector('[data-pe="close"]').focus();
  }
  function close() {
    if(drag)finishDrag(false);isOpen=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false');document.body.classList.remove('plan-editor-open');trigger.focus();
  }
  function point(event) {
    const matrix=svg.getScreenCTM();if(!matrix)return null;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());return {x:p.x,z:p.y};
  }
  function finishDrag(commit=true) {
    if(!drag)return;const origin=drag.before,rejected=!!invalidPreview;drag=null;
    svg.classList.remove('is-dragging');invalidPreview=null;
    if(!commit){apply(origin,{source:'cancel-drag',rememberChange:false,save:false});return;}
    if(JSON.stringify(state)!==JSON.stringify(origin)){remember(state);persist();}
    render();if(rejected)message('Տարրը մնաց վերջին թույլատրելի դիրքում։','warning');
  }
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const target=event.target.closest('[data-item-id]');if(!target)return;
    event.preventDefault();const id=target.dataset.itemId;setSelected(id);svg.focus({preventScroll:true});const item=byId.get(id);
    if(item.locked){message('Այս տարրը ֆիքսված է։ Ընտրեք տեղափոխելի կահույք։');return;}
    const p=point(event);if(!p)return;const pose=currentPose(item);
    drag={pointerId:event.pointerId,id,before:copy(state),dx:p.x-pose.x,dz:p.z-pose.z};
    svg.setPointerCapture(event.pointerId);svg.classList.add('is-dragging');
  });
  svg.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();const p=point(event);if(!p)return;
    const next=copy(state);next.preset='custom';next.placements||={};
    next.placements[drag.id]={...currentPose(byId.get(drag.id)),x:snap(p.x-drag.dx),z:snap(p.z-drag.dz)};
    const result=check(next);
    if(!result.valid){invalidPreview={id:drag.id,pose:next.placements[drag.id]};renderMap();message(result.errors[0]||'Այստեղ տեղադրել հնարավոր չէ։ Ընտրեք ազատ տարածք։','error');return;}
    apply(next,{source:'drag',rememberChange:false,save:false});
  });
  svg.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.pointerId)finishDrag(true);});
  svg.addEventListener('pointercancel',()=>finishDrag(false));
  svg.addEventListener('keydown',event=>{
    if(!selected)return;const item=byId.get(selected);if(item.locked)return;
    const amount=event.shiftKey ? .25 : .05,pose=currentPose(item),moves={ArrowLeft:{x:snap(pose.x-amount)},ArrowRight:{x:snap(pose.x+amount)},ArrowUp:{z:snap(pose.z-amount)},ArrowDown:{z:snap(pose.z+amount)}};
    if(moves[event.key]){event.preventDefault();editPose(moves[event.key],{source:'keyboard'});}
    else if(event.key.toLowerCase()==='r'){event.preventDefault();editPose({rotation:degrees(pose.rotation+90)},{source:'keyboard'});}
  });
  $('pe-item').addEventListener('change',event=>setSelected(event.target.value));
  $('pe-preset').addEventListener('change',event=>{
    const preset=presets.find(p=>p.id===event.target.value);
    if(!preset){apply({...copy(state),preset:'custom'},{source:'preset'});return;}
    const next=copy(typeof preset.state==='function'?preset.state():preset.state);
    if(!next?.placements){message('Այս տարբերակը հասանելի չէ։','error');renderPresets();return;}
    next.preset=preset.id;apply(next,{source:'preset'});
  });
  function commitCoordinate(key,input) {
    const item=byId.get(selected);if(!item||item.locked)return;
    const n=Number(input.value);if(input.value.trim()===''||!Number.isFinite(n)){message('Նշեք վավեր թիվ։','error');renderInspector();return;}
    const value=key==='rotation'?degrees(n):snap(n);
    if(Math.abs(value-Number(currentPose(item)[key]||0))<1e-7){renderInspector();return;}
    editPose({[key]:value},{source:'numeric'});renderInspector();
  }
  for(const key of ['x','z','rotation']){
    const input=$(`pe-${key}`);
    input.addEventListener('change',()=>commitCoordinate(key,input));
    input.addEventListener('blur',()=>commitCoordinate(key,input));
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commitCoordinate(key,input);}});
  }
  async function importFile(file) {
    if(!file)return;
    if(file.size>262144){message('Ֆայլը չափազանց մեծ է։ Ընտրեք այս խմբագրիչից պահված JSON ֆայլը։','error');return;}
    try{
      const document=JSON.parse(await file.text());
      if(document.format!=='vv8-layout'||document.version!==1||!document.state?.placements)throw new Error('format');
      if(apply(copy(document.state),{source:'import'}))message('Ձեր տարբերակը բեռնված է։');
    }catch{message('Ֆայլը չի համապատասխանում այս հատակագծի ձևաչափին։','error');}
  }
  panel.addEventListener('click',event=>{
    const action=event.target.closest('[data-pe]')?.dataset.pe;if(!action)return;
    if(action==='close')close();
    else if(action==='view-3d'){close();onMode?.('dollhouse');}
    else if(action==='rotate'){const pose=currentPose(byId.get(selected));editPose({rotation:degrees(pose.rotation+90)});}
    else if(action==='restore-item'){
      const base=presets.find(p=>p.id==='original')?.state,pose=base?.placements?.[selected];
      if(pose)editPose(copy(pose));
    }else if(action==='undo'&&historyIndex>0){const index=historyIndex-1;if(apply(copy(history[index]),{source:'undo',rememberChange:false}))historyIndex=index;renderInspector();}
    else if(action==='redo'&&historyIndex<history.length-1){const index=historyIndex+1;if(apply(copy(history[index]),{source:'redo',rememberChange:false}))historyIndex=index;renderInspector();}
    else if(action==='reset'){
      const preset=presets.find(p=>p.id==='original')||presets[0];if(preset?.state)apply({...copy(preset.state),preset:preset.id},{source:'reset'});
    }else if(action==='export'){
      const payload=JSON.stringify({format:'vv8-layout',version:1,savedAt:new Date().toISOString(),state},null,2);
      const url=URL.createObjectURL(new Blob([payload],{type:'application/json'})),anchor=document.createElement('a');
      anchor.href=url;anchor.download='VV8-my-layout.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Դասավորությունը պահվել է ֆայլում։');
    }else if(action==='import')$('pe-file-input').click();
  });
  $('pe-file-input').addEventListener('change',event=>{importFile(event.target.files?.[0]);event.target.value='';});
  const onKey=event=>{
    if(!isOpen)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(event.target.closest('.plan-editor'))event.stopPropagation();
  };
  panel.addEventListener('keydown',onKey);
  const onDocumentKey=event=>{if(isOpen&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}};
  document.addEventListener('keydown',onDocumentKey,true);
  trigger.addEventListener('click',()=>isOpen?close():open());
  populateItems();render();
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(saved?.format==='vv8-layout'&&saved.version===1&&saved.state?.placements){
      if(apply(saved.state,{source:'restore',rememberChange:false,save:false})){history=[copy(state)];historyIndex=0;message('Վերականգնված է այս դիտարկիչում պահված ձեր տարբերակը։');}
    }
  }catch { /* A missing or incompatible local draft leaves the supplied plan intact. */ }

  return {
    open,close,
    refresh(next){state=copy(next||getState());render();},
    setSelection(id){setSelected(id,false);},
    getState(){return copy(state);},
    destroy(){destroyed=true;clearTimeout(saveTimer);document.removeEventListener('keydown',onDocumentKey,true);panel.remove();trigger.remove();document.body.classList.remove('plan-editor-open');}
  };
}
