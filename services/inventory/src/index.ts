import { startTelemetry, stopTelemetry } from '@atlas/service-kit/telemetry';

const version = process.env.SERVICE_VERSION ?? '1.0.0';
await startTelemetry('inventory', version);
const { buildInventoryApp } = await import('./app.js');
const app = await buildInventoryApp();
const port = Number(process.env.INVENTORY_PORT ?? process.env.PORT ?? 4201);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'graceful shutdown started');
    await app.close();
    await stopTelemetry();
    process.exit(0);
  });
}
