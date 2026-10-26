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
const formatNumber = value => new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(value);
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
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Yerevan'}).format(date) : String(value || '');
}

function roomName(id) {
  return budgetData.rooms.find(room => room.id === id)?.name || 'Whole home';
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

function sourceLink(source, label = 'Price source') {
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
      <div class="budget-item-eyebrow"><span>${escape(roomName(item.room))}</span><span class="budget-price-kind ${isRetail ? 'listed' : 'allowance'}">${isRetail ? 'Listed online' : 'Planning allowance'}</span></div>
      <h3>${escape(item.name)}</h3>
      <p class="budget-item-supplier">${escape(item.supplier || (isRetail ? 'Armenian retailer' : 'Custom furniture'))}${quantity > 1 ? `<span>Quantity ${formatNumber(quantity)}</span>` : ''}</p>
      ${dimensionText ? `<p class="budget-item-size">${icon('ruler')}<span>${escape(dimensionText)}</span></p>` : ''}
      ${item.note ? `<p class="budget-item-note">${escape(item.note)}</p>` : ''}
      ${item.availability ? `<p class="budget-item-availability">${escape(item.availability)}</p>` : ''}
      <div class="budget-item-links">${sourceLink(source,isRetail ? 'Retail listing' : 'Price benchmark')}${modelRooms.has(item.room) ? `<button type="button" data-budget-view-room="${escape(item.room)}">View room ${icon('arrow')}</button>` : ''}</div>
    </div>
    <div class="budget-item-price"><strong>${amount(itemTotal(item))}</strong><small>${formatNumber(quantity)} × ${amount(number(item.unitAMD))}</small>${activeCurrency === 'USD' ? `<span>${amount(itemTotal(item),'AMD')}</span>` : `<span>~ ${amount(itemTotal(item),'USD')}</span>`}</div>
  </article>`;
}

function updateSidebar() {
  if (!sidebarButton || !budgetData) return;
  const totals = getBudgetTotals();
  const items = selectedModelRoom ? budgetData.items.filter(item => item.room === selectedModelRoom) : budgetData.items;
  const sum = items.reduce((total,item) => total + itemTotal(item),0);
  sidebarButton.innerHTML = `<span class="budget-sidebar-heading"><span class="budget-sidebar-dot"></span>${selectedModelRoom ? 'Furniture in this room' : 'Your furniture plan'}${icon('chevron')}</span><span class="budget-sidebar-values"><strong>${amount(sum,'USD')}</strong><span>${selectedModelRoom ? escape(roomName(selectedModelRoom)) : `of $${formatNumber(budgetData.budgetUSD)} ceiling`}</span></span><span class="budget-sidebar-note">${selectedModelRoom ? 'View items, dimensions & prices' : `${amount(Math.max(0,totals.unallocated),'USD')} unallocated after reserve`}</span>`;
  sidebarButton.setAttribute('aria-label', selectedModelRoom ? `View ${roomName(selectedModelRoom)} furniture budget` : 'Open furniture budget and Armenian price sources');
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
  dialog.innerHTML = `<div class="dialog-heading budget-dialog-heading"><div><p class="eyebrow">FURNITURE · ARMENIAN PRICES</p><h2 id="budget-title">${escape(budgetData.title || 'A considered home.')}</h2></div><button type="button" class="icon-button" data-budget-close aria-label="Close furniture budget">${icon('close')}</button></div>
    <div class="budget-scroll">
      <section class="budget-intro"><div><p class="budget-lead">${escape(budgetData.summary || 'A complete furniture plan, with room to choose carefully.')}</p><p class="budget-scope">${escape(budgetData.scope || 'Furniture, fitted cabinetry and soft furnishings. Renovation and appliances are outside this budget.')}</p></div><div class="budget-currency-switch" role="group" aria-label="Display currency"><button type="button" data-budget-currency="USD" aria-pressed="${activeCurrency === 'USD'}">USD $</button><button type="button" data-budget-currency="AMD" aria-pressed="${activeCurrency === 'AMD'}">AMD ֏</button></div></section>
      <div class="budget-materials"><span class="budget-materials-name">Warm contemporary</span><span class="budget-swatch" style="--swatch:#e9e2d2" title="Ivory and oat upholstery"><i></i>Ivory & oat</span><span class="budget-swatch" style="--swatch:#82694f" title="Smoked oak"><i></i>Smoked oak</span><span class="budget-swatch" style="--swatch:#d9d5c8" title="Pale stone"><i></i>Pale stone</span><span class="budget-swatch" style="--swatch:#a8aaa0" title="Dove grey"><i></i>Dove grey</span><span class="budget-swatch" style="--swatch:#b49a65" title="Warm bronze"><i></i>Warm bronze</span></div>
      <section class="budget-overview" aria-label="Furniture budget overview">
        <div class="budget-metric ceiling"><span>Budget ceiling</span><strong>${amount(totals.cap)}</strong><small>${activeCurrency === 'USD' ? amount(totals.cap,'AMD') : amount(totals.cap,'USD')}</small></div>
        <div class="budget-metric planned"><span>Planned furniture</span><strong>${amount(totals.planned)}</strong><small>Listed prices + allowances</small></div>
        <div class="budget-metric reserve"><span>Contingency reserve</span><strong>${amount(totals.reserve)}</strong><small>Held for changes & final quotes</small></div>
        <div class="budget-metric remaining ${overBudget ? 'over-budget' : ''}"><span>${overBudget ? 'Over budget' : 'Unallocated'}</span><strong>${amount(Math.abs(totals.unallocated))}</strong><small>${overBudget ? 'Reduce selections before ordering' : 'Available for upgrades or savings'}</small></div>
      </section>
      <div class="budget-allocation"><div class="budget-track" role="img" aria-label="${escape(`${amount(totals.planned)} planned; ${amount(totals.reserve)} contingency; ${amount(Math.abs(totals.unallocated))} ${overBudget ? 'over budget' : 'unallocated'}`)}"><span class="budget-track-planned" style="width:${proportion(totals.planned)}%"></span><span class="budget-track-reserve" style="width:${proportion(totals.reserve)}%"></span></div><div class="budget-allocation-note"><span><i class="planned"></i>Planned</span><span><i class="reserve"></i>Reserve</span><span><i class="remaining"></i>Unallocated</span><p>A ceiling, not a spending target.</p></div></div>
      <div class="budget-price-basis"><div><strong>${formatNumber(retailCount)} listed price${retailCount === 1 ? '' : 's'}</strong><span>${amount(totals.retail)}</span></div><div><strong>${formatNumber(allowanceCount)} allowance${allowanceCount === 1 ? '' : 's'}</strong><span>${amount(totals.allowances)}</span></div><p>Allowances are planning estimates, not supplier quotes. Online prices and stock should be reconfirmed before ordering.</p></div>
      <section class="budget-plan-section" aria-label="Room furniture selections"><div class="budget-section-heading"><div><p class="eyebrow">YOUR SELECTIONS</p><h3>Room by room.</h3></div><a class="budget-csv" href="./assets/VV8-furniture-budget.csv" download="VV8-furniture-budget.csv">${icon('download')}Download budget</a></div>
        <div class="budget-room-filters" role="group" aria-label="Filter furniture by room"><button type="button" data-budget-room="all" aria-pressed="${activeRoom === 'all'}">Whole home<span>${amount(totals.planned)}</span></button>${budgetData.rooms.filter(room => budgetData.items.some(item => item.room === room.id)).map(room => {const sum=budgetData.items.filter(item=>item.room===room.id).reduce((total,item)=>total+itemTotal(item),0);return `<button type="button" data-budget-room="${escape(room.id)}" aria-pressed="${activeRoom===room.id}">${escape(room.name)}<span>${amount(sum)}</span></button>`;}).join('')}</div>
        <div class="budget-list-heading" aria-live="polite"><span>${filtered.length} selection${filtered.length === 1 ? '' : 's'}${activeRoom === 'all' ? '' : ` · ${escape(roomName(activeRoom))}`}</span><strong>${amount(filteredTotal)}</strong></div>
        <div class="budget-item-list">${filtered.length ? filtered.map(itemCard).join('') : '<p class="budget-empty">No separately priced furniture is assigned to this room.</p>'}</div>
      </section>
      <details class="budget-notes"><summary>Price basis, scope & sources<span>${icon('plus')}</span></summary><div class="budget-notes-body"><p class="budget-rate">Prices checked ${escape(date)} · Reference conversion: <strong>$1 = ${escape(budgetData.usdToAmd)} ֏</strong>.</p><p>Dollar figures are rounded for display. The budget is calculated in drams at this fixed reference rate.</p><ul>${(budgetData.notes || []).map(note => `<li>${escape(note)}</li>`).join('')}</ul><p>Furniture in the 3D view is a design representation. Check each supplier's external dimensions against a measured floor plan before ordering.</p><h4>Sources</h4><ol class="budget-source-list">${budgetData.sources.map(source=>`<li>${sourceLink(source,source.title)}${source.checked ? `<small>Checked ${escape(dateLabel(source.checked))}</small>` : ''}</li>`).join('')}</ol></div></details>
      <p class="budget-bottom-note">${escape(date)} price snapshot · Nothing has been ordered.</p>
    </div>`;
}

export function initBudgetUI({data, onRoom: roomHandler}) {
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.rooms) || !Number.isFinite(Number(data.usdToAmd)) || Number(data.usdToAmd) <= 0) throw new Error('The furniture budget requires items, rooms and a valid exchange rate.');
  budgetData = {...data,sources:Array.isArray(data.sources)?data.sources:[]};
  onRoom = typeof roomHandler === 'function' ? roomHandler : () => {};
  document.getElementById('furniture-budget-dialog')?.remove();
  document.getElementById('furniture-budget-button')?.remove();
  document.getElementById('furniture-budget-summary')?.remove();
  const trigger = document.createElement('button');
  trigger.type = 'button';trigger.id = 'furniture-budget-button';trigger.className = 'budget-topbar-button';
  trigger.setAttribute('aria-label',`Open $${formatNumber(budgetData.budgetUSD)} furniture budget`);
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.innerHTML = `${icon('grid')}<span>Furniture</span><strong>$${formatNumber(number(data.budgetUSD)/1000)}k</strong>`;
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
