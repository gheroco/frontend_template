import { describe, expect, it } from 'vitest';
import {
  flattenVisibleExtensions,
  hasPermissions,
  parsePortalServiceManifest,
  type CatalogService
} from './index.js';

const validManifest = {
  apiVersion: 'portal.atlas.dev/v1alpha1',
  kind: 'PortalService',
  metadata: { name: 'inventory' },
  spec: {
    service: { id: 'inventory', displayName: 'Inventory', owner: 'supply-team', version: '1.0.0', enabled: true },
    backend: {
      apiBasePath: '/api/services/inventory',
      upstream: 'http://inventory:4201',
      apiVersion: '1.0.0',
      requiredPermissions: ['inventory:read']
    },
    health: { url: 'http://inventory:4201/health/ready', intervalSeconds: 15, timeoutMilliseconds: 1000 },
    security: { allowedOrigins: ['self'], integrityRequired: true },
    extensions: [
      {
        id: 'inventory-overview',
        displayName: 'Inventory',
        description: 'Stock',
        icon: 'boxes',
        route: '/inventory',
        order: 10,
        elementName: 'inventory-overview-v1',
        entry: { url: '/extensions/inventory/mfe/entry.js', type: 'module', integrity: `sha384-${'A'.repeat(64)}` },
        extensionVersion: '1.0.0',
        apiVersion: '1.0.0',
        portalCompatibility: '^1.0.0',
        requiredPermissions: ['inventory:read'],
        featureFlags: {}
      }
    ]
  }
};

describe('portal extension contract', () => {
  it('accepts a valid, versioned and integrity-protected manifest', () => {
    expect(parsePortalServiceManifest(validManifest).spec.service.id).toBe('inventory');
  });

  it('rejects an entry origin that was not allowlisted', () => {
    const invalid = structuredClone(validManifest);
    invalid.spec.extensions[0]!.entry.url = 'https://malicious.example/entry.js';
    expect(() => parsePortalServiceManifest(invalid)).toThrow(/not allowlisted/);
  });

  it('rejects a backend base path that does not match the service identity', () => {
    const invalid = structuredClone(validManifest);
    invalid.spec.backend.apiBasePath = '/api/services/other';
    expect(() => parsePortalServiceManifest(invalid)).toThrow(/stable service ID/);
  });

  it('requires every permission and filters hidden tabs', () => {
    expect(hasPermissions(['inventory:read', 'audit:read'], ['inventory:read'])).toBe(true);
    expect(hasPermissions(['inventory:read'], ['inventory:read', 'inventory:write'])).toBe(false);
    const catalog = { ...parsePortalServiceManifest(validManifest), availability: unknownAvailability() } satisfies CatalogService;
    expect(flattenVisibleExtensions([catalog], ['inventory:read'])).toHaveLength(1);
    expect(flattenVisibleExtensions([catalog], [])).toHaveLength(0);
  });
});

function unknownAvailability() {
  return { state: 'unknown' as const, checkedAt: null, consecutiveFailures: 0 };
}
