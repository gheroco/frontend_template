#!/usr/bin/env python3
"""Rebuild the native edition from committed original scans and reviewed inputs.

Requires Python 3.11+, Pillow, and lxml. Does not download a book or run OCR.
The original extraction/OCR outputs are retained so source corrections can be
reproduced without depending on later changes to a recognition engine.
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def main():
    project = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=project / "src/content")
    parser.add_argument("--source-scans", type=Path, default=project / "src/content/scans")
    args = parser.parse_args()
    evidence = project / "content-audit"
    with tempfile.TemporaryDirectory(prefix="evolution-native-rebuild-") as temporary:
        audit = Path(temporary)
        for file in (evidence / "source").glob("*.json"):
            shutil.copyfile(file, audit / file.name)
        (audit / "images").mkdir()
        for file in args.source_scans.glob("page-*.png"):
            shutil.copyfile(file, audit / "images" / file.name)
        with zipfile.ZipFile(evidence / "ocr-inputs.zip") as archive:
            for entry in archive.infolist():
                if not re.fullmatch(r"ocr(?:-clean)?/page-\d{3}\.(?:txt|tsv|hocr)", entry.filename):
                    raise SystemExit(f"Unexpected OCR archive member: {entry.filename}")
                target = audit / entry.filename
                target.parent.mkdir(exist_ok=True)
                target.write_bytes(archive.read(entry))
        scripts = Path(__file__).resolve().parent
        subprocess.run([sys.executable, str(scripts / "build_native.py"),
                        "--audit", str(audit), "--web", str(evidence / "comparison"),
                        "--output", str(args.output)], check=True)
        subprocess.run([sys.executable, str(scripts / "verify_content.py"),
                        "--content", str(args.output), "--audit", str(audit)], check=True)


if __name__ == "__main__":
    main()
