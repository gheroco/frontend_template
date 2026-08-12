# Operations runbook

## Install and verify

Create `atlas-platform-secrets` from an external secret manager with `SESSION_KEY` (32 random bytes encoded as 64 hex characters), `OIDC_CLIENT_SECRET`, `DEV_JWT_SECRET` (development only), and `REGISTRY_API_TOKEN`. Install with `scripts/install-platform.sh <environment>`.

Verify:

```bash
kubectl -n atlas-platform get gateway,httproute,portalservice,deploy,svc,hpa,pdb,networkpolicy
kubectl -n atlas-platform wait deploy --all --for=condition=Available --timeout=5m
kubectl -n atlas-platform auth can-i list portalservices --as=system:serviceaccount:atlas-platform:extension-registry
kubectl -n atlas-platform auth can-i update portalservices --as=system:serviceaccount:atlas-platform:extension-registry
```

The last answer must be `no`.

## Register, add a tab, disable, and delete

Installing a service chart creates the registration. Inventory demonstrates multiple tabs:

```bash
scripts/extension.sh suppliers
scripts/extension.sh disable
scripts/extension.sh enable
scripts/extension.sh delete
scripts/extension.sh register
```

Uninstalling a service release removes its HTTPRoute, registration, Service, and Deployment. The registry logs `portal.service.unregistered`; the shell drops the tab on its next poll.

## Upgrade and rollback

Release automation supplies an immutable image tag/digest and its exact SRI value. The standard upgrade uses `maxUnavailable: 0`, readiness gates, `--atomic`, `--cleanup-on-fail`, and a five-minute timeout. A failed readiness check automatically restores the prior Helm revision.

Manual rollback affects only the selected service:

```bash
helm history atlas-inventory -n atlas-platform
helm rollback atlas-inventory <revision> -n atlas-platform --wait
```

Keep the old remote path available until no previous pods receive traffic. The versioned element name permits open browser sessions to load both versions. Database migrations must be expand/migrate/contract and compatible with the preceding application release.

## Incident triage

1. Check Gateway and HTTPRoute `Accepted`, `ResolvedRefs`, and `Programmed` conditions.
2. Check the `PortalService`, registry validation logs, and `atlas_build_info` version labels.
3. Check readiness and `/health/ready`; dependency failures are deliberately not liveness failures.
4. Trace the browser `x-request-id` through portal and service structured logs or OTLP traces.
5. Inspect error rate, p95 latency, circuit state, restarts, and deployment revision.
6. Roll back the affected service; do not redeploy unrelated services or the shell.

## Secrets and rotation

No secret is stored in values or images. Rotate the registry token by updating the external Secret and rolling portal/registry. Rotating the session key invalidates sessions and should be planned. Use two-key support before zero-downtime session-key rotation in a high-availability production customization.

