import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { createAuthHooks, createServiceApp } from '@atlas/service-kit';

const version = process.env.SERVICE_VERSION ?? '1.0.0';
const auditEvents = [
  { id: 'evt-9031', action: 'portal.service.upgraded', actor: 'release-bot', target: 'inventory', outcome: 'success', occurredAt: '2026-08-12T10:42:18.000Z' },
  { id: 'evt-9027', action: 'inventory.reservation.created', actor: 'maya.chen', target: 'res-e8840db0', outcome: 'success', occurredAt: '2026-08-12T10:31:04.000Z' },
  { id: 'evt-9019', action: 'portal.service.registered', actor: 'catalog-controller', target: 'audit', outcome: 'success', occurredAt: '2026-08-12T09:58:42.000Z' },
  { id: 'evt-9014', action: 'authorization.denied', actor: 'viewer@example.com', target: 'inventory:write', outcome: 'denied', occurredAt: '2026-08-12T09:41:30.000Z' }
] as const;

export async function buildAuditApp(options: { logger?: boolean } = {}) {
  const app = createServiceApp({ serviceName: 'audit', serviceVersion: version, logger: options.logger });
  const auth = createAuthHooks({
    mode: process.env.AUTH_MODE === 'oidc' ? 'oidc' : 'dev',
    audience: process.env.OIDC_AUDIENCE ?? 'portal-api',
    issuer: process.env.OIDC_ISSUER,
    devSecret: process.env.DEV_JWT_SECRET ?? 'development-only-secret-must-be-replaced',
    permissionsClaim: process.env.PERMISSIONS_CLAIM,
    rolesClaim: process.env.ROLES_CLAIM
  });

  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/mfe/')) {
      reply.header('access-control-allow-origin', process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:4000');
      reply.header('cross-origin-resource-policy', 'cross-origin');
      reply.header('cache-control', process.env.NODE_ENV === 'production' ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  });

  await app.register(fastifyStatic, {
    root: path.resolve(import.meta.dirname, '../public/mfe'),
    prefix: '/mfe/',
    decorateReply: false,
    index: false
  });

  app.get('/api/v1/events', { preHandler: [auth.authenticate, auth.requirePermissions(['audit:read'])] }, async () => ({
    apiVersion: '1.0.0',
    serviceVersion: version,
    generatedAt: new Date().toISOString(),
    events: auditEvents
  }));

  return app;
}

