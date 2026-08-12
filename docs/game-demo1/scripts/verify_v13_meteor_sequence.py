"""Strict validation for the V13 review-only meteor sequence."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets/concepts/v13_meteor_sequence_review"


def check_png(path: Path, expected: tuple[int, int]) -> dict:
    result = {"path": str(path.relative_to(ROOT)), "size": None, "mode": None, "alphaBinary": False, "transparentBorder": False, "hasOpaquePixels": False, "errors": []}
    if not path.exists():
        result["errors"].append("missing")
        return result
    image = Image.open(path).convert("RGBA")
    result["size"] = list(image.size)
    result["mode"] = "RGBA"
    alpha = list(image.getchannel("A").getdata())
    result["alphaBinary"] = all(value in (0, 255) for value in alpha)
    result["hasOpaquePixels"] = 255 in alpha
    border = []
    border.extend(image.getpixel((x, 0))[3] for x in range(image.width))
    border.extend(image.getpixel((x, image.height - 1))[3] for x in range(image.width))
    border.extend(image.getpixel((0, y))[3] for y in range(image.height))
    border.extend(image.getpixel((image.width - 1, y))[3] for y in range(image.height))
    result["transparentBorder"] = not any(border)
    if result["size"] != list(expected): result["errors"].append(f"size != {expected}")
    if not result["alphaBinary"]: result["errors"].append("non-binary alpha")
    if not result["transparentBorder"]: result["errors"].append("opaque border")
    if not result["hasOpaquePixels"]: result["errors"].append("empty")
    pixels = list(image.getdata())
    magenta = sum(1 for r, g, b, a in pixels if a and r > 150 and b > 130 and g < 125 and abs(r - b) < 105)
    result["magentaOpaquePixels"] = magenta
    if magenta: result["errors"].append("magenta residue")
    return result


def gif_frames(path: Path) -> int:
    with Image.open(path) as image:
        return sum(1 for _ in ImageSequence.Iterator(image))


def main() -> None:
    errors = []
    checks = []
    warning = REVIEW / "vfx/meteor_warning_v5"
    impact = REVIEW / "vfx/meteor_impact_v4"
    for index in range(6): checks.append(check_png(warning / "frames" / f"frame_{index:02d}.png", (96, 64)))
    for index in range(10): checks.append(check_png(impact / "frames" / f"frame_{index:02d}.png", (128, 128)))
    checks.append(check_png(warning / "meteor_warning_v5.png", (576, 64)))
    checks.append(check_png(impact / "meteor_impact_v4.png", (1280, 128)))
    errors.extend(error for check in checks for error in check["errors"])
    if gif_frames(warning / "meteor_warning_v5.gif") != 6: errors.append("warning GIF frame count mismatch")
    if gif_frames(impact / "meteor_impact_v4.gif") != 10: errors.append("impact GIF frame count mismatch")
    warning_meta = json.loads((warning / "meteor_warning_v5.json").read_text(encoding="utf-8"))
    impact_meta = json.loads((impact / "meteor_impact_v4.json").read_text(encoding="utf-8"))
    if warning_meta["frameCount"] != 6 or warning_meta["frameWidth"] != 96 or warning_meta["frameHeight"] != 64: errors.append("warning metadata mismatch")
    if impact_meta["frameCount"] != 10 or impact_meta["frameWidth"] != 128 or impact_meta["frameHeight"] != 128: errors.append("impact metadata mismatch")
    if warning_meta["anchor"] != {"x": 48, "y": 32}: errors.append("warning anchor mismatch")
    if impact_meta["anchor"] != {"x": 64, "y": 64}: errors.append("impact anchor mismatch")
    # Semantic guardrail: the warning viewport is intentionally cropped around
    # the strike point, so generated warning art must not occupy the top strip.
    warning_top_band = []
    for index in range(6):
        image = Image.open(warning / "frames" / f"frame_{index:02d}.png").convert("RGBA")
        warning_top_band.append(sum(1 for y in range(0, 14) for x in range(image.width) if image.getpixel((x, y))[3]))
    if max(warning_top_band, default=0) > 12:
        errors.append("warning top band suggests an unapproved falling object; inspect frames 00-05")
    impact_first = Image.open(impact / "frames/frame_00.png").convert("RGBA")
    if not any(impact_first.getpixel((x, y))[3] for y in range(0, 58) for x in range(20, 108)):
        errors.append("impact frame 00 has no upper meteor entry pixels")
    payload = {
        "id": "v13_meteor_sequence_validation",
        "passed": not errors,
        "warning": {"frameCount": 6, "topBandOpaquePixels": warning_top_band},
        "impact": {"frameCount": 10, "meteorIntroducedAt": "frame_00"},
        "checks": checks,
        "manualSemanticReview": {
            "warningFramesContainNoMeteor": "required",
            "impactFrame00IntroducesMeteor": "required",
            "transitionCenterStable": "required",
        },
        "errors": errors,
    }
    REVIEW.mkdir(parents=True, exist_ok=True)
    (REVIEW / "v13_meteor_sequence_validation.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    if errors: raise SystemExit(1)


if __name__ == "__main__":
    main()
