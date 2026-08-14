"""Strict review-only checks for V14 meteor sequence assets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v14_meteor_sequence_review"
VFX = REVIEW / "vfx"
WARNING = VFX / "meteor_warning_v7"
IMPACT = VFX / "meteor_impact_v5"
OUT = REVIEW / "v14_meteor_sequence_validation.json"


def check_png(path: Path, expected: tuple[int, int], safe: tuple[int, int, int, int] | None = None) -> dict:
    errors: list[str] = []
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    alpha_values = set(alpha.getdata())
    bbox = alpha.getbbox()
    if image.size != expected:
        errors.append(f"size {image.size} != {expected}")
    if not alpha_values.issubset({0, 255}):
        errors.append("alpha is not binary")
    if bbox is None:
        errors.append("empty frame")
    if safe and bbox:
        x0, y0, x1, y1 = bbox
        sx0, sy0, sx1, sy1 = safe
        if x0 < sx0 or y0 < sy0 or x1 > sx1 or y1 > sy1:
            errors.append(f"bbox {bbox} outside safe bounds {safe}")
    edge = []
    for x in range(image.width):
        edge.extend((alpha.getpixel((x, 0)), alpha.getpixel((x, image.height - 1))))
    for y in range(image.height):
        edge.extend((alpha.getpixel((0, y)), alpha.getpixel((image.width - 1, y))))
    if any(edge):
        errors.append("opaque pixel touches edge")
    return {
        "path": str(path.relative_to(ROOT)),
        "size": list(image.size),
        "bbox": list(bbox) if bbox else None,
        "alphaBinary": alpha_values.issubset({0, 255}),
        "errors": errors,
    }


def gif_count(path: Path) -> int:
    with Image.open(path) as image:
        return sum(1 for _ in ImageSequence.Iterator(image))


def main() -> None:
    errors: list[str] = []
    checks: list[dict] = []
    warning_frames = []
    impact_frames = []
    for i in range(6):
        path = WARNING / "frames" / f"frame_{i:02d}.png"
        if path.exists():
            result = check_png(path, (96, 64), (8, 8, 88, 56))
            checks.append(result)
            warning_frames.append(Image.open(path).convert("RGBA"))
        else:
            errors.append(f"missing warning frame {i}")
    for i in range(10):
        path = IMPACT / "frames" / f"frame_{i:02d}.png"
        if path.exists():
            result = check_png(path, (128, 128))
            checks.append(result)
            impact_frames.append(Image.open(path).convert("RGBA"))
        else:
            errors.append(f"missing impact frame {i}")
    if len(warning_frames) == 6:
        if gif_count(WARNING / "meteor_warning_v7.gif") != 6:
            errors.append("warning GIF must contain 6 frames")
        if Image.open(WARNING / "meteor_warning_v7.png").size != (576, 64):
            errors.append("warning sheet must be 576x64")
        # The warning upper margin must stay clear; this catches a meteor or
        # falling trajectory leaking into the warning phase.
        for i, frame in enumerate(warning_frames):
            upper = sum(1 for y in range(0, 8) for x in range(96) if frame.getpixel((x, y))[3])
            if upper:
                errors.append(f"warning frame {i} has upper trajectory pixels: {upper}")
    if len(impact_frames) == 10:
        if gif_count(IMPACT / "meteor_impact_v5.gif") != 10:
            errors.append("impact GIF must contain 10 frames")
        if Image.open(IMPACT / "meteor_impact_v5.png").size != (1280, 128):
            errors.append("impact sheet must be 1280x128")
        if not impact_frames[0].getbbox():
            errors.append("impact frame 00 is empty; meteor introduction missing")
    metadata = json.loads((WARNING / "meteor_warning_v7.json").read_text(encoding="utf-8")) if (WARNING / "meteor_warning_v7.json").exists() else {}
    expected_metadata = {"frameWidth": 96, "frameHeight": 64, "frameCount": 6, "fps": 12, "loop": True}
    for key, value in expected_metadata.items():
        if metadata.get(key) != value:
            errors.append(f"warning metadata {key} mismatch")
    result = {
        "id": "v14_meteor_sequence_validation",
        "passed": not errors and all(not check["errors"] for check in checks),
        "warning": {"frameCount": len(warning_frames), "meteorPresent": False, "safeBounds": {"xMin": 8, "xMax": 87, "yMin": 8, "yMax": 55}},
        "impact": {"frameCount": len(impact_frames), "meteorIntroducedAt": "frame_00"},
        "checks": checks,
        "errors": errors + [check["errors"] for check in checks if check["errors"]],
        "runtimeChanged": False,
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
