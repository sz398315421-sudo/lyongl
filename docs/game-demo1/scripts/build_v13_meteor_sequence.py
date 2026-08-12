"""Build the review-only V13 meteor warning -> impact sequence.

The source is one GPT-Image 2 4x4 storyboard. Warning panels are cropped to
the 96x64 runtime viewport and contain no meteor; impact panels remain 128x128
and introduce the meteor only at impact frame zero. Nothing under assets/game
is written by this script.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v13_meteor_sequence_review"
VFX = REVIEW / "vfx"
WARNING_OUT = VFX / "meteor_warning_v5"
IMPACT_OUT = VFX / "meteor_impact_v4"
TMP = ROOT / "tmp" / "imagegen" / "v13_meteor_sequence"
SOURCE = TMP / "meteor_sequence_storyboard_alpha.png"
# The generated 4x4 storyboard placed the two hand-off panels in row two in
# visual order (warning, meteor entry) rather than strict grid order. Keep the
# source image untouched, but record the reviewed panel order explicitly so
# the deliverable follows the requested warning -> impact sequence.
# The provider placed the hand-off panels with a warning ring in panel 15,
# then the first visible meteor (panel 6) and its flaming approach (panel 7).
# Use the clean ring as the final warning frame so no meteor leaks into the
# warning loop; impact frame 00 then introduces that same centered meteor.
WARNING_PANEL_ORDER = [0, 1, 2, 3, 4, 15]
IMPACT_PANEL_ORDER = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

WARNING_SPEC = {
    "id": "meteor_warning",
    "reviewId": "meteor_warning_v5",
    "width": 96,
    "height": 64,
    "count": 6,
    "fps": 12,
    "loop": True,
    "anchor": {"x": 48, "y": 32},
}
IMPACT_SPEC = {
    "id": "meteor_impact",
    "reviewId": "meteor_impact_v4",
    "width": 128,
    "height": 128,
    "count": 10,
    "fps": 18,
    "loop": False,
    "anchor": {"x": 64, "y": 64},
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
            # Keep only crisp opaque pixels. Chroma extraction should already
            # have removed magenta, but this catches provider spill as well.
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


def crop_storyboard() -> list[Image.Image]:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing extracted storyboard: {SOURCE}")
    image = hard_alpha(Image.open(SOURCE))
    if image.width < 4 or image.height < 4:
        raise ValueError(f"Storyboard is too small: {image.size}")
    cell_w = image.width / 4.0
    cell_h = image.height / 4.0
    panels: list[Image.Image] = []
    for index in range(16):
        col = index % 4
        row = index // 4
        gutter = max(4, round(min(cell_w, cell_h) * 0.025))
        x0 = round(col * cell_w + gutter)
        y0 = round(row * cell_h + gutter)
        x1 = round((col + 1) * cell_w - gutter)
        y1 = round((row + 1) * cell_h - gutter)
        panels.append(hard_alpha(image.crop((x0, y0, x1, y1)).resize((128, 128), Image.Resampling.NEAREST)))
    return panels


def warning_crop(panel: Image.Image) -> Image.Image:
    # Preserve the common center (64,64): crop 96x64 around it, then clear the
    # border. All warning art is deliberately confined to this viewport.
    return hard_alpha(panel.crop((16, 32, 112, 96)).resize((96, 64), Image.Resampling.NEAREST))


def save_gif(frames: list[Image.Image], path: Path, fps: int, loop: bool, scale: int = 1, durations=None) -> None:
    rendered = [frame.resize((frame.width * scale, frame.height * scale), Image.Resampling.NEAREST) for frame in frames]
    # Preview GIFs use an opaque dark matte so pixels remain visible in common
    # viewers; the PNG frames remain transparent deliverables.
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
    cell_w = frames[0].width * scale
    cell_h = frames[0].height * scale
    rows = (len(frames) + columns - 1) // columns
    canvas = Image.new("RGBA", (cell_w * columns, cell_h * rows), (16, 19, 24, 255))
    draw = ImageDraw.Draw(canvas)
    tile = 8
    for y in range(0, canvas.height, tile):
        for x in range(0, canvas.width, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(42, 47, 54, 255))
            else:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(12, 15, 19, 255))
    for index, frame in enumerate(frames):
        canvas.alpha_composite(frame.resize((cell_w, cell_h), Image.Resampling.NEAREST), ((index % columns) * cell_w, (index // columns) * cell_h))
    canvas.save(path)


def write_asset(folder: Path, spec: dict, frames: list[Image.Image], palette: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    frame_dir = folder / "frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        frame.save(frame_dir / f"frame_{index:02d}.png")
    save_sheet(frames, folder / f"{spec['reviewId']}.png")
    save_gif(frames, folder / f"{spec['reviewId']}.gif", spec["fps"], spec["loop"])
    frames_4x = [frame.resize((frame.width * 4, frame.height * 4), Image.Resampling.NEAREST) for frame in frames]
    save_sheet(frames_4x, folder / f"{spec['reviewId']}_4x.png")
    save_alpha_check(frames, folder / f"{spec['reviewId']}_alpha_check.png", 3 if spec["count"] == 6 else 5)
    metadata = {
        "id": spec["id"],
        "reviewId": spec["reviewId"],
        "assetType": "vfx",
        "frameWidth": spec["width"],
        "frameHeight": spec["height"],
        "frameCount": spec["count"],
        "fps": spec["fps"],
        "loop": spec["loop"],
        "anchor": spec["anchor"],
        "blendMode": "source-over",
        "sheet": f"{spec['reviewId']}.png",
        "frames": [f"frames/frame_{i:02d}.png" for i in range(spec["count"])],
        "previewGif": f"{spec['reviewId']}.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "codex",
        "generationQuality": "medium",
        "sourceStoryboard": "tmp/imagegen/v13_meteor_sequence/meteor_sequence_storyboard_source.png",
        "alphaMethod": "chroma-key + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "palette": palette,
        "transitionTarget": "meteor_impact_v4/frame_00.png" if spec["id"] == "meteor_warning" else "meteor_warning_v5/frame_05.png",
    }
    (folder / f"{spec['reviewId']}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def compose_combo(warning: list[Image.Image], impact: list[Image.Image]) -> list[Image.Image]:
    combo: list[Image.Image] = []
    for frame in warning:
        canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        canvas.alpha_composite(frame, (16, 32))
        combo.append(canvas)
    combo.extend(frame.copy() for frame in impact)
    return combo


def save_previews(warning: list[Image.Image], impact: list[Image.Image]) -> None:
    combo = compose_combo(warning, impact)
    sheet = Image.new("RGBA", (128 * len(combo), 128), (0, 0, 0, 0))
    for index, frame in enumerate(combo):
        sheet.alpha_composite(frame, (index * 128, 0))
    sheet.save(VFX / "meteor_warning_impact_v5_combo.png")
    durations = [83] * 6 + [56] * 10
    save_gif(combo, VFX / "meteor_warning_impact_v5_combo.gif", 15, False, durations=durations)
    save_gif(combo, VFX / "meteor_warning_impact_v5_combo_4x.gif", 15, False, scale=4, durations=durations)
    transition = Image.new("RGBA", (512, 256), (8, 11, 14, 255))
    transition.alpha_composite(compose_combo(warning[-1:], [])[0].resize((256, 256), Image.Resampling.NEAREST), (0, 0))
    transition.alpha_composite(impact[0].resize((256, 256), Image.Resampling.NEAREST), (256, 0))
    transition.save(VFX / "meteor_warning_impact_v5_transition.png")

    grounds = [
        ("rust", ROOT / "assets/game/planets/rust_ground.png"),
        ("spore", ROOT / "assets/game/planets/spore_ground.png"),
        ("moon", ROOT / "assets/game/planets/moon_ground.png"),
    ]
    ground_preview = Image.new("RGBA", (3 * 256, 256), (8, 11, 14, 255))
    draw = ImageDraw.Draw(ground_preview)
    for index, (planet, path) in enumerate(grounds):
        if path.exists():
            ground = Image.open(path).convert("RGBA").resize((256, 256), Image.Resampling.NEAREST)
            ground_preview.alpha_composite(ground, (index * 256, 0))
        ground_preview.alpha_composite(combo[5].resize((192, 128), Image.Resampling.NEAREST), (index * 256 + 32, 16))
        ground_preview.alpha_composite(combo[6].resize((128, 128), Image.Resampling.NEAREST), (index * 256 + 64, 112))
        draw.text((index * 256 + 8, 8), f"{planet.upper()} // WARNING→IMPACT", fill=(232, 242, 228, 255))
    ground_preview.save(VFX / "meteor_warning_impact_v5_ground_preview.png")

    combo_meta = {
        "id": "meteor_warning_impact_v5_combo",
        "frameCount": 16,
        "loop": False,
        "anchor": {"x": 64, "y": 64},
        "imageSmoothingEnabled": False,
        "sequence": [
            {"asset": "meteor_warning_v5", "frames": list(range(6)), "fps": 12},
            {"asset": "meteor_impact_v4", "frames": list(range(10)), "fps": 18},
        ],
        "warningPlacement": {"x": 16, "y": 32},
        "handoff": {"warningLastFrame": 5, "impactFirstFrame": 0, "sharedCenter": {"x": 64, "y": 64}, "meteorIntroducedAt": "impact.frame_00"},
    }
    (VFX / "meteor_warning_impact_v5_combo.json").write_text(json.dumps(combo_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clean", action="store_true", help="remove only the V13 review output before rebuilding")
    args = parser.parse_args()
    if args.clean and REVIEW.exists():
        shutil.rmtree(REVIEW)
    panels = crop_storyboard()
    warning = [warning_crop(panels[i]) for i in WARNING_PANEL_ORDER]
    impact = [panels[i] for i in IMPACT_PANEL_ORDER]
    write_asset(WARNING_OUT, WARNING_SPEC, warning, "cold cyan scan arcs with orange-yellow danger ticks; no meteor")
    write_asset(IMPACT_OUT, IMPACT_SPEC, impact, "charcoal meteor, rust-orange fragments, ember-yellow core, limited cyan marker")
    save_previews(warning, impact)
    generation = {
        "id": "v13_meteor_sequence_generation",
        "model": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "size": "2K",
        "command": "images generate",
        "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "transparentExtraction": {"command": "transparent extract", "method": "chroma", "matteColor": "auto", "material": "sticker", "strict": True},
        "pixelization": "nearest-neighbor",
        "warningGuarantee": "frames 00-05 contain no meteor, rock silhouette or falling trajectory; visual review required",
        "impactGuarantee": "meteor first appears at impact frame 00",
        "storyboardPanelOrder": {"warning": WARNING_PANEL_ORDER, "impact": IMPACT_PANEL_ORDER},
        "sourceSha256": sha256(SOURCE),
    }
    (REVIEW / "v13_meteor_sequence_generation.json").write_text(json.dumps(generation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "id": "v13_meteor_sequence_review",
        "outputDirectory": "assets/concepts/v13_meteor_sequence_review",
        "runtimeChanged": False,
        "assets": [
            {"id": "meteor_warning", "reviewId": "meteor_warning_v5", "folder": "vfx/meteor_warning_v5", "frameCount": 6, "frameSize": [96, 64], "fps": 12, "loop": True},
            {"id": "meteor_impact", "reviewId": "meteor_impact_v4", "folder": "vfx/meteor_impact_v4", "frameCount": 10, "frameSize": [128, 128], "fps": 18, "loop": False},
        ],
        "transition": {"warningPlacement": {"x": 16, "y": 32}, "sharedAnchor": {"x": 64, "y": 64}, "meteorAppearsAt": "meteor_impact.frame_00"},
        "storyboardPanelOrder": {"warning": WARNING_PANEL_ORDER, "impact": IMPACT_PANEL_ORDER},
    }
    (REVIEW / "v13_meteor_sequence_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"built": True, "review": str(REVIEW.relative_to(ROOT)), "warningFrames": len(warning), "impactFrames": len(impact)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
