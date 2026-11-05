#!/usr/bin/env python3
"""Build the homepage slideshow photos from the original screenshots.

Usage: python scripts/build-hero-images.py <folder with the original images>

Images are used in file-name order and saved as assets/hero/NN-wide.webp (landscape screens)
and assets/hero/NN-tall.webp (a centre crop for portrait screens). Requires
scripts/preview-requirements.txt. The originals are not stored in this repository.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageOps

OUTPUT = Path(__file__).resolve().parent.parent / "assets" / "hero"
WIDE_MAX_WIDTH = 2560
TALL_MAX_HEIGHT = 1440
TALL_ASPECT = 3 / 4
QUALITY = 88


def save(image: Image.Image, path: Path) -> int:
    image.save(path, "WEBP", quality=QUALITY, method=6)
    return path.stat().st_size


def build(source: Path, number: int) -> tuple[int, int]:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    wide = image.copy()
    wide.thumbnail((WIDE_MAX_WIDTH, WIDE_MAX_WIDTH), Image.Resampling.LANCZOS)
    crop_width = min(image.width, round(image.height * TALL_ASPECT))
    left = (image.width - crop_width) // 2
    tall = image.crop((left, 0, left + crop_width, image.height))
    tall.thumbnail((TALL_MAX_HEIGHT, TALL_MAX_HEIGHT), Image.Resampling.LANCZOS)
    return (
        save(wide, OUTPUT / f"{number:02d}-wide.webp"),
        save(tall, OUTPUT / f"{number:02d}-tall.webp"),
    )


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sources = sorted(path for path in Path(sys.argv[1]).iterdir() if path.is_file())
    if not sources:
        sys.exit("No images found")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    totals = [0, 0]
    for number, source in enumerate(sources, start=1):
        wide, tall = build(source, number)
        totals[0] += wide
        totals[1] += tall
        print(f"{number:02d} {source.name}: wide {wide // 1024} KB / tall {tall // 1024} KB")
    print(f"Total: wide {totals[0] // 1024} KB / tall {totals[1] // 1024} KB")


if __name__ == "__main__":
    main()
