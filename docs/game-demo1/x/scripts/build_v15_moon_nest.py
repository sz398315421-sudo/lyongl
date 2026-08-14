"""Build the review-only GPT-Image 2 moon-nest idle animation."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v15_moon_nest_review"
RAW = OUT / "raw"
OBJ = OUT / "objects" / "moon_nest_v2"
SOURCE = RAW / "moon_nest_storyboard_alpha_v15.png"
GROUND = ROOT / "assets" / "game" / "planets" / "moon_ground.png"

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
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
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
    return frames


def save_sheet(frames: list[Image.Image]) -> None:
    sheet = Image.new("RGBA", (256, 64), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 64, 0))
    sheet.save(OBJ / "moon_nest_v2.png")


def save_gif(frames: list[Image.Image], filename: str, scale: int = 1) -> None:
    rendered = frames if scale == 1 else [frame.resize((64 * scale, 64 * scale), Image.Resampling.NEAREST) for frame in frames]
    palette = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for frame in rendered]
    palette[0].save(OBJ / filename, save_all=True, append_images=palette[1:], duration=round(1000 / FPS),
                    loop=0, disposal=2, transparency=0, optimize=False)


def save_previews(frames: list[Image.Image]) -> None:
    scale = 4
    overview = Image.new("RGBA", (512, 512), (8, 10, 16, 255))
    draw = ImageDraw.Draw(overview)
    for index, frame in enumerate(frames):
        x, y = (index % 2) * 256, (index // 2) * 256
        overview.alpha_composite(frame.resize((256, 256), Image.Resampling.NEAREST), (x, y))
        draw.rectangle((x + 8, y + 8, x + 48, y + 26), fill=(10, 14, 20, 230))
        draw.text((x + 14, y + 10), f"F{index + 1}", fill=(228, 244, 248, 255))
    overview.save(OBJ / "moon_nest_v2_overview.png")

    check = Image.new("RGBA", overview.size, (15, 18, 24, 255))
    checker = ImageDraw.Draw(check)
    tile = 16
    for y in range(0, check.height, tile):
        for x in range(0, check.width, tile):
            colour = (42, 46, 54, 255) if ((x // tile + y // tile) % 2 == 0) else (15, 18, 24, 255)
            checker.rectangle((x, y, x + tile - 1, y + tile - 1), fill=colour)
    for index, frame in enumerate(frames):
        x, y = (index % 2) * 256, (index // 2) * 256
        check.alpha_composite(frame.resize((256, 256), Image.Resampling.NEAREST), (x, y))
    check.save(OBJ / "moon_nest_v2_alpha_check.png")

    if GROUND.exists():
        ground = Image.open(GROUND).convert("RGBA").resize((256, 256), Image.Resampling.NEAREST)
        canvas = Image.new("RGBA", (512, 256), (8, 10, 16, 255))
        for index, frame in enumerate((frames[0], frames[3])):
            canvas.alpha_composite(ground, (index * 256, 0))
            canvas.alpha_composite(frame.resize((128, 128), Image.Resampling.NEAREST), (index * 256 + 64, 70))
        canvas.save(OUT / "moon_nest_v15_ground_preview.png")


def check(frame: Image.Image) -> dict:
    pixels = list(frame.getdata())
    alpha = {pixel[3] for pixel in pixels}
    border = [frame.getpixel((x, 0))[3] for x in range(64)] + [frame.getpixel((x, 63))[3] for x in range(64)]
    border += [frame.getpixel((0, y))[3] for y in range(64)] + [frame.getpixel((63, y))[3] for y in range(64)]
    magenta = sum(1 for r, g, b, a in pixels if a and r > 165 and b > 145 and g < 135 and abs(r - b) < 115)
    return {"size": list(frame.size), "mode": frame.mode, "alphaBinary": alpha <= {0, 255},
            "transparentCorners": all(frame.getpixel(point)[3] == 0 for point in [(0, 0), (63, 0), (0, 63), (63, 63)]),
            "transparentBorder": not any(border), "hasOpaquePixels": 255 in alpha,
            "magentaOpaquePixels": magenta, "nonTransparentPixels": sum(1 for pixel in pixels if pixel[3] > 0)}


def main() -> None:
    OBJ.mkdir(parents=True, exist_ok=True)
    (OBJ / "frames").mkdir(parents=True, exist_ok=True)
    frames = crop_frames()
    for index, frame in enumerate(frames):
        frame.save(OBJ / "frames" / f"frame_{index:02d}.png")
    save_sheet(frames)
    save_gif(frames, "moon_nest_v2.gif")
    save_gif(frames, "moon_nest_v2_4x.gif", scale=4)
    save_previews(frames)
    metadata = {
        "id": "moon_nest", "reviewId": "moon_nest_v2", "planet": "moon", "assetType": "mission-object", "state": "idle",
        "frameWidth": 64, "frameHeight": 64, "frameCount": 4, "fps": FPS, "loop": True,
        "anchor": {"x": 32, "y": 56}, "interactionRadius": 34, "blendMode": "source-over",
        "sheet": "moon_nest_v2.png", "frames": [f"frames/frame_{i:02d}.png" for i in range(4)],
        "previewGif": "moon_nest_v2.gif", "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2", "generationProvider": "Codex CLI / Codex image_generation", "generationQuality": "medium",
        "sourceStoryboard": "raw/moon_nest_storyboard_magenta_v15.png", "alphaStoryboard": "raw/moon_nest_storyboard_alpha_v15.png",
        "alphaMethod": "chroma-key auto matte + hard-alpha threshold", "pixelization": "nearest-neighbor", "runtimeChanged": False,
    }
    (OBJ / "moon_nest_v2.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    checks = [check(frame) for frame in frames]
    sheet = Image.open(OBJ / "moon_nest_v2.png")
    gif = Image.open(OBJ / "moon_nest_v2.gif")
    validation = {
        "id": "v15_moon_nest_review",
        "passed": all(c["size"] == [64, 64] and c["mode"] == "RGBA" and c["alphaBinary"] and c["transparentCorners"]
                       and c["transparentBorder"] and c["hasOpaquePixels"] and c["magentaOpaquePixels"] == 0 for c in checks)
                   and sheet.size == (256, 64) and sheet.mode == "RGBA" and getattr(gif, "n_frames", 1) == 4,
        "asset": metadata, "frames": checks, "sheet": {"size": list(sheet.size), "mode": sheet.mode},
        "gif": {"frames": getattr(gif, "n_frames", 1), "loop": gif.info.get("loop", 0), "durationMs": gif.info.get("duration")},
        "notes": "Review-only. Runtime object rendering is intentionally unchanged.",
    }
    (OUT / "v15_moon_nest_validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "v15_moon_nest_generation.json").write_text(json.dumps({
        "model": "gpt-image-2", "provider": "codex", "quality": "medium", "operation": "images edit",
        "referenceImages": ["assets/game/planets/moon/moon_cover.png", "assets/game/planets/moon_ground.png"],
        "storyboard": "raw/moon_nest_storyboard_magenta_v15.png", "layout": "2x2, four sequential idle frames", "output": metadata,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT / "v15_moon_nest_manifest.json").write_text(json.dumps({
        "id": "v15_moon_nest_review", "asset": "objects/moon_nest_v2",
        "files": {"gif": "objects/moon_nest_v2/moon_nest_v2.gif", "gif4x": "objects/moon_nest_v2/moon_nest_v2_4x.gif",
                  "sheet": "objects/moon_nest_v2/moon_nest_v2.png", "overview": "objects/moon_nest_v2/moon_nest_v2_overview.png",
                  "alphaCheck": "objects/moon_nest_v2/moon_nest_v2_alpha_check.png", "groundPreview": "moon_nest_v15_ground_preview.png"},
        "validation": "v15_moon_nest_validation.json", "runtimeChanged": False,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "passed": validation["passed"], "frames": 4}, ensure_ascii=False))


if __name__ == "__main__":
    main()
