# Test strategy

| Layer | Coverage |
|---|---|
| contract unit | schema, SemVer, IDs/routes, origins, SRI, visibility |
| service-kit unit | health, metrics, JWT/RBAC, circuit breaker |
| registry integration | add, upgrade, rollback state, disable, delete, invalid-resource isolation |
| BFF integration | encrypted session cookie, anonymous 401, permission filtering |
| service API contract | versioned response shape, 401/403, idempotency key replay |
| component | accessible selected/unavailable tab state |
| loader security | same-origin/HTTPS rules and SHA-384 enforcement |
| Playwright E2E | role-visible tabs, remote render, deep-link refresh, removed route, mobile viewport |
| chart/manifest | Helm lint/template, immutable tags, kubeconform |
| supply chain | npm audit, CodeQL, Trivy, SBOM, provenance, signature |

`npm run validate` is the local required gate. GitHub Actions adds Playwright and Kubernetes tooling that may not exist on a developer machine. With the local stack running, `npm run smoke:lifecycle:http` exercises the lifecycle through real HTTP; the same behavior is covered without external processes by `npm run smoke:lifecycle`.

New services must add negative authorization tests and prove that a failed remote does not alter shell navigation or another extension.
