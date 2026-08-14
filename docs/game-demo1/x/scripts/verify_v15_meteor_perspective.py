"""Verify V15 perspective meteor review assets before runtime installation."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v15_meteor_perspective_review"


def inspect_png(path: Path, expected: tuple[int, int]) -> dict:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        values = set(alpha.getdata())
        bbox = alpha.getbbox()
        return {"size": image.size, "rgba": image.mode in ("RGBA", "LA"), "hardAlpha": values.issubset({0, 255}), "bbox": bbox, "expected": expected, "empty": bbox is None}


def verify_asset(folder: Path, review_id: str, frame_size: tuple[int, int], frame_count: int) -> dict:
    meta = json.loads((folder / f"{review_id}.json").read_text(encoding="utf-8"))
    frames = []
    for index in range(frame_count):
        path = folder / "frames" / f"frame_{index:02d}.png"
        item = inspect_png(path, frame_size)
        if item["size"] != frame_size or not item["rgba"] or not item["hardAlpha"] or item["empty"]:
            raise RuntimeError(f"Invalid frame: {path} -> {item}")
        frames.append(item)
    sheet = inspect_png(folder / f"{review_id}.png", (frame_size[0] * frame_count, frame_size[1]))
    if sheet["size"] != (frame_size[0] * frame_count, frame_size[1]):
        raise RuntimeError(f"Invalid sheet: {sheet}")
    if meta["frameWidth"] != frame_size[0] or meta["frameHeight"] != frame_size[1] or meta["frameCount"] != frame_count:
        raise RuntimeError(f"Metadata mismatch for {review_id}: {meta}")
    return {"id": meta["id"], "reviewId": review_id, "frameCount": frame_count, "frameSize": frame_size, "frames": frames, "sheet": sheet}


def main() -> None:
    warning = verify_asset(REVIEW / "vfx" / "meteor_warning_v8", "meteor_warning_v8", (96, 64), 6)
    impact = verify_asset(REVIEW / "vfx" / "meteor_impact_v6", "meteor_impact_v6", (128, 128), 10)
    # The warning is placed on the shared 128px world canvas at (16,32). Its
    # visible contents must remain within the requested frame safety bounds.
    for index, item in enumerate(warning["frames"]):
        bbox = item["bbox"]
        if bbox and not (bbox[0] >= 8 and bbox[2] <= 88 and bbox[1] >= 8 and bbox[3] <= 56):
            raise RuntimeError(f"Warning frame {index} exceeds 96x64 safety bounds: {bbox}")
    result = {"passed": True, "review": "v15_meteor_perspective_review", "assets": [warning, impact], "checks": {"groundPerspective": "flattened horizontal ellipse required; inspect review image", "warningHasNoMeteor": "manual visual check required", "impactHasVolumetricMeteor": "manual visual check required"}}
    (REVIEW / "v15_meteor_perspective_validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "warningFrames": 6, "impactFrames": 10}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
