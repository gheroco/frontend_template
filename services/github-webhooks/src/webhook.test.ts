import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { MemoryDeliveryStore } from './storage.js';
import { processWebhook } from './processor.js';
import { envelopeFromRequest, parsePayload, projectPayload, verifyGithubSignature } from './webhook.js';

const secret = 'test-webhook-secret-with-more-than-32-characters';

describe('GitHub webhook boundary', () => {
  it('validates the raw body and supports secret rotation', () => {
    const body = Buffer.from('{"zen":"Keep it logically awesome."}');
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyGithubSignature(body, signature, ['previous-secret-with-more-than-32-characters', secret])).toBe(true);
    expect(verifyGithubSignature(Buffer.from(`${body.toString()} `), signature, [secret])).toBe(false);
    expect(verifyGithubSignature(body, 'sha1=not-supported', [secret])).toBe(false);
  });

  it('accepts an unknown future event type without schema coupling', () => {
    const body = Buffer.from('{"action":"created","repository":{"id":42,"full_name":"octo/demo"}}');
    const request = { headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-github-delivery': 'd63e7118-3e5e-4f86-bfed-4c0f120aa47e',
      'x-github-event': 'future_event.v2',
      'x-github-hook-id': '123'
    } } as unknown as FastifyRequest;
    const envelope = envelopeFromRequest(request, body);
    expect(envelope.eventType).toBe('future_event.v2');
    expect(projectPayload(parsePayload(envelope))).toMatchObject({ action: 'created', repositoryId: '42' });
  });

  it('parses GitHub form-encoded payloads', () => {
    const body = Buffer.from(`payload=${encodeURIComponent(JSON.stringify({ action: 'opened', organization: { login: 'octo' } }))}`);
    const request = { headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-github-delivery': 'form-delivery-1',
      'x-github-event': 'issues'
    } } as unknown as FastifyRequest;
    expect(projectPayload(parsePayload(envelopeFromRequest(request, body))).organizationLogin).toBe('octo');
  });

  it('persists malformed signed JSON as an invalid delivery and deduplicates redelivery', async () => {
    const store = new MemoryDeliveryStore();
    const envelope = {
      deliveryId: 'same-id', eventType: 'push', hookId: null, contentType: 'application/json' as const,
      receivedAt: new Date().toISOString(), headers: {}, body: Buffer.from('{broken')
    };
    expect(await processWebhook(store, envelope)).toBe('created');
    expect(await processWebhook(store, envelope)).toBe('duplicate');
    expect((await store.list({ limit: 10 })).deliveries[0]).toMatchObject({ processingStatus: 'invalid' });
  });
});
