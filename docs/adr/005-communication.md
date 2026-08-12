# ADR-005: No event broker in the baseline

Status: Accepted

## Decision

Discovery uses Kubernetes desired state and user-facing data uses synchronous HTTP. No queue or broker is deployed because the examples have no asynchronous product requirement.

A service introduces events only when temporal decoupling, fan-out, or durable retries justify them. New event contracts must be versioned, idempotent, observable, and owned by the producer; transactional publication requires an outbox.

