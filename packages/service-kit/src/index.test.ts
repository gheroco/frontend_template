import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError, createAuthHooks, createServiceApp, mintDevToken } from './index.js';

const secret = 'a'.repeat(48);

describe('service kit', () => {
  it('exposes Kubernetes health and Prometheus endpoints with version metadata', async () => {
    const app = createServiceApp({ serviceName: 'test-service', serviceVersion: '2.3.4', logger: false });
    const health = await app.inject({ method: 'GET', url: '/health/ready' });
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ready', version: '2.3.4' });
    expect(metrics.body).toContain('atlas_build_info');
    await app.close();
  });

  it('enforces backend permissions independently of tab visibility', async () => {
    const app = createServiceApp({ serviceName: 'secure-service', serviceVersion: '1.0.0', logger: false });
    const hooks = createAuthHooks({ mode: 'dev', audience: 'portal-api', devSecret: secret });
    app.get('/protected', { preHandler: [hooks.authenticate, hooks.requirePermissions(['audit:read'])] }, async () => ({ ok: true }));
    const token = await mintDevToken({ subject: 'viewer', displayName: 'Viewer', roles: ['viewer'], permissions: [] }, secret);
    const forbidden = await app.inject({ method: 'GET', url: '/protected', headers: { authorization: `Bearer ${token}` } });
    expect(forbidden.statusCode).toBe(403);
    await app.close();
  });

  it('opens a circuit after bounded failures and recovers after the reset window', async () => {
    vi.useFakeTimers();
    const breaker = new CircuitBreaker(2, 1000);
    await expect(breaker.execute(async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await expect(breaker.execute(async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await expect(breaker.execute(async () => 'never')).rejects.toBeInstanceOf(CircuitOpenError);
    await vi.advanceTimersByTimeAsync(1001);
    await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered');
    vi.useRealTimers();
  });
});
