# Evolution of Physics — native web edition

Russian-language reading website for Albert Einstein and Leopold Infeld's **Эволюция физики**, Moscow, «Наука», 1965, including the attached edition's front matter, S. G. Suvorov's afterword, and name index.

The book is shipped as native HTML-ready page data and original image assets. Visitors can read immediately. No document upload, PDF.js renderer, account, database, or application server is required.

## Source fidelity and current status

The attached PDF scan is the authoritative source. It contains **345 source-file leaves**, including blank leaves and duplicate scans; this is different from the book's printed pagination. Every leaf has an explicit record and original scan. Navigation retains both the source-file index and the printed page label where available.

The scanned book has no embedded text layer. Native text is transcribed using Russian OCR, source-checked corrections, and manually reconstructed regions such as tables and the name index. The linked web transcription is a comparison source, not a replacement for the attached edition. The processing data records source hashes, OCR information, corrections, and review status.

**The native text is not claimed to be character-perfect.** Processing every page and preserving every original image does not establish complete character-by-character proofreading. OCR mistakes can remain. Reading sections, page status labels, and the provenance dialog disclose this explicitly. The original scan can be opened beside the native text for comparison.

`src/content/book.json` is the authoritative manifest for the current page, section, illustration, word, and reviewed-page counts. The source contains 75 numbered figures, photographic plates, and publisher artwork; the published asset count can differ from 75 because those additional image groups are represented separately. Do not infer final asset counts from this README.

Review counts distinguish whole-page visual comparison (`stats.visuallyComparedPages`) from pages with manually prepared native transcription/overrides (`stats.reviewedPages`). The latter are included in the former. Counts include source-file duplicates whose text inherits the canonical leaf's corrections. A whole-page comparison records a visual pass, not a certification that every character is error-free. The site shows both counts and preserves that distinction in page status labels.

## Reader features

- Flowing, selectable native text grouped into 46 reading sections, with source-page markers.
- Chapter and section contents, direct source-leaf jumps, previous/next-page navigation, and neighboring-section navigation.
- Afterword topic links in the sidebar and section header, targeting the actual native heading blocks.
- Full-book Cyrillic search. Search normalization changes matching only; displayed snippets retain the source characters.
- Native tables, title-page alignment, original running headers, notes, and page-number blocks.
- Printed-page navigation links in the original contents and name index.
- Original figure atlas with chapter and text filters.
- Figure zoom/pan, mouse wheel and pinch gestures, keyboard controls, and a link back to the corresponding text.
- Optional source-scan comparison beside the native transcription.
- Local bookmarks, saved reading position, font size, dark/light theme, and focus mode.
- Responsive desktop and phone layouts, semantic controls, native modal dialogs, reduced-motion support, and print styling.

Preferences and bookmarks are stored in the current browser's `localStorage`. They are not synchronized across devices. Storage failure does not prevent reading.

### Keyboard controls

- `Ctrl/Cmd + K`: open full-book search.
- `Escape`: close the active modal. Within the reader, leave focus mode and close the mobile contents drawer.
- Left/right arrows when the text area has focus: previous/next source leaf.
- In the image viewer: `+` / `-` to zoom, `0` to fit, arrow keys to pan.

## Content layout

```text
src/content/book.json          Book, sections, page index, artwork index, provenance
src/content/pages/001.json     Ordered native blocks and source metadata for one leaf
src/content/search.json        Full-book search text keyed by source leaf
src/content/verification.json  Processing and correction evidence
src/content/scans/             Original extracted page images
```

Original figure assets are referenced through each block's `src` and the manifest's `figures` array. All runtime content is local to the site. JSON/image paths are restricted to the expected same-origin asset directories; imported inline HTML is sanitized to supported text and table elements.

Each page's `sectionId` and each section's `startPage` / `endPage` define its reading range. A printed page can contain the ending of one section and the beginning of the next; the complete source leaf is retained, so a section's first leaf can include preceding context. Source page jumps remain unambiguous even when printed numbers repeat.

Optional `book.subsections` entries use `{id, title, page, blockId, sectionId}`. The reader links these to `#read/<leaf>/<blockId>`, preserving direct access to headings within a long reading section. Missing block targets fall back to the corresponding source leaf.

## Development

Node.js 24 is recommended. From this app directory:

```sh
npm ci --workspaces=false
npm run check
npm test
npm run build
npm run dev
```

Open `http://localhost:3000`. The preview server supports `--port` or `PORT`. Serve the generated `dist/` directory over HTTP(S); loading through `file://` will not work with module imports and content fetches.

The production build copies committed source/content and bundled font assets. It performs no OCR, network scraping, image generation, or PDF processing. `dist/version.json` identifies the native reader version, source page count, and source PDF hash.

### Rebuilding native content

The offline ingestion utility is `scripts/content/build_native.py`. It requires Python 3.11+, `lxml`, Pillow, and the corresponding audit/OCR and web-comparison input directories:

```sh
python scripts/content/build_native.py \
  --audit /path/to/book-audit \
  --web /path/to/web-source \
  --output src/content
```

Keep original OCR, source images, page mapping, reviewed overrides, and correction evidence together. Review OCR changes against the attached scan; do not silently replace them with another edition's web text. Rebuild the search corpus together with page data, validate all manifest/asset references, and run the application build after any content change. `--allow-incomplete` is an inspection aid, not a release validation step.

## Render deployment

Existing source repository: `gheroco/frontend_template`.
Existing branch: `apps/evolution-physics-reader`.
App directory: `apps/evolution-physics-reader`.
Public service: <https://evolution-physics-reader.onrender.com/>.

Static Site build command from the repository root:

```sh
npm --prefix apps/evolution-physics-reader ci --workspaces=false && npm --prefix apps/evolution-physics-reader run build --workspaces=false
```

Publish path: `apps/evolution-physics-reader/dist`.
Environment: `NODE_VERSION=24`, `SKIP_INSTALL_DEPS=true`.

The existing Render service automatically deploys the configured source branch. Confirm that the deployed commit is live, then verify the public site, source data, representative text, original artwork, and mobile layout. A successful local build alone does not prove deployment success.

## Validation

`npm run check` checks JavaScript syntax. `npm test` covers navigation bounds, Cyrillic matching, exact-character search snippets, saved bookmark validation, same-origin content paths, and section lookup.

Content validation should confirm complete source-leaf coverage, unique block IDs, nonoverlapping page ranges, existing source scans and crop assets, matching hashes, and search/page consistency. Rendering validation must include title/front matter, prose, tables, figures, notes, the lengthy afterword, the name index, source comparison, and both desktop and phone layouts.

No local screenshot or live-deployment verification is implied by the automated checks. Record those checks separately after observing the actual interface. The source fidelity status is independent of UI test success.

## Sources and licenses

- Authoritative scan: <https://ikfia.ysn.ru/wp-content/uploads/2018/01/EinsteinInfeld1965ru.pdf>
- User-supplied comparison transcription: <https://alexandr4784.narod.ru/historyei.htm>
- Bibliographic record: <https://search.rsl.ru/ru/record/01006372237>

Manrope and IBM Plex Mono retain their bundled licenses, copied into the published `fonts/` directory. Restricted, self-hosted Noto Serif and Noto Sans Math subsets supply Greek notation, superscripts, subscripts, ℏ, and extended mathematical operators such as ⩳ and ⩾. Their CSS Unicode ranges leave ordinary Latin and Cyrillic text in the existing reader fonts. The subsets use independent family names and include the SIL Open Font License in `src/fonts/NOTO-OFL-LICENSE.txt`; the production build publishes this license with the fonts. Original book material is attributed to the source edition; the interface does not present it as newly authored material.
