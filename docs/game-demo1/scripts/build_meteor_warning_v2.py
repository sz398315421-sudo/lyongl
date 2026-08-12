"""Build the missing V7 meteor warning sheet without touching runtime files.

The warning is intentionally authored as a small, deterministic pixel effect:
an incoming trajectory, segmented landing scan and six changing countdown
segments.  It is later copied to the runtime meteor_warning slot.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v7_texture_review" / "vfx" / "meteor_warning_v2"
MANIFEST = ROOT / "assets" / "concepts" / "v7_texture_review" / "v7_texture_manifest.json"
VALIDATION = ROOT / "assets" / "concepts" / "v7_texture_review" / "v7_texture_validation.json"


def rgba(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def scrub(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for x in range(image.width):
        pixels[x, 0] = (*pixels[x, 0][:3], 0)
        pixels[x, image.height - 1] = (*pixels[x, image.height - 1][:3], 0)
    for y in range(image.height):
        pixels[0, y] = (*pixels[0, y][:3], 0)
        pixels[image.width - 1, y] = (*pixels[image.width - 1, y][:3], 0)
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0 and (r or g or b):
                pixels[x, y] = (0, 0, 0, 0)
    return image


def frame(index: int, count: int = 6) -> Image.Image:
    image = rgba(96, 64)
    draw = ImageDraw.Draw(image)
    cyan = (111, 229, 224, 255)
    orange = (255, 117, 67, 255)
    hot = (255, 198, 104, 255)
    dark = (77, 44, 42, 255)
    cx, cy = 48, 40

    # Incoming meteor trajectory: the head advances while the segmented tail
    # shortens, so the warning reads as a directional threat rather than a
    # static crosshair.
    head_x = 76 - index * 5
    head_y = 8 + index * 4
    for segment in range(4):
        x1 = head_x + 3 + segment * 5
        y1 = head_y - 1 - segment * 3
        x2 = x1 + 4
        y2 = y1 - 3
        draw.rectangle((x1, min(y1, y2), x2, max(y1, y2)), fill=orange if segment % 2 else hot)
    draw.polygon(
        [(head_x - 3, head_y - 4), (head_x + 5, head_y),
         (head_x + 1, head_y + 6), (head_x - 7, head_y + 2)],
        fill=dark,
    )
    draw.rectangle((head_x - 2, head_y - 2, head_x + 2, head_y + 2), fill=hot)

    # Four separated landing-scan brackets; no continuous ellipse or plus sign.
    sweep = int((index * 7) % 18)
    spans = [
        ((cx - 24, cy - 12, cx - 11 - sweep // 3, cy - 10), cyan),
        ((cx + 11 + sweep // 3, cy - 12, cx + 24, cy - 10), cyan),
        ((cx - 25, cy + 9, cx - 12 - sweep // 4, cy + 11), orange),
        ((cx + 12 + sweep // 4, cy + 9, cx + 25, cy + 11), orange),
    ]
    for box, color in spans:
        if box[0] < box[2]:
            draw.rectangle(box, fill=color)
    draw.rectangle((cx - 15, cy - 16, cx - 8, cy - 14), fill=cyan)
    draw.rectangle((cx + 8, cy - 16, cx + 15, cy - 14), fill=cyan)
    draw.rectangle((cx - 15, cy + 13, cx - 8, cy + 15), fill=orange)
    draw.rectangle((cx + 8, cy + 13, cx + 15, cy + 15), fill=orange)

    # A small segmented countdown bar at the bottom is readable at phone
    # scale and intentionally does not use any text glyphs.
    remaining = count - index
    for pip in range(count):
        x = 29 + pip * 7
        color = hot if pip < remaining else dark
        draw.rectangle((x, 56, x + 4, 58), fill=color)
    return scrub(image)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    frames = [frame(index) for index in range(6)]
    for index, image in enumerate(frames):
        image.save(OUT / f"frame_{index:02d}.png")
    sheet = rgba(96 * len(frames), 64)
    for index, image in enumerate(frames):
        sheet.alpha_composite(image, (index * 96, 0))
    sheet.save(OUT / "meteor_warning_v2.png")
    gif_frames = [image.convert("P", palette=Image.Palette.ADAPTIVE, colors=96) for image in frames]
    gif_frames[0].save(OUT / "meteor_warning_v2.gif", save_all=True,
                        append_images=gif_frames[1:], duration=1000 // 12,
                        loop=0, disposal=2)
    (OUT / "meteor_warning_v2.json").write_text(json.dumps({
        "id": "meteor_warning_v2",
        "assetType": "vfx",
        "event": "meteor_warning",
        "frameWidth": 96,
        "frameHeight": 64,
        "frameCount": 6,
        "fps": 12,
        "loop": True,
        "anchor": {"x": 48, "y": 32},
        "blendMode": "source-over",
        "sheet": "meteor_warning_v2.png",
        "imageSmoothingEnabled": False,
        "visualNotes": "trajectory, segmented landing scan, countdown pips"
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest.setdefault("vfx", [])
    manifest["vfx"] = [entry for entry in manifest["vfx"] if entry.get("id") != "meteor_warning_v2"]
    manifest["vfx"].append({
        "id": "meteor_warning_v2",
        "path": "assets/concepts/v7_texture_review/vfx/meteor_warning_v2/meteor_warning_v2.png"
    })
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    validation = json.loads(VALIDATION.read_text(encoding="utf-8"))
    validation["meteorWarningFrames"] = len(frames)
    validation["passed"] = bool(validation.get("passed", True))
    VALIDATION.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"path": str(OUT), "frameCount": len(frames)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
