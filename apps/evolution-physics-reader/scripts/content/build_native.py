#!/usr/bin/env python3
"""Build native reading data from page-level OCR and reviewed source regions.

The uploaded scan is the authority. Secondary web text is used only to recognize
discretionary hyphenation and to supply an independent comparison corpus. It is
never substituted wholesale. Original page images and crop pixels are retained.
Requires Python 3.11+, lxml and Pillow. See content-audit/README.md.
"""
from __future__ import annotations

import argparse
import collections
import copy
import hashlib
import html
import json
import re
import shutil
from pathlib import Path
from statistics import mean

from lxml import etree
from PIL import Image


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def box(node):
    m = re.search(r"bbox (\d+) (\d+) (\d+) (\d+)", node.get("title", ""))
    return list(map(int, m.groups())) if m else [0, 0, 0, 0]


def union(boxes):
    return [min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes)] if boxes else [0, 0, 0, 0]


def inside(word_box, region):
    x = (word_box[0] + word_box[2]) / 2
    y = (word_box[1] + word_box[3]) / 2
    return region[0] <= x <= region[2] and region[1] <= y <= region[3]


def text_normalize(text, hyphens):
    # Reflow only typesetting. Preserve genuine compound-word hyphens.
    def rejoin(m):
        a, b = m.group(1), m.group(2)
        compound = (a + "-" + b).lower()
        keep = compound in hyphens or a.lower() == "кое" or b.lower() in {"то", "либо", "нибудь", "ка", "таки", "де"}
        return a + ("-" if keep else "") + b
    text = re.sub(r"([\wЁё]+)-\s*\n\s*([\wЁё]+)", rejoin, text)
    return re.sub(r"\s+", " ", text).strip()


def mapped_text(lines, hyphens):
    """Reflow text while retaining the original word for every output character."""
    chars, owners, words = [], [], []
    for line in lines:
        if chars:
            chars.append("\n")
            owners.append(None)
        for token in line["words"]:
            if chars and chars[-1] != "\n":
                chars.append(" ")
                owners.append(None)
            index = len(words)
            words.append(token)
            chars.extend(token["text"])
            owners.extend([index] * len(token["text"]))
    raw = "".join(chars)
    # Remove only a typesetting line-break hyphen. Keep genuine compounds.
    for match in reversed(list(re.finditer(r"([\wЁё]+)-\s*\n\s*([\wЁё]+)", raw))):
        a, b = match.group(1), match.group(2)
        compound = (a + "-" + b).lower()
        keep = compound in hyphens or a.lower() == "кое" or b.lower() in {"то", "либо", "нибудь", "ка", "таки", "де"}
        first = match.end(1) + (1 if keep else 0)
        last = match.start(2)
        del chars[first:last]
        del owners[first:last]
    joined = "".join(chars)
    for match in reversed(list(re.finditer(r"\s+", joined))):
        chars[match.start():match.end()] = [" "]
        owners[match.start():match.end()] = [None]
    while chars and chars[0] == " ":
        chars.pop(0)
        owners.pop(0)
    while chars and chars[-1] == " ":
        chars.pop()
        owners.pop()
    return "".join(chars), owners, words, raw


def intersection(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))


def patch_score(block, start, end, patch):
    targets = [w["bbox"] for w in patch.get("tsvWords", [])] or ([patch["bbox"]] if patch.get("bbox") else [])
    if not targets:
        return 1.0
    indexes = {i for i in block["_textWordMap"][start:end] if i is not None}
    boxes = [block["_words"][i]["bbox"] for i in indexes]
    def area(b):
        return max(1, (b[2] - b[0]) * (b[3] - b[1]))
    return sum(max((intersection(a, b) / min(area(a), area(b)) for a in boxes), default=0) for b in targets) / len(targets)


def apply_reviewed_patch(blocks, patch, page, exclude, hyphens):
    """Resolve a source-checked correction by location, never by global replace."""
    for field in ["before", "after"]:
        candidates = []
        value = patch.get(field, "")
        if not value:
            continue
        normalized = text_normalize(value, hyphens)
        variants = [(value, patch["after"]), (normalized, text_normalize(patch["after"], hyphens))]
        # Some reviewed snippets stop at a typesetting hyphen rather than the
        # end of the word. Their native form has already removed that hyphen.
        if normalized.endswith("-"):
            variants.append((normalized[:-1], text_normalize(patch["after"], hyphens).removesuffix("-")))
        seen = set()
        for candidate_text, replacement in variants:
            if not candidate_text:
                continue
            for block in blocks:
                for match in re.finditer(re.escape(candidate_text), block.get("text", "")):
                    key = (id(block), match.start(), match.end())
                    if key in seen:
                        continue
                    seen.add(key)
                    if patch.get("wholeBlock") and (match.start() != 0 or match.end() != len(block["text"])):
                        continue
                    score = patch_score(block, match.start(), match.end(), patch)
                    if score > .2:
                        candidates.append((score, block, match.start(), match.end(), replacement))
        # Exact and dehyphenated variants can start at the same character.
        # Prefer the longest exact span there, rather than call it ambiguous.
        by_start = {}
        for candidate in candidates:
            key = (id(candidate[1]), candidate[2])
            old = by_start.get(key)
            if old is None or (candidate[0], candidate[3]) > (old[0], old[3]):
                by_start[key] = candidate
        candidates = list(by_start.values())
        candidates.sort(key=lambda item: -item[0])
        if not candidates:
            continue
        if len(candidates) > 1 and candidates[0][0] - candidates[1][0] < .01:
            continue
        _, block, start, end, replacement = candidates[0]
        if field == "after":
            return patch | {"application": "already-correct-in-clean-ocr"}
        owners = [x for x in block["_textWordMap"][start:end] if x is not None]
        block["text"] = block["text"][:start] + replacement + block["text"][end:]
        block["_textWordMap"][start:end] = [owners[0] if owners else None] * len(replacement)
        return patch | {"application": "source-location-verified"}
    # The same words may have been replaced by a verified native table or exact art.
    targets = [w["bbox"] for w in patch.get("tsvWords", [])] or ([patch["bbox"]] if patch.get("bbox") else [])
    if targets and all(any(inside(b, region) for region in exclude) for b in targets):
        return patch | {"application": "covered-by-original-image-or-reviewed-region"}
    raise ValueError(f"Ambiguous/stale correction on PDF {page}: {patch['before']!r} -> {patch['after']!r}")


def parse_hocr(path, exclude, page, hyphens, corrections):
    root = etree.parse(str(path), etree.HTMLParser())
    blocks = []
    rejected = []
    all_words = []
    running_headers = []
    opening_pages = {1, 2, 3, 5, 7, 9, 62, 108, 212, 253, 255, 345}
    for par in root.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," ocr_par ")]'):
        lines = []
        pwords = []
        for line in par.xpath('.//*[contains(concat(" ",normalize-space(@class)," ")," ocr_line ")]'):
            words = []
            for node in line.xpath('.//*[contains(concat(" ",normalize-space(@class)," ")," ocrx_word ")]'):
                original = "".join(node.itertext()).strip()
                if not original:
                    continue
                bounds = box(node)
                conf_m = re.search(r"x_wconf (\d+)", node.get("title", ""))
                conf = int(conf_m.group(1)) if conf_m else 0
                if any(inside(bounds, region) for region in exclude):
                    rejected.append({"text": original, "bbox": bounds, "reason": "replaced-by-original-art-or-reviewed-region"})
                    continue
                token = {"text": original, "bbox": bounds, "confidence": conf, "id": node.get("id")}
                all_words.append(token)
                words.append(token)
            if words:
                lines.append({"text": " ".join(w["text"] for w in words), "bbox": union([w["bbox"] for w in words]), "words": words})
                pwords.extend(words)
        if not lines:
            continue
        bounds = union([l["bbox"] for l in lines])
        text, owners, pwords, raw = mapped_text(lines, hyphens)
        if not text:
            continue
        if bounds[3] < 290 and page not in opening_pages:
            running_headers.append({"text": text, "bbox": bounds, "_words": pwords, "_textWordMap": owners})
            continue
        letters = [c for c in text if c.isalpha()]
        upper = sum(c.isupper() for c in letters) / max(1, len(letters))
        kind = "paragraph"
        if len(text) < 190 and len(letters) > 3 and upper > .88:
            kind = "heading"
        elif bounds[1] > 1700 and re.match(r"^(?:\*+\)|[¹²³])", text):
            kind = "note"
        if not letters and re.fullmatch(r"[\d\s.*]+", text) and bounds[1] > 2200:
            kind = "page-number"
        blocks.append({"type": kind, "text": text, "sourceText": raw,
                       "source": {"bbox": bounds},
                       "ocr": {"meanConfidence": round(mean(w["confidence"] for w in pwords), 2),
                               "lowConfidenceWords": sum(w["confidence"] < 60 for w in pwords)},
                       "proofread": False,
                       "_words": pwords, "_lines": lines, "_textWordMap": owners})
    # The reading order supplied by Tesseract is retained; OCR can split a
    # paragraph where a figure wraps. Join a continuation only at a real
    # end-of-line hyphen and a lowercase following word, with no intervening art.
    merged = []
    for block in blocks:
        if (merged and merged[-1]["type"] == block["type"] == "paragraph"
                and merged[-1]["text"].endswith("-") and block["text"][:1].islower()
                and block["source"]["bbox"][1] - merged[-1]["source"]["bbox"][3] < 150):
            previous = merged[-1]
            previous["_lines"] += block["_lines"]
            previous["text"], previous["_textWordMap"], previous["_words"], previous["sourceText"] = mapped_text(previous["_lines"], hyphens)
            previous["source"]["bbox"] = union([previous["source"]["bbox"], block["source"]["bbox"]])
        else:
            merged.append(block)
    # Patches are explicit, source-reviewed edits; unknown/ambiguous substitutions
    # fail rather than changing some other occurrence.
    applied = []
    for patch in corrections:
        try:
            applied.append(apply_reviewed_patch(merged + running_headers, patch, page, exclude, hyphens))
        except ValueError as error:
            applied.append(patch | {"application": "unresolved", "error": str(error)})
    for header in running_headers:
        header.pop("_words", None)
        header.pop("_textWordMap", None)
    return merged, running_headers, rejected, all_words, applied


def restore_formatting(blocks, emphasis, formulas, page):
    """Restore only source-reviewed italics and mathematical typography."""
    text_blocks = [b for b in blocks if b.get("text")]
    starts, joined = [], ""
    for block in text_blocks:
        if joined:
            joined += " "
        starts.append(len(joined))
        joined += block["text"]
    italic_ranges, formula_ranges, issues = [], [], []
    for spec in emphasis + formulas:
        phrase = spec["text"] if isinstance(spec, dict) else spec
        detail = spec if isinstance(spec, dict) else {"text": phrase}
        if not phrase:
            continue
        pattern = re.escape(phrase)
        if phrase[0].isalnum():
            pattern = r"(?<!\w)" + pattern
        if phrase[-1].isalnum():
            pattern += r"(?!\w)"
        matches = list(re.finditer(pattern, joined))
        if not matches:
            issues.append({"page": page, "text": phrase, "reason": "formatting-source-phrase-not-found"})
            continue
        if detail.get("allOccurrences"):
            selected = matches
        elif len(matches) == 1:
            selected = matches
        elif "occurrence" in detail:
            occurrence = int(detail["occurrence"])
            selected = matches[occurrence:occurrence + 1]
        else:
            before, after = detail.get("contextBefore", ""), detail.get("contextAfter", "")
            selected = [m for m in matches if (not before or joined[:m.start()].endswith(before)) and (not after or joined[m.end():].startswith(after))]
            if len(selected) != 1:
                issues.append({"page": page, "text": phrase, "reason": "ambiguous-formatting-phrase", "matches": len(matches)})
                continue
        for match in selected:
            if "html" in detail:
                formula_ranges.append((match.start(), match.end(), detail["html"]))
            else:
                italic_ranges.append((match.start(), match.end()))
    # Prefer the most complete formula if its symbols also have individual specs.
    accepted_formulas = []
    for item in sorted(formula_ranges, key=lambda f: -(f[1] - f[0])):
        if not any(item[0] < old[1] and item[1] > old[0] for old in accepted_formulas):
            accepted_formulas.append(item)
    for block, start in zip(text_blocks, starts):
        if block.get("html"):
            continue  # Full manual HTML transcriptions already preserve formatting.
        length = len(block["text"])
        italics = [False] * length
        for first, last in italic_ranges:
            for index in range(max(0, first - start), min(length, last - start)):
                italics[index] = True
        replacements = {first - start: (last - start, value) for first, last, value in accepted_formulas if first >= start and last <= start + length}
        if not any(italics) and not replacements:
            continue
        parts, index, active = [], 0, False
        while index < length:
            if italics[index] != active:
                active = italics[index]
                parts.append("<em>" if active else "</em>")
            if index in replacements:
                end, value = replacements[index]
                parts.append(value)
                index = end
            else:
                parts.append(html.escape(block["text"][index]))
                index += 1
        if active:
            parts.append("</em>")
        block["html"] = "".join(parts)
    return issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "src/content")
    parser.add_argument("--allow-incomplete", action="store_true")
    args = parser.parse_args()
    audit, web, out = args.audit, args.web, args.output
    source_inventory = read_json(audit / "inventory.json")
    page_map = read_json(audit / "page-map.json")
    toc = read_json(web / "primary-toc.json")
    web_book = read_json(web / "book-web.json", {"sections": []})
    overrides = read_json(web / "primary-overrides.json", {"pages": {}, "regions": {}})
    for name in ["root-overrides.json", "afterword-native-overrides.json", "afterword-audit-overrides.json"]:
        extra = read_json(audit / name, {})
        for group in ["pages", "regions"]:
            overrides.setdefault(group, {}).update(extra.get(group, {}))
    corrections = {"pages": collections.defaultdict(list)}
    emphasis, formulas, structures = collections.defaultdict(list), collections.defaultdict(list), collections.defaultdict(list)
    visually_compared = set()
    for path in [web / "reviewed-corrections.json", audit / "reviewed-corrections.json", audit / "root-corrections.json", audit / "afterword-native-corrections.json", audit / "afterword-audit-corrections.json"]:
        metadata = read_json(path, {})
        overrides["pages"].update(metadata.get("fullPageOverrides", {}))
        visually_compared.update(metadata.get("reviewedPages", []))
        for number, patches in metadata.get("pages", {}).items():
            corrections["pages"][number].extend(patches)
        for number in set(metadata.get("emphasis", {})) | set(metadata.get("emphasisRanges", {})):
            ranges = metadata.get("emphasisRanges", {}).get(number, [])
            covered = {r["text"] for r in ranges}
            emphasis[number].extend(ranges)
            emphasis[number].extend({"text": s} for s in metadata.get("emphasis", {}).get(number, []) if s not in covered)
        for number, items in metadata.get("formulas", {}).items():
            formulas[number].extend(items)
        for item in metadata.get("structure", []):
            structures[str(item["page"])].append(item)
    art_data = read_json(audit / "figures.json", {"figures": []})
    art = art_data.get("figures", []) if isinstance(art_data, dict) else art_data
    if len(art) != 86 or any(not f.get("reviewed") for f in art):
        raise SystemExit("Expected all 86 reviewed original-image assets before publishing.")
    hyphens = {x.lower() for x in re.findall(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)+", "\n".join(s["text"] for s in web_book["sections"]))}
    hocr_dir = audit / "ocr"
    for source_text in hocr_dir.glob("page-*.txt"):
        hyphens.update(x.lower() for x in re.findall(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)+", source_text.read_text()))
    lexicon = read_json(audit / "hyphen-lexicon.json")
    if lexicon is not None:
        hyphens.update(lexicon)
    else:
        dump(audit / "hyphen-lexicon.json", sorted(hyphens))
    missing = [p["pdf_page"] for p in page_map["pages"] if not (hocr_dir / f"page-{p['pdf_page']:03}.hocr").exists()]
    if missing and not args.allow_incomplete:
        raise SystemExit(f"Missing OCR pages: {missing}")
    for folder in ["pages", "scans", "figures"]:
        (out / folder).mkdir(parents=True, exist_ok=True)
    source_images = {p["pdf_page"]: p for p in source_inventory["pages"]}
    arts = collections.defaultdict(list)
    figures = []
    for index, f in enumerate(art):
        number = f.get("page", f.get("pdf_page"))
        name = f.get("id", f"figure-{index + 1:03}")
        dest = out / "figures" / (name + ".png")
        bbox = f["bbox"]
        im = Image.open(audit / source_images[number]["image_file"])
        crop = im.crop(tuple(bbox))
        crop.save(dest)
        figure = {"id": name, "page": number, "printedPage": f.get("printedPage"),
                  "src": "content/figures/" + dest.name, "caption": f.get("caption", f"Рис. {f.get('number', '')}."),
                  "width": crop.width, "height": crop.height, "source": {"bbox": bbox, "sha256": sha(dest)},
                  "kind": f.get("kind", "figure")}
        arts[number].append(figure)
        figures.append(figure)
    sections = [
        {"id": "title-pages", "title": "Титульные страницы", "chapter": "Издание 1965 года", "chapterNumber": 0, "startPage": 1, "endPage": 2},
        {"id": "contents", "title": "Оглавление издания", "chapter": "Издание 1965 года", "chapterNumber": 0, "startPage": 3, "endPage": 4},
    ]
    chapter_labels = toc["chapters"]
    for idx, entry in enumerate(toc["entries"]):
        printed = entry["printedStartPage"]
        available = [p["pdf_page"] for p in page_map["pages"] if p.get("printed_page") == printed and not p.get("duplicate_of")]
        start = min(available)
        chapter_num = entry.get("chapter", 5)
        chapter = chapter_labels[chapter_num] if isinstance(chapter_num, int) and chapter_num < len(chapter_labels) else "Послесловие и указатель"
        sections.append({"id": f"section-{idx:02}", "title": entry["sourceTitle"],
                         "chapter": chapter, "chapterNumber": chapter_num,
                         "startPage": start, "printedStartPage": printed,
                         "webSection": entry.get("webSection")})
    for idx, section in enumerate(sections):
        section["endPage"] = sections[idx + 1]["startPage"] - 1 if idx + 1 < len(sections) else page_map["pdf_pages"]
    page_records, search, evidence, unresolved, format_issues = [], [], [], [], []
    words_total = 0
    reviewed = []
    page_cache = {}
    for info in page_map["pages"]:
        n = info["pdf_page"]
        padded = f"{n:03}"
        section = next(s for s in sections if s["startPage"] <= n <= s["endPage"])
        image_source = audit / source_images[n]["image_file"]
        image_dest = out / "scans" / f"page-{padded}.png"
        if not image_dest.exists() or sha(image_dest) != source_images[n]["image_sha256"]:
            shutil.copyfile(image_source, image_dest)
        source_image = "content/scans/" + image_dest.name
        regions = overrides.get("regions", {}).get(str(n), [])
        full_override = overrides.get("pages", {}).get(str(n))
        exclude = [f["source"]["bbox"] for f in arts[n]] + [r["bbox"] for r in regions]
        hocr = hocr_dir / f"page-{padded}.hocr"
        clean_hocr = audit / "ocr-clean" / f"page-{padded}.hocr"
        if clean_hocr.exists():
            hocr = clean_hocr
        blocks, headers, rejected, ocr_words, applied = ([], [], [], [], [])
        if hocr.exists():
            blocks, headers, rejected, ocr_words, applied = parse_hocr(hocr, exclude, n, hyphens, [] if full_override else corrections.get("pages", {}).get(str(n), []))
        unresolved.extend({"page": n, **patch} for patch in applied if patch["application"] == "unresolved")
        if full_override:
            blocks = copy.deepcopy(full_override["blocks"])
            if full_override.get("proofread"):
                reviewed.append(n)
        for region in regions:
            blocks.append({"type": region.get("type", "table"), "text": region.get("text", ""),
                           "html": region.get("html"), "source": {"bbox": region["bbox"]},
                           "proofread": region.get("proofread", False)})
        for f in arts[n]:
            image_block = {"type": "figure", "id": f["id"], "src": f["src"], "caption": f["caption"],
                           "width": f["width"], "height": f["height"], "source": f["source"], "proofread": True}
            # The title-page transcription is ordered manually; the publisher
            # emblem belongs immediately before the imprint, as in the scan.
            if full_override and f["kind"] == "publisher-mark":
                blocks.insert(max(0, len(blocks) - 1), image_block)
            else:
                blocks.append(image_block)
        # Tesseract paragraphs retain their internal reading order. Visual blocks
        # are inserted by their original top edge. Ties keep extraction order.
        if not full_override:
            blocks.sort(key=lambda b: (b.get("source", {}).get("bbox", [0, 0])[1], b.get("source", {}).get("bbox", [0, 0])[0]))
        for i, block in enumerate(blocks):
            block.setdefault("id", f"p{padded}-b{i + 1:03}")
            for key in ["_words", "_lines", "_textWordMap"]:
                block.pop(key, None)
        for fix in structures[str(n)]:
            targets = [b for b in blocks if b.get("text") == fix.get("text")]
            if len(targets) == 1:
                target = targets[0]
                target["type"] = fix.get("type", target["type"])
                position = blocks.index(target)
                if fix.get("mergeInto") and position > 0:
                    prior = blocks[position - 1]
                    prior["text"] += " " + target["text"]
                    prior["sourceText"] = prior.get("sourceText", "") + "\n" + target.get("sourceText", target["text"])
                    blocks.remove(target)
        blocks = [b for b in blocks if b.get("text") or b.get("src") or b.get("html")]
        format_issues.extend(restore_formatting(blocks, emphasis[str(n)], formulas[str(n)], n))
        if info["kind"] == "blank":
            blocks = []
        duplicate = info.get("duplicate_of")
        if duplicate and duplicate in page_cache:
            # These are repeated scans of the same printed page, not omitted
            # content. Use its corrected text while retaining this scan itself.
            blocks = copy.deepcopy(page_cache[duplicate]["blocks"])
            for index, block in enumerate(blocks):
                block["id"] = f"p{padded}-b{index + 1:03}"
            headers = copy.deepcopy(page_cache[duplicate]["sourceHeader"])
            if page_cache[duplicate]["transcriptionStatus"] == "manually-proofread" and n not in reviewed:
                reviewed.append(n)
            if duplicate in visually_compared:
                visually_compared.add(n)
        text = "\n\n".join(b.get("text", b.get("caption", "")) for b in blocks)
        word_count = len(re.findall(r"\S+", text))
        words_total += word_count
        status = "manually-proofread" if n in reviewed else ("blank-source-page" if info["kind"] == "blank" else "source-compared" if n in visually_compared else "ocr-structure-reviewed")
        page = {"number": n, "printedPage": info.get("printed_page"), "sectionId": section["id"],
                "title": section["title"], "kind": info["kind"], "duplicateOf": info.get("duplicate_of"),
                "plate": info.get("plate"), "blocks": blocks, "sourceImage": source_image,
                "sourceImageSha256": source_images[n]["image_sha256"], "sourceHeader": headers,
                "transcriptionStatus": status, "wordCount": word_count}
        if duplicate:
            page["textSourcePage"] = duplicate
        page_cache[n] = page
        dump(out / "pages" / f"{padded}.json", page)
        page_records.append({key: page[key] for key in ["number", "printedPage", "title", "sectionId", "kind", "duplicateOf", "plate", "sourceImage", "wordCount", "transcriptionStatus"]} | {"path": f"content/pages/{padded}.json"})
        search.append({"page": n, "sectionId": section["id"], "text": text})
        evidence.append({"page": n, "sourceSha256": page["sourceImageSha256"], "ocrSha256": sha(hocr) if hocr.exists() else None,
                         "status": status, "blocks": len(blocks), "words": word_count, "originalFigures": len(arts[n]),
                         "excludedWords": rejected, "corrections": applied,
                         "lowConfidenceWords": [{"text": w["text"], "bbox": w["bbox"], "confidence": w["confidence"]} for w in ocr_words if w["confidence"] < 60]})
    dump(audit / "correction-application-errors.json", unresolved)
    dump(audit / "formatting-application-errors.json", format_issues)
    if unresolved:
        raise SystemExit(f"{len(unresolved)} source corrections need explicit integration; see {audit / 'correction-application-errors.json'}")
    if format_issues:
        raise SystemExit(f"{len(format_issues)} source formatting spans need explicit integration; see {audit / 'formatting-application-errors.json'}")
    subsections = []
    for n, page in page_cache.items():
        if 253 <= n <= 342 and not page.get("duplicateOf"):
            for block in page["blocks"]:
                title = block.get("text", "")
                if block["type"] == "heading" and (len(title) > 20 or title == "ЗАКЛЮЧЕНИЕ") and title != "ЭВОЛЮЦИЯ ФИЗИКИ В ПРЕДСТАВЛЕНИИ ЭЙНШТЕЙНА":
                    subsections.append({"id": f"afterword-{n}", "title": title, "page": n, "blockId": block["id"], "sectionId": page["sectionId"]})
    book = {"title": "Эволюция физики", "subtitle": "Развитие идей от первоначальных понятий до теории относительности и квантов",
            "authors": ["Альберт Эйнштейн", "Леопольд Инфельд"], "year": 1965,
            "totalPages": page_map["pdf_pages"], "source": {"pdfUrl": "https://ikfia.ysn.ru/wp-content/uploads/2018/01/EinsteinInfeld1965ru.pdf",
                "webUrl": "https://alexandr4784.narod.ru/historyei.htm", "sha256": source_inventory["source_sha256"],
                "authority": "Прикреплённый скан московского издания «Наука», 1965"},
            "stats": {"pages": len(page_records), "figures": len(figures), "sections": len(sections), "words": words_total,
                      "reviewedPages": len(reviewed), "numberedFigures": 75, "distinctPrintedPages": 327,
                      "duplicateScans": 10, "blankScans": 5, "plates": 3, "visuallyComparedPages": len(visually_compared | set(reviewed))},
            "sections": sections, "subsections": subsections, "pages": page_records, "figures": figures,
            "verification": {"status": "transcription-in-review", "allPagesProcessed": not missing,
                             "originalScansPreserved": True, "originalFiguresPreserved": bool(figures),
                             "characterPerfectClaim": False, "manuallyProofreadPages": reviewed,
                             "wholePageComparisonPages": sorted(visually_compared | set(reviewed)),
                             "note": "Все страницы обработаны. Иллюстрации и снимки страниц сохранены из исходного файла. Распознанный текст может содержать ошибки; полная посимвольная сверка не завершена.",
                             "pageMapNote": page_map["review_scope"]}}
    dump(out / "book.json", book)
    dump(out / "search.json", search)
    dump(out / "verification.json", {"source": book["source"], "summary": book["verification"], "pages": evidence})
    print(json.dumps({"pages": len(page_records), "missing": missing, "words": words_total, "figures": len(figures), "proofreadPages": reviewed, "sections": len(sections)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
