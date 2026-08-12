import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import secureSession from '@fastify/secure-session';
import fastifyStatic from '@fastify/static';
import * as oidc from 'openid-client';
import {
  CONTRACT_API_VERSION,
  PORTAL_API_VERSION,
  flattenVisibleExtensions,
  hasPermissions,
  type CatalogService,
  type ExtensionsResponse,
  type PortalIdentity,
  type SessionResponse
} from '@atlas/contracts';
import { CircuitBreaker, createServiceApp, fetchWithPolicy, mintDevToken } from '@atlas/service-kit';
import { RegistryCatalogClient, type CatalogProvider } from './catalog-client.js';

type StoredSession = {
  identity: PortalIdentity;
  csrfToken: string;
  accessToken?: string;
  expiresAt: number;
};

type OidcTransaction = { state: string; verifier: string; returnTo: string };
type PortalAppOptions = {
  logger?: boolean;
  catalogProvider?: CatalogProvider;
  serveStatic?: boolean;
  sessionKey?: string;
  publicUrl?: string;
  authMode?: 'dev' | 'oidc';
  allowedMicrofrontendOrigins?: string[];
};

const devIdentities: Record<string, PortalIdentity> = {
  viewer: {
    subject: 'dev-viewer', displayName: 'Alex Viewer', email: 'viewer@atlas.local', roles: ['viewer'], permissions: ['inventory:read', 'github-webhooks:read']
  },
  operator: {
    subject: 'dev-operator', displayName: 'Maya Operator', email: 'operator@atlas.local', roles: ['operator'],
    permissions: ['inventory:read', 'inventory:write', 'audit:read', 'github-webhooks:read']
  },
  admin: {
    subject: 'dev-admin', displayName: 'Sam Administrator', email: 'admin@atlas.local', roles: ['admin'],
    permissions: ['inventory:read', 'inventory:write', 'audit:read', 'github-webhooks:read', 'github-webhooks:manage', 'portal:admin']
  }
};

export async function buildPortalApp(options: PortalAppOptions = {}) {
  const version = process.env.SERVICE_VERSION ?? '1.0.0';
  const authMode = options.authMode ?? (process.env.AUTH_MODE === 'oidc' ? 'oidc' : 'dev');
  const publicUrl = (options.publicUrl ?? process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const sessionKey = decodeSessionKey(options.sessionKey ?? process.env.SESSION_KEY ?? '');
  const allowedOrigins = options.allowedMicrofrontendOrigins ?? parseList(process.env.MICROFRONTEND_ORIGINS);
  const catalog = options.catalogProvider ?? new RegistryCatalogClient(
    process.env.REGISTRY_URL ?? 'http://localhost:4100',
    process.env.REGISTRY_API_TOKEN
  );
  const breakers = new Map<string, CircuitBreaker>();
  const app = createServiceApp({ serviceName: 'portal-shell', serviceVersion: version, logger: options.logger });

  await app.register(secureSession, {
    key: sessionKey,
    cookieName: 'atlas_portal_session',
    expiry: 8 * 60 * 60,
    cookie: {
      path: '/',
      httpOnly: true,
      secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE !== 'false' : new URL(publicUrl).protocol === 'https:',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60
    }
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('content-security-policy', contentSecurityPolicy(allowedOrigins, new URL(publicUrl).protocol === 'https:'));
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    reply.header('cross-origin-opener-policy', 'same-origin');
  });

  app.get('/api/session', async (request): Promise<SessionResponse> => {
    const session = getStoredSession(request.session);
    if (!session || session.expiresAt <= Date.now()) {
      request.session.delete();
      return { authenticated: false, devMode: authMode === 'dev' };
    }
    return { authenticated: true, identity: session.identity, csrfToken: session.csrfToken, devMode: authMode === 'dev' };
  });

  app.post<{ Body: { identity?: string } }>('/auth/dev-login', async (request, reply) => {
    if (authMode !== 'dev') return reply.code(404).send({ error: 'not_found' });
    if (!isTrustedOrigin(request.headers.origin, publicUrl)) {
      return reply.code(403).send({ error: 'forbidden', message: 'Login origin is not trusted.', requestId: request.id });
    }
    const identity = request.body?.identity ? devIdentities[request.body.identity] : undefined;
    if (!identity) return reply.code(400).send({ error: 'invalid_identity', message: 'Choose a known development identity.' });
    const session: StoredSession = { identity, csrfToken: randomBytes(24).toString('base64url'), expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
    setSessionValue(request.session, 'portal', session);
    request.log.info({ audit: true, event: 'session.login', actor: identity.subject, authMode }, 'audit');
    return reply.code(204).send();
  });

  app.get('/auth/login', async (request, reply) => {
    if (authMode !== 'oidc') return reply.redirect('/');
    const config = await getOidcConfiguration();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    const state = oidc.randomState();
    const returnTo = safeReturnTo((request.query as { returnTo?: string }).returnTo);
    setSessionValue(request.session, 'oidc', { state, verifier, returnTo } satisfies OidcTransaction);
    const authorizationUrl = oidc.buildAuthorizationUrl(config, {
      redirect_uri: `${publicUrl}/auth/callback`,
      scope: 'openid profile email',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      ...(process.env.OIDC_AUDIENCE ? { audience: process.env.OIDC_AUDIENCE } : {})
    });
    return reply.redirect(authorizationUrl.toString());
  });

  app.get('/auth/callback', async (request, reply) => {
    if (authMode !== 'oidc') return reply.code(404).send({ error: 'not_found' });
    const transaction = request.session.get('oidc') as OidcTransaction | undefined;
    if (!transaction) return reply.code(400).send({ error: 'invalid_login', message: 'Login transaction expired.' });
    const config = await getOidcConfiguration();
    const tokens = await oidc.authorizationCodeGrant(config, new URL(request.url, publicUrl), {
      pkceCodeVerifier: transaction.verifier,
      expectedState: transaction.state
    });
    const claims = tokens.claims();
    if (!claims?.sub || !tokens.access_token) return reply.code(401).send({ error: 'invalid_token', message: 'Identity provider did not return required claims.' });
    const permissionsClaim = process.env.PERMISSIONS_CLAIM ?? 'permissions';
    const rolesClaim = process.env.ROLES_CLAIM ?? 'roles';
    const email = stringClaim(claims.email);
    const identity: PortalIdentity = {
      subject: claims.sub,
      displayName: stringClaim(claims.name) ?? stringClaim(claims.preferred_username) ?? claims.sub,
      ...(email ? { email } : {}),
      roles: stringArrayClaim(claims[rolesClaim]),
      permissions: stringArrayClaim(claims[permissionsClaim])
    };
    request.session.regenerate();
    setSessionValue(request.session, 'portal', {
      identity,
      csrfToken: randomBytes(24).toString('base64url'),
      accessToken: tokens.access_token,
      expiresAt: Date.now() + Math.min((tokens.expires_in ?? 3600) * 1000, 8 * 60 * 60 * 1000)
    } satisfies StoredSession);
    request.log.info({ audit: true, event: 'session.login', actor: identity.subject, authMode }, 'audit');
    return reply.redirect(transaction.returnTo);
  });

  app.post('/auth/logout', async (request, reply) => {
    const session = getStoredSession(request.session);
    if (!session) return reply.code(204).send();
    if (!validCsrf(request.headers['x-csrf-token'], session.csrfToken) || !isTrustedOrigin(request.headers.origin, publicUrl)) {
      return reply.code(403).send({ error: 'csrf_validation_failed', message: 'CSRF validation failed.', requestId: request.id });
    }
    request.log.info({ audit: true, event: 'session.logout', actor: session.identity.subject }, 'audit');
    request.session.delete();
    return reply.code(204).send();
  });

  app.get('/api/extensions', async (request, reply): Promise<ExtensionsResponse | unknown> => {
    const session = requireSession(request.session);
    if (!session) return reply.code(401).send({ error: 'unauthorized', message: 'Sign in is required.', requestId: request.id });
    try {
      const services = await catalog.list();
      const extensions = flattenVisibleExtensions(services, session.identity.permissions, PORTAL_API_VERSION)
        .filter((extension) => entryOriginAllowed(extension.entry.url, allowedOrigins));
      return {
        contractVersion: CONTRACT_API_VERSION,
        portalVersion: PORTAL_API_VERSION,
        generatedAt: new Date().toISOString(),
        extensions
      } satisfies ExtensionsResponse;
    } catch (error) {
      request.log.error({ err: error }, 'extension registry unavailable');
      return reply.code(503).send({ error: 'registry_unavailable', message: 'The extension catalog is temporarily unavailable.', requestId: request.id });
    }
  });

  app.all<{ Params: { serviceId: string; '*': string } }>('/api/services/:serviceId/*', async (request, reply) => {
    const session = requireSession(request.session);
    if (!session) return reply.code(401).send({ error: 'unauthorized', message: 'Sign in is required.', requestId: request.id });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && (!validCsrf(request.headers['x-csrf-token'], session.csrfToken) || !isTrustedOrigin(request.headers.origin, publicUrl))) {
      return reply.code(403).send({ error: 'csrf_validation_failed', message: 'CSRF validation failed.', requestId: request.id });
    }
    const service = await catalog.get(request.params.serviceId);
    if (!service?.spec.service.enabled) return reply.code(404).send({ error: 'not_found', message: 'Service is not registered.', requestId: request.id });
    if (!hasPermissions(session.identity.permissions, service.spec.backend.requiredPermissions)) {
      request.log.warn({ audit: true, event: 'authorization.denied', actor: session.identity.subject, serviceId: service.spec.service.id }, 'audit');
      return reply.code(403).send({ error: 'forbidden', message: 'Required service permission is missing.', requestId: request.id });
    }
    if (!upstreamAllowed(service)) return reply.code(502).send({ error: 'unsafe_upstream', message: 'Registered upstream is not allowlisted.', requestId: request.id });
    if (service.availability.state === 'unavailable') return reply.code(503).send({ error: 'service_unavailable', message: `${service.spec.service.displayName} is unavailable.`, requestId: request.id });

    const upstreamPath = sanitizeUpstreamPath(request.params['*']);
    if (upstreamPath === null) return reply.code(400).send({ error: 'invalid_path', message: 'Requested path is invalid.', requestId: request.id });
    const target = new URL(upstreamPath, `${service.spec.backend.upstream.replace(/\/$/, '')}/`);
    target.search = new URL(request.url, publicUrl).search;
    const token = authMode === 'dev'
      ? await mintDevToken(session.identity, process.env.DEV_JWT_SECRET ?? '', process.env.OIDC_AUDIENCE ?? 'portal-api')
      : session.accessToken;
    if (!token) return reply.code(401).send({ error: 'session_expired', message: 'Access token is not available.', requestId: request.id });

    const breaker = breakers.get(service.spec.service.id) ?? new CircuitBreaker(3, 10_000);
    breakers.set(service.spec.service.id, breaker);
    try {
      const response = await breaker.execute(() => fetchWithPolicy(target, {
        method: request.method,
        timeoutMilliseconds: 5_000,
        retries: request.method === 'GET' ? 1 : 0,
        headers: proxyHeaders(request.headers, token, request.id),
        ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: encodeBody(request.body) ?? null })
      }));
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > 2_097_152) return reply.code(502).send({ error: 'response_too_large', message: 'Upstream response exceeded the BFF limit.', requestId: request.id });
      reply.code(response.status);
      const contentType = response.headers.get('content-type');
      if (contentType) reply.type(contentType);
      reply.header('cache-control', 'no-store');
      return reply.send(body);
    } catch (error) {
      request.log.error({ err: error, serviceId: service.spec.service.id }, 'service proxy failed');
      return reply.code(503).send({ error: 'service_unavailable', message: `${service.spec.service.displayName} could not complete the request.`, requestId: request.id });
    }
  });

  if (options.serveStatic !== false) {
    await app.register(fastifyStatic, {
      root: path.resolve(import.meta.dirname, '../client'),
      prefix: '/',
      wildcard: false,
      index: false
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
        reply.header('cache-control', 'no-cache');
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found', message: 'Route was not found.', requestId: request.id });
    });
  }

  return app;
}

let oidcConfiguration: Promise<oidc.Configuration> | undefined;
function getOidcConfiguration(): Promise<oidc.Configuration> {
  if (!oidcConfiguration) {
    const issuer = process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_CLIENT_ID;
    if (!issuer || !clientId) throw new Error('OIDC_ISSUER and OIDC_CLIENT_ID are required');
    oidcConfiguration = oidc.discovery(new URL(issuer), clientId, process.env.OIDC_CLIENT_SECRET);
  }
  return oidcConfiguration;
}

function getStoredSession(session: { get(key: string): unknown }): StoredSession | undefined {
  return session.get('portal') as StoredSession | undefined;
}

function setSessionValue(session: unknown, key: string, value: unknown): void {
  (session as { set(name: string, entry: unknown): void }).set(key, value);
}

function requireSession(session: { get(key: string): unknown }): StoredSession | undefined {
  const stored = getStoredSession(session);
  return stored && stored.expiresAt > Date.now() ? stored : undefined;
}

function decodeSessionKey(value: string): Buffer {
  const decoded = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (decoded.byteLength !== 32) throw new Error('SESSION_KEY must decode to exactly 32 random bytes; run npm run setup');
  return decoded;
}

function validCsrf(value: string | string[] | undefined, expected: string): boolean {
  if (typeof value !== 'string') return false;
  const supplied = Buffer.from(value);
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

function isTrustedOrigin(origin: string | undefined, publicUrl: string): boolean {
  return origin === new URL(publicUrl).origin;
}

function safeReturnTo(value: string | undefined): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function parseList(value: string | undefined): string[] {
  return value?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function contentSecurityPolicy(origins: readonly string[], securePublicUrl: boolean): string {
  const remoteOrigins = origins.map((origin) => new URL(origin).origin).join(' ');
  return [
    `default-src 'self'`,
    `script-src 'self' ${remoteOrigins}`.trim(),
    `connect-src 'self' ${remoteOrigins}`.trim(),
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    ...(securePublicUrl ? [`upgrade-insecure-requests`] : [])
  ].join('; ');
}

function entryOriginAllowed(value: string, origins: readonly string[]): boolean {
  if (value.startsWith('/')) return true;
  const origin = new URL(value).origin;
  return origins.some((allowed) => new URL(allowed).origin === origin);
}

function upstreamAllowed(service: CatalogService): boolean {
  const url = new URL(service.spec.backend.upstream);
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', 'inventory', 'audit', 'github-webhooks'].includes(url.hostname)) return true;
  const suffixes = parseList(process.env.SERVICE_UPSTREAM_SUFFIXES ?? '.svc.cluster.local');
  return suffixes.some((suffix) => url.hostname.endsWith(suffix)) || /^[a-z][a-z0-9-]{1,62}$/.test(url.hostname);
}

function sanitizeUpstreamPath(value: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) return null;
  return decoded.replace(/^\/+/, '');
}

function proxyHeaders(headers: Record<string, unknown>, token: string, requestId: string): HeadersInit {
  const output: Record<string, string> = { authorization: `Bearer ${token}`, 'x-request-id': requestId, accept: 'application/json' };
  for (const name of ['content-type', 'idempotency-key', 'traceparent', 'tracestate']) {
    const value = headers[name];
    if (typeof value === 'string') output[name] = value;
  }
  return output;
}

function encodeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function stringArrayClaim(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value === 'string') return value.split(/[ ,]+/).filter(Boolean);
  return [];
}
