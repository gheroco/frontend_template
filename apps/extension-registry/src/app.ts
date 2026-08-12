import { timingSafeEqual } from 'node:crypto';
import { createServiceApp } from '@atlas/service-kit';
import { CONTRACT_API_VERSION } from '@atlas/contracts';
import { Gauge } from 'prom-client';
import { CatalogStore, type CatalogSource } from './catalog.js';

export type RegistryAppOptions = {
  source: CatalogSource;
  apiToken?: string;
  logger?: boolean;
  version?: string;
};

export async function buildRegistryApp(options: RegistryAppOptions) {
  let store: CatalogStore;
  const app = createServiceApp({
    serviceName: 'extension-registry',
    serviceVersion: options.version ?? '1.0.0',
    logger: options.logger,
    ready: () => Boolean(store)
  });
  store = new CatalogStore(options.source, app.log);
  const registeredServices = new Gauge({ name: 'atlas_registry_services', help: 'Number of validated registered services', registers: [app.metricsRegistry] });
  const registeredExtensions = new Gauge({ name: 'atlas_registry_extensions', help: 'Number of validated registered extensions', registers: [app.metricsRegistry] });
  const serviceAvailability = new Gauge({
    name: 'atlas_registry_service_available',
    help: 'Registered service health: 1 available, 0 unavailable, -1 unknown',
    labelNames: ['registered_service', 'registered_version'] as const,
    registers: [app.metricsRegistry]
  });
  const updateCatalogMetrics = () => {
    const snapshot = store.snapshot();
    registeredServices.set(snapshot.length);
    registeredExtensions.set(snapshot.flatMap((service) => service.spec.extensions).length);
    serviceAvailability.reset();
    snapshot.forEach((service) => serviceAvailability.set(
      { registered_service: service.spec.service.id, registered_version: service.spec.service.version },
      service.availability.state === 'available' ? 1 : service.availability.state === 'unavailable' ? 0 : -1
    ));
  };
  store.on('changed', updateCatalogMetrics);
  store.on('availability', updateCatalogMetrics);

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/v1/')) return;
    if (!options.apiToken) return;
    const supplied = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!constantTimeEqual(supplied, options.apiToken)) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Registry API token is invalid.', requestId: request.id });
    }
  });

  app.get('/v1/catalog', async () => ({
    contractVersion: CONTRACT_API_VERSION,
    generatedAt: new Date().toISOString(),
    services: store.snapshot()
  }));

  app.get<{ Params: { serviceId: string } }>('/v1/catalog/:serviceId', async (request, reply) => {
    const service = store.get(request.params.serviceId);
    return service ?? reply.code(404).send({ error: 'not_found', message: 'Service is not registered.', requestId: request.id });
  });

  app.get('/v1/status', async () => {
    const services = store.snapshot();
    return {
      registeredServices: services.length,
      enabledServices: services.filter((service) => service.spec.service.enabled).length,
      extensions: services.flatMap((service) => service.spec.extensions).length,
      unavailableServices: services.filter((service) => service.availability.state === 'unavailable').length
    };
  });

  app.addHook('onClose', async () => store.stop());
  await store.start();
  updateCatalogMetrics();
  return { app, store };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
