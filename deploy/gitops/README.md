# GitOps

`argocd-production.yaml` defines five independent Applications with sync waves. Register the private repository in Argo CD and create the externally managed `atlas-platform-secrets` and TLS Secret before enabling automated sync. Pin `targetRevision` to protected release branches or signed tags in production policy.

Each service remains independently promotable and revertible. Update only that Application's image tag/digest, service version, and SRI value. Do not combine service Applications into one Helm release.
