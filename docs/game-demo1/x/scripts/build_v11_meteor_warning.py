"""Build the GPT-Image 2 meteor-warning review asset.

This script is intentionally review-only.  It consumes the locally extracted
alpha storyboard produced from the GPT-Image 2 mother image, creates the
runtime-shaped 96x64 frames, and writes only under the V11 concept directory.
It never touches assets/game or the V7 review package.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v11_meteor_warning_review"
VFX = OUT / "vfx" / "meteor_warning_v3"
RAW = VFX / "raw"
FRAMES = VFX / "frames"
SOURCE = RAW / "meteor_warning_v3_storyboard_alpha.png"
SHEET_NAME = "meteor_warning_v3.png"


def hard_alpha(image: Image.Image) -> Image.Image:
    """Remove matte remnants and keep only binary alpha pixels."""

    image = image.convert("RGBA")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            # The chroma helper already removed the matte.  This second pass
            # makes the final sprite deliberately hard-alpha for pixel art.
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)
    # Never allow a generated pixel to touch the frame boundary.
    for x in range(image.width):
        px[x, 0] = (0, 0, 0, 0)
        px[x, image.height - 1] = (0, 0, 0, 0)
    for y in range(image.height):
        px[0, y] = (0, 0, 0, 0)
        px[image.width - 1, y] = (0, 0, 0, 0)
    return image


def make_frames() -> list[Image.Image]:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing extracted storyboard: {SOURCE}")
    storyboard = hard_alpha(Image.open(SOURCE))
    if storyboard.size != (1536, 1024):
        raise ValueError(f"Expected 1536x1024 storyboard, got {storyboard.size}")

    frames: list[Image.Image] = []
    for row in range(2):
        for col in range(3):
            panel = storyboard.crop((col * 512, row * 512,
                                     (col + 1) * 512, (row + 1) * 512))
            # The storyboard panels are square while the game VFX slot is
            # intentionally wide.  Nearest-neighbour fitting preserves every
            # stage (including the expanding final pulse) without cropping.
            frame = panel.resize((96, 64), Image.Resampling.NEAREST)
            frame = hard_alpha(frame)
            frames.append(frame)
    return frames


def save_preview(frames: list[Image.Image]) -> None:
    # 4x sheet for pixel inspection.
    sheet4 = Image.new("RGBA", (96 * len(frames) * 4, 64 * 4), (8, 10, 15, 255))
    for i, frame in enumerate(frames):
        sheet4.alpha_composite(frame.resize((384, 256), Image.Resampling.NEAREST),
                                (i * 384, 0))
    sheet4.save(VFX / "meteor_warning_v3_4x.png")

    # 2x contact sheet with a dark cell behind each transparent frame.
    overview = Image.new("RGBA", (192 * 3, 128 * 2), (8, 10, 15, 255))
    draw = ImageDraw.Draw(overview)
    for i, frame in enumerate(frames):
        x = (i % 3) * 192
        y = (i // 3) * 128
        overview.alpha_composite(frame.resize((192, 128), Image.Resampling.NEAREST), (x, y))
        draw.rectangle((x + 4, y + 4, x + 20, y + 18), fill=(12, 16, 22, 230))
        draw.text((x + 8, y + 5), str(i + 1), fill=(220, 238, 232, 255))
    overview.save(VFX / "meteor_warning_v3_overview.png")

    # Actual-ground proportion preview, using the imminent-contact frame.
    grounds = [
        ("rust", ROOT / "assets" / "game" / "planets" / "rust_ground.png"),
        ("spore", ROOT / "assets" / "game" / "planets" / "spore_ground.png"),
        ("moon", ROOT / "assets" / "game" / "planets" / "moon_ground.png"),
    ]
    ground_preview = Image.new("RGBA", (256 * 3, 192), (8, 10, 15, 255))
    effect = frames[-1].resize((192, 128), Image.Resampling.NEAREST)
    for i, (_, path) in enumerate(grounds):
        if path.exists():
            ground = Image.open(path).convert("RGBA")
            ground = ground.resize((256, 192), Image.Resampling.NEAREST)
            ground_preview.alpha_composite(ground, (i * 256, 0))
        ground_preview.alpha_composite(effect, (i * 256 + 32, 32))
    ground_preview.save(VFX / "meteor_warning_v3_ground_preview.png")

    # Transition check: the final warning frame sits immediately beside the
    # first impact frame at the same inspection scale.
    transition = Image.new("RGBA", (384, 256), (8, 10, 15, 255))
    transition.alpha_composite(frames[-1].resize((192, 128), Image.Resampling.NEAREST), (0, 64))
    impact_path = ROOT / "assets" / "game" / "skills" / "gunner" / "vfx" / "meteor_impact" / "frame_00.png"
    if impact_path.exists():
        impact = Image.open(impact_path).convert("RGBA")
        transition.alpha_composite(impact.resize((192, 192), Image.Resampling.NEAREST), (192, 32))
    transition.save(VFX / "meteor_warning_v3_impact_transition.png")


def write_metadata(frames: list[Image.Image]) -> dict:
    metadata = {
        "id": "meteor_warning",
        "reviewId": "meteor_warning_v3",
        "assetType": "vfx",
        "event": "meteor_warning",
        "frameWidth": 96,
        "frameHeight": 64,
        "frameCount": len(frames),
        "fps": 12,
        "loop": True,
        "anchor": {"x": 48, "y": 32},
        "blendMode": "source-over",
        "sheet": SHEET_NAME,
        "frames": [f"frames/frame_{i:02d}.png" for i in range(len(frames))],
        "previewGif": "meteor_warning_v3.gif",
        "imageSmoothingEnabled": False,
        "sourceReviewId": "meteor_impact_v2",
        "transitionTarget": "meteor_impact/frame_00",
        "generationModel": "gpt-image-2",
        "generationProvider": "Codex image_gen",
        "alphaMethod": "chroma-key + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "visualNotes": "incoming meteor, ember trajectory, segmented landing scan, compact pre-impact core",
    }
    (VFX / "meteor_warning_v3.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def validate(frames: list[Image.Image], metadata: dict) -> dict:
    checks = []
    magenta_pixels = 0
    for i, frame in enumerate(frames):
        pixels = list(frame.getdata())
        alpha_values = {p[3] for p in pixels}
        border_alpha = []
        border_alpha.extend(frame.getpixel((x, 0))[3] for x in range(frame.width))
        border_alpha.extend(frame.getpixel((x, frame.height - 1))[3] for x in range(frame.width))
        border_alpha.extend(frame.getpixel((0, y))[3] for y in range(frame.height))
        border_alpha.extend(frame.getpixel((frame.width - 1, y))[3] for y in range(frame.height))
        magenta_pixels += sum(1 for r, g, b, a in pixels
                              if a and r > 180 and b > 160 and g < 120)
        checks.append({
            "frame": i,
            "size": list(frame.size),
            "mode": frame.mode,
            "alphaBinary": alpha_values <= {0, 255},
            "transparentCorners": all(frame.getpixel(p)[3] == 0
                                       for p in [(0, 0), (95, 0), (0, 63), (95, 63)]),
            "borderTransparent": not any(border_alpha),
            "hasOpaquePixels": any(p[3] == 255 for p in pixels),
        })
    passed = all(
        c["size"] == [96, 64] and c["mode"] == "RGBA" and
        c["alphaBinary"] and c["transparentCorners"] and
        c["borderTransparent"] and c["hasOpaquePixels"]
        for c in checks
    ) and magenta_pixels == 0 and metadata["frameCount"] == 6
    result = {
        "id": "meteor_warning",
        "reviewId": "meteor_warning_v3",
        "passed": passed,
        "frameChecks": checks,
        "magentaOpaquePixels": magenta_pixels,
        "sheetSize": [96 * len(frames), 64],
        "transitionTarget": "meteor_impact/frame_00",
        "notes": "Review-only asset; runtime files intentionally unchanged.",
    }
    (OUT / "v11_meteor_warning_validation.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return result


def main() -> None:
    FRAMES.mkdir(parents=True, exist_ok=True)
    frames = make_frames()
    for i, frame in enumerate(frames):
        frame.save(FRAMES / f"frame_{i:02d}.png")

    sheet = Image.new("RGBA", (96 * len(frames), 64), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * 96, 0))
    sheet.save(VFX / SHEET_NAME)

    gif_frames = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=96)
                  for frame in frames]
    gif_frames[0].save(
        VFX / "meteor_warning_v3.gif", save_all=True,
        append_images=gif_frames[1:], duration=1000 // 12,
        loop=0, disposal=2, transparency=0,
    )

    metadata = write_metadata(frames)
    save_preview(frames)
    result = validate(frames, metadata)

    manifest = {
        "id": "v11_meteor_warning_review",
        "source": "assets/concepts/v11_meteor_warning_review/vfx/meteor_warning_v3",
        "runtimeTarget": "assets/game/skills/gunner/vfx/meteor_warning",
        "generationModel": "gpt-image-2",
        "generationProvider": "Codex image_gen",
        "sourceReferences": [
            "assets/game/skills/gunner/vfx/meteor_impact/meteor_impact.png",
            "assets/game/skills/gunner/vfx/meteor_warning/meteor_warning.png",
            "user-provided meteor warning screenshot",
        ],
        "transition": {
            "warningLastFrame": "meteor_warning_v3/frame_05.png",
            "impactFirstFrame": "meteor_impact/frame_00.png",
            "sharedAnchor": {"x": 48, "y": 32},
        },
        "files": {
            "sheet": SHEET_NAME,
            "frames": [f"frames/frame_{i:02d}.png" for i in range(6)],
            "json": "meteor_warning_v3.json",
            "gif": "meteor_warning_v3.gif",
            "preview4x": "meteor_warning_v3_4x.png",
            "overview": "meteor_warning_v3_overview.png",
            "groundPreview": "meteor_warning_v3_ground_preview.png",
            "transitionPreview": "meteor_warning_v3_impact_transition.png",
        },
        "validation": result,
    }
    (OUT / "v11_meteor_warning_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    generation = {
        "model": "gpt-image-2",
        "provider": "Codex image_gen",
        "referenceAssets": manifest["sourceReferences"],
        "layout": "3x2 storyboard, read left-to-right then top-to-bottom",
        "chromaKey": "#ff00ff, removed with remove_chroma_key.py",
        "postProcess": ["hard alpha", "nearest-neighbor resize", "binary alpha validation"],
        "transitionTarget": "meteor_impact frame_00",
    }
    (OUT / "v11_meteor_warning_generation.json").write_text(
        json.dumps(generation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"output": str(VFX), "passed": result["passed"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
