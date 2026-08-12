# Contributing

Use Node 24 and npm 11. Run `npm ci`, `npm run validate`, and the relevant component build before opening a pull request. A deployable change must update its version, tests, image release notes, chart values, and remote-entry SRI together.

Keep stable service/extension IDs and routes. API changes are additive by default. Do not add shared runtime frontend dependencies, direct Kubernetes access from the browser, cross-service database reads, credentials, unbounded retries, or a new infrastructure component without an ADR and an operational owner.

Conventional branch scope is `agent/<description>`. Releases use immutable semantic tags such as `inventory-v1.2.3`.
