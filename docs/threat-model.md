# Threat model

## Trust boundaries

The public boundary ends at Gateway/portal BFF. The registry and service upstreams are cluster-internal. Kubernetes registration is operator/GitOps controlled. Remote JavaScript is trusted release code but is still verified and isolated; truly untrusted code must not use the Web Component path.

## Controls

| Threat | Control |
|---|---|
| token theft through JavaScript | access token remains in encrypted `HttpOnly` cookie and BFF |
| login/session fixation | OIDC state + PKCE, session regeneration, short expiry |
| CSRF | SameSite cookie, exact Origin, per-session constant-time CSRF token on writes |
| XSS | React escaping, remote output escaping, CSP, no `eval`, SRI, allowlisted origins |
| malicious registration / SSRF | CR RBAC, strict schema, upstream DNS suffix allowlist, normalized paths, no redirects controlled by browser |
| remote supply-chain replacement | immutable path/tag, SHA-384 SRI, image scan/signature/provenance |
| frontend permission bypass | BFF and backend both authorize; hidden tabs are usability only |
| lateral movement | dedicated service accounts, restricted containers, default deny + workload policies |
| log/secret leakage | header/cookie redaction and no secrets in code, bundle, image, metrics, or audit fields |
| resource exhaustion | request/body/response limits, timeouts, HPA, circuit breaker, bounded retries with jitter |

Legacy or genuinely untrusted applications require a separately reviewed sandboxed iframe on a distinct origin. That mode is intentionally not part of the trusted extension contract.

