import { z } from 'zod';
import { loadRuntimeConfig } from './config.js';
import type { DeliveryStore } from './domain.js';
import { PostgresDeliveryStore } from './storage.js';

const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('organization'), owner: z.string().min(1), hookId: z.coerce.number().int().positive() }),
  z.object({
    kind: z.literal('repository'),
    owner: z.string().min(1),
    repository: z.string().min(1),
    hookId: z.coerce.number().int().positive()
  })
]);
const targetsSchema = z.array(targetSchema).max(250);

export type RecoveryTarget = z.infer<typeof targetSchema>;
type GithubDelivery = { id: number; delivered_at: string; status: string; redelivery?: boolean };
type RecoveryOptions = {
  apiUrl: string;
  apiVersion: string;
  token: string;
  lookbackHours: number;
  minimumIntervalSeconds: number;
  fetchImpl?: typeof fetch;
};

export async function recoverFailedDeliveries(
  targets: RecoveryTarget[],
  store: DeliveryStore,
  options: RecoveryOptions
): Promise<{ inspected: number; requested: number; skipped: number }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cutoff = Date.now() - Math.min(options.lookbackHours, 72) * 3_600_000;
  const result = { inspected: 0, requested: 0, skipped: 0 };

  for (const target of targets) {
    const basePath = target.kind === 'organization'
      ? `orgs/${encodeURIComponent(target.owner)}/hooks/${target.hookId}`
      : `repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repository)}/hooks/${target.hookId}`;
    const targetKey = `${target.kind}:${target.owner}:${target.kind === 'repository' ? `${target.repository}:` : ''}${target.hookId}`;

    for (let page = 1; page <= 10; page += 1) {
      const deliveries = await githubRequest<GithubDelivery[]>(fetchImpl, options, `${basePath}/deliveries?per_page=100&page=${page}`);
      if (deliveries.length === 0) break;
      let reachedCutoff = false;
      for (const delivery of deliveries) {
        const deliveredAt = Date.parse(delivery.delivered_at);
        if (!Number.isFinite(deliveredAt) || deliveredAt < cutoff) { reachedCutoff = true; continue; }
        result.inspected += 1;
        if (delivery.status.toUpperCase() === 'OK') continue;
        const reserved = await store.reserveRecoveryAttempt(targetKey, delivery.id, options.minimumIntervalSeconds);
        if (!reserved) { result.skipped += 1; continue; }
        await githubRequest(fetchImpl, options, `${basePath}/deliveries/${delivery.id}/attempts`, { method: 'POST' });
        result.requested += 1;
      }
      if (reachedCutoff || deliveries.length < 100) break;
    }
  }
  return result;
}

async function githubRequest<T = unknown>(
  fetchImpl: typeof fetch,
  options: RecoveryOptions,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetchImpl(new URL(path, ensureTrailingSlash(options.apiUrl)), {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${options.token}`,
      'x-github-api-version': options.apiVersion,
      'user-agent': 'atlas-github-webhook-reconciler/1.0',
      ...init.headers
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    throw new Error(`GitHub recovery API returned ${response.status} for ${init.method ?? 'GET'} ${path}.`);
  }
  if (response.status === 202 || response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

async function main(): Promise<void> {
  const runtime = loadRuntimeConfig();
  if (!runtime.databaseUrl) throw new Error('DATABASE_URL is required for webhook recovery.');
  const token = process.env.GITHUB_RECOVERY_TOKEN;
  if (!token) throw new Error('GITHUB_RECOVERY_TOKEN is required for webhook recovery.');
  const targets = targetsSchema.parse(JSON.parse(process.env.GITHUB_WEBHOOK_TARGETS ?? '[]'));
  if (targets.length === 0) {
    console.info('No direct webhook targets are configured for recovery.');
    return;
  }
  const store = new PostgresDeliveryStore(runtime.databaseUrl, 2, false);
  try {
    await store.start();
    const result = await recoverFailedDeliveries(targets, store, {
      apiUrl: process.env.GITHUB_API_URL ?? 'https://api.github.com',
      apiVersion: process.env.GITHUB_API_VERSION ?? '2026-03-10',
      token,
      lookbackHours: Number(process.env.GITHUB_RECOVERY_LOOKBACK_HOURS ?? 48),
      minimumIntervalSeconds: Number(process.env.GITHUB_RECOVERY_MIN_INTERVAL_SECONDS ?? 3_600)
    });
    console.info(JSON.stringify({ message: 'GitHub webhook recovery completed.', ...result }));
  } finally {
    await store.close();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
