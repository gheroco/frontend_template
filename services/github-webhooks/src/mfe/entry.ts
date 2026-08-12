import type { PortalCustomElement, PortalElementContext } from '@atlas/contracts';

type Summary = {
  total: number;
  last24Hours: number;
  eventTypes: number;
  latestReceivedAt: string | null;
  topEventTypes: Array<{ eventType: string; count: number }>;
};
type Delivery = {
  deliveryId: string;
  eventType: string;
  action: string | null;
  processingStatus: 'processed' | 'invalid';
  receivedAt: string;
  repositoryFullName: string | null;
  organizationLogin: string | null;
  senderLogin: string | null;
  payloadBytes: number;
};
type Page = { deliveries: Delivery[]; nextCursor: string | null };

class GithubWebhookDeliveries extends HTMLElement implements PortalCustomElement {
  #context: PortalElementContext | undefined;
  #root = this.attachShadow({ mode: 'open' });
  #eventType = '';

  set portalContext(value: PortalElementContext | undefined) {
    this.#context = value;
    if (this.isConnected) void this.#load();
  }
  get portalContext(): PortalElementContext | undefined { return this.#context; }

  connectedCallback(): void {
    this.#root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-reload]')) void this.#load();
    });
    this.#root.addEventListener('change', (event) => {
      const target = event.target as HTMLSelectElement;
      if (target.matches('[data-event-filter]')) { this.#eventType = target.value; void this.#load(); }
    });
    void this.#load();
  }

  async #load(): Promise<void> {
    if (!this.#context) { this.#renderMessage('Waiting for portal context…'); return; }
    this.#renderMessage('Loading webhook deliveries…');
    try {
      const query = new URLSearchParams({ limit: '50' });
      if (this.#eventType) query.set('eventType', this.#eventType);
      const [summary, page] = await Promise.all([
        this.#request<Summary>('/api/v1/summary'),
        this.#request<Page>(`/api/v1/deliveries?${query}`)
      ]);
      this.#render(summary, page);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The webhook service is unavailable.';
      this.#renderError(message);
    }
  }

  async #request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.#context?.apiBasePath ?? ''}${path}`, { credentials: 'include' });
    if (!response.ok) throw new Error(response.status === 403 ? 'You do not have permission to view webhook deliveries.' : `Request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }

  #render(summary: Summary, page: Page): void {
    const eventTypes = [...new Set([...summary.topEventTypes.map((entry) => entry.eventType), ...page.deliveries.map((delivery) => delivery.eventType)])].sort();
    this.#root.innerHTML = `${styles}
      <main>
        <header><div><p class="eyebrow">INTEGRATIONS / GITHUB</p><h1>Webhook deliveries</h1><p class="subtitle">Durably accepted direct webhook events. Payload bodies and secrets are never exposed here.</p></div><button data-reload>Refresh</button></header>
        <section class="metrics" aria-label="Delivery summary">
          ${metric('Total retained', formatNumber(summary.total))}
          ${metric('Last 24 hours', formatNumber(summary.last24Hours))}
          ${metric('Event types', formatNumber(summary.eventTypes))}
          ${metric('Latest delivery', summary.latestReceivedAt ? relativeTime(summary.latestReceivedAt) : 'None')}
        </section>
        <section class="panel">
          <div class="panel-head"><div><h2>Recent deliveries</h2><p>Newest first · duplicate delivery IDs are stored once</p></div>
            <label>Event type<select data-event-filter><option value="">All events</option>${eventTypes.map((type) => `<option value="${escapeHtml(type)}" ${type === this.#eventType ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select></label>
          </div>
          <div class="table-wrap"><table><thead><tr><th>Status</th><th>Event</th><th>Repository / organization</th><th>Sender</th><th>Received</th><th>Size</th><th>Delivery ID</th></tr></thead>
            <tbody>${page.deliveries.length > 0 ? page.deliveries.map(row).join('') : '<tr><td class="empty" colspan="7">No deliveries match this filter.</td></tr>'}</tbody>
          </table></div>
        </section>
      </main>`;
  }

  #renderMessage(message: string): void { this.#root.innerHTML = `${styles}<main><div class="state">${escapeHtml(message)}</div></main>`; }
  #renderError(message: string): void { this.#root.innerHTML = `${styles}<main><div class="state error"><strong>Could not load deliveries</strong><span>${escapeHtml(message)}</span><button data-reload>Try again</button></div></main>`; }
}

function metric(label: string, value: string): string { return `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`; }
function row(delivery: Delivery): string {
  const scope = delivery.repositoryFullName ?? delivery.organizationLogin ?? '—';
  return `<tr><td><span class="badge ${delivery.processingStatus}">${delivery.processingStatus}</span></td><td><strong>${escapeHtml(delivery.eventType)}</strong>${delivery.action ? `<small>${escapeHtml(delivery.action)}</small>` : ''}</td><td>${escapeHtml(scope)}</td><td>${escapeHtml(delivery.senderLogin ?? '—')}</td><td title="${escapeHtml(delivery.receivedAt)}">${escapeHtml(relativeTime(delivery.receivedAt))}</td><td>${escapeHtml(formatBytes(delivery.payloadBytes))}</td><td><code>${escapeHtml(delivery.deliveryId)}</code></td></tr>`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }
function formatNumber(value: number): string { return new Intl.NumberFormat().format(value); }
function formatBytes(value: number): string { return value < 1024 ? `${value} B` : value < 1_048_576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1_048_576).toFixed(1)} MB`; }
function relativeTime(value: string): string {
  const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] = absolute < 60 ? [seconds, 'second'] : absolute < 3_600 ? [Math.round(seconds / 60), 'minute'] : absolute < 86_400 ? [Math.round(seconds / 3_600), 'hour'] : [Math.round(seconds / 86_400), 'day'];
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(amount, unit);
}

const styles = `<style>
  :host{display:block;color:var(--atlas-text,#16202a);font:14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}main{padding:28px;max-width:1500px;margin:auto}header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:24px}.eyebrow{color:#5b6b7b;font-size:12px;font-weight:700;letter-spacing:.12em;margin:0 0 6px}h1{font-size:30px;line-height:1.15;margin:0}h2{font-size:18px;margin:0}.subtitle,.panel-head p{color:#627181;margin:6px 0 0}button,select{border:1px solid #c9d3dc;border-radius:8px;background:#fff;color:inherit;padding:9px 12px;font:inherit}button{cursor:pointer;font-weight:650}button:hover{border-color:#1778f2}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}.metrics article,.panel{background:var(--atlas-surface,#fff);border:1px solid #dce3e9;border-radius:12px;box-shadow:0 2px 8px #142b4410}.metrics article{padding:17px}.metrics span{display:block;color:#627181;font-size:12px;font-weight:650;text-transform:uppercase;letter-spacing:.04em}.metrics strong{display:block;font-size:24px;margin-top:7px}.panel-head{display:flex;align-items:end;justify-content:space-between;gap:20px;padding:18px 20px;border-bottom:1px solid #e5eaee}.panel-head label{color:#5b6977;font-size:12px;font-weight:650}.panel-head select{display:block;min-width:180px;margin-top:5px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;min-width:980px}th,td{padding:13px 16px;text-align:left;border-bottom:1px solid #edf0f3;white-space:nowrap}th{color:#617080;background:#f8fafb;font-size:11px;text-transform:uppercase;letter-spacing:.06em}td small{display:block;color:#697887}code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#455565}.badge{display:inline-flex;border-radius:99px;padding:3px 8px;font-size:11px;font-weight:700;text-transform:capitalize}.badge.processed{background:#e4f7ed;color:#12633c}.badge.invalid{background:#fee9e8;color:#a0231c}.empty{text-align:center;color:#697887;padding:40px}.state{display:flex;min-height:250px;align-items:center;justify-content:center;color:#627181}.state.error{flex-direction:column;gap:10px}.state.error strong{color:#a0231c}@media(max-width:900px){main{padding:18px}.metrics{grid-template-columns:repeat(2,1fr)}header,.panel-head{align-items:stretch;flex-direction:column}}@media(prefers-color-scheme:dark){:host{color:#e8eef3}.metrics article,.panel{background:#141c24;border-color:#2b3947}.subtitle,.panel-head p,.eyebrow{color:#9aacbc}.panel-head{border-color:#2b3947}th{background:#1a2530;color:#adbac7}th,td{border-color:#283542}button,select{background:#17212b;border-color:#405163;color:#e8eef3}}
</style>`;

if (!customElements.get('github-webhook-deliveries-v1')) customElements.define('github-webhook-deliveries-v1', GithubWebhookDeliveries);
