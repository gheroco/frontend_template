import { startTelemetry, stopTelemetry } from '@atlas/service-kit/telemetry';

const version = process.env.SERVICE_VERSION ?? '1.0.0';
await startTelemetry('audit', version);
const { buildAuditApp } = await import('./app.js');
const app = await buildAuditApp();
const port = Number(process.env.AUDIT_PORT ?? process.env.PORT ?? 4202);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'graceful shutdown started');
    await app.close();
    await stopTelemetry();
    process.exit(0);
  });
}
