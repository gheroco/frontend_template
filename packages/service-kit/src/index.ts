import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type preHandlerHookHandler
} from 'fastify';
import {
  SignJWT,
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey
} from 'jose';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { PortalIdentity } from '@atlas/contracts';

declare module 'fastify' {
  interface FastifyInstance {
    metricsRegistry: Registry;
  }
  interface FastifyRequest {
    identity: PortalIdentity | null;
  }
}

export type ServiceAppOptions = {
  serviceName: string;
  serviceVersion: string;
  logger?: boolean | undefined;
  ready?: () => boolean | Promise<boolean>;
};

export type AuthOptions = {
  mode: 'dev' | 'oidc';
  audience: string;
  issuer?: string | undefined;
  devSecret?: string | undefined;
  permissionsClaim?: string | undefined;
  rolesClaim?: string | undefined;
};

export function createServiceApp(options: ServiceAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger === false ? false : {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]'
      }
    },
    genReqId(request) {
      const supplied = request.headers['x-request-id'];
      return typeof supplied === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
    },
    requestTimeout: 15_000,
    connectionTimeout: 5_000,
    keepAliveTimeout: 72_000,
    bodyLimit: 1_048_576,
    trustProxy: true
  });

  app.decorateRequest('identity', null);
  void app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  });

  const metrics = installMetrics(app, options.serviceName, options.serviceVersion);
  app.decorate('metricsRegistry', metrics.registry);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
  });

  app.get('/health/live', async () => ({
    status: 'ok',
    service: options.serviceName,
    version: options.serviceVersion
  }));

  app.get('/health/startup', async () => ({
    status: 'started',
    service: options.serviceName,
    version: options.serviceVersion
  }));

  app.get('/health/ready', async (_request, reply) => {
    const ready = (await options.ready?.()) ?? true;
    if (!ready) return reply.code(503).send({ status: 'not-ready', service: options.serviceName });
    return { status: 'ready', service: options.serviceName, version: options.serviceVersion };
  });

  app.get('/metrics', async (_request, reply) => {
    reply.type(metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  app.setErrorHandler((error, request, reply) => {
    const normalized = (error instanceof Error ? error : new Error('Unknown service error')) as Error & { statusCode?: number };
    request.log.error({ err: normalized, requestId: request.id }, 'request failed');
    const statusCode = normalized.statusCode && normalized.statusCode >= 400 ? normalized.statusCode : 500;
    return reply.code(statusCode).send({
      error: statusCode === 500 ? 'Internal Server Error' : normalized.name,
      message: statusCode === 500 ? 'The service could not complete the request.' : normalized.message,
      requestId: request.id
    });
  });

  return app;
}

export function createAuthHooks(options: AuthOptions): {
  authenticate: preHandlerHookHandler;
  requirePermissions: (required: readonly string[]) => preHandlerHookHandler;
} {
  let remoteKeySet: JWTVerifyGetKey | undefined;
  let oidcIssuer: string | undefined;
  if (options.mode === 'oidc') {
    if (!options.issuer) throw new Error('OIDC_ISSUER is required in oidc auth mode');
    oidcIssuer = options.issuer;
    remoteKeySet = createRemoteJWKSet(new URL(`${oidcIssuer.replace(/\/$/, '')}/.well-known/jwks.json`));
  }

  const authenticate: preHandlerHookHandler = async (request, reply) => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'unauthorized', message: 'A bearer token is required.', requestId: request.id });
    }

    try {
      const token = authorization.slice('Bearer '.length);
      const verified = options.mode === 'dev'
        ? await verifyDevToken(token, options)
        : await jwtVerify(token, remoteKeySet as JWTVerifyGetKey, {
            issuer: oidcIssuer as string,
            audience: options.audience,
            algorithms: ['RS256', 'ES256']
          });
      request.identity = identityFromClaims(
        verified.payload,
        options.permissionsClaim ?? 'permissions',
        options.rolesClaim ?? 'roles'
      );
    } catch (error) {
      request.log.warn({ err: error, requestId: request.id }, 'token validation failed');
      return reply.code(401).send({ error: 'unauthorized', message: 'The access token is invalid.', requestId: request.id });
    }
  };

  return {
    authenticate,
    requirePermissions: (required) => async (request, reply) => {
      const granted = new Set(request.identity?.permissions ?? []);
      if (!request.identity || !required.every((permission) => granted.has(permission))) {
        return reply.code(403).send({ error: 'forbidden', message: 'Required permission is missing.', requestId: request.id });
      }
    }
  };
}

export async function mintDevToken(
  identity: PortalIdentity,
  secret: string,
  audience = 'portal-api',
  expiresIn = '5m'
): Promise<string> {
  if (Buffer.byteLength(secret) < 32) throw new Error('DEV_JWT_SECRET must contain at least 32 bytes');
  return new SignJWT({
    name: identity.displayName,
    email: identity.email,
    roles: identity.roles,
    permissions: identity.permissions
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(identity.subject)
    .setIssuer('atlas-dev-issuer')
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(secret));
}

export function identityFromClaims(payload: JWTPayload, permissionsClaim: string, rolesClaim: string): PortalIdentity {
  if (!payload.sub) throw new Error('The token does not contain a subject');
  const email = claimString(payload.email);
  return {
    subject: payload.sub,
    displayName: claimString(payload.name) ?? claimString(payload.preferred_username) ?? payload.sub,
    ...(email ? { email } : {}),
    roles: claimStrings(payload[rolesClaim]),
    permissions: claimStrings(payload[permissionsClaim])
  };
}

export class CircuitBreaker {
  readonly #failureThreshold: number;
  readonly #resetAfterMilliseconds: number;
  #failures = 0;
  #openedAt = 0;

  constructor(failureThreshold = 3, resetAfterMilliseconds = 10_000) {
    this.#failureThreshold = failureThreshold;
    this.#resetAfterMilliseconds = resetAfterMilliseconds;
  }

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.#failures < this.#failureThreshold) return 'closed';
    return Date.now() - this.#openedAt >= this.#resetAfterMilliseconds ? 'half-open' : 'open';
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') throw new CircuitOpenError();
    try {
      const result = await operation();
      this.#failures = 0;
      this.#openedAt = 0;
      return result;
    } catch (error) {
      this.#failures += 1;
      if (this.#failures >= this.#failureThreshold) this.#openedAt = Date.now();
      throw error;
    }
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super('Circuit is open');
    this.name = 'CircuitOpenError';
  }
}

export async function fetchWithPolicy(
  input: URL | string,
  init: RequestInit & { timeoutMilliseconds?: number; retries?: number } = {}
): Promise<Response> {
  const timeoutMilliseconds = init.timeoutMilliseconds ?? 2_000;
  const retries = isIdempotent(init.method) ? (init.retries ?? 2) : 0;
  const { timeoutMilliseconds: _timeout, retries: _retries, ...fetchInit } = init;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, { ...fetchInit, signal: AbortSignal.timeout(timeoutMilliseconds) });
      if (response.status < 500 || attempt === retries) return response;
      lastError = new Error(`upstream returned ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await delay(fullJitter(attempt));
  }
  throw lastError;
}

function installMetrics(app: FastifyInstance, serviceName: string, serviceVersion: string) {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName, version: serviceVersion });
  collectDefaultMetrics({ register: registry, prefix: 'atlas_' });
  const requests = new Counter({
    name: 'atlas_http_requests_total',
    help: 'Completed HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry]
  });
  const duration = new Histogram({
    name: 'atlas_http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry]
  });
  const build = new Gauge({
    name: 'atlas_build_info',
    help: 'Static service build metadata',
    labelNames: ['service', 'version'] as const,
    registers: [registry]
  });
  build.set({ service: serviceName, version: serviceVersion }, 1);

  app.addHook('onRequest', async (request) => {
    (request as FastifyRequest & { metricStartedAt?: bigint }).metricStartedAt = process.hrtime.bigint();
  });
  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const statusCode = String(reply.statusCode);
    requests.inc({ method: request.method, route, status_code: statusCode });
    const startedAt = (request as FastifyRequest & { metricStartedAt?: bigint }).metricStartedAt;
    if (startedAt) {
      duration.observe(
        { method: request.method, route, status_code: statusCode },
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
      );
    }
  });

  return { registry };
}

async function verifyDevToken(token: string, options: AuthOptions) {
  if (!options.devSecret || Buffer.byteLength(options.devSecret) < 32) {
    throw new Error('DEV_JWT_SECRET must contain at least 32 bytes');
  }
  return jwtVerify(token, new TextEncoder().encode(options.devSecret), {
    issuer: 'atlas-dev-issuer',
    audience: options.audience,
    algorithms: ['HS256']
  });
}

function claimString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function claimStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((candidate): candidate is string => typeof candidate === 'string');
  if (typeof value === 'string') return value.split(/[ ,]+/).filter(Boolean);
  return [];
}

function isIdempotent(method = 'GET'): boolean {
  return ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method.toUpperCase());
}

function fullJitter(attempt: number): number {
  return Math.floor(Math.random() * Math.min(1_000, 100 * 2 ** attempt));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
