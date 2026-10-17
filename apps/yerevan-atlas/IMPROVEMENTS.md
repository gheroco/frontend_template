# Yerevan Atlas improvement roadmap

Created 17 October 2026. Baseline: `df7e9a4`, 43 passing checks. Scope: the existing Armenian/Russian/English apartment research app, with filtering first. Preserve the reviewed catalogue, geometry provenance, local research and Render hosting.

## Implementation order

| # | Improvement | Acceptance criteria | Status |
| --- | --- | --- | --- |
| 1 | Trustworthy search and saved state | Invalid dates/ranges/fees cannot silently broaden a shared search; untrusted backups are validated before replacing state; unknown preference keys are discarded. | Planned |
| 2 | Consistent apartment matching | Cards, map colours, detail panels, comparisons and CSV use the same selected price variant and filters; unavailable/quarantined variants never count; total-cost sort uses total cost. | Planned |
| 3 | Explainable filtering | Explain matches and missing facts; offer counted ways to relax empty searches; include unknown-price opt-in in active chips; labels do not imply all offers fit the default budget. | Planned |
| 4 | Search performance | Render project cards in batches while map and counts retain all results; reuse match entries during a render; avoid unnecessary work on each keystroke. | Planned |
| 5 | Data health and freshness | A localized quality panel distinguishes project checks, unit checks, missing fields, price review, source conflicts, and footprint coverage; dates age against the current clock. | Planned |
| 6 | Geographic search and geometry | Search the current map extent with an explicit frozen boundary; save/share it; fit all matched footprint extents; no fabricated tower geometry. | Planned |
| 7 | Resilience and accessibility | Optional geometry/presets/translations cannot hide a usable catalogue; keyboard tabs have focus semantics; mobile hidden panels cannot trap focus; preserve map layer choices on load. | Planned |
| 8 | Useful research exports | Export matching apartment rows with exact selected price/finish, extras, source timestamps and URLs; comparison includes evidence gaps. | Planned |
| 9 | Safe repeatable source updates | Explicit dry-run/output staging, hash/completeness checks and failed-record preservation; no new freshness date without successful retrieval. | Planned |
| 10 | Release verification | Run regression suite and production build; add an app-scoped CI workflow; publish a reviewable branch/PR and document deployment verification limits. | Planned |

Each step is a separate commit with its evidence recorded below. Changes to unrelated repository applications are out of scope.

## Subsequent evidence-dependent improvements

These are part of the product roadmap, but require new evidence or services rather than invented data:

- **Coverage and deduplication:** continuously reconcile official developers and directories; review possible duplicate physical units without collapsing distinct blocks or payment offers; track source withdrawals and historical prices.
- **Surveyed geometry:** exact building/block assignment from cadastral or architect-provided plans, surveyed heights and calibrated models. A single photo cannot establish exact hidden geometry or scale.
- **Apartment suitability:** sourced orientation, usable-area definitions, sunlight/shading, balconies, noise and ventilation; allow unknown values instead of guessing quality scores.
- **Neighbourhood and commute:** dated amenity locations and pedestrian/transit routing with a selected routing provider. Straight-line distance must remain explicitly labelled.
- **Live inventory and notifications:** seller-confirmed inventory APIs, a persistent backend and opt-in alert delivery. Current snapshots cannot establish live availability.
- **Cross-device research:** authenticated sync of favourites, notes, searches and models, with export/restore and conflict handling.
- **Real-device visual verification:** WebGL, mobile Safari, slow networks, screen-reader navigation and imported GLB rendering. DOM tests cannot prove visual quality.

## Implementation record

### Baseline audit

- Source located in `gheroco/frontend_template`, branch `apps/yerevan-atlas`, app directory `apps/yerevan-atlas`.
- Source snapshot remains 13 October 2026; no later check is asserted by this development work.
- Confirmed risks: permissive shared preferences, contradictory badges/map colours, expensive full-list rerenders, stale open detail panels after quick filters, coupled optional resource loading, and no app-specific CI gate.
- Render connector requires explicit workspace selection before deployment. Prepare and validate the code before requesting that selection.
