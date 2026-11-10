# Source processing and review record

## Authoritative material

The supplied scan of Einstein and Infeld, **Эволюция физики**, third corrected Russian edition, Moscow, «Наука», 1965, is the authority. Its SHA256 is:

`51141147ada93e987752990cc8f8594928f0d34983a912fb78a99577c974f391`

The file has **345 scanned leaves**: 327 distinct printed pages, ten repeated scans, three photographic plate leaves, and five blank leaves. These are all represented. The name index is printed page327, source leaf345. The afterword begins on source leaf253; it is not present in the comparison website.

All page images were extracted directly from the PDF. They were not rendered, redrawn, enhanced, or regenerated. The 86 separate artwork assets comprise **75 numbered figures, ten photographic plate groups, and the publisher's mark**. Each crop is checked against the corresponding original source pixels. Crops include their printed captions; separately transcribed captions make the gallery searchable.

## How the native text was prepared

1. Inventory every source leaf, its original image, printed pagination, duplicate status, blank status, and artwork.
2. Recognize every leaf with Tesseract and the best Russian language model; the English title leaf uses English recognition.
3. Retain the original TXT, TSV, and HOCR outputs in `ocr-inputs.zip`. These are reproducible transcription inputs, not published reader pages.
4. Produce a second OCR pass for 68 leaves with artwork/table areas blanked in temporary recognition inputs. The original published images remain untouched. `source/ocr-clean-manifest.json` records these exact masks.
5. Compare the main book against the linked secondary transcription. Inspect disputed wording directly in the original scan, preserving genuine differences between editions. The secondary text is never substituted wholesale.
6. Manually transcribe front matter, the name index, tables, chapter summaries and conclusions, difficult formulas, and other damaged/complex regions. Directly compare the complete afterword against its source scans, including punctuation, italics, formulas, and footnotes.
7. Reflow typesetting line breaks while retaining lexical hyphens. Explicit source corrections are resolved by page, word location, and/or unique context; ambiguous corrections fail the build.
8. Restore reviewed emphasis and mathematical typography. Original source scans remain available next to the native text.
9. Reuse the corrected canonical text for the ten repeated scans, retain each duplicate's original scan image, and record its canonical `textSourcePage`.
10. Validate every page, section range, artwork crop, source hash, search entry, and duplicate correspondence before publishing.

## Review levels and limits

The published `book.json` is the authority for current counts and statuses. It distinguishes manually transcribed pages, pages compared in a complete visual pass, and OCR pages with structural review and selected source-checked corrections.

Every leaf received layout/pagination review. The complete afterword received a visual text comparison pass. The main text received independent transcription comparison, source checks for disputed passages, and manual transcription of complex regions and chapter conclusions. These are substantial checks, but **not a guarantee that every character in every page is error-free**. No independent second proofreading pass of the entire book is claimed. A damaged word on source leaf268 is explicitly documented as a contextual reconstruction.

The original images preserve the authoritative source even where transcription remains imperfect. The website discloses this difference rather than equating page coverage with character-perfect proofreading.

## Retained evidence

- `source/inventory.json`: original source image dimensions and hashes, page inventory and recognition statistics.
- `source/page-map.json`: source-to-printed pagination, duplicates, plates, blanks, figure references.
- `source/figures.json`: reviewed crop rectangles, captions and original-pixel provenance.
- `source/*corrections.json`: source-checked correction patches, full-page overrides, emphasis, formulas and review scopes.
- `source/root-overrides.json`: complete source transcriptions of the preface and first chapter opening.
- `source/hyphen-lexicon.json`: frozen compound-word spellings used solely for typesetting reflow.
- `comparison/primary-toc.json`: contents transcribed from the authoritative edition.
- `comparison/primary-overrides.json`: exact native tables, title/index pages, summaries, conclusions, footnotes and selected source regions.
- `comparison/reviewed-corrections.json`: source-checked main-book corrections and preserved edition differences.
- `comparison/final-native-audit.json`: additional structure and transcription checks.
- `ocr-inputs.zip`: exact original and masked OCR inputs for the native builder.

The secondary comparison website is <https://alexandr4784.narod.ru/historyei.htm>. Its chapter titles, words, and figure numbering sometimes differ from the scan. Those differences are retained in the evidence; they are not silently imposed on this edition.

## Rebuild and verify

From the application directory, with Python3.11+, `lxml`, and Pillow installed:

```sh
python scripts/content/rebuild_native.py
python scripts/content/verify_content.py
npm run check
npm test
npm run build
python scripts/content/verify_content.py --content dist/content
```

The rebuild uses the committed original scans plus the frozen recognition and manual-review inputs. To inspect a rebuild without changing `src/content`, pass `--output /path/to/rebuilt-content`.

`scripts/content/extract_source.py --help` describes extraction and OCR from a local copy of the source PDF. It verifies the source hash when resuming cached work and records language-model and engine provenance. Re-running recognition with a different engine/model can change results and requires a renewed review of the source corrections.

The production JavaScript build simply publishes committed content; it does not run OCR or fetch third-party text.
