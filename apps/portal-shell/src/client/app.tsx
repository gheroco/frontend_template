import { Component, createElement, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import type {
  ExtensionsResponse,
  PortalCustomElement,
  PublicExtension,
  SessionResponse
} from '@atlas/contracts';
import { loadRemote } from './remote-loader.js';

type Theme = 'light' | 'dark';

export function App() {
  return <BrowserRouter><SessionGate /></BrowserRouter>;
}

function SessionGate() {
  const [session, setSession] = useState<SessionResponse>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/session', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('Session service is unavailable');
      setSession(await response.json() as SessionResponse);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Session could not be loaded');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (error) return <FullPageState title="Portal unavailable" message={error} action={<button onClick={() => void refresh()}>Retry</button>} />;
  if (!session) return <FullPageState title="Preparing your workspace" message="Validating the secure session…" loading />;
  if (!session.authenticated) return <LoginScreen devMode={session.devMode} onAuthenticated={refresh} />;
  return <Portal session={session} onSessionChanged={refresh} />;
}

function LoginScreen({ devMode, onAuthenticated }: { devMode: boolean; onAuthenticated: () => Promise<void> }) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const identities = [
    { id: 'viewer', title: 'Viewer', detail: 'Inventory read access', icon: 'V' },
    { id: 'operator', title: 'Operator', detail: 'Inventory and audit operations', icon: 'O' },
    { id: 'admin', title: 'Administrator', detail: 'All platform permissions', icon: 'A' }
  ];

  async function devLogin(identity: string) {
    setBusy(identity);
    setError(undefined);
    try {
      const response = await fetch('/auth/dev-login', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity })
      });
      if (!response.ok) throw new Error('Development sign-in failed');
      await onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed');
    } finally {
      setBusy(undefined);
    }
  }

  return <main className="login-shell">
    <section className="login-panel">
      <Brand />
      <div className="login-copy"><span className="kicker">Extensible operations</span><h1>Your services. One calm workspace.</h1><p>Runtime-discovered tools with independent ownership, releases, and failure boundaries.</p></div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      {devMode ? <div className="identity-grid" aria-label="Development identities">
        {identities.map((identity) => <button className="identity-card" key={identity.id} disabled={Boolean(busy)} onClick={() => void devLogin(identity.id)}>
          <span className="identity-icon">{identity.icon}</span><span><strong>{identity.title}</strong><small>{identity.detail}</small></span><i>{busy === identity.id ? '…' : '→'}</i>
        </button>)}
      </div> : <a className="primary-action" href="/auth/login">Continue with company identity <span>→</span></a>}
      {devMode && <p className="dev-note">Development identity provider · Production uses OIDC Authorization Code + PKCE.</p>}
    </section>
    <aside className="login-art" aria-hidden="true"><div className="orbit orbit-a"></div><div className="orbit orbit-b"></div><div className="core-mark"><span></span><span></span><span></span></div><p>Runtime extension graph</p></aside>
  </main>;
}

function Portal({ session, onSessionChanged }: { session: SessionResponse; onSessionChanged: () => Promise<void> }) {
  const { extensions, error, refresh, refreshing } = useExtensions();
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('atlas-theme') as Theme | null) ?? 'light');
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const active = findExtension(extensions, location.pathname);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('atlas-theme', theme);
  }, [theme]);

  async function logout() {
    await fetch('/auth/logout', {
      method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': session.csrfToken ?? '' }
    });
    await onSessionChanged();
  }

  return <div className="app-shell">
    <header className="topbar">
      <Brand compact />
      <div className="topbar-actions">
        <span className={`sync-state ${refreshing ? 'refreshing' : ''}`} title="Catalog refreshes automatically"><i></i>{refreshing ? 'Syncing' : 'Live catalog'}</span>
        <button className="icon-button" aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '◐' : '☀'}</button>
        <div className="profile-wrap">
          <button className="profile-button" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}><span className="avatar">{initials(session.identity?.displayName ?? 'User')}</span><span className="profile-copy"><strong>{session.identity?.displayName}</strong><small>{session.identity?.roles[0] ?? 'member'}</small></span><span>⌄</span></button>
          {profileOpen && <div className="profile-menu"><div><strong>{session.identity?.email}</strong><small>{session.identity?.permissions.length} permissions</small></div><button onClick={() => void logout()}>Sign out</button></div>}
        </div>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <p className="nav-label">Workspace</p>
        <nav className="tabs" role="tablist" aria-label="Registered services">
          <TabLink to="/" label="Overview" icon="sparkles" selected={location.pathname === '/'} />
          {extensions.map((extension) => <TabLink key={extension.id} to={extension.route} label={extension.displayName} icon={extension.icon} selected={active?.id === extension.id} unavailable={extension.availability.state === 'unavailable'} />)}
        </nav>
        <div className="sidebar-status"><span className="status-symbol">{extensions.length}</span><div><strong>Active extensions</strong><small>Discovered at runtime</small></div></div>
      </aside>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {error && <div className="catalog-warning" role="status"><span>Catalog refresh failed. Showing the last known tabs.</span><button onClick={() => void refresh()}>Retry</button></div>}
        {location.pathname === '/' ? <Overview extensions={extensions} identityName={session.identity?.displayName ?? 'there'} /> : active ?
          <ExtensionErrorBoundary key={`${active.id}:${active.serviceVersion}`} extension={active}><RemoteExtensionHost extension={active} theme={theme} /></ExtensionErrorBoundary> :
          <NotFound extensions={extensions} />}
      </main>
    </div>
  </div>;
}

export function TabLink({ to, label, icon, selected, unavailable = false }: { to: string; label: string; icon: PublicExtension['icon']; selected: boolean; unavailable?: boolean }) {
  return <Link to={to} className={`tab ${selected ? 'selected' : ''}`} role="tab" aria-selected={selected}><Icon name={icon} /><span>{label}</span>{unavailable && <i className="unavailable-dot" title="Service unavailable"></i>}</Link>;
}

function Overview({ extensions, identityName }: { extensions: PublicExtension[]; identityName: string }) {
  const healthy = extensions.filter((extension) => extension.availability.state !== 'unavailable').length;
  return <div className="overview-page">
    <section className="welcome"><div><span className="kicker">Platform overview</span><h1>Welcome back, {identityName.split(' ')[0]}</h1><p>Your service workspace is assembled from the live extension catalog.</p></div><div className="date-chip">{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</div></section>
    <section className="overview-metrics" aria-label="Portal status"><article><span className="metric-icon purple"><Icon name="boxes" /></span><div><strong>{extensions.length}</strong><small>Visible tabs</small></div></article><article><span className="metric-icon green"><Icon name="pulse" /></span><div><strong>{healthy}</strong><small>Healthy services</small></div></article><article><span className="metric-icon amber"><Icon name="shield" /></span><div><strong>Enforced</strong><small>Backend RBAC</small></div></article></section>
    <section className="service-section"><div className="section-heading"><div><h2>Service catalog</h2><p>Access is tailored to your current permissions.</p></div><span>{extensions.length} available</span></div>
      {extensions.length ? <div className="service-grid">{extensions.map((extension) => <Link to={extension.route} className="service-card" key={extension.id}><span className={`service-icon ${extension.icon}`}><Icon name={extension.icon} /></span><div><strong>{extension.displayName}</strong><p>{extension.description || extension.serviceDisplayName}</p><small>{extension.serviceDisplayName} · v{extension.serviceVersion}</small></div><span className="card-arrow">→</span></Link>)}</div> : <EmptyCatalog />}
    </section>
  </div>;
}

function RemoteExtensionHost({ extension, theme }: { extension: PublicExtension; theme: Theme }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('Loading secure extension…');
  const [attempt, setAttempt] = useState(0);
  const location = useLocation();
  const elementRef = useRef<PortalCustomElement | null>(null);
  const subPath = location.pathname.slice(extension.route.length) || '/';

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setMessage('Loading secure extension…');
    void loadRemote(extension).then(() => {
      if (active) setStatus('ready');
    }).catch((cause: unknown) => {
      if (active) { setStatus('error'); setMessage(cause instanceof Error ? cause.message : 'Remote extension failed to load'); }
    });
    return () => { active = false; };
  }, [extension.entry.url, extension.entry.integrity, extension.elementName, attempt]);

  useEffect(() => {
    if (!elementRef.current || status !== 'ready') return;
    elementRef.current.portalContext = {
      apiBasePath: extension.apiBasePath,
      extensionId: extension.id,
      serviceVersion: extension.serviceVersion,
      subPath,
      theme,
      locale: navigator.language
    };
  }, [extension, status, subPath, theme]);

  if (extension.availability.state === 'unavailable') return <ExtensionState icon="pulse" title={`${extension.displayName} is unavailable`} message="The service failed its dependency health checks. The rest of the portal remains available." action={<button onClick={() => window.location.reload()}>Check again</button>} />;
  if (status === 'loading') return <ExtensionState loading icon={extension.icon} title={`Opening ${extension.displayName}`} message="Validating integrity and starting the isolated extension…" />;
  if (status === 'error') return <ExtensionState icon="shield" title={`${extension.displayName} could not start`} message={message} action={<button onClick={() => setAttempt((value) => value + 1)}>Retry extension</button>} />;

  return <section className="extension-page" aria-label={extension.displayName}>
    <div className="extension-breadcrumb"><span>Services</span><b>/</b><strong>{extension.displayName}</strong><span className="extension-version">{extension.extensionVersion}</span></div>
    {createElement(extension.elementName, {
      ref: (node: PortalCustomElement | null) => { elementRef.current = node; },
      onPortalError: () => setMessage('The extension reported an internal error.')
    })}
  </section>;
}

class ExtensionErrorBoundary extends Component<{ extension: PublicExtension; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch(error: Error, info: ErrorInfo): void { console.error('Extension boundary isolated a failure', { extensionId: this.props.extension.id, error, info }); }
  override render() {
    if (this.state.failed) return <ExtensionState icon="shield" title={`${this.props.extension.displayName} encountered an error`} message="This tab was isolated before it could affect the portal or another service." action={<button onClick={() => this.setState({ failed: false })}>Try again</button>} />;
    return this.props.children;
  }
}

function useExtensions() {
  const [extensions, setExtensions] = useState<PublicExtension[]>([]);
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/extensions', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('Catalog endpoint is unavailable');
      const payload = await response.json() as ExtensionsResponse;
      setExtensions(payload.extensions);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Catalog refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5_000);
    return () => window.clearInterval(interval);
  }, [refresh]);
  return { extensions, error, refresh, refreshing };
}

function findExtension(extensions: PublicExtension[], pathname: string): PublicExtension | undefined {
  return [...extensions].sort((a, b) => b.route.length - a.route.length).find((extension) => pathname === extension.route || pathname.startsWith(`${extension.route}/`));
}

function NotFound({ extensions }: { extensions: PublicExtension[] }) {
  const navigate = useNavigate();
  return <ExtensionState icon="settings" title="This tab is no longer available" message="It may have been disabled, unregistered, or hidden by a permission change." action={<button onClick={() => navigate('/')}>Return to overview</button>}><small>{extensions.length} extensions remain available.</small></ExtensionState>;
}

function EmptyCatalog() {
  return <div className="empty-catalog"><span><Icon name="boxes" /></span><h3>No tabs are available yet</h3><p>Register an enabled PortalService extension or request the required permission.</p></div>;
}

function ExtensionState({ icon, title, message, action, loading = false, children }: { icon: PublicExtension['icon']; title: string; message: string; action?: ReactNode; loading?: boolean; children?: ReactNode }) {
  return <section className="extension-state" role={loading ? 'status' : 'alert'}><span className={`state-icon ${loading ? 'loading' : ''}`}><Icon name={icon} /></span><h2>{title}</h2><p>{message}</p>{action}{children}</section>;
}

function FullPageState({ title, message, action, loading = false }: { title: string; message: string; action?: ReactNode; loading?: boolean }) {
  return <main className="full-state"><Brand /><span className={`state-icon ${loading ? 'loading' : ''}`}><Icon name={loading ? 'pulse' : 'shield'} /></span><h1>{title}</h1><p>{message}</p>{action}</main>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><span className="brand-mark"><i></i><i></i><i></i></span><span><strong>Atlas</strong><small>service portal</small></span></div>;
}

function Icon({ name }: { name: PublicExtension['icon'] }) {
  const paths: Record<PublicExtension['icon'], ReactNode> = {
    boxes: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8 10h8M8 14h8M8 18h5"/></>,
    pulse: <><path d="M3 12h4l2-6 4 12 2-6h6"/></>,
    shield: <><path d="M12 3 4.5 6v5c0 5 3 8 7.5 10 4.5-2 7.5-5 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-5"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a7 7 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a7 7 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></>,
    sparkles: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/><path d="m5 14 .6 1.8 1.9.7-1.9.7L5 19l-.6-1.8-1.9-.7 1.9-.7L5 14Z"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function initials(value: string): string {
  return value.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase();
}
