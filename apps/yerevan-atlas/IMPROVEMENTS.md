# Yerevan Atlas improvement roadmap

Created 17 October 2026. Baseline: `df7e9a4`, 43 passing checks. Scope: the existing Armenian/Russian/English apartment research app, with filtering first. Preserve the reviewed catalogue, geometry provenance, local research and Render hosting.

## Implementation order

| # | Improvement | Acceptance criteria | Status |
| --- | --- | --- | --- |
| 1 | Trustworthy search and saved state | Invalid dates/ranges/fees cannot silently broaden a shared search; untrusted backups are validated before replacing state; unknown preference keys are discarded. | Implemented |
| 2 | Consistent apartment matching | Cards, map colours, detail panels, comparisons and CSV use the same selected price variant and filters; unavailable/quarantined variants never count; total-cost sort uses total cost. | Implemented |
| 3 | Explainable filtering | Explain matches and missing facts; offer counted ways to relax empty searches; include unknown-price opt-in in active chips; labels do not imply all offers fit the default budget. | Implemented |
| 4 | Search performance | Render project cards in batches while map and counts retain all results; reuse match entries during a render; avoid unnecessary work on each keystroke. | Implemented |
| 5 | Data health and freshness | A localized quality panel distinguishes project checks, unit checks, missing fields, price review, source conflicts, and footprint coverage; dates age against the current clock. | Implemented |
| 6 | Geographic search and geometry | Search the current map extent with an explicit frozen boundary; save/share it; fit all matched footprint extents; no fabricated tower geometry. | Implemented |
| 7 | Resilience and accessibility | Optional geometry/presets/translations cannot hide a usable catalogue; keyboard tabs have focus semantics; mobile hidden panels cannot trap focus; preserve map layer choices on load. | Implemented |
| 8 | Useful research exports | Export matching apartment rows with exact selected price/finish, extras, source timestamps and URLs; comparison includes evidence gaps. | Implemented |
| 9 | Safe repeatable source updates | Explicit dry-run/output staging, hash/completeness checks and failed-record preservation; no new freshness date without successful retrieval. | Implemented |
| 10 | Release verification | Run regression suite and production build; add an app-scoped CI workflow; publish a reviewable branch/PR and document deployment verification limits. | Implemented |

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

### Completed implementation

- All ten implementation steps are complete in ordered commits.
- Validation: 56 JavaScript/DOM/data/model checks, 2 Python refresh-safety checks, and the Vite production build pass.
- A fresh source review read 285 catalogue records and 152 MyHome unit pages; 79 apartment details were enriched. The catalogue now retains 281 projects and 2,480 apartment records, including 11 historical offers under an unlisted project.
- Reappearing MyHome records 49/83/84 are retained as source inventories; MyHome367 is retained as unlisted and excluded from default matches.
- MyHome361 and unit36954 now carry the corrected source prices and preserved prior anomalous values. Reserved developer units with withdrawn prices keep null prices and are unavailable for normal matches.
- Two Bedeck requests failed with HTTP403; prior direct facts were preserved with failed-request evidence.
- Production deployment is pending Render workspace selection. Browser/WebGL/mobile visual QA was unavailable; the build still reports the existing large MapLibre/Three chunks.

### Repository integration checks

- The app-specific GitHub Actions workflow passed on commit `919f4de` (run `39013629079`). The app's lockfile audit reported zero known vulnerabilities on 17 October 2026.
- The first repository-wide run (`39013628953`) exposed a pre-existing workspace collision: the root `apps/*` pattern included this standalone app, whose dependencies have their own lockfile. The root workspace list now explicitly includes the two platform apps; the matching root lockfile metadata changed without changing dependency versions. `npm ci --ignore-scripts --dry-run` now accepts the root lockfile.
- The same run's security artifact contains 32 findings, all in the pre-existing root lockfile, across `@grpc/grpc-js`, `brace-expansion`, `fast-uri`, `fastify`, `ip-address` and `js-yaml`. None target the Atlas lockfile. Platform dependency upgrades remain a separate repository maintenance task; the security gate has not been disabled or weakened.

### Baseline audit

- Source located in `gheroco/frontend_template`, branch `apps/yerevan-atlas`, app directory `apps/yerevan-atlas`.
- The baseline source snapshot was 13 October 2026; the later refresh is separately documented above.
- Confirmed risks: permissive shared preferences, contradictory badges/map colours, expensive full-list rerenders, stale open detail panels after quick filters, coupled optional resource loading, and no app-specific CI gate.
- Render connector requires explicit workspace selection before deployment. Prepare and validate the code before requesting that selection.
