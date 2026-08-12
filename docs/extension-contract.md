# PortalService extension contract

The canonical runtime validator is `packages/contracts/src/index.ts`; the Kubernetes structural schema is in the registry chart CRD.

## Required fields

| Field | Purpose |
|---|---|
| `metadata.name`, `spec.service.id` | stable DNS-style service identity; values must match |
| `service.displayName`, `owner`, `version`, `enabled` | ownership, audit metadata, lifecycle control |
| `backend.apiBasePath`, `upstream`, `apiVersion` | public BFF path and internal service target |
| `backend.requiredPermissions` | minimum permission enforced before proxying |
| `health.url`, interval, timeout | registry-side dependency status |
| `security.allowedOrigins`, `integrityRequired` | remote allowlist and mandatory integrity policy |
| `extensions[].id`, `route`, `order` | stable tab identity and navigation |
| `elementName`, `entry.url`, `entry.integrity` | versioned custom element and SHA-384 remote entry |
| `extensionVersion`, `apiVersion`, `portalCompatibility` | independent compatibility negotiation |
| `requiredPermissions`, `featureFlags` | visibility rules and explicit capabilities |

Backend-only services use `extensions: []`. One service may contribute up to 16 tabs. IDs and routes are globally unique.

## Add a service

1. Copy one example service structure and choose stable IDs, routes, API path, and owner.
2. Implement backend JWT validation and permission checks for every protected operation.
3. Export a self-contained, versioned custom element. Do not import shell runtime dependencies.
4. Build the entry, compute `openssl dgst -sha384 -binary entry.js | openssl base64 -A`, and store it as `sha384-...` in chart values.
5. Add the service-owned HTTPRoute and PortalService templates to its chart.
6. Run contract, compatibility, API, failure, security, Helm, and E2E tests.
7. Release an immutable image and deploy only that service chart with `--atomic`.

The shell requires no code, rebuild, chart, or deployment change.

## Compatibility policy

Additive contract fields can be introduced in `v1alpha1` only when older consumers ignore them safely. A semantic change produces `v1beta1` or `v1`. The registry may serve multiple resource versions via CRD conversion when needed. The shell excludes an extension whose compatibility range does not include its portal API version.

