# Reliability targets

Recommended initial production SLOs, measured over a rolling 28-day window:

| SLI | SLO | Notes |
|---|---:|---|
| portal successful navigation | 99.95% | shell HTML plus `/api/session` and `/api/extensions` |
| registry catalog success | 99.9% | last-known-good serving reduces user impact |
| per-service API availability | 99.9% | measured independently; do not aggregate services into one SLO |
| portal BFF p95 latency | < 300 ms | excludes remote UI asset transfer |
| service read API p95 latency | < 500 ms | example starting objective |
| registration propagation | 99% < 10 s | CR update to permission-eligible tab response |

Page on fast-burn multi-window error-budget alerts, sustained total unavailability, and failed rollouts. Ticket on slow burn, resource saturation, elevated catalog rejections, certificate expiry, or SRI failures. Do not page merely because one optional extension is disabled intentionally.

