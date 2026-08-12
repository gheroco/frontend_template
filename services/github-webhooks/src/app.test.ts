import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildGithubWebhooksApp } from './app.js';
import type { WebhookEnvelope, WebhookPublisher } from './domain.js';
import { MemoryWebhookBroker } from './queue.js';
import { MemoryDeliveryStore } from './storage.js';

const secret = 'test-webhook-secret-with-more-than-32-characters';

describe('GitHub webhook receiver', () => {
  it('returns 202 only after the publisher accepts the exact bytes', async () => {
    const publisher = new MemoryWebhookBroker();
    const app = await buildGithubWebhooksApp({ publisher, store: new MemoryDeliveryStore(), webhookSecrets: [secret], maxPayloadBytes: 25 * 1024 * 1024, serviceVersion: 'test', logger: false });
    const body = JSON.stringify({ ref: 'refs/heads/main' });
    const response = await app.inject({ method: 'POST', url: '/webhooks/github', payload: body, headers: webhookHeaders(body, 'push') });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: 'accepted', deliveryId: 'test-delivery-id' });
    await app.close();
  });

  it('rejects an invalid signature before publishing', async () => {
    const publisher = new MemoryWebhookBroker();
    const app = await buildGithubWebhooksApp({ publisher, store: new MemoryDeliveryStore(), webhookSecrets: [secret], maxPayloadBytes: 1024, serviceVersion: 'test', logger: false });
    const response = await app.inject({ method: 'POST', url: '/webhooks/github', payload: '{}', headers: { ...webhookHeaders('{}', 'ping'), 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns 503 instead of acknowledging when durable publish fails', async () => {
    const publisher: WebhookPublisher = {
      async start() {}, ready: () => false,
      async publish(_envelope: WebhookEnvelope) { throw new Error('broker unavailable'); },
      async close() {}
    };
    const app = await buildGithubWebhooksApp({ publisher, store: new MemoryDeliveryStore(), webhookSecrets: [secret], maxPayloadBytes: 1024, serviceVersion: 'test', logger: false });
    const response = await app.inject({ method: 'POST', url: '/webhooks/github', payload: '{}', headers: webhookHeaders('{}', 'future_event') });
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('5');
    await app.close();
  });
});

function webhookHeaders(body: string, event: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-github-delivery': 'test-delivery-id',
    'x-github-event': event,
    'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  };
}
