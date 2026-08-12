# ADR-001: Web Components for runtime composition

Status: Accepted

## Decision

Service UIs are self-contained ES modules that register versioned custom elements and render in Shadow DOM. The shell loads the declared entry with SRI and supplies a small property/event contract.

## Alternatives

| Option | Strength | Reason not selected as default |
|---|---|---|
| runtime Module Federation | rich module sharing and React integration | shared scopes and framework versions create governance and release coupling; runtime/SRI behavior is more complex |
| Web Components | browser-native discovery, framework-neutral, tiny contract, Shadow DOM isolation | selected; services bundle their own runtime and accept some duplication |
| iframe | strongest process/origin isolation | accessibility, routing, theme, responsive layout, session, and communication are worse for trusted applications |
| build-time packages | simplest code sharing | requires shell rebuild and violates runtime registration |

An iframe remains an exception for legacy or untrusted applications after security review. Module Federation may be adopted inside one ownership/release domain, not as the platform-wide contract.

