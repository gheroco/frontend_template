import { startTelemetry, stopTelemetry } from '@atlas/service-kit/telemetry';
import { buildGithubWebhooksApp } from './app.js';
import { loadRuntimeConfig } from './config.js';
import { processWebhook } from './processor.js';
import { createRuntime } from './runtime.js';

const config = loadRuntimeConfig();
await startTelemetry('github-webhooks', config.serviceVersion);
const runtime = createRuntime(config);
if (config.runtime === 'memory') {
  await runtime.store.start();
} else {
  // Ingestion depends on RabbitMQ, not PostgreSQL. Keep the public receiver
  // available during a database outage and expose that outage via api-ready.
  await runtime.store.start().catch((error: unknown) => {
    console.error('GitHub webhook query database is unavailable at startup.', error);
  });
}
await runtime.publisher.start();

const controller = new AbortController();
if (config.runtime === 'memory') {
  await runtime.consumer.start(async (envelope) => { await processWebhook(runtime.store, envelope); }, controller.signal);
}

const app = await buildGithubWebhooksApp({
  publisher: runtime.publisher,
  store: runtime.store,
  webhookSecrets: config.webhookSecrets,
  maxPayloadBytes: config.maxPayloadBytes,
  serviceVersion: config.serviceVersion
});
await app.listen({ port: config.port, host: config.host });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'graceful shutdown started');
    controller.abort();
    await app.close();
    await runtime.consumer.close();
    await runtime.publisher.close();
    await runtime.store.close();
    await stopTelemetry();
    process.exit(0);
  });
}
