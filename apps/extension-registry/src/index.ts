import { startTelemetry, stopTelemetry } from '@atlas/service-kit/telemetry';
import { FilesystemCatalogSource, KubernetesCatalogSource } from './catalog.js';
import { buildRegistryApp } from './app.js';

const version = process.env.SERVICE_VERSION ?? '1.0.0';
await startTelemetry('extension-registry', version);

const bootstrapLogger = {
  info: (bindings: object, message: string) => console.info(JSON.stringify({ level: 'info', message, ...bindings })),
  warn: (bindings: object, message: string) => console.warn(JSON.stringify({ level: 'warn', message, ...bindings })),
  error: (bindings: object, message: string) => console.error(JSON.stringify({ level: 'error', message, ...bindings }))
};
const source = process.env.REGISTRY_SOURCE === 'kubernetes'
  ? new KubernetesCatalogSource(
      process.env.POD_NAMESPACE ?? 'atlas-platform',
      Number(process.env.CATALOG_REFRESH_MS ?? 5_000),
      bootstrapLogger
    )
  : new FilesystemCatalogSource(process.env.CATALOG_DIR ?? './catalog/local', bootstrapLogger);
const { app } = await buildRegistryApp({
  source,
  ...(process.env.REGISTRY_API_TOKEN ? { apiToken: process.env.REGISTRY_API_TOKEN } : {}),
  version
});
const port = Number(process.env.REGISTRY_PORT ?? process.env.PORT ?? 4100);

await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'graceful shutdown started');
    await app.close();
    await stopTelemetry();
    process.exit(0);
  });
}
