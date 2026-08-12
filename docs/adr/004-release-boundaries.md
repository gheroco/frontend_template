# ADR-004: Independent releases in a monorepo

Status: Accepted

## Decision

Source code uses npm workspaces for consistent tooling, but each deployable has its own package version, Dockerfile, chart, path-triggered CI, release input, image, HPA, and Helm history. The convenience installer orchestrates five separate Helm releases rather than an umbrella release.

Shared TypeScript packages are build-time dependencies bundled into deployables. They do not become runtime singletons. This balances a solo/small platform team workflow with independent operations and prevents a distributed monolith.

