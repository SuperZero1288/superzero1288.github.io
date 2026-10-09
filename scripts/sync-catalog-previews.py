#!/usr/bin/env python3
"""Build small, SHA-checked WebP previews without modifying the distribution repository.

Install scripts/preview-requirements.txt, then run this from any working directory.
Original images and download links remain available on GitHub.
"""
from __future__ import annotations

import base64
import io
import json
import re
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

REPOSITORY = "SuperZero1288/Zeroichiba-Workshop"
API = f"https://api.github.com/repos/{REPOSITORY}"
ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "vrchat-assets" / "previews"
PUBLIC_PATH = "/vrchat-assets/previews/"
MAX_SOURCE_BYTES = 20 * 1024 * 1024


def request(url: str, *, raw: bool = False) -> bytes:
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github.raw+json" if raw else "application/vnd.github+json",
        "User-Agent": "zeroichiba-catalog-previews/1.0",
    })
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read(MAX_SOURCE_BYTES * 2 + 1)
    if len(data) > MAX_SOURCE_BYTES * 2:
        raise ValueError("Response exceeds the preview generation limit")
    return data


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    tree = json.loads(request(f"{API}/git/trees/main?recursive=1"))
    if tree.get("truncated"):
        raise RuntimeError("GitHub returned a truncated tree; refusing to publish a partial manifest")
    pictures = [entry for entry in tree["tree"] if entry["type"] == "blob"
                and entry["path"].rsplit("/", 1)[0].lower().endswith(".ast")
                and re.search(r"\.(?:png|jpe?g|webp|gif|avif)$", entry["path"], re.I)]
    if len(pictures) > 60:
        raise RuntimeError("More than 60 previews: review the catalogue before generating a large batch")
    manifest = {}
    for entry in pictures:
        source_path, sha = entry["path"], entry["sha"]
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("Invalid Git blob SHA")
        old = previous.get(source_path, {})
        if old.get("sha") == sha and all(
            old.get(key, "").startswith(PUBLIC_PATH)
            and (OUTPUT / Path(old[key]).name).is_file() for key in ("small", "large")
        ):
            manifest[source_path] = old
            continue
        if entry.get("size", 0) > MAX_SOURCE_BYTES:
            print(f"Skipped oversized image: {source_path}")
            continue
        data = request(f"{API}/git/blobs/{sha}", raw=True)
        if data.lstrip().startswith(b"{"):
            data = base64.b64decode(json.loads(data)["content"])
        if len(data) > MAX_SOURCE_BYTES:
            raise ValueError(f"Source image too large: {source_path}")
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            preview = {"sha": sha}
            for key, size in (("small", 640), ("large", 1440)):
                resized = image.copy()
                resized.thumbnail((size, size), Image.Resampling.LANCZOS)
                filename = f"{sha[:12]}-{size}.webp"
                resized.save(OUTPUT / filename, "WEBP", quality=82, method=6)
                preview[key] = PUBLIC_PATH + filename
                preview[key + "Width"] = resized.width
                preview[key + "Height"] = resized.height
            manifest[source_path] = preview
            total = sum((OUTPUT / Path(preview[key]).name).stat().st_size for key in ("small", "large"))
            print(f"{source_path}: {len(data):,} bytes -> {total:,} bytes (two sizes)")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    # Only remove this script's previously listed generated files, never arbitrary assets.
    retained = {Path(item[key]).name for item in manifest.values() for key in ("small", "large")}
    for item in previous.values():
        for key in ("small", "large"):
            filename = Path(item.get(key, "")).name
            if re.fullmatch(r"[0-9a-f]{12}-(640|1440)\.webp", filename) and filename not in retained:
                (OUTPUT / filename).unlink(missing_ok=True)
    print(f"Saved {len(manifest)} image previews to {manifest_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
