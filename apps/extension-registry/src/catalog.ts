import { EventEmitter } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { CustomObjectsApi, KubeConfig } from '@kubernetes/client-node';
import YAML from 'yaml';
import {
  parsePortalServiceManifest,
  type Availability,
  type CatalogService,
  type PortalServiceManifest
} from '@atlas/contracts';
import { fetchWithPolicy } from '@atlas/service-kit';

export type CatalogLogger = {
  info: (bindings: object, message: string) => void;
  warn: (bindings: object, message: string) => void;
  error: (bindings: object, message: string) => void;
};

export interface CatalogSource {
  load(): Promise<unknown[]>;
  start?(onChange: () => void): Promise<void> | void;
  stop?(): Promise<void> | void;
}

export class FilesystemCatalogSource implements CatalogSource {
  readonly #directory: string;
  readonly #logger: CatalogLogger;
  #watcher?: FSWatcher;

  constructor(directory: string, logger: CatalogLogger) {
    this.#directory = path.resolve(directory);
    this.#logger = logger;
  }

  async load(): Promise<unknown[]> {
    const entries = await readdir(this.#directory, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /\.(?:json|ya?ml)$/i.test(entry.name))
      .map((entry) => path.join(this.#directory, entry.name))
      .sort();
    const manifests: unknown[] = [];
    for (const file of files) {
      try {
        const contents = await readFile(file, 'utf8');
        manifests.push(file.endsWith('.json') ? JSON.parse(contents) : YAML.parse(contents));
      } catch (error) {
        this.#logger.error({ err: error, file }, 'catalog file could not be parsed');
      }
    }
    return manifests;
  }

  async start(onChange: () => void): Promise<void> {
    this.#watcher = watch(this.#directory, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } });
    this.#watcher.on('all', (_event, changedPath) => {
      if (/\.(?:json|ya?ml)$/i.test(changedPath)) onChange();
    });
  }

  async stop(): Promise<void> {
    await this.#watcher?.close();
  }
}

export class KubernetesCatalogSource implements CatalogSource {
  readonly #api: CustomObjectsApi;
  readonly #namespace: string;
  readonly #pollMilliseconds: number;
  readonly #logger: CatalogLogger;
  #timer?: NodeJS.Timeout;

  constructor(namespace: string, pollMilliseconds: number, logger: CatalogLogger, kubeConfig?: KubeConfig) {
    const config = kubeConfig ?? new KubeConfig();
    if (!kubeConfig) config.loadFromDefault();
    this.#api = config.makeApiClient(CustomObjectsApi);
    this.#namespace = namespace;
    this.#pollMilliseconds = pollMilliseconds;
    this.#logger = logger;
  }

  async load(): Promise<unknown[]> {
    const response = await this.#api.listNamespacedCustomObject({
      group: 'portal.atlas.dev',
      version: 'v1alpha1',
      namespace: this.#namespace,
      plural: 'portalservices'
    });
    const payload = response as unknown as { items?: unknown[]; body?: { items?: unknown[] } };
    return payload.items ?? payload.body?.items ?? [];
  }

  start(onChange: () => void): void {
    this.#timer = setInterval(() => {
      try {
        onChange();
      } catch (error) {
        this.#logger.warn({ err: error }, 'Kubernetes catalog poll failed');
      }
    }, this.#pollMilliseconds);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }
}

export class CatalogStore extends EventEmitter {
  readonly #source: CatalogSource;
  readonly #logger: CatalogLogger;
  readonly #availability = new Map<string, Availability>();
  readonly #healthTimers = new Map<string, NodeJS.Timeout>();
  #manifests = new Map<string, PortalServiceManifest>();
  #reloadPromise: Promise<void> | undefined;

  constructor(source: CatalogSource, logger: CatalogLogger) {
    super();
    this.#source = source;
    this.#logger = logger;
  }

  async start(): Promise<void> {
    await this.reload();
    await this.#source.start?.(() => void this.reload());
  }

  async stop(): Promise<void> {
    for (const timer of this.#healthTimers.values()) clearInterval(timer);
    this.#healthTimers.clear();
    await this.#source.stop?.();
  }

  async reload(): Promise<void> {
    if (this.#reloadPromise) return this.#reloadPromise;
    this.#reloadPromise = this.#performReload().finally(() => {
      this.#reloadPromise = undefined;
    });
    return this.#reloadPromise;
  }

  snapshot(): CatalogService[] {
    return [...this.#manifests.values()]
      .map((manifest) => ({
        ...manifest,
        availability: this.#availability.get(manifest.spec.service.id) ?? unknownAvailability()
      }))
      .sort((left, right) => left.spec.service.displayName.localeCompare(right.spec.service.displayName));
  }

  get(serviceId: string): CatalogService | undefined {
    const manifest = this.#manifests.get(serviceId);
    return manifest ? { ...manifest, availability: this.#availability.get(serviceId) ?? unknownAvailability() } : undefined;
  }

  async checkHealth(serviceId: string): Promise<Availability> {
    const manifest = this.#manifests.get(serviceId);
    if (!manifest) throw new Error(`Unknown service ${serviceId}`);
    const previous = this.#availability.get(serviceId) ?? unknownAvailability();
    try {
      const response = await fetchWithPolicy(manifest.spec.health.url, {
        timeoutMilliseconds: manifest.spec.health.timeoutMilliseconds,
        retries: 1,
        headers: { accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`health endpoint returned ${response.status}`);
      const next: Availability = { state: 'available', checkedAt: new Date().toISOString(), consecutiveFailures: 0 };
      this.#availability.set(serviceId, next);
      if (previous.state !== next.state) this.emit('availability', { serviceId, availability: next });
      return next;
    } catch (error) {
      const consecutiveFailures = previous.consecutiveFailures + 1;
      const next: Availability = {
        state: consecutiveFailures >= 2 ? 'unavailable' : previous.state,
        checkedAt: new Date().toISOString(),
        reason: error instanceof Error ? error.message : 'health check failed',
        consecutiveFailures
      };
      this.#availability.set(serviceId, next);
      if (previous.state !== next.state) this.emit('availability', { serviceId, availability: next });
      return next;
    }
  }

  async #performReload(): Promise<void> {
    let inputs: unknown[];
    try {
      inputs = await this.#source.load();
    } catch (error) {
      this.#logger.error({ err: error }, 'catalog source reload failed; retaining last known-good snapshot');
      return;
    }

    const next = new Map<string, PortalServiceManifest>();
    const extensionIds = new Set<string>();
    const routes = new Set<string>();
    for (const input of inputs) {
      try {
        const manifest = parsePortalServiceManifest(normalizeKubernetesResource(input));
        const serviceId = manifest.spec.service.id;
        if (next.has(serviceId)) throw new Error(`duplicate service ID ${serviceId}`);
        for (const extension of manifest.spec.extensions) {
          if (extensionIds.has(extension.id)) throw new Error(`duplicate extension ID ${extension.id}`);
          if (routes.has(extension.route)) throw new Error(`duplicate portal route ${extension.route}`);
        }
        next.set(serviceId, manifest);
        manifest.spec.extensions.forEach((extension) => {
          extensionIds.add(extension.id);
          routes.add(extension.route);
        });
      } catch (error) {
        this.#logger.error({ err: error, manifest: redactInput(input) }, 'invalid catalog entry was isolated');
      }
    }

    const previous = this.#manifests;
    this.#manifests = next;
    this.#reconcileHealthChecks();
    this.#auditChanges(previous, next);
    this.emit('changed', this.snapshot());
  }

  #reconcileHealthChecks(): void {
    for (const [serviceId, timer] of this.#healthTimers) {
      if (!this.#manifests.has(serviceId)) {
        clearInterval(timer);
        this.#healthTimers.delete(serviceId);
        this.#availability.delete(serviceId);
      }
    }
    for (const [serviceId, manifest] of this.#manifests) {
      if (this.#healthTimers.has(serviceId)) continue;
      void this.checkHealth(serviceId);
      const interval = setInterval(() => void this.checkHealth(serviceId), manifest.spec.health.intervalSeconds * 1000);
      interval.unref();
      this.#healthTimers.set(serviceId, interval);
    }
  }

  #auditChanges(previous: Map<string, PortalServiceManifest>, next: Map<string, PortalServiceManifest>): void {
    for (const [serviceId, current] of next) {
      const before = previous.get(serviceId);
      if (!before) {
        this.#logger.info(audit('portal.service.registered', current), 'audit');
      } else if (before.spec.service.enabled && !current.spec.service.enabled) {
        this.#logger.info(audit('portal.service.disabled', current), 'audit');
      } else if (!before.spec.service.enabled && current.spec.service.enabled) {
        this.#logger.info(audit('portal.service.enabled', current), 'audit');
      } else if (before.spec.service.version !== current.spec.service.version) {
        this.#logger.info({
          ...audit('portal.service.upgraded', current),
          previousVersion: before.spec.service.version
        }, 'audit');
      }
    }
    for (const [serviceId, before] of previous) {
      if (!next.has(serviceId)) this.#logger.info(audit('portal.service.unregistered', before), 'audit');
    }
  }
}

function normalizeKubernetesResource(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const resource = input as Record<string, unknown>;
  if (resource.apiVersion === 'portal.atlas.dev/v1alpha1') return resource;
  return input;
}

function unknownAvailability(): Availability {
  return { state: 'unknown', checkedAt: null, consecutiveFailures: 0 };
}

function audit(event: string, manifest: PortalServiceManifest) {
  return {
    audit: true,
    event,
    actor: 'catalog-source',
    serviceId: manifest.spec.service.id,
    serviceVersion: manifest.spec.service.version,
    owner: manifest.spec.service.owner,
    occurredAt: new Date().toISOString()
  };
}

function redactInput(input: unknown): object {
  if (!input || typeof input !== 'object') return { kind: typeof input };
  const candidate = input as { metadata?: { name?: unknown }; spec?: { service?: { id?: unknown } } };
  return { metadataName: candidate.metadata?.name, serviceId: candidate.spec?.service?.id };
}
