import type { CatalogService } from '@atlas/contracts';
import { CircuitBreaker, fetchWithPolicy } from '@atlas/service-kit';

export interface CatalogProvider {
  list(): Promise<CatalogService[]>;
  get(serviceId: string): Promise<CatalogService | undefined>;
}

export class RegistryCatalogClient implements CatalogProvider {
  readonly #url: string;
  readonly #token: string | undefined;
  readonly #breaker = new CircuitBreaker(3, 10_000);
  #cache?: { expiresAt: number; services: CatalogService[] };

  constructor(url: string, token?: string) {
    this.#url = url.replace(/\/$/, '');
    this.#token = token;
  }

  async list(): Promise<CatalogService[]> {
    if (this.#cache && this.#cache.expiresAt > Date.now()) return this.#cache.services;
    try {
      const services = await this.#breaker.execute(async () => {
        const response = await fetchWithPolicy(`${this.#url}/v1/catalog`, {
          timeoutMilliseconds: 2_000,
          retries: 2,
          headers: { accept: 'application/json', ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}) }
        });
        if (!response.ok) throw new Error(`registry returned ${response.status}`);
        const payload = await response.json() as { services?: CatalogService[] };
        if (!Array.isArray(payload.services)) throw new Error('registry response is invalid');
        return payload.services;
      });
      this.#cache = { expiresAt: Date.now() + 2_000, services };
      return services;
    } catch (error) {
      if (this.#cache) return this.#cache.services.map((service) => ({
        ...service,
        availability: { state: 'unknown', checkedAt: new Date().toISOString(), consecutiveFailures: 0, reason: 'Registry is unavailable; using last-known-good catalog.' }
      }));
      throw error;
    }
  }

  async get(serviceId: string): Promise<CatalogService | undefined> {
    return (await this.list()).find((service) => service.spec.service.id === serviceId);
  }
}
