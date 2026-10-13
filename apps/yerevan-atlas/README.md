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

## October 2026 upgrade

The interface, project names/addresses, research notes, dates, numeric formatting, accessibility labels and CSV headings support Armenian, Russian and English. Armenian is the default; language and existing saved research persist across reloads. Provider-owned map labels and external websites retain available source language coverage.

The expanded project workspace separates overview, apartment offers, source evidence and personal research. A total-cost calculator separates purchase, renovation, parking and percentage-based fees. Users can set a reference place on the map, see a 1 km straight-line radius, and sort/compare distances. Distances are not travel times.

The 3D studio rectifies user-marked facade quadrilaterals from an image using a projective homography and maps them onto a dimensioned building volume. Two visually reviewed, source-attributed presets (one Defanse tower and a Bedeck corner section) are available in the studio. Uncalibrated photo presets are no longer placed on the map automatically. These are partial visual approximations. Hidden geometry, facade recesses, adjoining wings and unmeasured dimensions are not recovered from a single image. Users can edit dimensions/heading, mark front/right facade corners, inspect the model, export GLB and save it locally with map offsets.

The studio also imports self-contained, uncompressed GLB files with embedded textures (up to 40 MB), preserving supplied mesh geometry while allowing height calibration and heading. External resource references and unsupported compressed formats are rejected. Model provenance is embedded in generated GLB metadata. Photo uploads and models stay on-device in IndexedDB; GLB export is separate from research JSON backups.

Map models are rendered through a MapLibre custom layer with Three.js. The Three.js/model studio chunks load on demand. Source material for the presets and all localized data are stored with the app.

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

The CARTO Voyager vector style is stored in `public/map-style.json`. Tiles, glyphs and sprites are requested from CARTO. City footprints come from OpenStreetMap. Height fields may be missing or estimated. Project geometry now comes from `public/data/project-geometry.json`: **103 distinct OSM building footprints matched to 25 catalogue records**, including 63 separately addressed Defanse buildings (320/1–320/63). Original polygon rings, source tags, source URLs and the check date are preserved. Matches were manually reviewed using exact addresses or names; no nearest-building snapping is used. Unknown project footprints remain points. A footprint without height evidence stays flat.

Heights use a numeric OSM height when present, otherwise individual above-ground OSM levels × 3.2 m. Both source heights and estimated heights are labelled; neither is certified as a surveyed height. Complex-wide maximum floor counts are never applied to every tower. Invalid source height strings are discarded and floor-count conflicts are shown. Width/depth are the oriented bounding rectangle of the mapped footprint, and area excludes interior rings. Measurements are not usable apartment area.

Bedeck Davtashen’s records now share a named residential-complex point corroborated by Yandex Maps, Construction.am and municipal address/permit evidence. Individual block positions remain unverified. Municipal permit points can lie on streets and multiple Defanse permits share one site point; they were not treated as footprints. Original catalogue pins remain available in the accuracy tab, together with the displacement distance. Nine pin-over-structure discrepancies, 29 map-view centres and shared publisher pins are flagged. No accuracy percentage or arbitrary uncertainty radius is invented.

The model renderer, click volumes and offsets share MapLibre’s spherical Mercator scale. Heading 0 faces north; 90 faces east. Geometry handedness is preserved for imported models. The studio can fit its dimensioned volume to a selected mapped building; this is an oriented bounding box, not full reconstruction of recesses or hidden faces. Imported GLB click volumes use their actual normalized bounds. Saved models retain their original anchor when project coordinates change. Reference circles now use geodesic destinations at exactly the requested spherical distance.

The 2D view retains coloured footprint outlines. The map layer menu can restrict results to matched footprints. A dedicated Map accuracy tab gives building selection, dimensions, height basis, original source position and evidence in Armenian, Russian and English. The building polygons represent mapped geometry, including construction/planned states, not a claim that every structure is completed.

Map attribution: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) and [© CARTO](https://carto.com/attributions). Publisher project images and floor plans load from their original URLs and remain the property of their publishers. Fonts load from Google Fonts with local fallbacks. The app remains usable as a searchable list if WebGL or map resources fail.

## Render deployment

Deploy as a Render Static Site from the `apps/yerevan-atlas` branch of `gheroco/frontend_template`. The app occupies only `apps/yerevan-atlas/`; the repository's existing application files remain unchanged.

- Build: `npm --prefix apps/yerevan-atlas ci --workspaces=false && npm --prefix apps/yerevan-atlas run check --workspaces=false && npm --prefix apps/yerevan-atlas run build --workspaces=false`
- Publish directory: `apps/yerevan-atlas/dist`
- Environment: `NODE_VERSION=24.19.0`, `SKIP_INSTALL_DEPS=true`
- Auto deploy is configured, but this public-repository-URL service does not receive Git push events. Deploy the latest branch commit manually through Render when no automatic deploy starts.

Project navigation uses hash links, so no SPA rewrite is needed.

## Verification

The automated suite additionally checks multilingual interface and content coverage, placeholder consistency, language switching with saved notes, projective facade corner mapping, invalid geometry rejection, GLB resource validation, model scale normalization, total-cost calculations, straight-line distances and catalogue statistics. It checks budget and size matching, sold-out/unknown data handling, exchange conversion, filters, no invented geometry, safe links and CSV export, date semantics, catalogue provenance, apartment offer identity, and DOM interactions for search/save/compare/notes. Additional accuracy checks cover Mercator metre scale against MapLibre, cardinal headings, handedness, rotated click-volume alignment, polygon dimensions/courtyard area, source identity, no fake height, saved model anchoring, Bedeck source preservation and geodesic radius. CARTO returned real Yerevan building footprints and heights during collection. A real browser/WebGL rendering and mobile device check was not available in the build environment; DOM tests do not replace that visual check.
