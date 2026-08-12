# ADR-003: OIDC BFF security boundary

Status: Accepted

## Decision

The portal server performs OIDC Authorization Code + PKCE and stores identity/access-token material in an encrypted `HttpOnly` cookie. Remote UIs call same-origin BFF paths; the BFF forwards an access token only to the validated service upstream. Backends validate issuer, audience, algorithm, subject, and permissions.

This avoids tokens in local storage or remote JavaScript and centralizes session, CSRF, CORS/CSP, proxy limits, and upstream allowlisting. It does not centralize authorization: each service remains authoritative for its operations.

