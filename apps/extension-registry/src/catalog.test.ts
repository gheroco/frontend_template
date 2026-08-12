import { mkdtemp, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { CatalogStore, FilesystemCatalogSource } from './catalog.js';

const directories: string[] = [];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('runtime extension catalog', () => {
  it('registers, upgrades, disables, and removes a service without restarting', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'atlas-catalog-'));
    directories.push(directory);
    const file = path.join(directory, 'inventory.yaml');
    const source = new FilesystemCatalogSource(directory, logger);
    const store = new CatalogStore(source, logger);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

    await writeFile(file, YAML.stringify(manifest()), 'utf8');
    await store.start();
    expect(store.snapshot()[0]?.spec.service.version).toBe('1.0.0');

    await writeFile(file, YAML.stringify(manifest({ version: '1.1.0' })), 'utf8');
    await store.reload();
    expect(store.snapshot()[0]?.spec.service.version).toBe('1.1.0');

    await writeFile(file, YAML.stringify(manifest({ version: '1.1.0', enabled: false })), 'utf8');
    await store.reload();
    expect(store.snapshot()[0]?.spec.service.enabled).toBe(false);

    await unlink(file);
    await store.reload();
    expect(store.snapshot()).toEqual([]);
    expect(logger.info.mock.calls.some(([bindings]) => (bindings as { event?: string }).event === 'portal.service.upgraded')).toBe(true);
    await store.stop();
  });

  it('isolates an invalid registration while retaining valid services', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'atlas-catalog-'));
    directories.push(directory);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await writeFile(path.join(directory, 'valid.yaml'), YAML.stringify(manifest()), 'utf8');
    await writeFile(path.join(directory, 'invalid.yaml'), 'kind: DefinitelyNotAllowed', 'utf8');
    const store = new CatalogStore(new FilesystemCatalogSource(directory, logger), logger);
    await store.start();
    expect(store.snapshot()).toHaveLength(1);
    expect(logger.error).toHaveBeenCalled();
    await store.stop();
  });
});

function manifest(overrides: { version?: string; enabled?: boolean } = {}) {
  return {
    apiVersion: 'portal.atlas.dev/v1alpha1',
    kind: 'PortalService',
    metadata: { name: 'inventory' },
    spec: {
      service: {
        id: 'inventory', displayName: 'Inventory', owner: 'supply-team',
        version: overrides.version ?? '1.0.0', enabled: overrides.enabled ?? true
      },
      backend: {
        apiBasePath: '/api/services/inventory', upstream: 'http://inventory:4201',
        apiVersion: '1.0.0', requiredPermissions: ['inventory:read']
      },
      health: { url: 'http://inventory:4201/health/ready', intervalSeconds: 15, timeoutMilliseconds: 500 },
      security: { allowedOrigins: ['self'], integrityRequired: true },
      extensions: [{
        id: 'inventory-overview', displayName: 'Inventory', description: 'Stock', icon: 'boxes', route: '/inventory',
        order: 10, elementName: 'inventory-overview-v1',
        entry: { url: '/extensions/inventory/mfe/entry.js', type: 'module', integrity: `sha384-${'A'.repeat(64)}` },
        extensionVersion: '1.0.0', apiVersion: '1.0.0', portalCompatibility: '^1.0.0',
        requiredPermissions: ['inventory:read'], featureFlags: {}
      }]
    }
  };
}
