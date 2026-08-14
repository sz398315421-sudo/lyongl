"""Build and install the V8 moon planet mark using the rust planet's pixel grammar.

The 32px icon is the single source of truth.  The 128px briefing cover is a
nearest-neighbour upscale so both runtime variants have identical silhouettes,
hard alpha and pixel density.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
REVIEW = ROOT / "assets" / "concepts" / "v8_moon_style_review" / "planets" / "moon"
BACKUP_ROOT = ROOT / "assets" / "concepts" / "v8_moon_style_backup"
RUNTIME = GAME / "planets" / "moon"
DIRECTIONS = ["front", "right", "back", "left"]


def hard_rgba(size: tuple[int, int]) -> Image.Image:
    return Image.new("RGBA", size, (0, 0, 0, 0))


def make_moon_icon() -> Image.Image:
    """Create a 32px stepped planet with rust-icon proportions and moon colors."""
    rust_icon = Image.open(GAME / "ui" / "icons" / "planet_rust.png").convert("RGBA")
    mask = rust_icon.getchannel("A")
    image = hard_rgba((32, 32))
    ink = (13, 18, 21, 255)
    base = (78, 91, 95, 255)
    mid = (94, 108, 110, 255)
    light = (151, 168, 164, 255)
    crater = (36, 46, 50, 255)
    crater_mid = (58, 70, 73, 255)
    cyan = (83, 219, 211, 255)
    cyan_hi = (170, 255, 243, 255)

    # Reuse the rust planet's exact hard-alpha silhouette. This keeps the
    # outline, stepped corners and occupied area identical across ecosystems.
    outer = Image.new("RGBA", (32, 32), ink)
    outer.putalpha(mask)
    image.alpha_composite(outer)
    inner_mask = mask.filter(ImageFilter.MinFilter(3))
    body = Image.new("RGBA", (32, 32), base)
    body.putalpha(inner_mask)
    image.alpha_composite(body)

    texture = hard_rgba((32, 32))
    draw = ImageDraw.Draw(texture)

    # Blocky crater clusters; each cluster has a dark pocket and one lit rim.
    draw.rectangle((7, 7, 12, 11), fill=crater_mid)
    draw.rectangle((8, 8, 11, 10), fill=crater)
    draw.rectangle((7, 7, 10, 7), fill=light)
    draw.rectangle((19, 6, 24, 9), fill=mid)
    draw.rectangle((20, 7, 23, 9), fill=crater)
    draw.rectangle((19, 6, 22, 6), fill=light)
    draw.rectangle((12, 13, 18, 17), fill=crater_mid)
    draw.rectangle((13, 14, 17, 16), fill=crater)
    draw.rectangle((12, 13, 15, 13), fill=mid)
    draw.rectangle((23, 16, 28, 21), fill=crater)
    draw.rectangle((24, 16, 27, 17), fill=crater_mid)
    draw.rectangle((6, 21, 10, 24), fill=mid)
    draw.rectangle((7, 22, 10, 24), fill=crater)
    draw.rectangle((16, 23, 21, 27), fill=crater_mid)
    draw.rectangle((17, 24, 20, 26), fill=crater)

    # Small cold energy seam, intentionally sparse like the rust planet's
    # orange surface flecks rather than a large glowing band.
    for box in ((7, 18, 9, 19), (10, 18, 12, 19), (13, 17, 15, 18),
                (16, 17, 18, 18), (19, 16, 21, 17)):
        draw.rectangle(box, fill=cyan)
    draw.rectangle((22, 8, 24, 10), fill=cyan_hi)
    draw.rectangle((5, 22, 7, 24), fill=cyan_hi)

    texture.putalpha(ImageChops.multiply(texture.getchannel("A"), mask))
    image.alpha_composite(texture)

    # Enforce hard alpha and transparent corners.
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a:
                pixels[x, y] = (r, g, b, 255)
    for x, y in ((0, 0), (31, 0), (0, 31), (31, 31)):
        pixels[x, y] = (0, 0, 0, 0)
    return image


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def build_review() -> dict:
    REVIEW.mkdir(parents=True, exist_ok=True)
    icon = make_moon_icon()
    cover = icon.resize((128, 128), Image.Resampling.NEAREST)
    icon.save(REVIEW / "planet_moon.png")
    cover.save(REVIEW / "moon_cover.png")
    cover.resize((512, 512), Image.Resampling.NEAREST).save(REVIEW / "moon_cover_4x.png")
    write_json(REVIEW / "planet_moon.json", {
        "id": "planet_moon",
        "assetType": "planet_mark",
        "width": 32,
        "height": 32,
        "anchor": {"x": 16, "y": 16},
        "planet": "moon",
        "styleReference": "assets/game/ui/icons/planet_rust.png",
        "imageSmoothingEnabled": False,
    })
    write_json(REVIEW / "moon_cover.json", {
        "id": "moon_cover",
        "assetType": "planet_cover",
        "width": 128,
        "height": 128,
        "anchor": {"x": 64, "y": 64},
        "planet": "moon",
        "derivedFrom": "planet_moon.png",
        "scale": "nearest-neighbor 4x",
        "styleReference": "assets/game/ui/icons/planet_rust.png",
        "imageSmoothingEnabled": False,
    })
    return {
        "icon": rel(REVIEW / "planet_moon.png"),
        "cover": rel(REVIEW / "moon_cover.png"),
        "iconSha256": sha256(REVIEW / "planet_moon.png"),
        "coverSha256": sha256(REVIEW / "moon_cover.png"),
    }


def install_runtime(review: dict) -> dict:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = BACKUP_ROOT / timestamp / "planets" / "moon"
    if RUNTIME.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(RUNTIME, backup)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    for name in ("planet_moon.png", "planet_moon.json", "moon_cover.png", "moon_cover.json"):
        shutil.copy2(REVIEW / name, RUNTIME / name)

    manifest = {
        "version": 8,
        "sourceReview": "assets/concepts/v8_moon_style_review/planets/moon",
        "backup": rel(backup),
        "styleReference": "assets/game/ui/icons/planet_rust.png",
        "pixelMethod": "32px source + nearest-neighbor 4x cover",
        "planet": "moon",
        "icon": {"path": rel(RUNTIME / "planet_moon.png"), "width": 32, "height": 32, "anchor": {"x": 16, "y": 16}, "sha256": sha256(RUNTIME / "planet_moon.png")},
        "cover": {"path": rel(RUNTIME / "moon_cover.png"), "width": 128, "height": 128, "anchor": {"x": 64, "y": 64}, "sha256": sha256(RUNTIME / "moon_cover.png")},
    }
    write_json(GAME / "v8_moon_style_manifest.json", manifest)

    v7_path = GAME / "v7_runtime_manifest.json"
    if v7_path.exists():
        v7 = json.loads(v7_path.read_text(encoding="utf-8"))
        v7["planetMoon"] = {
            "icon": rel(RUNTIME / "planet_moon.png"),
            "cover": rel(RUNTIME / "moon_cover.png"),
            "sourceReview": manifest["sourceReview"],
            "styleReference": manifest["styleReference"],
        }
        v7["v8MoonStyle"] = {"manifest": rel(GAME / "v8_moon_style_manifest.json"), "backup": rel(backup)}
        v7_path.write_text(json.dumps(v7, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"backup": rel(backup), "manifest": rel(GAME / "v8_moon_style_manifest.json"), "review": review}


def main() -> None:
    review = build_review()
    result = install_runtime(review)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
