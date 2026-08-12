import { describe, expect, it } from 'vitest';
import type { CatalogProvider } from './catalog-client.js';
import type { CatalogService } from '@atlas/contracts';
import { buildPortalApp } from './app.js';

const service = {
  apiVersion: 'portal.atlas.dev/v1alpha1', kind: 'PortalService', metadata: { name: 'audit' },
  spec: {
    service: { id: 'audit', displayName: 'Audit', owner: 'security', version: '1.0.0', enabled: true },
    backend: { apiBasePath: '/api/services/audit', upstream: 'http://audit:4202', apiVersion: '1.0.0', requiredPermissions: ['audit:read'] },
    health: { url: 'http://audit:4202/health/ready', intervalSeconds: 15, timeoutMilliseconds: 1000 },
    security: { allowedOrigins: ['self'], integrityRequired: true },
    extensions: [{ id: 'audit-timeline', displayName: 'Audit', description: 'Events', icon: 'clipboard', route: '/audit', order: 20, elementName: 'audit-timeline-v1', entry: { url: '/extensions/audit/mfe/entry.js', type: 'module', integrity: `sha384-${'A'.repeat(64)}`, crossOrigin: 'anonymous' }, extensionVersion: '1.0.0', apiVersion: '1.0.0', portalCompatibility: '^1.0.0', requiredPermissions: ['audit:read'], featureFlags: {} }]
  },
  availability: { state: 'available', checkedAt: new Date().toISOString(), consecutiveFailures: 0 }
} satisfies CatalogService;
const catalog: CatalogProvider = { list: async () => [service], get: async () => service };
const sessionKey = Buffer.alloc(32, 7).toString('hex');

describe('portal BFF session and permission filtering', () => {
  it('authenticates with a secure cookie and hides unauthorized tabs', async () => {
    const app = await buildPortalApp({ logger: false, serveStatic: false, catalogProvider: catalog, sessionKey, authMode: 'dev', publicUrl: 'http://localhost:4000' });
    const anonymous = await app.inject({ method: 'GET', url: '/api/extensions' });
    expect(anonymous.statusCode).toBe(401);

    const login = await app.inject({ method: 'POST', url: '/auth/dev-login', headers: { origin: 'http://localhost:4000' }, payload: { identity: 'viewer' } });
    expect(login.statusCode).toBe(204);
    const cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
    const extensions = await app.inject({ method: 'GET', url: '/api/extensions', headers: { cookie } });
    expect(extensions.statusCode).toBe(200);
    expect(extensions.json().extensions).toEqual([]);
    await app.close();
  });

  it('shows a protected tab only after the required permission is present', async () => {
    const app = await buildPortalApp({ logger: false, serveStatic: false, catalogProvider: catalog, sessionKey, authMode: 'dev', publicUrl: 'http://localhost:4000' });
    const login = await app.inject({ method: 'POST', url: '/auth/dev-login', headers: { origin: 'http://localhost:4000' }, payload: { identity: 'operator' } });
    const cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
    const extensions = await app.inject({ method: 'GET', url: '/api/extensions', headers: { cookie } });
    expect(extensions.json().extensions.map((extension: { id: string }) => extension.id)).toContain('audit-timeline');
    await app.close();
  });
});
