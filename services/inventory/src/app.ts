import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { createAuthHooks, createServiceApp } from '@atlas/service-kit';

type ReservationBody = { sku: string; quantity: number };
const version = process.env.SERVICE_VERSION ?? '1.0.0';
const items = [
  { sku: 'EDGE-240', name: 'Edge compute node', stock: 184, reorderAt: 60, location: 'A-04' },
  { sku: 'NVME-8T', name: 'NVMe storage module', stock: 42, reorderAt: 35, location: 'B-11' },
  { sku: 'OPT-400', name: '400G optical transceiver', stock: 18, reorderAt: 24, location: 'C-02' },
  { sku: 'PDU-32A', name: 'Smart rack PDU', stock: 96, reorderAt: 30, location: 'D-07' }
] as const;
const suppliers = [
  { id: 'nova-circuits', name: 'Nova Circuits', status: 'on-time', leadDays: 4, activeOrders: 12 },
  { id: 'vector-optics', name: 'Vector Optics', status: 'at-risk', leadDays: 11, activeOrders: 6 },
  { id: 'northstar-power', name: 'Northstar Power', status: 'on-time', leadDays: 7, activeOrders: 3 }
] as const;
const reservations = new Map<string, { id: string; sku: string; quantity: number; status: string }>();

export async function buildInventoryApp(options: { logger?: boolean } = {}) {
  const app = createServiceApp({ serviceName: 'inventory', serviceVersion: version, logger: options.logger });
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

  app.get('/api/v1/items', { preHandler: [auth.authenticate, auth.requirePermissions(['inventory:read'])] }, async () => ({
    apiVersion: '1.0.0',
    serviceVersion: version,
    generatedAt: new Date().toISOString(),
    summary: {
      totalSkus: items.length,
      unitsInStock: items.reduce((total, item) => total + item.stock, 0),
      attentionRequired: items.filter((item) => item.stock <= item.reorderAt).length
    },
    items
  }));

  app.get('/api/v1/suppliers', { preHandler: [auth.authenticate, auth.requirePermissions(['inventory:read'])] }, async () => ({
    apiVersion: '1.0.0',
    serviceVersion: version,
    suppliers
  }));

  app.post<{ Body: ReservationBody }>('/api/v1/reservations', {
    preHandler: [auth.authenticate, auth.requirePermissions(['inventory:write'])],
    schema: {
      body: {
        type: 'object', additionalProperties: false, required: ['sku', 'quantity'],
        properties: { sku: { type: 'string', minLength: 2, maxLength: 32 }, quantity: { type: 'integer', minimum: 1, maximum: 100 } }
      }
    }
  }, async (request, reply) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return reply.code(400).send({ error: 'invalid_idempotency_key', message: 'A 16–128 character Idempotency-Key is required.' });
    }
    const existing = reservations.get(idempotencyKey);
    if (existing) return reply.code(200).send(existing);
    const reservation = {
      id: `res-${idempotencyKey.slice(0, 12)}`,
      sku: request.body.sku,
      quantity: request.body.quantity,
      status: 'accepted'
    };
    reservations.set(idempotencyKey, reservation);
    request.log.info({ audit: true, event: 'inventory.reservation.created', reservationId: reservation.id, actor: request.identity?.subject }, 'audit');
    return reply.code(201).send(reservation);
  });

  return app;
}

