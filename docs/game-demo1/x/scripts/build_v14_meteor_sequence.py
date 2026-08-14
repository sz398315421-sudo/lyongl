"""Build V14 review-only meteor warning -> impact assets.

The input is a GPT-Image 2 4x4 storyboard. It is never copied into assets/game;
the builder emits a fresh V14 review directory and preserves V13 assets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v14_meteor_sequence_review"
VFX = REVIEW / "vfx"
WARNING_OUT = VFX / "meteor_warning_v7"
IMPACT_OUT = VFX / "meteor_impact_v5"
TMP = ROOT / "tmp" / "imagegen" / "v14_meteor_sequence"
SOURCE = TMP / "meteor_sequence_storyboard_alpha.png"

WARNING_ORDER = [0, 1, 2, 3, 4, 5]
IMPACT_ORDER = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
WARNING_SAFE = (8, 8, 88, 56)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hard_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            magenta = r > 150 and b > 130 and g < 125 and abs(r - b) < 105
            if a < 128 or magenta:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (r, g, b, 255)
    for x in range(image.width):
        pixels[x, 0] = (0, 0, 0, 0)
        pixels[x, image.height - 1] = (0, 0, 0, 0)
    for y in range(image.height):
        pixels[0, y] = (0, 0, 0, 0)
        pixels[image.width - 1, y] = (0, 0, 0, 0)
    return image


def crop_panels() -> list[Image.Image]:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing extracted storyboard: {SOURCE}")
    image = hard_alpha(Image.open(SOURCE))
    cell_w = image.width / 4.0
    cell_h = image.height / 4.0
    panels: list[Image.Image] = []
    for index in range(16):
        col, row = index % 4, index // 4
        gutter = max(4, round(min(cell_w, cell_h) * 0.025))
        box = (
            round(col * cell_w + gutter),
            round(row * cell_h + gutter),
            round((col + 1) * cell_w - gutter),
            round((row + 1) * cell_h - gutter),
        )
        panel = hard_alpha(image.crop(box).resize((128, 128), Image.Resampling.NEAREST))
        if panel.getbbox() is None:
            raise ValueError(f"Storyboard panel {index} is empty")
        panels.append(panel)
    return panels


def warning_frame(panel: Image.Image) -> Image.Image:
    # Center-preserving square crop and letterbox. This guarantees a complete
    # ring in the 96x64 output even when the provider panel is square.
    side = min(panel.width, panel.height)
    x0 = (panel.width - side) // 2
    y0 = (panel.height - side) // 2
    crop = panel.crop((x0, y0, x0 + side, y0 + side))
    contained = ImageOps.contain(crop, (80, 48), method=Image.Resampling.NEAREST)
    frame = Image.new("RGBA", (96, 64), (0, 0, 0, 0))
    frame.alpha_composite(contained, (48 - contained.width // 2, 32 - contained.height // 2))
    return hard_alpha(frame)


def save_gif(frames: list[Image.Image], path: Path, fps: int, loop: bool, scale: int = 1, durations=None) -> None:
    rendered = [frame.resize((frame.width * scale, frame.height * scale), Image.Resampling.NEAREST) for frame in frames]
    palette = []
    for frame in rendered:
        bg = Image.new("RGBA", frame.size, (8, 11, 14, 255))
        bg.alpha_composite(frame)
        palette.append(bg.convert("P", palette=Image.Palette.ADAPTIVE, colors=128))
    kwargs = {
        "save_all": True,
        "append_images": palette[1:],
        "duration": durations or [round(1000 / fps)] * len(palette),
        "disposal": 2,
        "optimize": False,
    }
    if loop:
        kwargs["loop"] = 0
    palette[0].save(path, **kwargs)


def save_sheet(frames: list[Image.Image], path: Path) -> None:
    sheet = Image.new("RGBA", (frames[0].width * len(frames), frames[0].height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * frame.width, 0))
    sheet.save(path)


def save_alpha_check(frames: list[Image.Image], path: Path, columns: int) -> None:
    scale = 4
    cell_w, cell_h = frames[0].width * scale, frames[0].height * scale
    rows = (len(frames) + columns - 1) // columns
    canvas = Image.new("RGBA", (cell_w * columns, cell_h * rows), (16, 19, 24, 255))
    draw = ImageDraw.Draw(canvas)
    for y in range(0, canvas.height, 8):
        for x in range(0, canvas.width, 8):
            color = (42, 47, 54, 255) if ((x // 8) + (y // 8)) % 2 == 0 else (12, 15, 19, 255)
            draw.rectangle((x, y, x + 7, y + 7), fill=color)
    for index, frame in enumerate(frames):
        canvas.alpha_composite(frame.resize((cell_w, cell_h), Image.Resampling.NEAREST), ((index % columns) * cell_w, (index // columns) * cell_h))
    canvas.save(path)


def write_asset(folder: Path, review_id: str, frame_size: tuple[int, int], frames: list[Image.Image], fps: int, loop: bool, anchor: dict, palette: str, safe_bounds=None) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    frame_dir = folder / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        frame.save(frame_dir / f"frame_{index:02d}.png")
    save_sheet(frames, folder / f"{review_id}.png")
    save_gif(frames, folder / f"{review_id}.gif", fps, loop)
    save_sheet([frame.resize((frame.width * 4, frame.height * 4), Image.Resampling.NEAREST) for frame in frames], folder / f"{review_id}_4x.png")
    save_alpha_check(frames, folder / f"{review_id}_alpha_check.png", 3 if len(frames) == 6 else 5)
    metadata = {
        "id": "meteor_warning" if "warning" in review_id else "meteor_impact",
        "reviewId": review_id,
        "assetType": "vfx",
        "frameWidth": frame_size[0],
        "frameHeight": frame_size[1],
        "frameCount": len(frames),
        "fps": fps,
        "loop": loop,
        "anchor": anchor,
        "blendMode": "source-over",
        "sheet": f"{review_id}.png",
        "frames": [f"frames/frame_{i:02d}.png" for i in range(len(frames))],
        "previewGif": f"{review_id}.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "codex",
        "generationQuality": "medium",
        "sourceStoryboard": "tmp/imagegen/v14_meteor_sequence/meteor_sequence_storyboard_source.png",
        "alphaMethod": "chroma-key + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "palette": palette,
    }
    if safe_bounds:
        metadata["safeBounds"] = safe_bounds
    (folder / f"{review_id}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def combo_preview(warning: list[Image.Image], impact: list[Image.Image]) -> None:
    combo: list[Image.Image] = []
    for frame in warning:
        canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        canvas.alpha_composite(frame, (16, 32))
        combo.append(canvas)
    combo.extend(frame.copy() for frame in impact)
    sheet = Image.new("RGBA", (128 * len(combo), 128), (0, 0, 0, 0))
    for index, frame in enumerate(combo):
        sheet.alpha_composite(frame, (index * 128, 0))
    sheet.save(VFX / "meteor_warning_v7_impact_v5_combo.png")
    durations = [83] * 6 + [56] * 10
    save_gif(combo, VFX / "meteor_warning_v7_impact_v5_combo.gif", 15, False, durations=durations)
    save_gif(combo, VFX / "meteor_warning_v7_impact_v5_combo_4x.gif", 15, False, scale=4, durations=durations)
    warning_last = combo[5]
    transition = Image.new("RGBA", (512, 256), (8, 11, 14, 255))
    transition.alpha_composite(warning_last.resize((256, 256), Image.Resampling.NEAREST), (0, 0))
    transition.alpha_composite(impact[0].resize((256, 256), Image.Resampling.NEAREST), (256, 0))
    transition.save(VFX / "meteor_warning_v7_transition.png")
    combo_meta = {
        "id": "meteor_warning_v7_impact_v5_combo",
        "frameWidth": 128,
        "frameHeight": 128,
        "frameCount": 16,
        "loop": False,
        "sequence": [
            {"asset": "meteor_warning_v7", "frames": list(range(6)), "fps": 12},
            {"asset": "meteor_impact_v5", "frames": list(range(10)), "fps": 18},
        ],
        "warningPlacement": {"x": 16, "y": 32},
        "anchor": {"x": 64, "y": 64},
        "imageSmoothingEnabled": False,
        "meteorAppearsAt": "meteor_impact_v5.frame_00",
    }
    (VFX / "meteor_warning_v7_impact_v5_combo.json").write_text(json.dumps(combo_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()
    if args.clean and REVIEW.exists():
        shutil.rmtree(REVIEW)
    panels = crop_panels()
    warning = [warning_frame(panels[index]) for index in WARNING_ORDER]
    impact = [panels[index] for index in IMPACT_ORDER]
    write_asset(WARNING_OUT, "meteor_warning_v7", (96, 64), warning, 12, True, {"x": 48, "y": 32}, "cold cyan scan arcs, orange-yellow lock ticks; no meteor", WARNING_SAFE)
    write_asset(IMPACT_OUT, "meteor_impact_v5", (128, 128), impact, 18, False, {"x": 64, "y": 64}, "charcoal meteor, rust-orange impact, ember-yellow core, limited cyan marker")
    combo_preview(warning, impact)
    generation = {
        "id": "v14_meteor_sequence_generation",
        "model": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "size": "2K",
        "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "grid": {"columns": 4, "rows": 4},
        "warningPanelOrder": WARNING_ORDER,
        "impactPanelOrder": IMPACT_ORDER,
        "transparentExtraction": {"method": "chroma", "matteColor": "auto", "material": "sticker", "strict": True},
        "pixelization": "nearest-neighbor",
        "warningGuarantee": "panels 0-5 contain no meteor, rock, falling object, smoke or explosion",
        "impactGuarantee": "panel 6 is the first panel containing a meteor",
        "sourceSha256": sha256(SOURCE),
        "runtimeChanged": False,
    }
    (REVIEW / "v14_meteor_sequence_generation.json").write_text(json.dumps(generation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "id": "v14_meteor_sequence_review",
        "outputDirectory": "assets/concepts/v14_meteor_sequence_review",
        "runtimeChanged": False,
        "assets": [
            {"id": "meteor_warning", "reviewId": "meteor_warning_v7", "frameCount": 6, "frameSize": [96, 64], "fps": 12, "loop": True, "anchor": {"x": 48, "y": 32}},
            {"id": "meteor_impact", "reviewId": "meteor_impact_v5", "frameCount": 10, "frameSize": [128, 128], "fps": 18, "loop": False, "anchor": {"x": 64, "y": 64}},
        ],
        "transition": {"warningPlacement": {"x": 16, "y": 32}, "sharedCenter": {"x": 64, "y": 64}, "meteorAppearsAt": "meteor_impact_v5.frame_00"},
        "safeBounds": {"xMin": 8, "xMax": 87, "yMin": 8, "yMax": 55},
    }
    (REVIEW / "v14_meteor_sequence_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"built": True, "warningFrames": 6, "impactFrames": 10, "runtimeChanged": False}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
