"""Build the review-only V13 warning v6 package.

The source is a GPT-Image 2 two-column by three-row storyboard. Each panel is
reframed into a 96x64 warning frame using one shared crop region, so the lock
ring stays complete and centered instead of being cut by a fixed y crop. The
existing meteor_impact_v4 frames are only read for the review combo; runtime
files are never touched.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v13_meteor_sequence_review"
VFX = REVIEW / "vfx"
WARNING_OUT = VFX / "meteor_warning_v6"
IMPACT_OUT = VFX / "meteor_impact_v4"
TMP = ROOT / "tmp" / "imagegen" / "v13_meteor_warning_v6"
SOURCE = TMP / "meteor_warning_storyboard_alpha.png"

WARNING_SPEC = {
    "id": "meteor_warning",
    "reviewId": "meteor_warning_v6",
    "width": 96,
    "height": 64,
    "count": 6,
    "fps": 12,
    "loop": True,
    "anchor": {"x": 48, "y": 32},
}


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


def extract_panels() -> list[Image.Image]:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing extracted storyboard: {SOURCE}")
    image = hard_alpha(Image.open(SOURCE))
    cell_w = image.width / 2.0
    cell_h = image.height / 3.0
    panels: list[Image.Image] = []
    for index in range(6):
        col = index % 2
        row = index // 2
        gutter = max(4, round(min(cell_w, cell_h) * 0.035))
        x0 = round(col * cell_w + gutter)
        y0 = round(row * cell_h + gutter)
        x1 = round((col + 1) * cell_w - gutter)
        y1 = round((row + 1) * cell_h - gutter)
        panel = hard_alpha(image.crop((x0, y0, x1, y1)))
        if panel.getbbox() is None:
            raise ValueError(f"Storyboard panel {index} is empty")
        panels.append(panel)
    return panels


def shared_crop_box(panels: list[Image.Image]) -> tuple[int, int, int, int]:
    boxes = [panel.getbbox() for panel in panels]
    if any(box is None for box in boxes):
        raise ValueError("Every warning storyboard panel must contain visible pixels")
    # Do not crop to the union of the visible pixels: that makes the source
    # ring fill the output and can cut later frames when the provider's panel
    # sizes vary. Use a fixed square source window around the common panel
    # center, then fit it into a 80x48 safe rectangle in the final frame.
    center_x = panels[0].width // 2
    center_y = panels[0].height // 2
    side = min(panels[0].width, panels[0].height)
    x0 = max(0, center_x - side // 2)
    y0 = max(0, center_y - side // 2)
    x1 = min(panels[0].width, x0 + side)
    y1 = min(panels[0].height, y0 + side)
    return (x0, y0, x1, y1)


def frame_from_panel(panel: Image.Image, crop_box: tuple[int, int, int, int]) -> Image.Image:
    # Keep one shared crop for every frame to preserve the same world center.
    crop = panel.crop(crop_box)
    # Keep the 2:3 source composition mapped to 80x48, leaving >=8px on all
    # sides of the 96x64 logical frame. The generated panel is square-ish;
    # the output is intentionally letterboxed rather than edge-cropped.
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


def save_alpha_check(frames: list[Image.Image], path: Path) -> None:
    scale = 4
    cell_w = frames[0].width * scale
    cell_h = frames[0].height * scale
    canvas = Image.new("RGBA", (cell_w * 3, cell_h * 2), (16, 19, 24, 255))
    draw = ImageDraw.Draw(canvas)
    tile = 8
    for y in range(0, canvas.height, tile):
        for x in range(0, canvas.width, tile):
            color = (42, 47, 54, 255) if ((x // tile) + (y // tile)) % 2 == 0 else (12, 15, 19, 255)
            draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=color)
    for index, frame in enumerate(frames):
        canvas.alpha_composite(frame.resize((cell_w, cell_h), Image.Resampling.NEAREST), ((index % 3) * cell_w, (index // 3) * cell_h))
    canvas.save(path)


def write_warning_asset(frames: list[Image.Image], crop_box: tuple[int, int, int, int]) -> None:
    WARNING_OUT.mkdir(parents=True, exist_ok=True)
    frame_dir = WARNING_OUT / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        frame.save(frame_dir / f"frame_{index:02d}.png")
    save_sheet(frames, WARNING_OUT / "meteor_warning_v6.png")
    save_gif(frames, WARNING_OUT / "meteor_warning_v6.gif", 12, True)
    save_sheet([frame.resize((384, 256), Image.Resampling.NEAREST) for frame in frames], WARNING_OUT / "meteor_warning_v6_4x.png")
    save_alpha_check(frames, WARNING_OUT / "meteor_warning_v6_alpha_check.png")
    metadata = {
        "id": "meteor_warning",
        "reviewId": "meteor_warning_v6",
        "assetType": "vfx",
        "frameWidth": 96,
        "frameHeight": 64,
        "frameCount": 6,
        "fps": 12,
        "loop": True,
        "anchor": {"x": 48, "y": 32},
        "blendMode": "source-over",
        "sheet": "meteor_warning_v6.png",
        "frames": [f"frames/frame_{i:02d}.png" for i in range(6)],
        "previewGif": "meteor_warning_v6.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "codex",
        "generationQuality": "medium",
        "sourceStoryboard": "tmp/imagegen/v13_meteor_warning_v6/meteor_warning_storyboard_source.png",
        "alphaMethod": "chroma-key + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "safeBounds": {"xMin": 8, "xMax": 87, "yMin": 8, "yMax": 55},
        "sharedSourceCrop": list(crop_box),
        "transitionTarget": "../meteor_impact_v4/frames/frame_00.png",
    }
    (WARNING_OUT / "meteor_warning_v6.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_impact_frames() -> list[Image.Image]:
    frames = []
    for index in range(10):
        path = IMPACT_OUT / "frames" / f"frame_{index:02d}.png"
        if not path.exists():
            raise FileNotFoundError(f"Missing existing impact frame: {path}")
        frames.append(hard_alpha(Image.open(path)))
    return frames


def save_combo(warning: list[Image.Image], impact: list[Image.Image]) -> None:
    combo = []
    for frame in warning:
        canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        canvas.alpha_composite(frame, (16, 32))
        combo.append(canvas)
    combo.extend(frame.copy() for frame in impact)
    sheet = Image.new("RGBA", (128 * len(combo), 128), (0, 0, 0, 0))
    for index, frame in enumerate(combo):
        sheet.alpha_composite(frame, (index * 128, 0))
    sheet.save(VFX / "meteor_warning_v6_impact_v4_combo.png")
    durations = [83] * 6 + [56] * 10
    save_gif(combo, VFX / "meteor_warning_v6_impact_v4_combo.gif", 15, False, durations=durations)
    save_gif(combo, VFX / "meteor_warning_v6_impact_v4_combo_4x.gif", 15, False, scale=4, durations=durations)
    transition = Image.new("RGBA", (512, 256), (8, 11, 14, 255))
    warning_last = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    warning_last.alpha_composite(warning[-1], (16, 32))
    transition.alpha_composite(warning_last.resize((256, 256), Image.Resampling.NEAREST), (0, 0))
    transition.alpha_composite(impact[0].resize((256, 256), Image.Resampling.NEAREST), (256, 0))
    transition.save(VFX / "meteor_warning_v6_transition.png")
    combo_meta = {
        "id": "meteor_warning_v6_impact_v4_combo",
        "frameWidth": 128,
        "frameHeight": 128,
        "frameCount": 16,
        "loop": False,
        "sequence": [
            {"asset": "meteor_warning_v6", "frames": list(range(6)), "fps": 12},
            {"asset": "meteor_impact_v4", "frames": list(range(10)), "fps": 18},
        ],
        "warningPlacement": {"x": 16, "y": 32},
        "anchor": {"x": 64, "y": 64},
        "imageSmoothingEnabled": False,
        "meteorAppearsAt": "meteor_impact_v4.frame_00",
    }
    (VFX / "meteor_warning_v6_impact_v4_combo.json").write_text(json.dumps(combo_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true")
    args = parser.parse_args()
    if args.clean and WARNING_OUT.exists():
        shutil.rmtree(WARNING_OUT)
    for name in [
        "meteor_warning_v6_impact_v4_combo.gif",
        "meteor_warning_v6_impact_v4_combo_4x.gif",
        "meteor_warning_v6_impact_v4_combo.png",
        "meteor_warning_v6_impact_v4_combo.json",
        "meteor_warning_v6_transition.png",
    ]:
        path = VFX / name
        if path.exists():
            path.unlink()
    panels = extract_panels()
    crop_box = shared_crop_box(panels)
    frames = [frame_from_panel(panel, crop_box) for panel in panels]
    write_warning_asset(frames, crop_box)
    impact = load_impact_frames()
    save_combo(frames, impact)
    generation = {
        "id": "v13_meteor_warning_v6_generation",
        "model": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "size": "2K",
        "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "grid": {"columns": 2, "rows": 3},
        "transparentExtraction": {"method": "chroma", "matteColor": "auto", "material": "sticker", "strict": True},
        "pixelization": "nearest-neighbor",
        "safeBounds": {"xMin": 8, "xMax": 87, "yMin": 8, "yMax": 55},
        "impactReference": "assets/concepts/v13_meteor_sequence_review/vfx/meteor_impact_v4/frames/frame_00.png",
        "sourceSha256": sha256(SOURCE),
        "runtimeChanged": False,
    }
    (REVIEW / "v13_meteor_warning_v6_generation.json").write_text(json.dumps(generation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "id": "v13_meteor_warning_v6_review",
        "outputDirectory": "assets/concepts/v13_meteor_sequence_review",
        "runtimeChanged": False,
        "warning": {"reviewId": "meteor_warning_v6", "frameSize": [96, 64], "frameCount": 6, "fps": 12, "loop": True, "anchor": {"x": 48, "y": 32}},
        "impactReference": {"reviewId": "meteor_impact_v4", "frameSize": [128, 128], "frameCount": 10, "fps": 18, "anchor": {"x": 64, "y": 64}},
        "transition": {"warningPlacement": {"x": 16, "y": 32}, "sharedCenter": {"x": 64, "y": 64}, "meteorAppearsAt": "meteor_impact_v4.frame_00"},
        "safeBounds": {"xMin": 8, "xMax": 87, "yMin": 8, "yMax": 55},
    }
    (REVIEW / "v13_meteor_warning_v6_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"built": True, "warningFrames": len(frames), "cropBox": crop_box, "runtimeChanged": False}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
