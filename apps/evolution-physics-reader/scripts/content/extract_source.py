#!/usr/bin/env python3
"""Inventory this image-only PDF, extract its original pixels, and OCR every leaf.

Usage:
  python audit_pdf.py --pdf /path/to/source.pdf --output /path/to/book-audit \
      --rus-model /path/to/tessdata_best/rus.traineddata

Dependencies: PyMuPDF, Pillow, Tesseract with its eng model and configs.
The Russian model must be tessdata_best/rus.traineddata, available from
https://github.com/tesseract-ocr/tessdata_best/blob/main/rus.traineddata

There is deliberately no rendering DPI option: images are extracted losslessly
from the PDF. Changing resolution would alter source pixels. Contact sheets are
separate thumbnails; neither source PDF nor original extracted images is edited.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import statistics
import subprocess

import fitz
from PIL import Image, ImageDraw, ImageFont


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def inventory_pdf(source, output):
    """Resume only when the PDF and every cached extracted image still match."""
    source_hash = sha256(source)
    cache_path = output / "inventory.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached.get("source_sha256") != source_hash:
            raise ValueError("Output directory belongs to a different source PDF; use a new --output directory")
        for entry in cached["pages"]:
            path = output / entry["image_file"]
            if not path.is_file() or sha256(path) != entry["image_sha256"]:
                raise ValueError(f"Cached source image is absent or modified: {path}")
        cached["source"] = str(source)
        return cached
    records = []
    with fitz.open(source) as document:
        for index, page in enumerate(document):
            images = page.get_images(full=True)
            if len(images) != 1:
                raise ValueError(f"PDF page {index + 1}: expected exactly one original scan, found {len(images)}")
            extracted = document.extract_image(images[0][0])
            destination = output / "images" / f"page-{index + 1:03}.{extracted['ext']}"
            if destination.exists() and destination.read_bytes() != extracted["image"]:
                raise ValueError(f"Refusing to overwrite a different extracted source image: {destination}")
            destination.write_bytes(extracted["image"])
            with Image.open(destination) as image:
                black = sum(image.convert("L").histogram()[:128])
                fraction = black / (image.width * image.height)
                records.append({
                    "pdf_page": index + 1, "pdf_width": page.rect.width, "pdf_height": page.rect.height,
                    "text_layer_chars": len(page.get_text()), "embedded_images": len(images),
                    "vector_drawings": len(page.get_drawings()), "fonts": len(page.get_fonts()),
                    "image_file": str(destination.relative_to(output)), "image_width": image.width,
                    "image_height": image.height, "black_pixel_fraction": fraction,
                    "image_sha256": sha256(destination), "blank": fraction < 0.00005,
                })
        return {"source": str(source), "source_sha256": source_hash,
                "page_count": len(document), "metadata": document.metadata, "pages": records}


def contact_sheets(records, output):
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    for start in range(0, len(records), 12):
        destination = output / "contact-sheets" / f"pages-{start + 1:03}-{min(start + 12, len(records)):03}.jpg"
        if destination.exists():
            continue
        sheet = Image.new("RGB", (1280, 1500), "#d6d9dc")
        draw = ImageDraw.Draw(sheet)
        for slot, record in enumerate(records[start:start + 12]):
            with Image.open(output / record["image_file"]) as original:
                image = original.convert("RGB")
                image.thumbnail((304, 458))
                x = (slot % 4) * 320 + (320 - image.width) // 2
                y = (slot // 4) * 500 + 28
                sheet.paste(image, (x, y))
            label = f"PDF {record['pdf_page']:03}" + (" - BLANK" if record["blank"] else "")
            draw.text(((slot % 4) * 320 + 12, (slot // 4) * 500 + 6), label, fill="black", font=font)
        sheet.save(destination, quality=85)


def configure_tessdata(output, model, system_tessdata, custom_tessdata):
    if custom_tessdata:
        tessdata = custom_tessdata.resolve()
    else:
        tessdata = output / "tessdata"
        tessdata.mkdir(exist_ok=True)
        russian = model.resolve() if model else output / "rus-best.traineddata"
        sources = {"rus.traineddata": russian,
                   "eng.traineddata": system_tessdata / "eng.traineddata",
                   "configs": system_tessdata / "configs",
                   "tessconfigs": system_tessdata / "tessconfigs"}
        for name, source in sources.items():
            target = tessdata / name
            if not source.exists():
                raise ValueError(f"Missing Tesseract resource {source}; provide --rus-model or --system-tessdata")
            if target.exists():
                if target.resolve() != source.resolve():
                    raise ValueError(f"Existing Tesseract resource points elsewhere: {target}; use --tessdata-dir explicitly")
            else:
                if target.is_symlink():
                    target.unlink()
                target.symlink_to(source.resolve())
    required = ["rus.traineddata", "eng.traineddata", "configs/txt", "configs/tsv", "configs/hocr"]
    for name in required:
        if not (tessdata / name).exists():
            raise ValueError(f"Missing Tesseract resource: {tessdata / name}")
    return tessdata


def recognize(record, output, tessdata, force=False):
    number = record["pdf_page"]
    base = output / "ocr" / f"page-{number:03}"
    language = "eng" if number == 2 else "rus"
    required = [base.with_suffix(extension) for extension in [".txt", ".tsv", ".hocr"]]
    if force or not all(path.exists() for path in required):
        process = subprocess.run([
            "tesseract", str(output / record["image_file"]), str(base), "--tessdata-dir", str(tessdata),
            "-l", language, "--psm", "3", "txt", "tsv", "hocr",
        ], capture_output=True, text=True, env={**os.environ, "OMP_THREAD_LIMIT": "1"})
        if process.returncode or not all(path.exists() for path in required):
            raise RuntimeError(f"OCR failed on PDF page {number}: {process.stderr.strip()}")
    text = base.with_suffix(".txt").read_text(encoding="utf-8")
    rows = csv.DictReader(io.StringIO(base.with_suffix(".tsv").read_text(encoding="utf-8")), delimiter="\t")
    words = [row for row in rows if row.get("text", "").strip() and float(row["conf"]) >= 0]
    confidences = [float(row["conf"]) for row in words]
    return {"pdf_page": number, "ocr_chars": len(text), "ocr_words": len(words), "ocr_language": language,
            "mean_confidence": statistics.mean(confidences) if confidences else None,
            "low_confidence_words": sum(value < 60 for value in confidences),
            "text_file": str(base.with_suffix(".txt").relative_to(output)),
            "tsv_file": str(base.with_suffix(".tsv").relative_to(output)),
            "hocr_file": str(base.with_suffix(".hocr").relative_to(output)), "first_lines": text.splitlines()[:5]}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pdf", type=Path, required=True, help="Unmodified source PDF")
    parser.add_argument("--output", type=Path, required=True, help="Audit output directory")
    parser.add_argument("--rus-model", type=Path, help="Best Russian traineddata model (default: OUTPUT/rus-best.traineddata)")
    parser.add_argument("--system-tessdata", type=Path, default=Path("/usr/share/tesseract-ocr/5/tessdata"),
                        help="Installed English model and Tesseract configs directory")
    parser.add_argument("--tessdata-dir", type=Path, help="Use an existing complete tessdata directory instead of creating links")
    parser.add_argument("--workers", type=int, default=8, help="Parallel single-threaded OCR processes (default: 8)")
    parser.add_argument("--skip-ocr", action="store_true", help="Inventory/extract only; no Tesseract or models required")
    parser.add_argument("--no-contact-sheets", action="store_true", help="Do not generate separate review thumbnails")
    parser.add_argument("--force-ocr", action="store_true", help="Regenerate OCR files; leaves original image files intact")
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error("--pdf must name an existing PDF")
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    source, output = args.pdf.resolve(), args.output.resolve()
    for name in ["images", "ocr", "contact-sheets"]:
        (output / name).mkdir(parents=True, exist_ok=True)
    try:
        inventory = inventory_pdf(source, output)
        dump(output / "inventory.json", inventory)
        print(f"Inventoried {inventory['page_count']} PDF leaves; exact source images retained", flush=True)
        if not args.no_contact_sheets:
            contact_sheets(inventory["pages"], output)
        if not args.skip_ocr:
            tessdata = configure_tessdata(output, args.rus_model, args.system_tessdata.resolve(), args.tessdata_dir)
            provenance = {"rusModelSha256": sha256(tessdata / "rus.traineddata"),
                          "engModelSha256": sha256(tessdata / "eng.traineddata"),
                          "languages": "rus-only except eng-only on PDF page 2", "psm": 3,
                          "tesseractVersion": subprocess.run(["tesseract", "--version"], capture_output=True, text=True, check=True).stdout.splitlines()[0]}
            provenance_path = output / "ocr-provenance.json"
            if provenance_path.exists() and not args.force_ocr:
                previous = json.loads(provenance_path.read_text(encoding="utf-8"))
                if previous != provenance:
                    raise ValueError("OCR engine/model differs from cached provenance; use --force-ocr or another --output directory")
            with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
                results = pool.map(lambda record: recognize(record, output, tessdata, args.force_ocr), inventory["pages"])
                for index, (record, result) in enumerate(zip(inventory["pages"], results), 1):
                    record.update(result)
                    if index % 20 == 0:
                        print(f"OCR {index}/{inventory['page_count']}", flush=True)
            dump(output / "inventory.json", inventory)
            dump(provenance_path, provenance)
            combined = "\n\n".join(f"=== PDF PAGE {record['pdf_page']} ===\n" + (output / record["text_file"]).read_text(encoding="utf-8")
                                    for record in inventory["pages"] if "text_file" in record)
            (output / "all-pages-ocr.txt").write_text(combined, encoding="utf-8")
        print(json.dumps({"pages": inventory["page_count"], "sourceSha256": inventory["source_sha256"],
                          "output": str(output), "ocrRun": not args.skip_ocr,
                          "blankPages": [record["pdf_page"] for record in inventory["pages"] if record["blank"]]}))
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Audit failed: {error}\n")


if __name__ == "__main__":
    main()
