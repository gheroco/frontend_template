# Evolution of Physics — reading room

A responsive Russian-language reading website with an animated spatial grid, dark/light themes, and a private PDF reader.

The book is not included, mirrored, transcribed, or fetched by the server. The website links to the supplied original PDF. Visitors select their own local copy; the reader displays its original pages using PDF.js. The original bytes are stored locally in IndexedDB, and a separate buffer is passed to the renderer. No document is uploaded. Search uses the existing PDF text layer, so image-only scans cannot be searched.

Features: PDF outline navigation, page jumps, zoom, bookmarks, saved progress, Cyrillic search, focus mode, password-protected PDF handling, and local copy removal. Files are limited to 200 MB. Storage availability depends on browser settings; a storage failure does not prevent the current document from being read. Browser data is local to that browser profile, not synchronized across devices.

Keyboard shortcuts when the document area has focus: left/right = pages; B = bookmark; F = focus; Ctrl/Cmd+F = search; Escape = leave focus or reader.

## Local development

Node.js 24 recommended.

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

Open http://localhost:3000. Serve the built `dist` folder over HTTP(S); do not open it through file://.

## Render

Source branch: `apps/evolution-physics-reader` in `gheroco/frontend_template`.
Project directory: `apps/evolution-physics-reader`.

Static Site build command (repository root):

```sh
npm --prefix apps/evolution-physics-reader ci --workspaces=false && npm --prefix apps/evolution-physics-reader run build --workspaces=false
```

Publish path: `apps/evolution-physics-reader/dist`.
Environment: `NODE_VERSION=24`, `SKIP_INSTALL_DEPS=true`.
No secrets, database, or application server are required.

## Validation

JavaScript syntax checks, production build, and six unit tests cover input rejection, navigation bounds, Cyrillic search, original-symbol preservation in search results, bookmark validation and fingerprint byte preservation. Browser verification covers PDF rendering, page navigation, search, bookmarks, saved progress, zoom, themes and a 390 px mobile layout using an original three-page test fixture.

## Attribution

Book metadata: https://search.rsl.ru/ru/record/01006372237
Original PDF: https://ikfia.ysn.ru/wp-content/uploads/2018/01/EinsteinInfeld1965ru.pdf
PDF.js is Apache-2.0. Manrope and IBM Plex Mono retain their bundled font licenses. The build includes those licenses alongside the served assets.
