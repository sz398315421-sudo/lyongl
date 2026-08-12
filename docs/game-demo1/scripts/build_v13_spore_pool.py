"""Build the review-only V13 spore eruption animation.

The GPT-Image 2 storyboard is kept as a raw source.  This script performs the
deterministic chroma cleanup, nearest-neighbour fitting, previews and strict
validation.  It intentionally writes only below assets/concepts/v13_* and
never changes assets/game or runtime code.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v13_spore_burst_review"
RAW = OUT / "raw"
VFX = OUT / "vfx" / "spore_pool_v2"
SOURCE = RAW / "spore_pool_storyboard_alpha_v13.png"
GROUND = ROOT / "assets" / "game" / "planets" / "spore_ground.png"

FRAME_SIZE = (96, 96)
FRAME_COUNT = 6
FPS = 10


def hard_alpha(image: Image.Image) -> Image.Image:
    """Remove matte spill and make the effect a crisp binary-alpha sprite."""

    image = image.convert("RGBA")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            # The source matte is pink/magenta.  Keep the deep purple subject,
            # but remove pink edge spill and any faint extraction fringe.
            matte_like = r > 165 and b > 145 and g < 135 and abs(r - b) < 115
            if a < 160 or matte_like:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)

    # A transparent safety margin is required by the runtime effect renderer.
    for x in range(image.width):
        px[x, 0] = (0, 0, 0, 0)
        px[x, image.height - 1] = (0, 0, 0, 0)
    for y in range(image.height):
        px[0, y] = (0, 0, 0, 0)
        px[image.width - 1, y] = (0, 0, 0, 0)
    return image


def crop_frames() -> list[Image.Image]:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing extracted storyboard: {SOURCE}")
    source = hard_alpha(Image.open(SOURCE))
    width, height = source.size
    frames: list[Image.Image] = []
    # GPT-Image 2 returned a 3x2 sheet.  Use proportional boundaries so this
    # also remains robust if the service returns a nearby 3:2 resolution.
    for row in range(2):
        y0, y1 = round(row * height / 2), round((row + 1) * height / 2)
        for col in range(3):
            x0, x1 = round(col * width / 3), round((col + 1) * width / 3)
            inset = max(2, min((x1 - x0) // 80, (y1 - y0) // 80))
            panel = source.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset))
            frame = panel.resize(FRAME_SIZE, Image.Resampling.NEAREST)
            frames.append(hard_alpha(frame))
    if len(frames) != FRAME_COUNT:
        raise RuntimeError(f"Expected {FRAME_COUNT} frames, got {len(frames)}")
    return frames


def save_sheet(frames: list[Image.Image], path: Path) -> None:
    sheet = Image.new("RGBA", (FRAME_SIZE[0] * len(frames), FRAME_SIZE[1]), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * FRAME_SIZE[0], 0))
    sheet.save(path)


def save_gif(frames: list[Image.Image], path: Path, scale: int = 1) -> None:
    rendered = frames
    if scale != 1:
        rendered = [frame.resize((frame.width * scale, frame.height * scale), Image.Resampling.NEAREST)
                    for frame in frames]
    palette = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128)
               for frame in rendered]
    # Keep a deliberate loop for the contamination pool.  Disposal 2 avoids
    # frame trails when viewed over map textures.
    palette[0].save(path, save_all=True, append_images=palette[1:], duration=100,
                    loop=0, disposal=2, transparency=0, optimize=False)


def save_overview(frames: list[Image.Image], path: Path) -> None:
    scale = 3
    cell_w, cell_h = FRAME_SIZE[0] * scale, FRAME_SIZE[1] * scale
    canvas = Image.new("RGBA", (cell_w * 3, cell_h * 2), (8, 10, 16, 255))
    draw = ImageDraw.Draw(canvas)
    for i, frame in enumerate(frames):
        x, y = (i % 3) * cell_w, (i // 3) * cell_h
        canvas.alpha_composite(frame.resize((cell_w, cell_h), Image.Resampling.NEAREST), (x, y))
        draw.rectangle((x + 6, y + 6, x + 54, y + 24), fill=(10, 14, 20, 230))
        draw.text((x + 12, y + 8), f"F{i + 1}", fill=(228, 244, 232, 255))
    canvas.save(path)


def save_alpha_check(frames: list[Image.Image], path: Path) -> None:
    scale = 4
    canvas = Image.new("RGBA", (FRAME_SIZE[0] * scale * 3, FRAME_SIZE[1] * scale * 2), (8, 10, 16, 255))
    tile = 8
    for y in range(0, canvas.height, tile):
        for x in range(0, canvas.width, tile):
            colour = (42, 46, 54, 255) if ((x // tile + y // tile) % 2 == 0) else (15, 18, 24, 255)
            ImageDraw.Draw(canvas).rectangle((x, y, x + tile - 1, y + tile - 1), fill=colour)
    for i, frame in enumerate(frames):
        x, y = (i % 3) * FRAME_SIZE[0] * scale, (i // 3) * FRAME_SIZE[1] * scale
        canvas.alpha_composite(frame.resize((FRAME_SIZE[0] * scale, FRAME_SIZE[1] * scale), Image.Resampling.NEAREST), (x, y))
    canvas.save(path)


def save_ground_preview(frames: list[Image.Image]) -> None:
    if not GROUND.exists():
        return
    ground = Image.open(GROUND).convert("RGBA").resize((256, 256), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (768, 256), (8, 10, 16, 255))
    for i, frame in enumerate((frames[0], frames[3], frames[4])):
        canvas.alpha_composite(ground, (i * 256, 0))
        canvas.alpha_composite(frame.resize((192, 192), Image.Resampling.NEAREST), (i * 256 + 32, 32))
    canvas.save(OUT / "spore_pool_v13_ground_preview.png")


def frame_check(frame: Image.Image) -> dict:
    pixels = list(frame.getdata())
    alpha = {p[3] for p in pixels}
    border = []
    border.extend(frame.getpixel((x, 0))[3] for x in range(frame.width))
    border.extend(frame.getpixel((x, frame.height - 1))[3] for x in range(frame.width))
    border.extend(frame.getpixel((0, y))[3] for y in range(frame.height))
    border.extend(frame.getpixel((frame.width - 1, y))[3] for y in range(frame.height))
    magenta = sum(1 for r, g, b, a in pixels
                  if a and r > 165 and b > 145 and g < 135 and abs(r - b) < 115)
    return {
        "size": list(frame.size),
        "mode": frame.mode,
        "alphaBinary": alpha <= {0, 255},
        "transparentCorners": all(frame.getpixel(point)[3] == 0 for point in [(0, 0), (95, 0), (0, 95), (95, 95)]),
        "transparentBorder": not any(border),
        "hasOpaquePixels": 255 in alpha,
        "magentaOpaquePixels": magenta,
        "nonTransparentPixels": sum(1 for p in pixels if p[3] > 0),
    }


def build(frames: list[Image.Image]) -> dict:
    VFX.mkdir(parents=True, exist_ok=True)
    frames_dir = VFX / "frames"
    frames_dir.mkdir(exist_ok=True)
    for i, frame in enumerate(frames):
        frame.save(frames_dir / f"frame_{i:02d}.png")
    save_sheet(frames, VFX / "spore_pool_v2.png")
    save_gif(frames, VFX / "spore_pool_v2.gif")
    save_gif(frames, VFX / "spore_pool_v2_4x.gif", scale=4)
    save_overview(frames, VFX / "spore_pool_v2_overview.png")
    save_alpha_check(frames, VFX / "spore_pool_v2_alpha_check.png")
    save_ground_preview(frames)

    metadata = {
        "id": "spore_pool",
        "reviewId": "spore_pool_v2",
        "assetType": "vfx",
        "planet": "spore",
        "frameWidth": 96,
        "frameHeight": 96,
        "frameCount": FRAME_COUNT,
        "fps": FPS,
        "loop": True,
        "anchor": {"x": 48, "y": 48},
        "blendMode": "lighter",
        "sheet": "spore_pool_v2.png",
        "frames": [f"frames/frame_{i:02d}.png" for i in range(FRAME_COUNT)],
        "previewGif": "spore_pool_v2.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "Codex CLI / Codex image_generation",
        "generationQuality": "medium",
        "sourceStoryboard": "raw/spore_pool_storyboard_magenta_v13.png",
        "alphaStoryboard": "raw/spore_pool_storyboard_alpha_v13.png",
        "alphaMethod": "chroma-key auto matte + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "runtimeChanged": False,
    }
    (VFX / "spore_pool_v2.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "v13_spore_burst_generation.json").write_text(json.dumps({
        "model": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "operation": "images edit",
        "referenceImages": [
            "assets/game/enemies/vfx/spore/spore_pool/spore_pool.png",
            "assets/game/planets/spore_ground.png",
        ],
        "storyboard": "raw/spore_pool_storyboard_magenta_v13.png",
        "layout": "3x2, six sequential frames, left-to-right then top-to-bottom",
        "output": metadata,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    checks = [frame_check(frame) for frame in frames]
    sheet = Image.open(VFX / "spore_pool_v2.png")
    gif = Image.open(VFX / "spore_pool_v2.gif")
    validation = {
        "id": "v13_spore_burst_review",
        "passed": (
            all(c["size"] == [96, 96] and c["mode"] == "RGBA" and c["alphaBinary"]
                and c["transparentCorners"] and c["transparentBorder"]
                and c["hasOpaquePixels"] and c["magentaOpaquePixels"] == 0 for c in checks)
            and sheet.size == (576, 96)
            and sheet.mode == "RGBA"
            and getattr(gif, "n_frames", 1) == FRAME_COUNT
        ),
        "asset": metadata,
        "frames": checks,
        "sheet": {"size": list(sheet.size), "mode": sheet.mode},
        "gif": {"frames": getattr(gif, "n_frames", 1), "loop": gif.info.get("loop", 0), "durationMs": gif.info.get("duration")},
        "notes": "Review-only. Runtime assets and source code intentionally unchanged.",
    }
    (OUT / "v13_spore_burst_validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "v13_spore_burst_manifest.json").write_text(json.dumps({
        "id": "v13_spore_burst_review",
        "sourceReview": "GPT-Image 2 redraw of the existing spore_pool effect",
        "asset": "vfx/spore_pool_v2",
        "files": {
            "gif": "vfx/spore_pool_v2/spore_pool_v2.gif",
            "gif4x": "vfx/spore_pool_v2/spore_pool_v2_4x.gif",
            "sheet": "vfx/spore_pool_v2/spore_pool_v2.png",
            "overview": "vfx/spore_pool_v2/spore_pool_v2_overview.png",
            "alphaCheck": "vfx/spore_pool_v2/spore_pool_v2_alpha_check.png",
            "groundPreview": "spore_pool_v13_ground_preview.png",
        },
        "validation": "v13_spore_burst_validation.json",
        "runtimeChanged": False,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return validation


def main() -> None:
    validation = build(crop_frames())
    print(json.dumps({"output": str(OUT), "passed": validation["passed"], "frames": FRAME_COUNT}, ensure_ascii=False))


if __name__ == "__main__":
    main()
