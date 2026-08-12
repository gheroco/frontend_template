# GitHub webhook ingestion

This release unit accepts direct repository or organization webhooks before a GitHub App is introduced. It acknowledges a delivery only after RabbitMQ publisher confirmation, processes it asynchronously, stores the exact signed bytes idempotently in PostgreSQL, and contributes the `/github-webhooks` tab to the Atlas portal.

## Compatibility model

The receiver does not enumerate GitHub event names or deserialize event-specific schemas. It validates the signature and boundary headers, preserves the raw payload, and projects only stable common fields such as `action`, repository, organization, installation, and sender. This accepts every currently documented GitHub event and future event names matching GitHub's header format. Unknown payload fields are retained in `raw_payload` without requiring a deployment.

JSON and GitHub's legacy `application/x-www-form-urlencoded` format are supported. The maximum accepted request is 25 MiB. Configure RabbitMQ `max_message_size` to at least 33,554,432 bytes so the broker can accept GitHub's largest delivery without base64 expansion.

## Direct webhook setup

1. Expose `POST https://<gateway>/webhooks/github` over TLS.
2. Generate a high-entropy secret of at least 32 characters and store it as `GITHUB_WEBHOOK_SECRET` in the chart's existing Secret.
3. In the repository or organization settings, create a webhook with content type `application/json`, paste the same secret, and select the events the platform needs. Selecting all events is safe for ingestion because event handling is not schema-gated.
4. During rotation, set the new value in `GITHUB_WEBHOOK_SECRET` and the old value in `GITHUB_WEBHOOK_PREVIOUS_SECRET`. Remove the previous value after GitHub has been updated and in-flight deliveries have drained.

Never expose the receiver without the signature secret. The signature header is validated against the untouched body with constant-time SHA-256 comparison and is never logged, queued as metadata, stored, or returned by the portal API.

## Production dependencies and capacity

- PostgreSQL 15+ through `DATABASE_URL`. Run the Helm migration hook before receiver/worker rollout. Raw payload retention defaults to 90 days; set a shorter policy if payloads can contain sensitive repository data.
- RabbitMQ quorum queues through `AMQP_URL`. The chart expects an operator-managed highly available broker. The main queue, three delayed retry queues, and a DLQ are declared by the service.
- KEDA 2.x when `keda.enabled=true`. The worker scales from RabbitMQ queue depth. Budget PostgreSQL connections for both tiers: `receiver.maxReplicas × 2 + keda.maxReplicaCount × worker.databasePoolSize`, plus migrations and recovery.
- The receiver uses a regular Deployment/HPA with at least two replicas in production. It is deliberately not scaled to zero because GitHub requires a prompt HTTP response and does not retry failed deliveries automatically.

`/health/ready` reports ingestion readiness (RabbitMQ). `/health/api-ready` additionally reports PostgreSQL readiness for the portal and should be used by the registry health check. A PostgreSQL outage therefore disables querying but does not unnecessarily stop durable intake.

## Failed-delivery recovery

GitHub does not automatically retry a failed webhook. The optional CronJob inspects recent direct-hook deliveries and requests redelivery for non-OK results, deduplicating attempts in PostgreSQL. GitHub retains delivery records for a limited window, so the lookback is capped at 72 hours.

Set `recovery.enabled=true`, put a least-privilege token in `GITHUB_RECOVERY_TOKEN`, and configure targets:

```yaml
recovery:
  enabled: true
  targets:
    - { kind: organization, owner: octo-org, hookId: 123 }
    - { kind: repository, owner: octo-org, repository: storefront, hookId: 456 }
```

The token needs permission to read and redeliver the configured repository or organization hook deliveries. Recovery is an operational safety net, not an ordering mechanism: deliveries may arrive or be redelivered out of order, so downstream projections must remain idempotent.

## Local verification

Run `npm run compose:up`, configure a webhook to a tunnel terminating at `http://localhost:4203/webhooks/github`, and sign with the generated `GITHUB_WEBHOOK_SECRET` from `.env`. The Compose profile starts PostgreSQL, RabbitMQ (with a 32 MiB limit), receiver, and worker. The normal `npm run dev` path uses an in-memory broker only for fast UI development.
