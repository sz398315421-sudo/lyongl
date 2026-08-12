#!/usr/bin/env python3
"""Strict validation for the V9 moon-prop review-only package."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, List

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v9_moon_props_review"
OUT = REVIEW / "props" / "moon"
RUNTIME = ROOT / "assets" / "game" / "props" / "moon"

ASSET_SPECS = {
    "moon_crystal_cluster": ((64, 64), {"x": 32, "y": 56}, True),
    "moon_energy_seam": ((64, 32), {"x": 32, "y": 24}, False),
    "moon_shallow_crater": ((64, 32), {"x": 32, "y": 24}, False),
    "moon_regolith_chunk": ((48, 48), {"x": 24, "y": 40}, True),
    "moon_antenna_fragment": ((64, 96), {"x": 32, "y": 88}, True),
    "moon_dust_ridge": ((96, 48), {"x": 48, "y": 40}, False),
    "moon_lander_panel": ((96, 64), {"x": 48, "y": 56}, True),
    "moon_probe_wreck": ((96, 64), {"x": 48, "y": 56}, True),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_png(path: Path, size: tuple[int, int], allow_shadow: bool) -> Dict:
    result = {"path": str(path), "exists": path.exists(), "passed": False, "errors": []}
    if not path.exists():
        result["errors"].append("missing")
        return result
    image = Image.open(path)
    result.update({"size": [image.width, image.height], "mode": image.mode})
    if image.mode != "RGBA":
        result["errors"].append("not RGBA")
    if image.size != size:
        result["errors"].append(f"expected {size}")
    alpha = image.getchannel("A")
    values = set(alpha.getdata())
    result["alphaValues"] = sorted(values)
    if not values.issubset({0, 255}):
        result["errors"].append("partial alpha")
    if any(alpha.getpixel((x, y)) for x, y in ((0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1))):
        result["errors"].append("corner touches")
    bbox = alpha.getbbox()
    result["bbox"] = list(bbox) if bbox else None
    if not bbox:
        result["errors"].append("empty")
    elif bbox[0] == 0 or bbox[1] == 0 or bbox[2] == image.width or bbox[3] == image.height:
        result["errors"].append("canvas touch")
    rgb = image.load()
    magenta_pixels = 0
    purple_spill_pixels = 0
    stray_transparent_rgb = 0
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = rgb[x, y]
            if a == 0 and (r or g or b):
                stray_transparent_rgb += 1
            if a and r > 145 and b > 115 and g < max(125, min(r, b) * 0.72):
                magenta_pixels += 1
            if a and r > 70 and r > g * 1.35 and b > g * 1.2:
                purple_spill_pixels += 1
    result["magentaPixels"] = magenta_pixels
    result["purpleSpillPixels"] = purple_spill_pixels
    result["transparentRgbPixels"] = stray_transparent_rgb
    if magenta_pixels:
        result["errors"].append("magenta residue")
    if purple_spill_pixels:
        result["errors"].append("purple matte spill")
    if stray_transparent_rgb:
        result["errors"].append("transparent RGB residue")
    if not allow_shadow and bbox and bbox[3] > size[1] - 2:
        result["errors"].append("decal too close to bottom edge")
    result["sha256"] = sha256(path)
    result["passed"] = not result["errors"]
    return result


def validate_preview(source: Path, preview: Path) -> Dict:
    result = {"path": str(preview), "passed": False, "errors": []}
    if not source.exists() or not preview.exists():
        result["errors"].append("missing source or preview")
        return result
    src = Image.open(source).convert("RGBA")
    actual = Image.open(preview).convert("RGBA")
    expected = src.resize((src.width * 4, src.height * 4), Image.Resampling.NEAREST)
    result["size"] = [actual.width, actual.height]
    if actual.size != expected.size:
        result["errors"].append("wrong preview size")
    elif actual.tobytes() != expected.tobytes():
        result["errors"].append("not nearest-neighbor identical")
    result["passed"] = not result["errors"]
    return result


def validate_json(path: Path, asset_id: str, size: tuple[int, int], anchor: Dict[str, int]) -> Dict:
    result = {"path": str(path), "passed": False, "errors": []}
    if not path.exists():
        result["errors"].append("missing")
        return result
    data = json.loads(path.read_text(encoding="utf-8"))
    for key, expected in (
        ("id", asset_id),
        ("width", size[0]),
        ("height", size[1]),
        ("anchor", anchor),
        ("generationModel", "gpt-image-2"),
        ("alphaMethod", "chroma-key"),
        ("pixelization", "nearest-neighbor"),
        ("imageSmoothingEnabled", False),
    ):
        if data.get(key) != expected:
            result["errors"].append(f"{key} mismatch")
    result["passed"] = not result["errors"]
    return result


def main() -> None:
    checks: List[Dict] = []
    for asset_id, (size, anchor, allow_shadow) in ASSET_SPECS.items():
        checks.append(validate_png(OUT / f"{asset_id}.png", size, allow_shadow))
        checks.append(validate_preview(OUT / f"{asset_id}.png", OUT / f"{asset_id}_4x.png"))
        checks.append(validate_json(OUT / f"{asset_id}.json", asset_id, size, anchor))

    runtime_unchanged = {}
    generation_path = REVIEW / "v9_moon_props_generation.json"
    generation = json.loads(generation_path.read_text(encoding="utf-8")) if generation_path.exists() else {}
    remaining_path = REVIEW / "v9_moon_props_remaining_generation.json"
    remaining = json.loads(remaining_path.read_text(encoding="utf-8")) if remaining_path.exists() else {}
    before_hashes = dict(generation.get("runtimeSourceSha256BeforeReview", {}))
    before_hashes.update(remaining.get("runtimeSourceSha256BeforeReview", {}))
    for asset_id in ASSET_SPECS:
        runtime_path = RUNTIME / f"{asset_id}.png"
        before = before_hashes.get(asset_id)
        after = sha256(runtime_path) if runtime_path.exists() else None
        runtime_unchanged[asset_id] = {"before": before, "after": after, "unchanged": bool(before and before == after)}

    passed = all(item.get("passed", False) for item in checks) and all(item["unchanged"] for item in runtime_unchanged.values())
    report = {
        "package": "v9_moon_props_review",
        "passed": passed,
        "checks": checks,
        "runtimeUnchanged": runtime_unchanged,
        "reviewOnly": True,
        "runtimeReplacementPerformed": False,
    }
    output = REVIEW / "v9_moon_props_validation.json"
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
