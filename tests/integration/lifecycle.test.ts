import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import YAML from 'yaml';
import { CatalogStore, FilesystemCatalogSource } from '../../apps/extension-registry/src/catalog.js';
import { flattenVisibleExtensions } from '@atlas/contracts';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('service lifecycle smoke contract', () => {
  it('changes visible tabs for registration, upgrade, rollback, disable, and deletion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const directory = await mkdtemp(path.join(tmpdir(), 'atlas-lifecycle-'));
    cleanup.push(directory);
    const source = new FilesystemCatalogSource(directory, silentLogger());
    const store = new CatalogStore(source, silentLogger());
    const file = path.join(directory, 'service.yaml');

    await writeFile(file, YAML.stringify(manifest('1.0.0', true, ['overview'])), 'utf8');
    await store.start();
    expect(visible(store)).toEqual(['inventory-overview']);

    await writeFile(file, YAML.stringify(manifest('1.0.0', true, ['overview', 'suppliers'])), 'utf8');
    await store.reload();
    expect(visible(store)).toEqual(['inventory-overview', 'inventory-suppliers']);

    await writeFile(file, YAML.stringify(manifest('1.1.0', true, ['overview'], 'inventory-overview-v2')), 'utf8');
    await store.reload();
    expect(store.snapshot()[0]?.spec.service.version).toBe('1.1.0');

    await writeFile(file, YAML.stringify(manifest('1.0.0', true, ['overview'])), 'utf8');
    await store.reload();
    expect(store.snapshot()[0]?.spec.service.version).toBe('1.0.0');

    await writeFile(file, YAML.stringify(manifest('1.0.0', false, ['overview'])), 'utf8');
    await store.reload();
    expect(visible(store)).toEqual([]);

    await unlink(file);
    await store.reload();
    expect(store.snapshot()).toEqual([]);
    await store.stop();
  });
});

function visible(store: CatalogStore) {
  return flattenVisibleExtensions(store.snapshot(), ['inventory:read']).map((extension) => extension.id);
}

function manifest(version: string, enabled: boolean, tabs: string[], elementName = 'inventory-overview-v1') {
  const entry = { url: '/extensions/inventory/mfe/entry.js', type: 'module', integrity: `sha384-${'A'.repeat(64)}`, crossOrigin: 'anonymous' };
  return {
    apiVersion: 'portal.atlas.dev/v1alpha1', kind: 'PortalService', metadata: { name: 'inventory' },
    spec: {
      service: { id: 'inventory', displayName: 'Inventory', owner: 'supply', version, enabled },
      backend: { apiBasePath: '/api/services/inventory', upstream: 'http://inventory:4201', apiVersion: '1.0.0', requiredPermissions: ['inventory:read'] },
      health: { url: 'http://inventory:4201/health/ready', intervalSeconds: 15, timeoutMilliseconds: 500 },
      security: { allowedOrigins: ['self'], integrityRequired: true },
      extensions: tabs.map((tab, index) => ({
        id: `inventory-${tab}`, displayName: tab, description: tab, icon: 'boxes', route: `/${tab}`, order: index,
        elementName: tab === 'overview' ? elementName : 'inventory-suppliers-v1', entry,
        extensionVersion: version, apiVersion: '1.0.0', portalCompatibility: '^1.0.0', requiredPermissions: ['inventory:read'], featureFlags: {}
      }))
    }
  };
}

function silentLogger() { return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }; }

