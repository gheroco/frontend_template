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

## 3.1 improvements — 17 October 2026

The implementation roadmap and evidence-dependent follow-up work are in [IMPROVEMENTS.md](IMPROVEMENTS.md).

- Search cards, map colours, open detail panels, comparisons and exports use the same active apartment criteria and price variant. Total-cost scenarios select the lowest total including the user's extras.
- Shared searches and imported research validate ranges, calendar dates, extra costs, reference locations and known fields before applying state. Existing local research is preserved.
- Project cards render 30 at a time. The map, counters and exports still include all matches; apartment evaluations are cached during each render.
- Apartment results explain matching and missing source fields. Empty searches offer counted filter or text relaxations.
- **Data health** distinguishes project and apartment check ages, source conflicts, failed source requests, missing fields, price review and footprint coverage. Evidence reports can be exported as JSON.
- **Search this map area** captures a fixed geographic rectangle around the current viewport; only published project pins inside that rectangle pass. Panning does not change the search. The dashed outline, saved searches and shared URLs preserve the boundary. A tilted/rotated viewport uses its bounding rectangle, not an exact visible-screen polygon.
- Fit-to-results includes complete building footprints. No new building geometry is inferred by these UI changes.
- Optional model, geometry or translation failures no longer hide a valid catalogue. Tabs support arrow/Home/End navigation and focus return; hidden mobile surfaces are inert and touch targets are larger.
- Apartment CSV exports include the selected finish/payment basis, purchase and budget amounts, source availability, separate check timestamps and original listing URL. Project exports retain research notes; shared search links still exclude them.
- Source refreshes stage by default. Publication requires `--apply`, a matching base hash and complete catalogue/unit-list capture. Withdrawn projects remain historical but are excluded from normal searches. Corrected anomalous unit prices retain previous evidence.
- The app-specific GitHub Actions workflow runs UI/data/model checks, refresh safety checks and a production build. No browser/WebGL or real-device visual pass was available in this environment.

### Current source snapshot

The **17 October 2026** refresh successfully read **285 directory detail records** (150 Karucapatoxic + 135 MyHome) and all **152 MyHome unit-list pages**. The retained catalogue contains **281 project records**, including **183 in Yerevan**, after reviewed cross-source merges and retaining a withdrawn record. The three reappearing MyHome records (49, 83, 84) are distinct source inventories, not asserted to be three unique new buildings.

There are **2,480 retained apartment listing records**: **2,424 newly captured MyHome apartments**, **45 selected developer listings**, and **11 historical MyHome listings** retained under a project no longer listed by that source. Historical/unlisted records are excluded from default matches. 1,180 retained listings belong to Yerevan projects. **79** unit details were enriched successfully; the remaining units retain unknown detail fields. The source-reported total was 2,475 units including 51 houses/townhouses, which are excluded from apartment inventory.

MyHome367 is now unlisted; it was not labelled sold or deleted. MyHome361 and unit36954 now publish plausible corrected prices; their prior anomalous values remain in price-quality/history evidence. MyHome235's source minimum is 906,575 AMD/m². Existing Bedeck 2028/18-floor evidence is preserved; both direct Bedeck requests again returned403 and their old facts were not marked newly verified. The CBA reference is 362.34 AMD/USD dated16October2026; existing user-selected rates stay unchanged. Source snapshots are not seller-confirmed stock.

The October13 figures below document the earlier baseline, not the current inventory.

## October 2026 upgrade

The interface, project names/addresses, research notes, dates, numeric formatting, accessibility labels and CSV headings support Armenian, Russian and English. Armenian is the default; language and existing saved research persist across reloads. Provider-owned map labels and external websites retain available source language coverage.

The expanded project workspace separates overview, apartment offers, source evidence and personal research. A total-cost calculator separates purchase, renovation, parking and percentage-based fees. Users can set a reference place on the map, see a 1 km straight-line radius, and sort/compare distances. Distances are not travel times.

The 3D studio rectifies user-marked facade quadrilaterals from an image using a projective homography and maps them onto a dimensioned building volume. Two visually reviewed, source-attributed presets (one Defanse tower and a Bedeck corner section) are available in the studio. Uncalibrated photo presets are no longer placed on the map automatically. These are partial visual approximations. Hidden geometry, facade recesses, adjoining wings and unmeasured dimensions are not recovered from a single image. Users can edit dimensions/heading, mark front/right facade corners, inspect the model, export GLB and save it locally with map offsets.

The studio also imports self-contained, uncompressed GLB files with embedded textures (up to 40 MB), preserving supplied mesh geometry while allowing height calibration and heading. External resource references and unsupported compressed formats are rejected. Model provenance is embedded in generated GLB metadata. Photo uploads and models stay on-device in IndexedDB; GLB export is separate from research JSON backups.

Map models are rendered through a MapLibre custom layer with Three.js. The Three.js/model studio chunks load on demand. Source material for the presets and all localized data are stored with the app.

## Features

- 3D OSM city footprints and clickable project markers, with a 2D toggle.
- Search across English, Armenian and Russian project names, addresses and developers.
- Unified faceted filters with result counts, same-unit matching, saved searches and shareable criteria.
- Published apartment prices, floor plans, floor and room filters, and booked-unit labels.
- Four-project comparison, favourites, notes, checklists, share links and CSV export.
- Source links, cross-source differences, developer contacts, dated progress images and further research links.
- Editable purchase budget, size and USD/AMD planning exchange rate.

## Filtering and current source coverage

The filter dialog previews result counts before applying. Multi-select facets use OR within a group and AND across groups. Project estimates and individual apartment matching are explicitly separate. Rooms, floors, finish, balcony and top-floor criteria always require a single actual unit to satisfy all conditions; missing values never qualify. Selecting a finish checks that finish's own price against the budget, area and per-m² ceiling. Top-floor exclusion requires the individual unit's published building height; a complex-wide maximum is not substituted.

Filters include multi-district, multi-developer, construction status, purchase budget or budget with planned extras, area, rooms, floors, finish, balcony, per-m² ceiling, target handover deadline, straight-line distance, source-check recency, mapped footprints and known source conflicts. Sold-out projects and booked/sold units are excluded by default. Below-minimum budgets fail the range. Unknown project prices are an explicit opt-in for estimates only. Quarantined prices never generate unit matches. Year-only handover targets use 31 December; a past date never establishes completion.

The map, cards, apartment detail tab, comparison counts and cost scenarios use the same filter criteria. Active chips can be removed individually. Empty results offer counted relaxation choices. Searches can be named and saved locally, restored against the latest loaded data, or shared by URL. A shared search includes its reference point and cost assumptions, but not personal notes or saved projects. Draft filters are applied only after validation and submission.

The 13 October 2026 refresh contains **278 project/source-inventory records: 180 in Yerevan and 98 outside**, with outside records hidden by default. The two directories returned **150 Karucapatoxic + 133 MyHome records**, all successfully parsed. Ten reviewed cross-source aliases remain merged; separate blocks and inventories remain separate. New source IDs are MyHome361 (outside Yerevan) and367 (Arabkir). Eleven Yerevan districts are represented. These counts are not physical tower counts or exhaustive official coverage.

Apartment inventory expanded from91 to **2,500 listing records**: **2,456 apartments from all150 pages of the public MyHome unit-list endpoint, plus44 selected official developer listings**. MyHome queries did not restrict price, size, room count or booking status. Another51 houses/townhouses were collected in research and excluded from apartment inventory. Of the2,500 listings,1,185 are in Yerevan. Fifty MyHome units received extra detail enrichment for finish prices, balconies and unit-specific building floors; unknown details are retained as unknown. Developer capture is bounded, not exhaustive. Separate sources may still advertise the same physical apartment.

All283 catalogue detail records were read successfully, with checks from16:01–16:04UTC. MyHome list checks ran16:03–16:06UTC, followed by50 detail checks. Two direct Bedeck requests returned403; a readable official web page independently corroborated its2028 target and18 floors. A JavaScript portal returning HTTP200 is not treated as verified current stock. Each source and unit retains its own successful check time; publisher dates are separate. The downloadable `public/data/refresh-audit.json` records completeness, scope, changes and failures.

The refresh corrected MyHome235's published minimum to905,048AMD/m² and quarantined MyHome361's implausible2,000AMD unit/34AMD per-m² rate without inventing replacement values. A cached830,300AMD/m² single-unit Bedeck rate was removed from the complex-wide headline; individual block rates remain attributed to their own source. Two explicitly sold Defanse units retain historical prices and are excluded from normal matching. Unreconciled directory/detail/unit-list counts are displayed separately. Booking flags mean only what the source reported, not seller-confirmed availability.

Default planning preferences remain80–100m² andAMD50–75M. New users receive the CBA13October2026 reference of**361.73AMD/USD**; an existing user-selected planning rate remains unchanged. Finish conditionIDs5/6/7 are renovated / not renovated / partially renovated, verified from source unit-detail labels. They are not financing codes. Specific developer mortgage/installment variants keep their explicit source labels.

This is a dated source snapshot, not a live stock feed. The interface shows successful source-check dates, stale checks, known conflicts and seller-confirmation language. It does not certify construction quality, legal status, ownership, permits or completion.

### Repeatable refresh

Collectors use Python's standard library and public source endpoints. They write reviewable evidence and patches under ignored `research-output/`, and do not mutate the app. Run from the app directory:

```sh
python scripts/sources/refresh_public_catalogues.py
python scripts/sources/collect_full_myhome_inventory.py --projects research-output/catalogue/RUN/myhome-live-catalogue.json --output research-output/units --details yerevan --detail-limit 50 --detail-strategy default-preferences
python scripts/sources/refresh_official.py
```

Replace `RUN` with the timestamped run from the first command. Review `catalogue-patch.json`, additions, failures, source-count discrepancies, price-quality flags and unit-page completeness. Apply the reviewed patch with:

```sh
python scripts/apply-refresh.py --catalogue research-output/catalogue/RUN --units research-output/units --official research-output/official --output research-output/prepared
# Inspect staged JSON and source changes, then apply the reviewed patch:
python scripts/apply-refresh.py --catalogue research-output/catalogue/RUN --units research-output/units --official research-output/official --apply
npm run check
npm run build
```

The default/dry-run path stages complete output without modifying public data. The explicit apply step requires the catalogue patch's base-data hash to match, refuses an incomplete unit-page capture, preserves reviewed aliases and separate geometry, and applies only reviewed direct field changes. It preserves raw anomalous values and provenance. New localized strings and newly changed official facts still require review before publication. No background schedule is configured; freshness ages remain visible between deployments.

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

The 43 automated checks cover strict same-unit filter combinations, finish-price coupling, inclusive ranges, missing values, freshness, anomalies, source status, facet counts, saved-search round trips, map/list consistency, and multilingual interface behavior. The suite additionally checks multilingual interface and content coverage, placeholder consistency, language switching with saved notes, projective facade corner mapping, invalid geometry rejection, GLB resource validation, model scale normalization, total-cost calculations, straight-line distances and catalogue statistics. It checks budget and size matching, sold-out/unknown data handling, exchange conversion, filters, no invented geometry, safe links and CSV export, date semantics, catalogue provenance, apartment offer identity, and DOM interactions for search/save/compare/notes. Additional accuracy checks cover Mercator metre scale against MapLibre, cardinal headings, handedness, rotated click-volume alignment, polygon dimensions/courtyard area, source identity, no fake height, saved model anchoring, Bedeck source preservation and geodesic radius. CARTO returned real Yerevan building footprints and heights during collection. A real browser/WebGL rendering and mobile device check was not available in the build environment; DOM tests do not replace that visual check.
