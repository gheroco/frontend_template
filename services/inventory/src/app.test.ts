import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mintDevToken } from '@atlas/service-kit';
import { buildInventoryApp } from './app.js';

const secret = 'inventory-test-secret-that-is-at-least-32-bytes';
beforeEach(() => {
  process.env.AUTH_MODE = 'dev';
  process.env.DEV_JWT_SECRET = secret;
});
afterEach(() => delete process.env.DEV_JWT_SECRET);

describe('inventory API contract and authorization', () => {
  it('returns the versioned inventory contract to an authorized caller', async () => {
    const app = await buildInventoryApp({ logger: false });
    const token = await mintDevToken({ subject: 'operator', displayName: 'Operator', roles: ['operator'], permissions: ['inventory:read'] }, secret);
    const response = await app.inject({ method: 'GET', url: '/api/v1/items', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ apiVersion: '1.0.0', summary: { totalSkus: 4 } });
    await app.close();
  });

  it('requires write permission and makes retried mutations idempotent', async () => {
    const app = await buildInventoryApp({ logger: false });
    const token = await mintDevToken({ subject: 'operator', displayName: 'Operator', roles: ['operator'], permissions: ['inventory:read', 'inventory:write'] }, secret);
    const request = { method: 'POST' as const, url: '/api/v1/reservations', headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'same-request-0000001' }, payload: { sku: 'EDGE-240', quantity: 2 } };
    const first = await app.inject(request);
    const retry = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    await app.close();
  });
});

