import { describe, expect, it, vi } from 'vitest';
import { recoverFailedDeliveries } from './reconciler.js';
import { MemoryDeliveryStore } from './storage.js';

describe('failed-delivery recovery', () => {
  it('redelivers recent failures once and ignores successful or stale deliveries', async () => {
    const now = new Date();
    const stale = new Date(now.getTime() - 60 * 3_600_000);
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 1, status: 'Internal Server Error', delivered_at: now.toISOString() },
        { id: 2, status: 'OK', delivered_at: now.toISOString() },
        { id: 3, status: 'Gateway Timeout', delivered_at: stale.toISOString() }
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const store = new MemoryDeliveryStore();
    const target = { kind: 'repository' as const, owner: 'octo', repository: 'demo', hookId: 99 };
    const options = { apiUrl: 'https://api.github.com', apiVersion: '2026-03-10', token: 'token', lookbackHours: 48, minimumIntervalSeconds: 3600, fetchImpl: fetchMock };
    await expect(recoverFailedDeliveries([target], store, options)).resolves.toEqual({ inspected: 2, requested: 1, skipped: 0 });
    expect(fetchMock.mock.calls[1]?.[0].toString()).toContain('/repos/octo/demo/hooks/99/deliveries/1/attempts');

    const secondFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify([
      { id: 1, status: 'Internal Server Error', delivered_at: now.toISOString() }
    ]), { status: 200 }));
    await expect(recoverFailedDeliveries([target], store, { ...options, fetchImpl: secondFetch })).resolves.toEqual({ inspected: 1, requested: 0, skipped: 1 });
  });
});
