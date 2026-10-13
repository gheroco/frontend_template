# Yerevan Atlas

A 3D discovery map and apartment comparison workspace for publicly advertised new residential developments in Yerevan.

## Run and verify

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run check
npm run build
npm run dev
```

The production output is `dist/`. The app uses Vite, MapLibre GL JS and a static JSON catalogue. There is no application server, private API key or account system. Favourites, comparisons, notes, preferences and checklists use localStorage. Users can export and import a research backup.

## Features

- 3D OSM city footprints and clickable project markers, with a 2D toggle.
- Search across English, Armenian and Russian project names, addresses and developers.
- District, construction status, budget, area, specific-offer and preferred-district filters.
- Published apartment prices, floor plans, floor and room filters, and booked-unit labels.
- Four-project comparison, favourites, notes, checklists, share links and CSV export.
- Source links, cross-source differences, developer contacts, dated progress images and further research links.
- Editable purchase budget, size and USD/AMD planning exchange rate.

## Research snapshot and coverage

`public/data/projects.json` was compiled on 13 October 2026. It contains 276 project/building/source-inventory records: 179 in Yerevan (177 mapped) and 97 outside Yerevan, hidden by default. Eleven Yerevan districts are represented; these sources did not establish a Nubarashen project.

The underlying catalogues returned 150 Karucapatoxic and 131 MyHome records. All returned detail pages were collected. Ten manually reviewed same-address cross-source duplicates were merged. Distinct phases and separately published inventories remain separate and are identified in notes; record counts are not counts of physical towers.

The snapshot includes 91 individual apartment offers: 82 MyHome offers in the original 80–100 m² / AMD50–75M range (77 marked not booked and 5 booked), two matching official Defanse offers, and seven ArmConstruct alternatives near that range. Changing preferences filters these captured offers; it does not fetch additional inventory. Prices and availability require seller confirmation.

Primary catalogues: https://karucapatoxic.am/ and https://myhome.am/en/buildings. Targeted developer cross-checks include Defanse, Bedeck, Mikshin/Yeraz, Premium Home, Cascade Hills, Jermuk Group and ArmConstruct. Each record and offer carries its own source URL and checked date. Website links merely supplied by a directory are distinguished from read sources. Conflicting dates and pins are retained rather than silently resolved. Published contact details are business contacts.

Default preferences are 80–100 m² and AMD50–75M for purchase. USD conversions use an editable reference rate of AMD362.21 per USD from the [Central Bank of Armenia, 12 October 2026](https://www.cba.am/en/exchange-rates-archive/). Estimates exclude renovation, parking and fees unless explicitly included by an offer.

This is a dated research catalogue, not an exhaustive official construction register or a live inventory feed. It does not certify construction quality, ownership, permits or completion. Update the curated JSON with newly checked sources, preserve per-field provenance and conflicts, update metadata/counts and the coverage text in `src/main.js`, then run `npm run check` before deploying. Never infer completed status simply because a target date has passed.

## Map geometry and attribution

The CARTO Voyager vector style is stored in `public/map-style.json`. Tiles, glyphs and sprites are requested from CARTO. City footprints come from OpenStreetMap. Height fields may be missing or estimated. Coloured project extrusions are **schematic 30 × 22 metre markers** at published or approximate source locations; height is maximum published floors × 3.2 metres, capped at 180 metres, or 32 metres when unknown. They are not architectural models, surveyed positions, individual towers of a complex, or a sunlight simulation. Missing project locations are retained in the list without fabricated coordinates.

Map attribution: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) and [© CARTO](https://carto.com/attributions). Publisher project images and floor plans load from their original URLs and remain the property of their publishers. Fonts load from Google Fonts with local fallbacks. The app remains usable as a searchable list if WebGL or map resources fail.

## Render deployment

Deploy as a Render Static Site from the `apps/yerevan-atlas` branch of `gheroco/frontend_template`. The app occupies only `apps/yerevan-atlas/`; the repository's existing application files remain unchanged.

- Build: `npm --prefix apps/yerevan-atlas ci --workspaces=false && npm --prefix apps/yerevan-atlas run check --workspaces=false && npm --prefix apps/yerevan-atlas run build --workspaces=false`
- Publish directory: `apps/yerevan-atlas/dist`
- Environment: `NODE_VERSION=24.19.0`, `SKIP_INSTALL_DEPS=true`
- Auto deploy: enabled for this branch.

Project navigation uses hash links, so no SPA rewrite is needed.

## Verification

The automated suite checks budget and size matching, sold-out/unknown data handling, exchange conversion, filters, schematic geometry, safe links and CSV export, date semantics, catalogue provenance, apartment offer identity, and DOM interactions for search/save/compare/notes. The production build and MapLibre style validation pass. CARTO returned real Yerevan building footprints and heights during collection. A real browser/WebGL rendering and mobile device check was not available in the build environment; DOM tests do not replace that visual check.
