# ADR-002: Kubernetes PortalService catalog

Status: Accepted

## Decision

Kubernetes uses namespaced `PortalService` CRs as desired state. The registry reads them with least-privilege RBAC, validates a richer runtime contract, checks health, exposes a sanitized internal API, and audits changes. Local development uses the same YAML contract through a watched filesystem adapter.

This makes installation and uninstallation naturally declarative and GitOps compatible. The browser never receives Kubernetes credentials or API access.

Polling every five seconds is selected for a low-churn catalog. It is bounded, easy to recover, and keeps the adapter deterministic. The source interface permits a watch/informer without changing consumers.

