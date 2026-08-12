#!/usr/bin/env python3
"""Build the GPT-Image 2 moon prop review package.

The generated masters are intentionally kept outside assets/game.  This script
only performs local chroma cleanup, hard-alpha conversion, nearest-neighbour
pixelization, metadata generation, and review composites.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "tmp" / "imagegen" / "v9_moon_props"
REVIEW = ROOT / "assets" / "concepts" / "v9_moon_props_review"
OUT = REVIEW / "props" / "moon"
RUNTIME = ROOT / "assets" / "game" / "props" / "moon"

CRYSTAL_ID = "moon_crystal_cluster"
SEAM_ID = "moon_energy_seam"

CRYSTAL_PROMPT = (
    "Create a single isolated game asset on a completely flat solid pure magenta "
    "#ff00ff background for later chroma-key extraction. Hard-edged 8-bit pixel art, "
    "medium pixel density, no anti-aliasing, no smooth edges, no gradients, no soft glow. "
    "Centered moon crystal cluster: three to five irregular stepped cold-cyan crystal "
    "columns rising from a compact deep-graphite rocky base, blue-cyan bodies with "
    "pale-cyan block highlights, a few tiny moon-dust pixels and a small hard-edged "
    "contact shadow directly under the base. Keep the object within the middle 60 percent "
    "of the canvas with generous flat magenta margin on all sides. One object only, "
    "orthographic game-sprite presentation. Do not include text, UI, buildings, terrain, "
    "stars, atmospheric background, border, frame, extra symbols, or any magenta inside "
    "the object."
)

SEAM_PROMPT = (
    "Create a single isolated 64x32-style ground decal asset on a completely flat solid "
    "pure magenta #ff00ff background for later chroma-key extraction. Hard-edged 8-bit "
    "pixel art, medium pixel density, no anti-aliasing, no smooth edges, no gradients, "
    "no soft glow. One irregular dark blue-gray energy seam running mostly horizontally "
    "through the center, with two or three short branching cracks, a cold cyan energy "
    "core broken into segmented pixel lines, and only a few bright cyan nodes. The seam "
    "should be discontinuous and uneven, with crisp square pixel ends, centered with "
    "generous flat magenta margin. One decal only. No shadow, no floor texture, no "
    "rectangular plate, no border, no text, no UI, no scene background, no particles, "
    "no atmospheric effects, and no magenta inside the decal."
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def harden_alpha(image: Image.Image) -> Image.Image:
    """Remove matte-colored pixels and force a binary alpha channel."""
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            # The generated subject is cyan/graphite. Remove residual magenta
            # spill before quantizing alpha, including transparent RGB garbage.
            magenta = r > 145 and b > 115 and g < max(125, min(r, b) * 0.72)
            if magenta:
                pixels[x, y] = (0, 0, 0, 0)
            elif a >= 128:
                # Chroma extraction can leave a dark purple fringe around
                # opaque pixels. Moon props use graphite/cold-blue shadows,
                # so neutralize that spill without deleting the silhouette.
                if r > 70 and r > g * 1.35 and b > g * 1.2:
                    r = min(r, g + 12)
                pixels[x, y] = (r, g, b, 255)
            else:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def build_sprite(source: Path, size: Tuple[int, int], kind: str) -> Image.Image:
    image = harden_alpha(Image.open(source))
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError(f"no opaque subject found in {source}")
    cropped = image.crop(bbox)
    max_w, max_h = ((50, 50) if kind == "crystal" else (56, 20))
    scale = min(max_w / cropped.width, max_h / cropped.height)
    new_size = (
        max(1, int(round(cropped.width * scale))),
        max(1, int(round(cropped.height * scale))),
    )
    scaled = cropped.resize(new_size, Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - scaled.width) // 2
    if kind == "crystal":
        # Anchor y=56 is the ground contact point; the last occupied row is y=55.
        y = 56 - scaled.height
    else:
        y = (size[1] - scaled.height) // 2
    if x < 1 or y < 1 or x + scaled.width >= size[0] or y + scaled.height >= size[1]:
        raise RuntimeError(f"{kind} sprite would touch canvas edge: {new_size} at {(x, y)}")
    canvas.alpha_composite(scaled, (x, y))
    return harden_alpha(canvas)


def save_nearest(image: Image.Image, path: Path, factor: int = 1) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if factor == 1:
        image.save(path, format="PNG", optimize=False)
    else:
        image.resize((image.width * factor, image.height * factor), Image.Resampling.NEAREST).save(
            path, format="PNG", optimize=False
        )


def panel_background(size: Tuple[int, int]) -> Image.Image:
    canvas = Image.new("RGBA", size, (12, 19, 24, 255))
    draw = ImageDraw.Draw(canvas)
    for x in range(0, size[0], 8):
        draw.line((x, 0, x, size[1]), fill=(21, 35, 42, 255), width=1)
    for y in range(0, size[1], 8):
        draw.line((0, y, size[0], y), fill=(21, 35, 42, 255), width=1)
    return canvas


def paste_checker(canvas: Image.Image, image: Image.Image, center: Tuple[int, int], scale: int) -> None:
    shown = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    canvas.alpha_composite(shown, (center[0] - shown.width // 2, center[1] - shown.height // 2))


def metadata(asset_id: str, width: int, height: int, anchor: Dict[str, int], has_shadow: bool) -> Dict:
    return {
        "id": asset_id,
        "planet": "moon",
        "assetType": "prop",
        "width": width,
        "height": height,
        "anchor": anchor,
        "sizeClass": "medium" if asset_id == CRYSTAL_ID else "decal",
        "suggestedScale": [0.72, 1.15],
        "occupancyRadius": 21 if asset_id == CRYSTAL_ID else 10,
        "weight": 1,
        "hasShadow": has_shadow,
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "sourceReference": f"assets/game/props/moon/{asset_id}.png",
        "alphaMethod": "chroma-key",
        "pixelization": "nearest-neighbor",
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    crystal_source = TMP / "moon_crystal_cluster_alpha.png"
    seam_source = TMP / "moon_energy_seam_alpha.png"
    if not crystal_source.exists() or not seam_source.exists():
        raise SystemExit("transparent extraction outputs are missing")

    crystal = build_sprite(crystal_source, (64, 64), "crystal")
    seam = build_sprite(seam_source, (64, 32), "seam")
    crystal_path = OUT / f"{CRYSTAL_ID}.png"
    seam_path = OUT / f"{SEAM_ID}.png"
    save_nearest(crystal, crystal_path)
    save_nearest(seam, seam_path)
    save_nearest(crystal, OUT / f"{CRYSTAL_ID}_4x.png", 4)
    save_nearest(seam, OUT / f"{SEAM_ID}_4x.png", 4)

    crystal_meta = metadata(CRYSTAL_ID, 64, 64, {"x": 32, "y": 56}, True)
    seam_meta = metadata(SEAM_ID, 64, 32, {"x": 32, "y": 24}, False)
    (OUT / f"{CRYSTAL_ID}.json").write_text(json.dumps(crystal_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / f"{SEAM_ID}.json").write_text(json.dumps(seam_meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Overview: both new props on a restrained pixel-grid panel.
    overview = panel_background((512, 256))
    paste_checker(overview, crystal, (130, 126), 3)
    paste_checker(overview, seam, (380, 126), 5)
    ImageDraw.Draw(overview).text((42, 224), "MOON CRYSTAL / NEW", fill=(166, 244, 249, 255))
    ImageDraw.Draw(overview).text((316, 224), "ENERGY SEAM / NEW", fill=(166, 244, 249, 255))
    overview.save(REVIEW / "moon_props_v9_overview.png", format="PNG", optimize=False)

    # Comparison: old runtime and new review assets, enlarged with nearest-neighbour.
    comparison = panel_background((640, 304))
    draw = ImageDraw.Draw(comparison)
    old_crystal = Image.open(RUNTIME / f"{CRYSTAL_ID}.png").convert("RGBA")
    old_seam = Image.open(RUNTIME / f"{SEAM_ID}.png").convert("RGBA")
    for title, image, center in (
        ("OLD", old_crystal, (98, 104)),
        ("NEW", crystal, (226, 104)),
        ("OLD", old_seam, (424, 104)),
        ("NEW", seam, (552, 104)),
    ):
        scale = 2 if image.height >= 64 else 4
        paste_checker(comparison, image, center, scale)
        draw.text((center[0] - 15, 174), title, fill=(226, 244, 244, 255))
    draw.text((50, 18), "MOON PROPS V9 // OLD RUNTIME VS GPT-IMAGE 2 REVIEW", fill=(126, 232, 237, 255))
    draw.text((55, 228), "CRYSTAL", fill=(166, 244, 249, 255))
    draw.text((414, 228), "ENERGY SEAM", fill=(166, 244, 249, 255))
    comparison.save(REVIEW / "moon_props_v9_comparison.png", format="PNG", optimize=False)

    runtime_hashes = {}
    for asset_id in (CRYSTAL_ID, SEAM_ID):
        runtime_path = RUNTIME / f"{asset_id}.png"
        if runtime_path.exists():
            runtime_hashes[asset_id] = sha256(runtime_path)
    generation = {
        "package": "v9_moon_props_review",
        "provider": "codex",
        "quality": "medium",
        "modelArgument": None,
        "delegatedImageModel": "gpt-image-2",
        "cli": "scripts/gpt_image_2_skill.cjs",
        "generationCommand": "images generate --provider codex --quality medium --size 2K --format png (no --model)",
        "sourceReferences": {
            CRYSTAL_ID: f"assets/game/props/moon/{CRYSTAL_ID}.png",
            SEAM_ID: f"assets/game/props/moon/{SEAM_ID}.png",
        },
        "prompts": {CRYSTAL_ID: CRYSTAL_PROMPT, SEAM_ID: SEAM_PROMPT},
        "masters": {
            CRYSTAL_ID: str(TMP / "moon_crystal_cluster_master.png"),
            SEAM_ID: str(TMP / "moon_energy_seam_master.png"),
        },
        "transparentExtraction": {
            "method": "chroma",
            "material": "sticker",
            "matteColor": "auto",
            "strict": True,
            "outputs": {
                CRYSTAL_ID: str(crystal_source),
                SEAM_ID: str(seam_source),
            },
        },
        "runtimeSourceSha256BeforeReview": runtime_hashes,
        "outputs": {
            CRYSTAL_ID: str(crystal_path),
            SEAM_ID: str(seam_path),
        },
    }
    (REVIEW / "v9_moon_props_generation.json").write_text(
        json.dumps(generation, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({"ok": True, "output": str(REVIEW)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
