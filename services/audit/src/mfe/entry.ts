import type { PortalCustomElement, PortalElementContext } from '@atlas/contracts';

type AuditResponse = {
  serviceVersion: string;
  events: Array<{ id: string; action: string; actor: string; target: string; outcome: string; occurredAt: string }>;
};

class AuditTimelineV1 extends HTMLElement implements PortalCustomElement {
  #context: PortalElementContext | undefined;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  set portalContext(value: PortalElementContext | undefined) {
    this.#context = value;
    if (value && this.isConnected) void this.load(value);
  }

  get portalContext(): PortalElementContext | undefined { return this.#context; }

  connectedCallback(): void {
    this.renderLoading();
    if (this.#context) void this.load(this.#context);
  }

  async load(context: PortalElementContext): Promise<void> {
    this.renderLoading();
    try {
      const response = await fetch(`${context.apiBasePath}/api/v1/events`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status === 403 ? 'Audit access is not available for your role.' : `Request returned ${response.status}`);
      const data = await response.json() as AuditResponse;
      this.#root.innerHTML = `${styles}<section class="surface" aria-labelledby="audit-title"><div class="headline"><div><span class="eyebrow">Governance</span><h2 id="audit-title">Audit activity</h2><p>Security and lifecycle events from across the platform.</p></div><span class="live"><i></i>Live</span></div><div class="timeline">${data.events.map(renderEvent).join('')}</div></section>`;
      this.dispatchEvent(new CustomEvent('portal:ready', { bubbles: true, composed: true }));
    } catch (error) {
      this.#root.innerHTML = `${styles}<section class="state error" role="alert"><strong>Audit data could not be loaded</strong><span>${escapeHtml(error instanceof Error ? error.message : 'Request failed')}</span><button type="button">Try again</button></section>`;
      this.#root.querySelector('button')?.addEventListener('click', () => void this.load(context));
      this.dispatchEvent(new CustomEvent('portal:error', { bubbles: true, composed: true }));
    }
  }

  private renderLoading(): void {
    this.#root.innerHTML = `${styles}<section class="state" aria-live="polite"><span class="spinner"></span><strong>Loading audit stream…</strong></section>`;
  }
}

if (!customElements.get('audit-timeline-v1')) customElements.define('audit-timeline-v1', AuditTimelineV1);

function renderEvent(event: AuditResponse['events'][number]): string {
  const denied = event.outcome === 'denied';
  return `<article class="event"><span class="event-icon ${denied ? 'denied' : ''}">${denied ? '!' : '✓'}</span><div><strong>${escapeHtml(humanize(event.action))}</strong><p><b>${escapeHtml(event.actor)}</b> · ${escapeHtml(event.target)}</p></div><time datetime="${escapeHtml(event.occurredAt)}">${formatTime(event.occurredAt)}</time></article>`;
}

function humanize(value: string): string {
  return value.split('.').map((part) => part.replace(/-/g, ' ')).join(' / ');
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

const styles = `<style>
  :host{display:block;color:var(--atlas-text,#172033);font-family:var(--atlas-font,Inter,ui-sans-serif,system-ui);container-type:inline-size}*{box-sizing:border-box}.surface{background:var(--atlas-surface,#fff);border:1px solid var(--atlas-border,#e7eaf0);border-radius:20px;padding:clamp(18px,3vw,30px);box-shadow:0 16px 45px rgba(29,36,54,.06)}.headline{align-items:flex-start;display:flex;justify-content:space-between;gap:20px;margin-bottom:24px}.eyebrow{color:var(--atlas-accent,#5b5ce2);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}h2{font-size:clamp(24px,4vw,34px);letter-spacing:-.035em;margin:6px 0}p{color:var(--atlas-muted,#687086);line-height:1.5;margin:0}.live{align-items:center;background:#e9fbf3;border-radius:99px;color:#13795b;display:flex;font-size:12px;font-weight:800;gap:7px;padding:7px 10px}.live i{animation:pulse 1.6s infinite;background:#27a77c;border-radius:50%;height:7px;width:7px}.timeline{display:grid}.event{align-items:center;border-top:1px solid var(--atlas-border,#e7eaf0);display:grid;gap:14px;grid-template-columns:auto 1fr auto;padding:17px 0}.event:first-child{border-top:0}.event-icon{align-items:center;background:#e9fbf3;border-radius:11px;color:#13795b;display:flex;font-weight:900;height:38px;justify-content:center;width:38px}.event-icon.denied{background:#fff0f0;color:#b64141}.event strong{font-size:14px;text-transform:capitalize}.event p{font-size:13px;margin-top:4px}.event p b{color:var(--atlas-text,#172033);font-weight:650}.event time{color:var(--atlas-muted,#687086);font-size:12px;white-space:nowrap}.state{align-items:center;background:var(--atlas-surface,#fff);border:1px solid var(--atlas-border,#e7eaf0);border-radius:20px;display:flex;flex-direction:column;gap:10px;justify-content:center;min-height:320px;padding:30px;text-align:center}.state span{color:var(--atlas-muted,#687086)}.state.error{border-color:#f4c5c5;color:#9c3030}.state button{background:var(--atlas-accent,#5b5ce2);border:0;border-radius:9px;color:#fff;cursor:pointer;font:inherit;font-weight:700;padding:10px 14px}.spinner{animation:spin 1s linear infinite;border:3px solid #e5e7eb;border-top-color:var(--atlas-accent,#5b5ce2);border-radius:50%;height:28px;width:28px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{box-shadow:0 0 0 5px rgba(39,167,124,.16)}}@container (max-width:560px){.event{grid-template-columns:auto 1fr}.event time{grid-column:2}.surface{border-radius:14px}}
</style>`;
