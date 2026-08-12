import semver from 'semver';
import { z } from 'zod';

export const CONTRACT_API_VERSION = 'portal.atlas.dev/v1alpha1' as const;
export const CONTRACT_KIND = 'PortalService' as const;
export const PORTAL_API_VERSION = '1.0.0' as const;

const dnsId = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, 'must be a DNS-style identifier');
const semverValue = z.string().refine((value) => semver.valid(value) !== null, 'must be valid SemVer');
const semverRange = z
  .string()
  .refine((value) => semver.validRange(value) !== null, 'must be a valid SemVer range');
const permission = z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/);
const route = z
  .string()
  .regex(/^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/, 'must be an absolute lower-case portal route')
  .refine((value) => !value.startsWith('/api') && !value.startsWith('/auth'), 'route is reserved');
const customElementName = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/, 'must be a valid versioned custom-element name');
const integrity = z.string().regex(/^sha384-[A-Za-z0-9+/]{64}$/, 'must be a SHA-384 SRI value');

const entryUrl = z.string().refine((value) => {
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopback(parsed.hostname));
  } catch {
    return false;
  }
}, 'must be an HTTPS URL, a loopback HTTP URL, or a same-origin absolute path');

const upstreamUrl = z.string().refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, 'must be an HTTP(S) service URL');

export const portalExtensionSchema = z.object({
  id: dnsId,
  displayName: z.string().min(1).max(48),
  description: z.string().max(180).default(''),
  icon: z.enum(['boxes', 'clipboard', 'pulse', 'shield', 'database', 'settings', 'sparkles']),
  route,
  order: z.number().int().min(0).max(10_000).default(100),
  elementName: customElementName,
  entry: z.object({
    url: entryUrl,
    type: z.literal('module'),
    integrity,
    crossOrigin: z.literal('anonymous').default('anonymous')
  }),
  extensionVersion: semverValue,
  apiVersion: semverValue,
  portalCompatibility: semverRange,
  requiredPermissions: z.array(permission).max(32).default([]),
  featureFlags: z.record(z.string().min(1).max(64), z.boolean()).default({})
});

export const portalServiceManifestSchema = z
  .object({
    apiVersion: z.literal(CONTRACT_API_VERSION),
    kind: z.literal(CONTRACT_KIND),
    metadata: z.object({
      name: dnsId,
      namespace: dnsId.optional(),
      labels: z.record(z.string(), z.string()).optional()
    }),
    spec: z.object({
      service: z.object({
        id: dnsId,
        displayName: z.string().min(1).max(80),
        owner: z.string().min(1).max(120),
        version: semverValue,
        enabled: z.boolean().default(true)
      }),
      backend: z.object({
        apiBasePath: z.string().regex(/^\/api\/services\/[a-z][a-z0-9-]*$/),
        upstream: upstreamUrl,
        apiVersion: semverValue,
        requiredPermissions: z.array(permission).max(32).default([])
      }),
      health: z.object({
        url: upstreamUrl,
        intervalSeconds: z.number().int().min(5).max(300).default(15),
        timeoutMilliseconds: z.number().int().min(100).max(10_000).default(1_500)
      }),
      security: z.object({
        allowedOrigins: z.array(z.string().min(1)).max(16),
        integrityRequired: z.literal(true)
      }),
      extensions: z.array(portalExtensionSchema).max(16).default([])
    })
  })
  .superRefine((manifest, context) => {
    if (manifest.metadata.name !== manifest.spec.service.id) {
      context.addIssue({
        code: 'custom',
        path: ['metadata', 'name'],
        message: 'metadata.name must equal spec.service.id'
      });
    }
    if (manifest.spec.backend.apiBasePath !== `/api/services/${manifest.spec.service.id}`) {
      context.addIssue({
        code: 'custom',
        path: ['spec', 'backend', 'apiBasePath'],
        message: 'apiBasePath must be derived from the stable service ID'
      });
    }
    const ids = new Set<string>();
    const routes = new Set<string>();
    for (const [index, extension] of manifest.spec.extensions.entries()) {
      if (ids.has(extension.id)) {
        context.addIssue({ code: 'custom', path: ['spec', 'extensions', index, 'id'], message: 'duplicate ID' });
      }
      if (routes.has(extension.route)) {
        context.addIssue({ code: 'custom', path: ['spec', 'extensions', index, 'route'], message: 'duplicate route' });
      }
      ids.add(extension.id);
      routes.add(extension.route);
      validateEntryOrigin(extension.entry.url, manifest.spec.security.allowedOrigins, context, index);
    }
  });

export type PortalExtension = z.infer<typeof portalExtensionSchema>;
export type PortalServiceManifest = z.infer<typeof portalServiceManifestSchema>;

export type Availability = {
  state: 'available' | 'unavailable' | 'unknown';
  checkedAt: string | null;
  reason?: string;
  consecutiveFailures: number;
};

export type CatalogService = PortalServiceManifest & { availability: Availability };

export type PublicExtension = Omit<PortalExtension, 'requiredPermissions'> & {
  serviceId: string;
  serviceDisplayName: string;
  serviceVersion: string;
  apiBasePath: string;
  availability: Availability;
};

export type PortalIdentity = {
  subject: string;
  displayName: string;
  email?: string;
  roles: string[];
  permissions: string[];
};

export type SessionResponse = {
  authenticated: boolean;
  identity?: PortalIdentity;
  csrfToken?: string;
  devMode: boolean;
};

export type ExtensionsResponse = {
  contractVersion: typeof CONTRACT_API_VERSION;
  portalVersion: string;
  generatedAt: string;
  extensions: PublicExtension[];
};

export type PortalElementContext = {
  apiBasePath: string;
  extensionId: string;
  serviceVersion: string;
  subPath: string;
  theme: 'light' | 'dark';
  locale: string;
};

export interface PortalCustomElement extends HTMLElement {
  portalContext: PortalElementContext | undefined;
}

export function parsePortalServiceManifest(input: unknown): PortalServiceManifest {
  return portalServiceManifestSchema.parse(input);
}

export function isPortalCompatible(range: string, portalVersion = PORTAL_API_VERSION): boolean {
  return semver.satisfies(portalVersion, range, { includePrerelease: true });
}

export function hasPermissions(granted: readonly string[], required: readonly string[]): boolean {
  const available = new Set(granted);
  return required.every((candidate) => available.has(candidate));
}

export function flattenVisibleExtensions(
  services: readonly CatalogService[],
  permissions: readonly string[],
  portalVersion = PORTAL_API_VERSION
): PublicExtension[] {
  return services
    .filter((manifest) => manifest.spec.service.enabled)
    .flatMap((manifest) =>
      manifest.spec.extensions
        .filter((extension) => isPortalCompatible(extension.portalCompatibility, portalVersion))
        .filter((extension) => hasPermissions(permissions, extension.requiredPermissions))
        .map((extension) => ({
          ...extension,
          serviceId: manifest.spec.service.id,
          serviceDisplayName: manifest.spec.service.displayName,
          serviceVersion: manifest.spec.service.version,
          apiBasePath: manifest.spec.backend.apiBasePath,
          availability: manifest.availability
        }))
    )
    .sort((left, right) => left.order - right.order || left.displayName.localeCompare(right.displayName));
}

function validateEntryOrigin(
  value: string,
  allowedOrigins: readonly string[],
  context: z.core.$RefinementCtx<PortalServiceManifest>,
  extensionIndex: number
): void {
  if (value.startsWith('/')) {
    if (!allowedOrigins.includes('self')) {
      context.addIssue({
        code: 'custom',
        path: ['spec', 'extensions', extensionIndex, 'entry', 'url'],
        message: 'same-origin entry requires "self" in allowedOrigins'
      });
    }
    return;
  }
  const origin = new URL(value).origin;
  if (!allowedOrigins.includes(origin)) {
    context.addIssue({
      code: 'custom',
      path: ['spec', 'extensions', extensionIndex, 'entry', 'url'],
      message: `entry origin ${origin} is not allowlisted`
    });
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
