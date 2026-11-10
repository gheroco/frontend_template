# Evolution of Physics — Observatory 2100

The redesign adds a scientific entrance, a contextual reading workspace, an idea
atlas and six deterministic models to the existing Russian 1965 edition.

## Content and fidelity

All files in `src/content/` are unchanged from commit
`3f17c3ae4e69ced0a1675ce45ff5d613b4b902c7`. The canonical book, source scans,
figure crops, block identifiers and search text remain separate from the new
teaching layer in `src/companion/`.

`src/companion/coverage-report.html` is the readable, linked ledger for all 345
source leaves, 46 sections and 86 original artworks. Its JSON counterpart exposes
verification status, exact destinations, image hashes and the unresolved source
damage. Generate both with:

```sh
python scripts/content/build_companion.py
python scripts/content/audit_observatory.py
```

The audit checks existing extraction hashes and exact figure crop pixels. It
does not re-extract the PDF or claim a new complete proofreading pass. The
previous project records a full visual comparison of 104 leaves, including 27
manual transcriptions and duplicate leaves. The other 241 leaves have no recorded
full text comparison; that count also includes blanks and photographic plates.
Residual OCR mistakes can remain. Leaf 268, `p268-b004`, has an explicitly marked
contextual reconstruction of damaged letters. The original scan is available
beside the text.

## Routes and local persistence

- `#read/88` opens a source leaf; `#read/88/p088-b001` opens a passage.
- `#section/section-17` opens a real section.
- `#learn/section-17` opens its separate explanation alongside the book.
- `#experiment/waves` opens a linked model alongside its source passage.
- `#figure/figure-001` opens the unmodified original crop.
- `#atlas`, `#lab`, `#gallery` are conventional navigable views.
- `#resume` restores a saved paragraph and its visual offset.

Preferences and page bookmarks use local storage, without an account. Existing
progress and bookmarks retain their storage keys. A separate versioned anchor
record adds paragraph-level resume. Changing type size or panel layout restores
the same paragraph offset. Source pages remain visible while teaching material
is open, including a stacked reading area on small screens.

## Models and accessibility

`models.mjs` contains the numerical definitions tested independently of canvas.
The six models cover a travelling transverse wave, Galilean frames, two point
charges, a transverse light clock, a local elevator comparison and a single-photon
photoelectric threshold. Each has labeled controls, output text, source links,
model limitations and reset; animated models also have pause. The field view is
static. Reduced motion disables animation without disabling calculations.

Native dialogs retain keyboard focus. The mobile chapter drawer supports Escape
and focus cycling. Figure inspection supports keyboard zoom, pan and reset, with
a full-window display. Both original content and teaching notes are searchable
and labeled by origin. Notes offer summary, reasoning, misconceptions and a
reflection question; the afterword is identified as Suvorov's text.

## Verification and delivery

```sh
npm ci --workspaces=false
npm run check
npm test
python scripts/content/audit_observatory.py
npm run build
python scripts/test_observatory.py
```

Browser checks use Chromium at 390×844, 834×1112, 1366×900 and 1920×1080, plus
WebKit with a touch/mobile viewport. They save real screenshots and structured
results under `artifacts/`. WebKit automation checks the engine; it is not a
physical-device Safari certification. The workflow uploads the visual review
artifacts for inspection. Runtime errors, image failures, horizontal overflow,
source access, models, search, bookmarks, stable links and resume are checked.

The Render service remains `evolution-physics-reader`; its build and publish
paths and deployment branch are preserved. Deploy only the reviewed commit to
`apps/evolution-physics-reader`, then inspect deployment status and live routes.

The build fingerprints the complete module graph, styles, favicon and companion
data with one deterministic release identity. Dependency-only changes also
invalidate the entry URL, so cached modules from an older visit cannot break
startup. Browser acceptance checks deliberately serve incompatible legacy
modules at the old unversioned URLs and verify that the current release never
requests them, including the lazy experiment module.
