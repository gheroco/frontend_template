import { createServiceApp } from '@atlas/service-kit';
import { startTelemetry, stopTelemetry } from '@atlas/service-kit/telemetry';
import { loadRuntimeConfig } from './config.js';
import { processWebhook } from './processor.js';
import { createRuntime } from './runtime.js';

const config = loadRuntimeConfig();
if (config.runtime !== 'external') throw new Error('The standalone worker requires WEBHOOK_RUNTIME=external.');
await startTelemetry('github-webhooks-worker', config.serviceVersion);
const runtime = createRuntime(config);
await runtime.store.start();
const controller = new AbortController();
await runtime.consumer.start(async (envelope) => { await processWebhook(runtime.store, envelope); }, controller.signal);
const health = createServiceApp({
  serviceName: 'github-webhooks-worker',
  serviceVersion: config.serviceVersion,
  ready: async () => runtime.consumer.ready() && await runtime.store.ready()
});
await health.listen({ port: Number(process.env.WORKER_HEALTH_PORT ?? 4_204), host: config.host });

const maintenance = setInterval(() => {
  void runtime.store.maintain(config.retentionDays).catch(() => undefined);
}, 60 * 60 * 1000);
maintenance.unref();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    controller.abort();
    clearInterval(maintenance);
    await health.close();
    await runtime.consumer.close();
    await runtime.publisher.close();
    await runtime.store.close();
    await stopTelemetry();
    process.exit(0);
  });
}
