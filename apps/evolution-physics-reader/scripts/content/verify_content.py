#!/usr/bin/env python3
"""Validate the complete native book and its retained source assets.

Standard-library checks work on either src/content or dist/content. Supplying
--audit also compares the published scans with the extraction inventory and
uses Pillow to verify every illustration against the original source pixels.

Examples:
  python scripts/content/verify_content.py
  python scripts/content/verify_content.py --content dist/content
  python scripts/content/verify_content.py --audit /path/to/book-audit

The report is JSON on stdout. Exit 0 means all structural/integrity checks pass;
it does not certify that every transcribed character has been proofread.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import struct
import sys
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath


PAGE_COUNT = 345
SECTION_COUNT = 46
BLANK_PAGES = {52, 102, 234, 343, 344}
PLATE_PAGES = {51, 101, 233}
DUPLICATES = {8: 6, 9: 7, 168: 166, 169: 167, 254: 252,
              255: 253, 278: 276, 279: 277, 312: 310, 313: 311}
FIGURE_KINDS = {"numbered-figure": 75, "plate": 10, "publisher-mark": 1}
SAFE_COMPONENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def native_text(page):
    """The exact ordered native strings that must also populate search.json."""
    return "\n\n".join(block.get("text", block.get("caption", ""))
                       for block in page.get("blocks", []))


def png_size(path):
    with path.open("rb") as stream:
        header = stream.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError("File is not a PNG with a valid IHDR header")
    return struct.unpack(">II", header[16:24])


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if not value:
                continue
            if name in {"src", "poster"}:
                self.references.append(value)
            elif name == "href" and value.startswith("content/"):
                self.references.append(value)
            elif name == "srcset":
                self.references.extend(item.strip().split()[0]
                                       for item in value.split(",") if item.strip())


class Validator:
    def __init__(self, content, audit=None):
        self.content = content.resolve()
        self.audit = audit.resolve() if audit else None
        self.errors = []
        self.counts = collections.Counter()
        self.passed = collections.Counter()
        self.assets = set()
        self.hashes = {}

    def check(self, condition, check, message, **context):
        if condition:
            self.passed[check] += 1
        else:
            self.errors.append({"check": check, "message": message, **context})
        return bool(condition)

    def load(self, path, expected_type=None):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if expected_type is not None and not isinstance(value, expected_type):
                raise ValueError(f"Expected {expected_type.__name__}, got {type(value).__name__}")
            self.passed["json-readable"] += 1
            return value
        except (OSError, ValueError) as error:
            self.check(False, "json-readable", str(error), path=str(path))
            return expected_type() if expected_type else None

    def hash(self, path):
        if path not in self.hashes:
            self.hashes[path] = sha256(path)
        return self.hashes[path]

    def asset(self, value, context):
        if not isinstance(value, str):
            self.check(False, "asset-path-safe", "Asset reference is not a string", location=context)
            return None
        parts = PurePosixPath(value).parts
        safe = (value.startswith("content/") and len(parts) >= 2
                and all(SAFE_COMPONENT.fullmatch(part) and part not in {".", ".."}
                        for part in parts)
                and "\\" not in value and "//" not in value)
        if not self.check(safe, "asset-path-safe", "Asset must use a safe relative content/ path",
                          location=context, asset=value):
            return None
        path = self.content.joinpath(*parts[1:])
        if not self.check(path.resolve().is_relative_to(self.content), "asset-path-safe",
                          "Asset resolves outside content directory", location=context, asset=value):
            return None
        self.assets.add(value)
        return path if self.check(path.is_file(), "asset-exists", "Referenced asset is missing",
                                  location=context, asset=value) else None

    def references(self, value, context):
        if isinstance(value, dict):
            for key, item in value.items():
                location = f"{context}.{key}"
                if key in {"src", "sourceImage", "poster"}:
                    self.asset(item, location)
                elif key in {"path", "href"} and isinstance(item, str) and item.startswith("content/"):
                    self.asset(item, location)
                elif key == "html" and isinstance(item, str):
                    parser = AssetParser()
                    parser.feed(item)
                    for ref in parser.references:
                        self.asset(ref, location)
                else:
                    self.references(item, location)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                self.references(item, f"{context}[{index}]")

    def unique_index(self, records, key, expected, label):
        values = [row.get(key) for row in records if isinstance(row, dict)]
        self.check(len(values) == len(records) and len(set(map(str, values))) == len(values),
                   f"{label}-unique", "Records have missing, duplicate or malformed identifiers")
        self.check(set(values) == set(expected), f"{label}-coverage",
                   "Identifiers do not match the expected complete set",
                   missing=sorted(set(expected) - set(values), key=str),
                   extra=sorted(set(values) - set(expected), key=str))
        return {row[key]: row for row in records if isinstance(row, dict) and key in row}

    def run(self):
        book = self.load(self.content / "book.json", dict)
        search = self.load(self.content / "search.json", list)
        verification = self.load(self.content / "verification.json", dict)
        records = book.get("pages", [])
        index = self.unique_index(records, "number", range(1, PAGE_COUNT + 1), "page-manifest")
        search_index = self.unique_index(search, "page", range(1, PAGE_COUNT + 1), "search")
        self.check(book.get("totalPages") == PAGE_COUNT, "page-count", "Book must contain all 345 PDF leaves")
        actual_files = {p.name for p in (self.content / "pages").glob("*.json")}
        expected_files = {f"{n:03}.json" for n in range(1, PAGE_COUNT + 1)}
        self.check(actual_files == expected_files, "page-files", "Page JSON files must be exactly 001–345",
                   missing=sorted(expected_files - actual_files), extra=sorted(actual_files - expected_files))
        pages = {}
        for n in range(1, PAGE_COUNT + 1):
            page = self.load(self.content / "pages" / f"{n:03}.json", dict)
            if not page:
                continue
            pages[n] = page
            self.check(page.get("number") == n, "page-id", "Page identifier disagrees with its filename", page=n)
            record = index.get(n, {})
            for field in ["number", "printedPage", "sectionId", "kind", "duplicateOf", "plate",
                          "sourceImage", "wordCount", "transcriptionStatus"]:
                self.check(record.get(field) == page.get(field), "page-manifest-consistent",
                           f"Page and book manifest disagree on {field}", page=n)
            self.check(record.get("path") == f"content/pages/{n:03}.json", "page-path",
                       "Manifest points to an unexpected page JSON path", page=n)
            blocks = page.get("blocks", [])
            self.check(isinstance(blocks, list), "page-blocks", "Blocks must be an ordered list", page=n)
            if not isinstance(blocks, list):
                continue
            block_ids = [b.get("id") for b in blocks]
            self.check(all(isinstance(x, str) and x for x in block_ids) and len(set(block_ids)) == len(block_ids),
                       "block-ids", "Block identifiers must be present and unique within each page", page=n)
            is_blank = n in BLANK_PAGES
            self.check((page.get("kind") == "blank") == is_blank, "blank-page-map",
                       "Blank status disagrees with the five blank source leaves", page=n)
            self.check(not blocks if is_blank else any(b.get("text", "").strip() or b.get("src") for b in blocks),
                       "page-body", "Nonblank page needs native content; blank source page must have no blocks", page=n)
            self.check(page.get("duplicateOf") == DUPLICATES.get(n), "duplicate-map",
                       "Duplicate source page mapping is incorrect", page=n)
            self.check((page.get("kind") == "plate") == (n in PLATE_PAGES), "plate-page-map",
                       "Photographic plate page mapping is incorrect", page=n)
            text = native_text(page)
            entry = search_index.get(n, {})
            self.check(entry.get("text") == text, "search-text",
                       "Search text differs from the ordered native blocks and figure captions", page=n)
            self.check(entry.get("sectionId") == page.get("sectionId"), "search-section",
                       "Search section disagrees with native page", page=n)
            words = len(re.findall(r"\S+", text))
            self.check(page.get("wordCount") == words, "word-count", "Page word count is stale", page=n)
            self.counts["words"] += words
            self.counts["blocks"] += len(blocks)
            scan_ref = page.get("sourceImage")
            self.check(scan_ref == f"content/scans/page-{n:03}.png", "scan-path",
                       "Source scan filename must retain its page identifier", page=n)
            scan = self.asset(scan_ref, f"page[{n}].sourceImage")
            expected_hash = page.get("sourceImageSha256", "")
            self.check(isinstance(expected_hash, str) and SHA256.fullmatch(expected_hash), "scan-hash-format",
                       "Source scan SHA256 is missing or malformed", page=n)
            if scan:
                self.check(self.hash(scan) == expected_hash, "scan-hash", "Source scan bytes differ from recorded SHA256", page=n)
                try:
                    expected_size = (1700, 2576) if n == 52 else (1700, 2565)
                    self.check(png_size(scan) == expected_size, "scan-dimensions",
                               "Source scan dimensions must retain the original extracted dimensions",
                               page=n, expected=list(expected_size))
                except (OSError, ValueError) as error:
                    self.check(False, "scan-dimensions", str(error), page=n)
            self.references(page, f"page[{n}]")

        sections = book.get("sections", [])
        section_ids = [s.get("id") for s in sections]
        self.check(len(sections) == SECTION_COUNT and len(set(section_ids)) == len(sections),
                   "section-count", "Expected 46 uniquely identified sections")
        coverage = collections.defaultdict(list)
        for section in sections:
            start, end = section.get("startPage"), section.get("endPage")
            if self.check(isinstance(start, int) and isinstance(end, int) and 1 <= start <= end <= PAGE_COUNT,
                          "section-range", "Section has an invalid source-page range", section=section.get("id")):
                for n in range(start, end + 1):
                    coverage[n].append(section.get("id"))
        for n in range(1, PAGE_COUNT + 1):
            self.check(len(coverage[n]) == 1, "section-coverage",
                       "Each PDF leaf must belong to exactly one section range", page=n, sections=coverage[n])
            if n in pages:
                self.check(coverage[n] == [pages[n].get("sectionId")], "page-section",
                           "Page section disagrees with section ranges", page=n)
        for n, canonical in DUPLICATES.items():
            if n in pages and canonical in pages:
                self.check(native_text(pages[n]) == native_text(pages[canonical]), "duplicate-text",
                           "Duplicate scan must use the same corrected native text as its canonical page",
                           page=n, canonical=canonical)

        figures = book.get("figures", [])
        ids = [f.get("id") for f in figures]
        self.check(len(figures) == 86 and len(set(ids)) == 86, "figure-count",
                   "Expected 86 uniquely identified original illustration assets", actual=len(figures))
        kinds = collections.Counter(f.get("kind") for f in figures)
        self.check(dict(kinds) == FIGURE_KINDS, "figure-kinds",
                   "Expected 75 numbered figures, 10 plate groups and 1 publisher mark", actual=dict(kinds))
        numbered = {f.get("id") for f in figures if f.get("kind") == "numbered-figure"}
        self.check(numbered == {f"figure-{n:03}" for n in range(1, 76)}, "numbered-figures",
                   "Numbered figure identifiers must cover 001–075 exactly once")
        figure_index = {f.get("id"): f for f in figures}
        appearances = collections.Counter()
        for n, page in pages.items():
            for block in page.get("blocks", []):
                if block.get("type") != "figure":
                    continue
                figure = figure_index.get(block.get("id"))
                if not self.check(figure is not None, "figure-reference", "Figure block is absent from the figure manifest",
                                  page=n, figure=block.get("id")):
                    continue
                appearances[block["id"]] += 1
                for field in ["src", "caption", "width", "height", "source"]:
                    self.check(block.get(field) == figure.get(field), "figure-block-consistent",
                               f"Figure block and manifest disagree on {field}", page=n, figure=block["id"])
                self.check(figure.get("page") in {n, DUPLICATES.get(n)}, "figure-page",
                           "Figure appears on an unrelated source page", page=n, figure=block["id"])
        for figure in figures:
            fid = figure.get("id")
            self.check(isinstance(fid, str) and SAFE_COMPONENT.fullmatch(fid), "figure-id-safe",
                       "Figure identifier is not filename-safe", figure=fid)
            self.check(appearances[fid] > 0, "figure-used", "Figure asset is not present in native page content", figure=fid)
            ref = figure.get("src")
            self.check(ref == f"content/figures/{fid}.png", "figure-path",
                       "Figure asset filename must match its identifier", figure=fid)
            asset = self.asset(ref, f"figure[{fid}].src")
            source = figure.get("source", {})
            bounds = source.get("bbox")
            bounds_ok = (isinstance(bounds, list) and len(bounds) == 4
                         and all(isinstance(x, int) for x in bounds)
                         and 0 <= bounds[0] < bounds[2] <= 1700 and 0 <= bounds[1] < bounds[3] <= 2565)
            self.check(bounds_ok, "figure-bbox", "Figure needs a valid original-image pixel rectangle", figure=fid)
            if asset:
                self.check(self.hash(asset) == source.get("sha256"), "figure-hash",
                           "Figure file bytes differ from its manifest hash", figure=fid)
                try:
                    dimensions = png_size(asset)
                    self.check(dimensions == (figure.get("width"), figure.get("height")), "figure-dimensions",
                               "Figure dimensions disagree with the actual PNG", figure=fid)
                    if bounds_ok:
                        self.check(dimensions == (bounds[2] - bounds[0], bounds[3] - bounds[1]), "figure-bbox-size",
                                   "Figure dimensions disagree with its source rectangle", figure=fid)
                except (OSError, ValueError) as error:
                    self.check(False, "figure-dimensions", str(error), figure=fid)
        self.references(book, "book")

        evidence = self.unique_index(verification.get("pages", []), "page", range(1, PAGE_COUNT + 1), "verification")
        self.check(verification.get("source", {}).get("sha256") == book.get("source", {}).get("sha256"),
                   "verification-source", "Verification and book source hashes disagree")
        for n, page in pages.items():
            row = evidence.get(n, {})
            self.check(row.get("sourceSha256") == page.get("sourceImageSha256"), "verification-scan",
                       "Verification scan hash differs from native page", page=n)
            self.check(row.get("blocks") == len(page.get("blocks", [])) and row.get("words") == page.get("wordCount"),
                       "verification-counts", "Verification block/word counts are stale", page=n)
            for patch in row.get("corrections", []):
                self.check(patch.get("application") != "unresolved", "resolved-corrections",
                           "Source-reviewed correction remains unresolved", page=n, before=patch.get("before"))

        self.counts.update({"pages": len(pages), "sections": len(sections), "figures": len(figures),
                            "numberedFigures": kinds["numbered-figure"], "plateGroups": kinds["plate"],
                            "publisherMarks": kinds["publisher-mark"], "blankScans": sum(p.get("kind") == "blank" for p in pages.values()),
                            "duplicateScans": sum(p.get("duplicateOf") is not None for p in pages.values()),
                            "plates": sum(p.get("kind") == "plate" for p in pages.values()),
                            "distinctPrintedPages": len({p.get("printedPage") for p in pages.values() if p.get("printedPage") is not None}),
                            "referencedAssets": len(self.assets)})
        for key in ["pages", "sections", "figures", "words", "numberedFigures", "blankScans", "duplicateScans", "plates", "distinctPrintedPages"]:
            self.check(book.get("stats", {}).get(key) == self.counts[key], "book-statistics",
                       f"Book statistic {key} disagrees with its native content", expected=self.counts[key], actual=book.get("stats", {}).get(key))
        if self.audit:
            self.source_checks(book, pages, figures)

    def source_checks(self, book, pages, figures):
        inventory = self.load(self.audit / "inventory.json", dict)
        page_map = self.load(self.audit / "page-map.json", dict)
        audit_art = self.load(self.audit / "figures.json", list)
        source_pages = self.unique_index(inventory.get("pages", []), "pdf_page", range(1, PAGE_COUNT + 1), "audit-inventory")
        source_map = self.unique_index(page_map.get("pages", []), "pdf_page", range(1, PAGE_COUNT + 1), "audit-page-map")
        source_art = {f.get("id"): f for f in audit_art}
        self.check(book.get("source", {}).get("sha256") == inventory.get("source_sha256"),
                   "source-pdf-hash", "Book source identity disagrees with the extraction inventory")
        for n, page in pages.items():
            entry = source_pages.get(n, {})
            expected = entry.get("image_sha256")
            self.check(page.get("sourceImageSha256") == expected, "audit-scan-hash",
                       "Published scan hash differs from the original extraction inventory", page=n)
            published_scan = self.content / "scans" / f"page-{n:03}.png"
            if published_scan.is_file():
                self.check(png_size(published_scan) == (entry.get("image_width"), entry.get("image_height")),
                           "audit-scan-dimensions", "Published scan dimensions differ from the original inventory", page=n)
            image_file = entry.get("image_file")
            original = self.audit / image_file if isinstance(image_file, str) else None
            if self.check(original is not None and original.is_file(), "audit-source-exists",
                          "Original extracted page image is missing", page=n):
                self.check(self.hash(original) == expected, "audit-original-hash",
                           "Original extracted page image differs from its recorded hash", page=n)
            for native_key, audit_key in [("kind", "kind"), ("printedPage", "printed_page"), ("duplicateOf", "duplicate_of")]:
                self.check(page.get(native_key) == source_map.get(n, {}).get(audit_key), "audit-page-map",
                           f"Native {native_key} differs from the source page map", page=n)
        self.check(set(source_art) == {f.get("id") for f in figures}, "audit-figure-coverage",
                   "Published illustration IDs differ from the visually reviewed source crop inventory")
        try:
            from PIL import Image, ImageChops
        except ImportError:
            self.check(False, "source-pixel-dependency", "--audit requires Pillow for exact source-pixel comparisons")
            return
        for figure in figures:
            fid = figure.get("id")
            original_record = source_art.get(fid, {})
            for key in ["page", "printedPage", "kind", "caption", "width", "height"]:
                self.check(figure.get(key) == original_record.get(key), "audit-figure-metadata",
                           f"Published figure {key} differs from its reviewed source manifest", figure=fid)
            bounds = figure.get("source", {}).get("bbox")
            self.check(bounds == original_record.get("bbox"), "audit-figure-bbox",
                       "Published figure bbox differs from the visually reviewed source rectangle", figure=fid)
            source_entry = source_pages.get(figure.get("page"), {})
            original_path = self.audit / source_entry.get("image_file", "__missing__")
            asset = self.asset(figure.get("src"), f"source-pixels[{fid}]")
            if not asset or not original_path.is_file() or not isinstance(bounds, list) or len(bounds) != 4:
                continue
            try:
                with Image.open(original_path) as original, Image.open(asset) as published:
                    expected = original.crop(tuple(bounds)).convert("RGBA")
                    actual = published.convert("RGBA")
                    equal = expected.size == actual.size and ImageChops.difference(expected, actual).getbbox(alpha_only=False) is None
                    if self.check(equal, "figure-source-pixels", "Illustration pixels differ from the original source crop", figure=fid):
                        self.counts["sourcePixelCropsVerified"] += 1
            except (OSError, ValueError, TypeError) as error:
                self.check(False, "figure-source-pixels", str(error), figure=fid)

    def report(self):
        return {"schemaVersion": 1, "ok": not self.errors,
                "mode": "source-and-content" if self.audit else "content-only",
                "contentDirectory": str(self.content), "auditDirectory": str(self.audit) if self.audit else None,
                "counts": dict(self.counts), "passedChecks": dict(self.passed),
                "errorCount": len(self.errors), "errors": self.errors,
                "scope": "Structural coverage, referenced assets, recorded hashes, search parity and duplicate text. With --audit, original scan identity and illustration pixels are also compared. These checks do not certify OCR transcription accuracy."}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--content", type=Path, default=Path(__file__).resolve().parents[2] / "src/content",
                        help="Native content directory (default: app src/content; may also be dist/content)")
    parser.add_argument("--audit", type=Path, help="Original book-audit directory for source inventory and pixel comparisons")
    parser.add_argument("--report", type=Path, help="Also save the JSON report to this file")
    args = parser.parse_args()
    validator = Validator(args.content, args.audit)
    try:
        validator.run()
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        validator.check(False, "validation-input", f"Malformed content prevented further validation: {error}")
    report = validator.report()
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(serialized, encoding="utf-8")
    sys.stdout.write(serialized)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
