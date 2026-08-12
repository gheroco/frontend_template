import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { createAuthHooks, createServiceApp } from '@atlas/service-kit';
import { z } from 'zod';
import type { DeliveryStore, WebhookPublisher } from './domain.js';
import { envelopeFromRequest, verifyGithubSignature } from './webhook.js';

type AppOptions = {
  publisher: WebhookPublisher;
  store: DeliveryStore;
  webhookSecrets: readonly string[];
  maxPayloadBytes: number;
  serviceVersion: string;
  logger?: boolean;
};

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  eventType: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/).optional(),
  cursor: z.string().min(1).max(1_024).optional()
});

export async function buildGithubWebhooksApp(options: AppOptions) {
  const app = createServiceApp({
    serviceName: 'github-webhooks',
    serviceVersion: options.serviceVersion,
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ready: () => options.publisher.ready()
  });
  const auth = createAuthHooks({
    mode: process.env.AUTH_MODE === 'oidc' ? 'oidc' : 'dev',
    audience: process.env.OIDC_AUDIENCE ?? 'portal-api',
    devSecret: process.env.DEV_JWT_SECRET ?? 'development-only-secret-must-be-replaced',
    ...(process.env.OIDC_ISSUER ? { issuer: process.env.OIDC_ISSUER } : {}),
    ...(process.env.PERMISSIONS_CLAIM ? { permissionsClaim: process.env.PERMISSIONS_CLAIM } : {}),
    ...(process.env.ROLES_CLAIM ? { rolesClaim: process.env.ROLES_CLAIM } : {})
  });

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/mfe/')) {
      reply.header('access-control-allow-origin', process.env.PORTAL_PUBLIC_URL ?? 'http://localhost:4000');
      reply.header('cross-origin-resource-policy', 'cross-origin');
      reply.header('cache-control', process.env.NODE_ENV === 'production' ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
    if (request.url.startsWith('/api/v1/')) reply.header('cache-control', 'no-store');
  });

  await app.register(fastifyStatic, {
    root: path.resolve(import.meta.dirname, '../public/mfe'),
    prefix: '/mfe/',
    decorateReply: false,
    index: false
  });

  app.get('/health/api-ready', async (_request, reply) => {
    const ready = await options.store.ready();
    return ready ? { status: 'ready', dependencies: { database: 'ready' } }
      : reply.code(503).send({ status: 'not-ready', dependencies: { database: 'unavailable' } });
  });

  app.post<{ Body: Buffer }>('/webhooks/github', { bodyLimit: options.maxPayloadBytes }, async (request, reply) => {
    const body = request.body;
    if (!Buffer.isBuffer(body)) return reply.code(415).send({ error: 'unsupported_media_type', message: 'Webhook body must be bytes.' });
    const signature = typeof request.headers['x-hub-signature-256'] === 'string'
      ? request.headers['x-hub-signature-256']
      : undefined;
    if (!verifyGithubSignature(body, signature, options.webhookSecrets)) {
      request.log.warn({ deliveryId: request.headers['x-github-delivery'] }, 'GitHub webhook signature rejected');
      return reply.code(401).send({ error: 'invalid_signature', message: 'Webhook signature validation failed.' });
    }
    const envelope = envelopeFromRequest(request, body);
    try {
      await options.publisher.publish(envelope);
    } catch (error) {
      request.log.error({ err: error, deliveryId: envelope.deliveryId }, 'durable webhook publish failed');
      return reply.code(503).header('retry-after', '5').send({
        error: 'ingestion_unavailable',
        message: 'The delivery was not durably accepted.',
        deliveryId: envelope.deliveryId
      });
    }
    return reply.code(202).send({ status: 'accepted', deliveryId: envelope.deliveryId });
  });

  app.get('/api/v1/summary', {
    preHandler: [auth.authenticate, auth.requirePermissions(['github-webhooks:read'])]
  }, async () => options.store.summary());

  app.get('/api/v1/deliveries', {
    preHandler: [auth.authenticate, auth.requirePermissions(['github-webhooks:read'])]
  }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return options.store.list({
      limit: query.limit,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {})
    });
  });

  return app;
}
