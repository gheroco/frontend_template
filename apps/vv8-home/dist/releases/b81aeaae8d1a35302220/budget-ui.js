/** Furniture-only budget, expressed in AMD and converted at the documented reference rate. */
let budgetData = null;
let onRoom = () => {};
let activeCurrency = 'USD';
let activeRoom = 'all';
let selectedModelRoom = null;
let dialog;
let sidebarButton;

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const itemTotal = item => number(item.qty) * number(item.unitAMD);
const modelRooms = new Set(['living','kitchen','primary','bedroom','hall','bathroom','balcony-kitchen','balcony-bedroom']);
const formatNumber = value => new Intl.NumberFormat('hy-AM', {maximumFractionDigits: 0}).format(value);
const safeURL = value => {
  try { const url = new URL(String(value)); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; }
  catch { return ''; }
};

export function getBudgetTotals(data = budgetData) {
  if (!data) return {cap:0,planned:0,reserve:0,unallocated:0,retail:0,allowances:0};
  const cap = number(data.budgetUSD) * number(data.usdToAmd);
  const planned = data.items.reduce((sum,item) => sum + itemTotal(item), 0);
  const reserve = number(data.reserveAMD);
  const retail = data.items.filter(item => item.kind === 'retail').reduce((sum,item) => sum + itemTotal(item), 0);
  return {cap,planned,reserve,unallocated:cap-planned-reserve,retail,allowances:planned-retail};
}

function amount(amd, currency = activeCurrency) {
  if (currency === 'USD') return '$' + formatNumber(amd / budgetData.usdToAmd);
  return formatNumber(amd) + ' ֏';
}

function dateLabel(value) {
  const date = new Date(String(value) + 'T12:00:00+04:00');
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('hy-AM',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Yerevan'}).format(date) : String(value || '');
}

function roomName(id) {
  return budgetData.rooms.find(room => room.id === id)?.name || 'Ամբողջ բնակարանը';
}

function closeRoomSheet() {
  document.getElementById('sidebar')?.classList.remove('is-open');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) backdrop.hidden = true;
  document.getElementById('open-sidebar')?.setAttribute('aria-expanded','false');
}

function openBudget(room = 'all') {
  activeRoom = budgetData.rooms.some(item => item.id === room) ? room : 'all';
  closeRoomSheet();
  render();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.budget-scroll').scrollTop = 0;
}

function sourceLink(source, label = 'Գնի աղբյուրը') {
  const url = safeURL(source?.url);
  return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer" class="budget-source-link">${escape(label)}<span aria-hidden="true">↗</span></a>` : '';
}

function itemCard(item) {
  const source = budgetData.sources.find(source => source.id === item.sourceId);
  const isRetail = item.kind === 'retail';
  const quantity = number(item.qty);
  const dimensionText = typeof item.dimensions === 'object' ? Object.entries(item.dimensions).map(([key,value]) => `${key}: ${value}`).join(' · ') : item.dimensions;
  return `<article class="budget-item" data-budget-item="${escape(item.id)}">
    <div class="budget-item-main">
      <div class="budget-item-eyebrow"><span>${escape(roomName(item.room))}</span><span class="budget-price-kind ${isRetail ? 'listed' : 'allowance'}">${isRetail ? 'Կայքում նշված գին' : 'Նախահաշվային գումար'}</span></div>
      <h3>${escape(item.name)}</h3>
      <p class="budget-item-supplier">${escape(item.supplier || (isRetail ? 'Հայաստանյան վաճառող' : 'Պատվերով կահույք'))}${quantity > 1 ? `<span>Քանակ՝ ${formatNumber(quantity)}</span>` : ''}</p>
      ${dimensionText ? `<p class="budget-item-size">${icon('ruler')}<span>${escape(dimensionText)}</span></p>` : ''}
      ${item.note ? `<p class="budget-item-note">${escape(item.note)}</p>` : ''}
      ${item.availability ? `<p class="budget-item-availability">${escape(item.availability)}</p>` : ''}
      <div class="budget-item-links">${sourceLink(source,isRetail ? 'Ապրանքի էջը' : 'Գնի համեմատության աղբյուրը')}${modelRooms.has(item.room) ? `<button type="button" data-budget-view-room="${escape(item.room)}">Դիտել սենյակը ${icon('arrow')}</button>` : ''}</div>
    </div>
    <div class="budget-item-price"><strong>${amount(itemTotal(item))}</strong><small>${formatNumber(quantity)} × ${amount(number(item.unitAMD))}</small>${activeCurrency === 'USD' ? `<span>${amount(itemTotal(item),'AMD')}</span>` : `<span>~ ${amount(itemTotal(item),'USD')}</span>`}</div>
  </article>`;
}

function updateSidebar() {
  if (!sidebarButton || !budgetData) return;
  const totals = getBudgetTotals();
  const items = selectedModelRoom ? budgetData.items.filter(item => item.room === selectedModelRoom) : budgetData.items;
  const sum = items.reduce((total,item) => total + itemTotal(item),0);
  sidebarButton.innerHTML = `<span class="budget-sidebar-heading"><span class="budget-sidebar-dot"></span>${selectedModelRoom ? 'Այս սենյակի կահույքը' : 'Կահույքի նախահաշիվը'}${icon('chevron')}</span><span class="budget-sidebar-values"><strong>${amount(sum,'USD')}</strong><span>${selectedModelRoom ? escape(roomName(selectedModelRoom)) : `$${formatNumber(budgetData.budgetUSD)} սահմանաչափից`}</span></span><span class="budget-sidebar-note">${selectedModelRoom ? 'Դիտել կահույքը, չափերն ու գները' : `${amount(Math.max(0,totals.unallocated),'USD')} չբաշխված՝ պահուստից բացի`}</span>`;
  sidebarButton.setAttribute('aria-label', selectedModelRoom ? `Դիտել կահույքի բյուջեն․ ${roomName(selectedModelRoom)}` : 'Բացել կահույքի բյուջեն և հայաստանյան գների աղբյուրները');
}

function render() {
  const totals = getBudgetTotals();
  const filtered = activeRoom === 'all' ? budgetData.items : budgetData.items.filter(item => item.room === activeRoom);
  const filteredTotal = filtered.reduce((sum,item) => sum + itemTotal(item),0);
  const proportion = value => totals.cap > 0 ? Math.max(0,Math.min(100,value / totals.cap * 100)) : 0;
  const overBudget = totals.unallocated < 0;
  const retailCount = budgetData.items.filter(item => item.kind === 'retail').length;
  const allowanceCount = budgetData.items.length - retailCount;
  const date = dateLabel(budgetData.asOf);
  dialog.innerHTML = `<div class="dialog-heading budget-dialog-heading"><div><p class="eyebrow">ԿԱՀՈՒՅՔ · ՀԱՅԱՍՏԱՆՅԱՆ ԳՆԵՐ</p><h2 id="budget-title">${escape(budgetData.title || 'Խնամքով կահավորված տուն։')}</h2></div><button type="button" class="icon-button" data-budget-close aria-label="Փակել կահույքի բյուջեն">${icon('close')}</button></div>
    <div class="budget-scroll">
      <section class="budget-intro"><div><p class="budget-lead">${escape(budgetData.summary || 'Կահույքի ամբողջական նախահաշիվ՝ ընտրությունը հանգիստ կատարելու հնարավորությամբ։')}</p><p class="budget-scope">${escape(budgetData.scope || 'Կահույք, ներկառուցվող պահարաններ և տան տեքստիլ։ Վերանորոգումն ու կենցաղային տեխնիկան այս բյուջեում ներառված չեն։')}</p></div><div class="budget-currency-switch" role="group" aria-label="Ցուցադրվող արժույթը"><button type="button" data-budget-currency="USD" aria-pressed="${activeCurrency === 'USD'}">ԱՄՆ դոլար $</button><button type="button" data-budget-currency="AMD" aria-pressed="${activeCurrency === 'AMD'}">Դրամ ֏</button></div></section>
      <div class="budget-materials"><span class="budget-materials-name">Ժամանակակից ոճ՝ տաք երանգներով</span><span class="budget-swatch" style="--swatch:#e9e2d2" title="Փղոսկրագույն և բաց բեժ պաստառ"><i></i>Փղոսկրագույն և բեժ</span><span class="budget-swatch" style="--swatch:#82694f" title="Ապխտած կաղնի"><i></i>Ապխտած կաղնի</span><span class="budget-swatch" style="--swatch:#d9d5c8" title="Բաց գույնի քար"><i></i>Բաց գույնի քար</span><span class="budget-swatch" style="--swatch:#a8aaa0" title="Բաց մոխրագույն"><i></i>Բաց մոխրագույն</span><span class="budget-swatch" style="--swatch:#b49a65" title="Տաք երանգի բրոնզ"><i></i>Տաք երանգի բրոնզ</span></div>
      <section class="budget-overview" aria-label="Կահույքի բյուջեի ամփոփում">
        <div class="budget-metric ceiling"><span>Բյուջեի սահմանաչափ</span><strong>${amount(totals.cap)}</strong><small>${activeCurrency === 'USD' ? amount(totals.cap,'AMD') : amount(totals.cap,'USD')}</small></div>
        <div class="budget-metric planned"><span>Նախատեսված կահույք</span><strong>${amount(totals.planned)}</strong><small>Կայքի գներ + նախահաշվային գումարներ</small></div>
        <div class="budget-metric reserve"><span>Պահուստ</span><strong>${amount(totals.reserve)}</strong><small>Փոփոխությունների և վերջնական առաջարկների համար</small></div>
        <div class="budget-metric remaining ${overBudget ? 'over-budget' : ''}"><span>${overBudget ? 'Սահմանաչափի գերազանցում' : 'Չբաշխված գումար'}</span><strong>${amount(Math.abs(totals.unallocated))}</strong><small>${overBudget ? 'Մինչ պատվիրելը կրճատեք ընտրված կահույքը' : 'Բարելավումների կամ խնայողության համար'}</small></div>
      </section>
      <div class="budget-allocation"><div class="budget-track" role="img" aria-label="${escape(`Նախատեսված՝ ${amount(totals.planned)}․ պահուստ՝ ${amount(totals.reserve)}․ ${overBudget ? 'սահմանաչափի գերազանցում' : 'չբաշխված գումար'}՝ ${amount(Math.abs(totals.unallocated))}`)}"><span class="budget-track-planned" style="width:${proportion(totals.planned)}%"></span><span class="budget-track-reserve" style="width:${proportion(totals.reserve)}%"></span></div><div class="budget-allocation-note"><span><i class="planned"></i>Նախատեսված</span><span><i class="reserve"></i>Պահուստ</span><span><i class="remaining"></i>Չբաշխված</span><p>Պետք չէ ծախսել ամբողջ սահմանաչափը։</p></div></div>
      <div class="budget-price-basis"><div><strong>${formatNumber(retailCount)} կայքում նշված գին</strong><span>${amount(totals.retail)}</span></div><div><strong>${formatNumber(allowanceCount)} նախահաշվային գումար</strong><span>${amount(totals.allowances)}</span></div><p>Նախահաշվային գումարները պլանավորման գնահատումներ են, ոչ թե մատակարարների գնային առաջարկներ։ Պատվիրելուց առաջ կրկին ճշտեք կայքերում նշված գներն ու առկայությունը։</p></div>
      <section class="budget-plan-section" aria-label="Կահույքի ընտրությունն ըստ սենյակների"><div class="budget-section-heading"><div><p class="eyebrow">ՆԱԽԱՏԵՍՎԱԾ ԿԱՀՈՒՅՔ</p><h3>Ըստ սենյակների</h3></div><a class="budget-csv" href="./assets/VV8-furniture-budget.csv" download="VV8-furniture-budget.csv">${icon('download')}Ներբեռնել բյուջեն</a></div>
        <div class="budget-room-filters" role="group" aria-label="Զտել կահույքն ըստ սենյակի"><button type="button" data-budget-room="all" aria-pressed="${activeRoom === 'all'}">Ամբողջ բնակարանը<span>${amount(totals.planned)}</span></button>${budgetData.rooms.filter(room => budgetData.items.some(item => item.room === room.id)).map(room => {const sum=budgetData.items.filter(item=>item.room===room.id).reduce((total,item)=>total+itemTotal(item),0);return `<button type="button" data-budget-room="${escape(room.id)}" aria-pressed="${activeRoom===room.id}">${escape(room.name)}<span>${amount(sum)}</span></button>`;}).join('')}</div>
        <div class="budget-list-heading" aria-live="polite"><span>${formatNumber(filtered.length)} դիրք${activeRoom === 'all' ? '' : ` · ${escape(roomName(activeRoom))}`}</span><strong>${amount(filteredTotal)}</strong></div>
        <div class="budget-item-list">${filtered.length ? filtered.map(itemCard).join('') : '<p class="budget-empty">Այս սենյակի համար առանձին գնով կահույք նախատեսված չէ։</p>'}</div>
      </section>
      <details class="budget-notes"><summary>Գների հիմքը, ընդգրկումը և աղբյուրները<span>${icon('plus')}</span></summary><div class="budget-notes-body"><p class="budget-rate">Գները ստուգվել են՝ ${escape(date)} · Հաշվարկային փոխարժեք՝ <strong>$1 = ${escape(new Intl.NumberFormat('hy-AM',{maximumFractionDigits:2}).format(budgetData.usdToAmd))} ֏</strong>։</p><p>Դոլարով գումարները ցուցադրման համար կլորացված են։ Բյուջեն հաշվարկվում է դրամով՝ այս հաստատուն հաշվարկային փոխարժեքով։</p><ul>${(budgetData.notes || []).map(note => `<li>${escape(note)}</li>`).join('')}</ul><p>Եռաչափ տեսքում կահույքը ներկայացված է նախագծային ձևով։ Պատվիրելուց առաջ յուրաքանչյուր մատակարարի նշած արտաքին չափերը համեմատեք տեղում չափագրված հատակագծի հետ։</p><h4>Աղբյուրներ</h4><ol class="budget-source-list">${budgetData.sources.map(source=>`<li>${sourceLink(source,source.title)}${source.checked ? `<small>Ստուգվել է՝ ${escape(dateLabel(source.checked))}</small>` : ''}</li>`).join('')}</ol></div></details>
      <p class="budget-bottom-note">Գները՝ ${escape(date)} դրությամբ · Պատվերներ չեն կատարվել։</p>
    </div>`;
}

export function initBudgetUI({data, onRoom: roomHandler}) {
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.rooms) || !Number.isFinite(Number(data.usdToAmd)) || Number(data.usdToAmd) <= 0) throw new Error('Կահույքի բյուջեի համար անհրաժեշտ են կահույքի ցանկը, սենյակները և վավեր փոխարժեքը։');
  budgetData = {...data,sources:Array.isArray(data.sources)?data.sources:[]};
  onRoom = typeof roomHandler === 'function' ? roomHandler : () => {};
  document.getElementById('furniture-budget-dialog')?.remove();
  document.getElementById('furniture-budget-button')?.remove();
  document.getElementById('furniture-budget-summary')?.remove();
  const trigger = document.createElement('button');
  trigger.type = 'button';trigger.id = 'furniture-budget-button';trigger.className = 'budget-topbar-button';
  trigger.setAttribute('aria-label',`Բացել կահույքի $${formatNumber(budgetData.budgetUSD)} բյուջեն`);
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.innerHTML = `${icon('grid')}<span>Կահույք</span><strong>$${formatNumber(number(data.budgetUSD)/1000)} հազ․</strong>`;
  trigger.addEventListener('click',()=>openBudget());
  const actions = document.querySelector('.topbar-actions');
  actions?.insertBefore(trigger,actions.querySelector('.export-button'));
  sidebarButton = document.createElement('button');
  sidebarButton.type = 'button';sidebarButton.id = 'furniture-budget-summary';sidebarButton.className = 'budget-sidebar-card';
  sidebarButton.setAttribute('aria-haspopup','dialog');
  sidebarButton.addEventListener('click',()=>openBudget(selectedModelRoom || 'all'));
  document.getElementById('selection-card')?.insertAdjacentElement('afterend',sidebarButton);
  dialog = document.createElement('dialog');dialog.id = 'furniture-budget-dialog';dialog.className = 'budget-dialog';
  dialog.setAttribute('aria-labelledby','budget-title');document.body.append(dialog);
  dialog.addEventListener('click',event=>{
    const close = event.target.closest('[data-budget-close]');
    if (close) {dialog.close();return;}
    const currency = event.target.closest('[data-budget-currency]');
    if (currency) {const scroll=dialog.querySelector('.budget-scroll').scrollTop;activeCurrency=currency.dataset.budgetCurrency;render();dialog.querySelector('.budget-scroll').scrollTop=scroll;dialog.querySelector(`[data-budget-currency="${activeCurrency}"]`)?.focus({preventScroll:true});return;}
    const filter = event.target.closest('[data-budget-room]');
    if (filter) {const scroll=dialog.querySelector('.budget-scroll').scrollTop;activeRoom=filter.dataset.budgetRoom;render();dialog.querySelector('.budget-scroll').scrollTop=scroll;dialog.querySelector(`[data-budget-room="${CSS.escape(activeRoom)}"]`)?.focus({preventScroll:true});return;}
    const view = event.target.closest('[data-budget-view-room]');
    if (view) {dialog.close();onRoom(view.dataset.budgetViewRoom);return;}
    if (event.target === dialog) {const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}
  });
  // Keep viewer keyboard navigation inactive while the budget is open.
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  updateSidebar();
  return {open:openBudget,totals:getBudgetTotals()};
}

export function setBudgetRoom(roomId) {
  selectedModelRoom = budgetData?.rooms.some(room=>room.id===roomId) ? roomId : null;
  updateSidebar();
}
