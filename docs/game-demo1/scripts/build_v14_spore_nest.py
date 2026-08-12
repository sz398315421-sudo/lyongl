"""Build the review-only GPT-Image 2 spore nest idle animation."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v14_spore_nest_review"
RAW = OUT / "raw"
OBJ = OUT / "objects" / "spore_nest_v2"
SOURCE = RAW / "spore_nest_storyboard_alpha_v14.png"
GROUND = ROOT / "assets" / "game" / "planets" / "spore_ground.png"

FRAME_SIZE = (64, 64)
FRAME_COUNT = 4
FPS = 7


def hard_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            matte_like = r > 165 and b > 145 and g < 135 and abs(r - b) < 115
            if a < 160 or matte_like:
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


def crop_frames() -> list[Image.Image]:
    source = hard_alpha(Image.open(SOURCE))
    width, height = source.size
    frames: list[Image.Image] = []
    for row in range(2):
        y0, y1 = round(row * height / 2), round((row + 1) * height / 2)
        for col in range(2):
            x0, x1 = round(col * width / 2), round((col + 1) * width / 2)
            inset = max(3, min((x1 - x0) // 80, (y1 - y0) // 80))
            panel = source.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset))
            frames.append(hard_alpha(panel.resize(FRAME_SIZE, Image.Resampling.NEAREST)))
    if len(frames) != FRAME_COUNT:
        raise RuntimeError("Expected four nest frames")
    return frames


def save_sheet(frames: list[Image.Image]) -> None:
    sheet = Image.new("RGBA", (FRAME_SIZE[0] * FRAME_COUNT, FRAME_SIZE[1]), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * FRAME_SIZE[0], 0))
    sheet.save(OBJ / "spore_nest_v2.png")


def save_gif(frames: list[Image.Image], name: str, scale: int = 1) -> None:
    rendered = frames if scale == 1 else [frame.resize((64 * scale, 64 * scale), Image.Resampling.NEAREST) for frame in frames]
    palette = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for frame in rendered]
    palette[0].save(OBJ / name, save_all=True, append_images=palette[1:], duration=round(1000 / FPS),
                    loop=0, disposal=2, transparency=0, optimize=False)


def save_preview(frames: list[Image.Image]) -> None:
    scale = 4
    canvas = Image.new("RGBA", (64 * scale * 2, 64 * scale * 2), (8, 10, 16, 255))
    draw = ImageDraw.Draw(canvas)
    for index, frame in enumerate(frames):
        x, y = (index % 2) * 64 * scale, (index // 2) * 64 * scale
        canvas.alpha_composite(frame.resize((64 * scale, 64 * scale), Image.Resampling.NEAREST), (x, y))
        draw.rectangle((x + 8, y + 8, x + 48, y + 26), fill=(10, 14, 20, 230))
        draw.text((x + 14, y + 10), f"F{index + 1}", fill=(232, 244, 232, 255))
    canvas.save(OBJ / "spore_nest_v2_overview.png")

    checker = Image.new("RGBA", canvas.size, (15, 18, 24, 255))
    cdraw = ImageDraw.Draw(checker)
    tile = 16
    for yy in range(0, checker.height, tile):
        for xx in range(0, checker.width, tile):
            colour = (42, 46, 54, 255) if ((xx // tile + yy // tile) % 2 == 0) else (15, 18, 24, 255)
            cdraw.rectangle((xx, yy, xx + tile - 1, yy + tile - 1), fill=colour)
    for index, frame in enumerate(frames):
        x, y = (index % 2) * 64 * scale, (index // 2) * 64 * scale
        checker.alpha_composite(frame.resize((64 * scale, 64 * scale), Image.Resampling.NEAREST), (x, y))
    checker.save(OBJ / "spore_nest_v2_alpha_check.png")


def save_ground_preview(frames: list[Image.Image]) -> None:
    if not GROUND.exists():
        return
    ground = Image.open(GROUND).convert("RGBA").resize((256, 256), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (512, 256), (8, 10, 16, 255))
    for index, frame in enumerate((frames[0], frames[3])):
        canvas.alpha_composite(ground, (index * 256, 0))
        canvas.alpha_composite(frame.resize((128, 128), Image.Resampling.NEAREST), (index * 256 + 64, 70))
    canvas.save(OUT / "spore_nest_v14_ground_preview.png")


def check_frame(frame: Image.Image) -> dict:
    pixels = list(frame.getdata())
    alpha = {pixel[3] for pixel in pixels}
    border = [frame.getpixel((x, 0))[3] for x in range(64)]
    border += [frame.getpixel((x, 63))[3] for x in range(64)]
    border += [frame.getpixel((0, y))[3] for y in range(64)]
    border += [frame.getpixel((63, y))[3] for y in range(64)]
    magenta = sum(1 for r, g, b, a in pixels if a and r > 165 and b > 145 and g < 135 and abs(r - b) < 115)
    return {
        "size": list(frame.size),
        "mode": frame.mode,
        "alphaBinary": alpha <= {0, 255},
        "transparentCorners": all(frame.getpixel(p)[3] == 0 for p in [(0, 0), (63, 0), (0, 63), (63, 63)]),
        "transparentBorder": not any(border),
        "hasOpaquePixels": 255 in alpha,
        "magentaOpaquePixels": magenta,
        "nonTransparentPixels": sum(1 for pixel in pixels if pixel[3] > 0),
    }


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    OBJ.mkdir(parents=True, exist_ok=True)
    (OBJ / "frames").mkdir(parents=True, exist_ok=True)
    frames = crop_frames()
    for index, frame in enumerate(frames):
        frame.save(OBJ / "frames" / f"frame_{index:02d}.png")
    save_sheet(frames)
    save_gif(frames, "spore_nest_v2.gif")
    save_gif(frames, "spore_nest_v2_4x.gif", scale=4)
    save_preview(frames)
    save_ground_preview(frames)

    metadata = {
        "id": "spore_nest",
        "reviewId": "spore_nest_v2",
        "planet": "spore",
        "assetType": "mission-object",
        "state": "idle",
        "frameWidth": 64,
        "frameHeight": 64,
        "frameCount": FRAME_COUNT,
        "fps": FPS,
        "loop": True,
        "anchor": {"x": 32, "y": 56},
        "interactionRadius": 34,
        "blendMode": "source-over",
        "sheet": "spore_nest_v2.png",
        "frames": [f"frames/frame_{i:02d}.png" for i in range(FRAME_COUNT)],
        "previewGif": "spore_nest_v2.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "Codex CLI / Codex image_generation",
        "generationQuality": "medium",
        "sourceStoryboard": "raw/spore_nest_storyboard_magenta_v14.png",
        "alphaStoryboard": "raw/spore_nest_storyboard_alpha_v14.png",
        "alphaMethod": "chroma-key auto matte + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "runtimeChanged": False,
    }
    (OBJ / "spore_nest_v2.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    checks = [check_frame(frame) for frame in frames]
    sheet = Image.open(OBJ / "spore_nest_v2.png")
    gif = Image.open(OBJ / "spore_nest_v2.gif")
    validation = {
        "id": "v14_spore_nest_review",
        "passed": all(check["size"] == [64, 64] and check["mode"] == "RGBA" and check["alphaBinary"]
                       and check["transparentCorners"] and check["transparentBorder"] and check["hasOpaquePixels"]
                       and check["magentaOpaquePixels"] == 0 for check in checks)
                   and sheet.size == (256, 64) and sheet.mode == "RGBA" and getattr(gif, "n_frames", 1) == FRAME_COUNT,
        "asset": metadata,
        "frames": checks,
        "sheet": {"size": list(sheet.size), "mode": sheet.mode},
        "gif": {"frames": getattr(gif, "n_frames", 1), "loop": gif.info.get("loop", 0), "durationMs": gif.info.get("duration")},
        "notes": "Review-only. Runtime object rendering is intentionally unchanged.",
    }
    (OUT / "v14_spore_nest_validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "v14_spore_nest_generation.json").write_text(json.dumps({
        "model": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "operation": "images edit",
        "referenceImages": [
            "assets/game/objects/rust/rust_nest/rust_nest.png",
            "assets/game/planets/spore_ground.png",
        ],
        "storyboard": "raw/spore_nest_storyboard_magenta_v14.png",
        "layout": "2x2, four sequential idle frames",
        "output": metadata,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "v14_spore_nest_manifest.json").write_text(json.dumps({
        "id": "v14_spore_nest_review",
        "asset": "objects/spore_nest_v2",
        "files": {
            "gif": "objects/spore_nest_v2/spore_nest_v2.gif",
            "gif4x": "objects/spore_nest_v2/spore_nest_v2_4x.gif",
            "sheet": "objects/spore_nest_v2/spore_nest_v2.png",
            "overview": "objects/spore_nest_v2/spore_nest_v2_overview.png",
            "alphaCheck": "objects/spore_nest_v2/spore_nest_v2_alpha_check.png",
            "groundPreview": "spore_nest_v14_ground_preview.png",
        },
        "validation": "v14_spore_nest_validation.json",
        "runtimeChanged": False,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "passed": validation["passed"], "frames": FRAME_COUNT}, ensure_ascii=False))


if __name__ == "__main__":
    main()
