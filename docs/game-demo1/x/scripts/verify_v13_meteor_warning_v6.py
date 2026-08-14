"""Verify the standalone V13 meteor warning v6 review package."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
VFX = ROOT / "assets" / "concepts" / "v13_meteor_sequence_review" / "vfx"
WARNING = VFX / "meteor_warning_v6"
IMPACT = VFX / "meteor_impact_v4"
OUT = ROOT / "assets" / "concepts" / "v13_meteor_sequence_review" / "v13_meteor_warning_v6_validation.json"


def check_png(path: Path, size: tuple[int, int], safe: tuple[int, int, int, int]) -> dict:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    values = set(alpha.getdata())
    bbox = alpha.getbbox()
    errors: list[str] = []
    if image.size != size:
        errors.append(f"size {image.size} != {size}")
    if not values.issubset({0, 255}):
        errors.append("alpha is not hard binary")
    if bbox is None:
        errors.append("empty frame")
    else:
        x0, y0, x1, y1 = bbox
        sx0, sy0, sx1, sy1 = safe
        if x0 < sx0 or y0 < sy0 or x1 > sx1 or y1 > sy1:
            errors.append(f"content bbox {bbox} outside safe bounds {safe}")
    edge_pixels = []
    for x in range(image.width):
        edge_pixels += [alpha.getpixel((x, 0)), alpha.getpixel((x, image.height - 1))]
    for y in range(image.height):
        edge_pixels += [alpha.getpixel((0, y)), alpha.getpixel((image.width - 1, y))]
    if any(edge_pixels):
        errors.append("content touches frame edge")
    # The warning has no falling object, so the upper area must remain nearly
    # empty; the generated effect itself lives around the center/lower scan.
    top_band = sum(1 for y in range(0, 8) for x in range(image.width) if alpha.getpixel((x, y)))
    if top_band > 0:
        errors.append(f"top band contains {top_band} opaque pixels")
    return {"path": str(path.relative_to(ROOT)), "size": list(image.size), "bbox": list(bbox) if bbox else None, "alphaBinary": values.issubset({0, 255}), "topBandOpaquePixels": top_band, "errors": errors}


def main() -> None:
    errors: list[str] = []
    frames = [WARNING / "frames" / f"frame_{i:02d}.png" for i in range(6)]
    checks = [check_png(path, (96, 64), (8, 8, 88, 56)) for path in frames if path.exists()]
    if len(checks) != 6:
        errors.append("missing warning frame")
    sheet = WARNING / "meteor_warning_v6.png"
    if not sheet.exists() or Image.open(sheet).size != (576, 64):
        errors.append("warning sheet must be 576x64")
    gif = WARNING / "meteor_warning_v6.gif"
    gif_frames = 0
    if not gif.exists():
        errors.append("missing warning GIF")
    else:
        gif_frames = sum(1 for _ in ImageSequence.Iterator(Image.open(gif)))
        if gif_frames != 6:
            errors.append(f"warning GIF has {gif_frames} frames")
    impact0 = IMPACT / "frames" / "frame_00.png"
    if not impact0.exists():
        errors.append("missing impact reference frame 00")
    metadata_path = WARNING / "meteor_warning_v6.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.exists() else {}
    for key, value in {"frameWidth": 96, "frameHeight": 64, "frameCount": 6, "fps": 12}.items():
        if metadata.get(key) != value:
            errors.append(f"metadata {key} mismatch")
    result = {
        "id": "v13_meteor_warning_v6_validation",
        "passed": not errors and all(not item["errors"] for item in checks),
        "warning": {"frameCount": len(checks), "gifFrameCount": gif_frames, "safeBounds": {"xMin": 8, "xMax": 87, "yMin": 8, "yMax": 55}, "meteorPresent": False},
        "checks": checks,
        "errors": errors + [item["errors"] for item in checks if item["errors"]],
        "runtimeChanged": False,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
