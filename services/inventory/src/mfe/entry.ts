import type { PortalCustomElement, PortalElementContext } from '@atlas/contracts';

type InventoryResponse = {
  serviceVersion: string;
  summary: { totalSkus: number; unitsInStock: number; attentionRequired: number };
  items: Array<{ sku: string; name: string; stock: number; reorderAt: number; location: string }>;
};
type SupplierResponse = {
  suppliers: Array<{ id: string; name: string; status: string; leadDays: number; activeOrders: number }>;
};

abstract class AtlasRemoteElement extends HTMLElement implements PortalCustomElement {
  #context: PortalElementContext | undefined;
  protected readonly root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  set portalContext(value: PortalElementContext | undefined) {
    this.#context = value;
    if (value && this.isConnected) void this.load(value);
  }

  get portalContext(): PortalElementContext | undefined {
    return this.#context;
  }

  connectedCallback(): void {
    this.renderLoading();
    if (this.#context) void this.load(this.#context);
  }

  protected abstract request(context: PortalElementContext): Promise<unknown>;
  protected abstract renderData(data: unknown, context: PortalElementContext): void;

  protected async load(context: PortalElementContext): Promise<void> {
    this.renderLoading();
    try {
      const data = await this.request(context);
      this.renderData(data, context);
      this.dispatchEvent(new CustomEvent('portal:ready', { bubbles: true, composed: true }));
    } catch (error) {
      this.root.innerHTML = `${styles}<section class="state error" role="alert"><strong>Inventory is temporarily unavailable</strong><span>${escapeHtml(error instanceof Error ? error.message : 'Request failed')}</span><button type="button">Try again</button></section>`;
      this.root.querySelector('button')?.addEventListener('click', () => void this.load(context));
      this.dispatchEvent(new CustomEvent('portal:error', { bubbles: true, composed: true, detail: { message: 'Inventory request failed' } }));
    }
  }

  private renderLoading(): void {
    this.root.innerHTML = `${styles}<section class="state" aria-live="polite"><span class="spinner"></span><strong>Loading service data…</strong></section>`;
  }
}

class InventoryOverviewV1 extends AtlasRemoteElement {
  protected override async request(context: PortalElementContext): Promise<InventoryResponse> {
    return getJson<InventoryResponse>(`${context.apiBasePath}/api/v1/items`);
  }

  protected override renderData(value: unknown, context: PortalElementContext): void {
    const data = value as InventoryResponse;
    this.root.innerHTML = `${styles}
      <section class="surface" aria-labelledby="inventory-title">
        <div class="headline"><div><span class="eyebrow">Supply operations</span><h2 id="inventory-title">Inventory overview</h2><p>Real-time availability across fulfillment locations.</p></div><span class="version">v${escapeHtml(context.serviceVersion)}</span></div>
        <div class="metrics">
          ${metric('SKUs monitored', data.summary.totalSkus, 'neutral')}
          ${metric('Units available', data.summary.unitsInStock, 'positive')}
          ${metric('Need attention', data.summary.attentionRequired, data.summary.attentionRequired ? 'warning' : 'positive')}
        </div>
        <div class="table-wrap"><table><thead><tr><th>Item</th><th>SKU</th><th>Location</th><th>Available</th><th>Status</th></tr></thead><tbody>
          ${data.items.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td><code>${escapeHtml(item.sku)}</code></td><td>${escapeHtml(item.location)}</td><td>${item.stock}</td><td>${statusPill(item.stock <= item.reorderAt ? 'Reorder' : 'Healthy', item.stock <= item.reorderAt ? 'warning' : 'positive')}</td></tr>`).join('')}
        </tbody></table></div>
      </section>`;
  }
}

class InventoryOverviewV2 extends InventoryOverviewV1 {
  protected override renderData(value: unknown, context: PortalElementContext): void {
    super.renderData(value, context);
    const headline = this.root.querySelector('.headline');
    headline?.insertAdjacentHTML('beforeend', '<span class="release">Enhanced view</span>');
  }
}

class InventorySuppliersV1 extends AtlasRemoteElement {
  protected override async request(context: PortalElementContext): Promise<SupplierResponse> {
    return getJson<SupplierResponse>(`${context.apiBasePath}/api/v1/suppliers`);
  }

  protected override renderData(value: unknown): void {
    const data = value as SupplierResponse;
    this.root.innerHTML = `${styles}<section class="surface"><div class="headline"><div><span class="eyebrow">Supply network</span><h2>Supplier health</h2><p>Lead time and order risk from the Inventory service.</p></div></div><div class="cards">${data.suppliers.map((supplier) => `<article class="supplier"><span class="avatar">${escapeHtml(initials(supplier.name))}</span><div><strong>${escapeHtml(supplier.name)}</strong><p>${supplier.activeOrders} active orders · ${supplier.leadDays} day lead</p></div>${statusPill(supplier.status === 'on-time' ? 'On time' : 'At risk', supplier.status === 'on-time' ? 'positive' : 'warning')}</article>`).join('')}</div></section>`;
  }
}

define('inventory-overview-v1', InventoryOverviewV1);
define('inventory-overview-v2', InventoryOverviewV2);
define('inventory-suppliers-v1', InventorySuppliersV1);

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 403 ? 'You do not have permission to view this data.' : `Request returned ${response.status}`);
  return response.json() as Promise<T>;
}

function define(name: string, constructor: CustomElementConstructor): void {
  if (!customElements.get(name)) customElements.define(name, constructor);
}

function metric(label: string, value: number, tone: string): string {
  return `<article class="metric ${tone}"><span>${escapeHtml(label)}</span><strong>${value.toLocaleString()}</strong></article>`;
}

function statusPill(label: string, tone: string): string {
  return `<span class="pill ${tone}"><i></i>${escapeHtml(label)}</span>`;
}

function initials(value: string): string {
  return value.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

const styles = `<style>
  :host{display:block;color:var(--atlas-text,#172033);font-family:var(--atlas-font,Inter,ui-sans-serif,system-ui);container-type:inline-size}
  *{box-sizing:border-box}.surface{background:var(--atlas-surface,#fff);border:1px solid var(--atlas-border,#e7eaf0);border-radius:20px;padding:clamp(18px,3vw,30px);box-shadow:0 16px 45px rgba(29,36,54,.06)}
  .headline{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px;position:relative}.eyebrow{color:var(--atlas-accent,#5b5ce2);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h2{font-size:clamp(24px,4vw,34px);letter-spacing:-.035em;margin:6px 0}p{color:var(--atlas-muted,#687086);margin:0;line-height:1.55}.version,.release{background:var(--atlas-tint,#f1f2ff);border-radius:99px;color:var(--atlas-accent,#5b5ce2);font-size:12px;font-weight:800;padding:7px 10px;white-space:nowrap}.release{position:absolute;right:0;top:40px;background:#e9fbf3;color:#13795b}
  .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:22px}.metric{background:var(--atlas-subtle,#f7f8fb);border-radius:14px;padding:16px}.metric span{color:var(--atlas-muted,#687086);display:block;font-size:13px}.metric strong{display:block;font-size:27px;margin-top:7px}.metric.warning{background:#fff7e8;color:#9c5b00}.metric.positive{background:#effbf6;color:#13795b}
  .table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:640px}th,td{border-bottom:1px solid var(--atlas-border,#e7eaf0);padding:14px 10px;text-align:left}th{color:var(--atlas-muted,#687086);font-size:11px;letter-spacing:.08em;text-transform:uppercase}td{font-size:14px}code{background:var(--atlas-subtle,#f7f8fb);border-radius:6px;padding:4px 6px}.pill{align-items:center;border-radius:99px;display:inline-flex;font-size:12px;font-weight:750;gap:6px;padding:6px 9px}.pill i{background:currentColor;border-radius:50%;height:6px;width:6px}.pill.positive{background:#e9fbf3;color:#13795b}.pill.warning{background:#fff2d5;color:#9c5b00}
  .cards{display:grid;gap:10px}.supplier{align-items:center;background:var(--atlas-subtle,#f7f8fb);border-radius:14px;display:grid;gap:13px;grid-template-columns:auto 1fr auto;padding:16px}.supplier .avatar{align-items:center;background:#e7e8ff;border-radius:11px;color:#4d4ed0;display:flex;font-size:12px;font-weight:900;height:42px;justify-content:center;width:42px}.supplier p{font-size:13px;margin-top:3px}.state{align-items:center;background:var(--atlas-surface,#fff);border:1px solid var(--atlas-border,#e7eaf0);border-radius:20px;display:flex;flex-direction:column;gap:10px;justify-content:center;min-height:320px;padding:30px;text-align:center}.state span{color:var(--atlas-muted,#687086)}.state.error{border-color:#f4c5c5;color:#9c3030}.state button{background:var(--atlas-accent,#5b5ce2);border:0;border-radius:9px;color:#fff;cursor:pointer;font:inherit;font-weight:700;padding:10px 14px}.spinner{animation:spin 1s linear infinite;border:3px solid #e5e7eb;border-top-color:var(--atlas-accent,#5b5ce2);border-radius:50%;height:28px;width:28px}@keyframes spin{to{transform:rotate(360deg)}}
  @container (max-width:620px){.metrics{grid-template-columns:1fr}.headline{display:block}.version{display:inline-block;margin-top:12px}.release{position:static;margin-left:6px}.surface{border-radius:14px}.supplier{grid-template-columns:auto 1fr}.supplier .pill{grid-column:2}}
</style>`;
