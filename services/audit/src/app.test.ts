import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mintDevToken } from '@atlas/service-kit';
import { buildAuditApp } from './app.js';

const secret = 'audit-test-secret-that-is-at-least-32-bytes';
beforeEach(() => {
  process.env.AUTH_MODE = 'dev';
  process.env.DEV_JWT_SECRET = secret;
});
afterEach(() => delete process.env.DEV_JWT_SECRET);

describe('audit API authorization', () => {
  it('does not rely on frontend visibility for access control', async () => {
    const app = await buildAuditApp({ logger: false });
    const token = await mintDevToken({ subject: 'viewer', displayName: 'Viewer', roles: ['viewer'], permissions: ['inventory:read'] }, secret);
    const response = await app.inject({ method: 'GET', url: '/api/v1/events', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('returns a versioned contract to an auditor', async () => {
    const app = await buildAuditApp({ logger: false });
    const token = await mintDevToken({ subject: 'auditor', displayName: 'Auditor', roles: ['auditor'], permissions: ['audit:read'] }, secret);
    const response = await app.inject({ method: 'GET', url: '/api/v1/events', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ apiVersion: '1.0.0' });
    expect(response.json().events.length).toBeGreaterThan(0);
    await app.close();
  });
});

