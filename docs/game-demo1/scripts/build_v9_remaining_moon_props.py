#!/usr/bin/env python3
"""Build the six remaining GPT-Image 2 moon map props for the V9 review set."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image, ImageDraw

from build_v9_moon_props_review import (
    ROOT,
    TMP,
    REVIEW,
    OUT,
    RUNTIME,
    harden_alpha,
    save_nearest,
    panel_background,
    paste_checker,
    sha256,
)


SPECS = {
    "moon_shallow_crater": {
        "size": (64, 32), "anchor": {"x": 32, "y": 24}, "box": (56, 18),
        "sizeClass": "decal", "occupancyRadius": 10, "hasShadow": False,
        "prompt": "Create a single isolated shallow lunar crater ground decal on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching an established sci-fi moon map prop set, no anti-aliasing, no smooth edges, no gradients, no soft glow. An irregular low oval crater with a stepped graphite-gray rim, pale gray moon-dust interior, a few square chips and one or two tiny cold-cyan mineral glints. Flat decal seen from a slight top-down game view, centered with generous magenta margin. No text, UI, border, rectangular background, terrain tile, shadow outside the crater, stars, buildings, or extra objects, and no magenta inside the subject.",
    },
    "moon_regolith_chunk": {
        "size": (48, 48), "anchor": {"x": 24, "y": 40}, "box": (34, 30),
        "sizeClass": "small", "occupancyRadius": 16, "hasShadow": True,
        "prompt": "Create a single isolated small lunar regolith rubble prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching an established sci-fi moon map prop set, no anti-aliasing, no smooth edges, no gradients, no soft glow. Three to five compact irregular graphite and pale-gray moon-rock chunks with stepped silhouettes, a few cold-cyan mineral flecks, and a small hard-edged contact shadow underneath. One centered game-sprite object with generous magenta margin. No text, UI, terrain, crater, border, atmospheric background, or extra rocks scattered away from the main cluster, and no magenta inside the subject.",
    },
    "moon_antenna_fragment": {
        "size": (64, 96), "anchor": {"x": 32, "y": 88}, "box": (38, 84),
        "sizeClass": "medium", "occupancyRadius": 21, "hasShadow": True,
        "prompt": "Create a single isolated broken lunar antenna fragment prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching an established sci-fi moon map prop set, no anti-aliasing, no smooth edges, no gradients, no soft glow. A tilted snapped communications mast with a small angular dish or sensor loop, segmented graphite metal struts, pale-gray panel joints, one or two cold-cyan indicator pixels, and a compact base with a hard-edged contact shadow. Tall narrow object centered with generous magenta margin, designed for a 64x96 game sprite. No text, UI, cables extending beyond the object, terrain, stars, border, scene background, or extra symbols, and no magenta inside the subject.",
    },
    "moon_dust_ridge": {
        "size": (96, 48), "anchor": {"x": 48, "y": 40}, "box": (88, 24),
        "sizeClass": "decal", "occupancyRadius": 16, "hasShadow": False,
        "prompt": "Create a single isolated low lunar dust ridge ground decal on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching an established sci-fi moon map prop set, no anti-aliasing, no smooth edges, no gradients, no soft glow. A long low irregular stepped ridge of pale gray and graphite moon dust, gently broken into blocky layers, with a few tiny cold-cyan mineral specks embedded along the crest. Flat ground decal in a slight top-down view, wide and shallow, centered with generous magenta margin, designed for a 96x48 game sprite. No shadow, no crater, no terrain tile, no background, no text, no UI, no border, no extra objects, and no magenta inside the subject.",
    },
    "moon_lander_panel": {
        "size": (96, 64), "anchor": {"x": 48, "y": 56}, "box": (78, 42),
        "sizeClass": "large", "occupancyRadius": 21, "hasShadow": True,
        "prompt": "Create a single isolated broken lunar lander panel prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching an established sci-fi moon map prop set, no anti-aliasing, no smooth edges, no gradients, no soft glow. A small crashed landing-module panel lying at a slight angle: pale gray and graphite faceted armor plate, two short snapped struts, exposed dark underside, one or two cold-cyan power indicator pixels, and a compact hard-edged contact shadow. Wide low object centered with generous magenta margin, designed for a 96x64 game sprite. No text, UI, intact spacecraft, terrain, stars, border, scene background, or extra parts scattered away from the panel, and no magenta inside the subject.",
    },
    "moon_probe_wreck": {
        "size": (96, 64), "anchor": {"x": 48, "y": 56}, "box": (82, 44),
        "sizeClass": "large", "occupancyRadius": 21, "hasShadow": True,
        "prompt": "Create a single isolated crashed lunar probe wreck prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching an established sci-fi moon map prop set, no anti-aliasing, no smooth edges, no gradients, no soft glow. A compact damaged exploration probe chassis with a low graphite body, pale-gray angular panels, one broken sensor mast, a small cold-cyan lens or power node, exposed dark mechanical joints, and a compact hard-edged contact shadow. Wide centered game-sprite object with generous magenta margin, designed for a 96x64 sprite. No text, UI, intact rover, terrain, stars, border, scene background, or extra debris scattered away from the wreck, and no magenta inside the subject.",
    },
}


def build_sprite(source: Path, size: Tuple[int, int], box: Tuple[int, int], anchor: Dict[str, int]) -> Image.Image:
    image = harden_alpha(Image.open(source))
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError(f"no subject in {source}")
    cropped = image.crop(bbox)
    scale = min(box[0] / cropped.width, box[1] / cropped.height)
    new_size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    scaled = cropped.resize(new_size, Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - scaled.width) // 2
    y = anchor["y"] - scaled.height
    if x < 1 or y < 1 or x + scaled.width >= size[0] or y + scaled.height >= size[1]:
        raise RuntimeError(f"{source.name} would touch canvas: {new_size} at {(x, y)}")
    canvas.alpha_composite(scaled, (x, y))
    return harden_alpha(canvas)


def asset_meta(asset_id: str, spec: Dict) -> Dict:
    width, height = spec["size"]
    return {
        "id": asset_id,
        "planet": "moon",
        "assetType": "prop",
        "width": width,
        "height": height,
        "anchor": spec["anchor"],
        "sizeClass": spec["sizeClass"],
        "suggestedScale": [0.72, 1.15],
        "occupancyRadius": spec["occupancyRadius"],
        "weight": 1,
        "hasShadow": spec["hasShadow"],
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "sourceReference": f"assets/game/props/moon/{asset_id}.png",
        "alphaMethod": "chroma-key",
        "pixelization": "nearest-neighbor",
    }


def draw_labeled_asset(canvas: Image.Image, image: Image.Image, label: str, center: Tuple[int, int], scale: int) -> None:
    paste_checker(canvas, image, center, scale)
    ImageDraw.Draw(canvas).text((center[0] - min(65, len(label) * 3), center[1] + 60), label, fill=(181, 239, 243, 255))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = {}
    runtime_hashes = {}
    for asset_id, spec in SPECS.items():
        alpha_path = TMP / f"{asset_id}_alpha.png"
        if not alpha_path.exists():
            raise SystemExit(f"missing extraction output: {alpha_path}")
        image = build_sprite(alpha_path, spec["size"], spec["box"], spec["anchor"])
        path = OUT / f"{asset_id}.png"
        save_nearest(image, path)
        save_nearest(image, OUT / f"{asset_id}_4x.png", 4)
        (OUT / f"{asset_id}.json").write_text(json.dumps(asset_meta(asset_id, spec), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        outputs[asset_id] = str(path)
        runtime_path = RUNTIME / f"{asset_id}.png"
        runtime_hashes[asset_id] = sha256(runtime_path) if runtime_path.exists() else None

    # Six-asset overview on one common pixel-grid panel.
    overview = panel_background((768, 432))
    positions = {
        "moon_shallow_crater": ((128, 78), 4),
        "moon_regolith_chunk": ((384, 78), 4),
        "moon_antenna_fragment": ((640, 92), 2),
        "moon_dust_ridge": ((128, 270), 2),
        "moon_lander_panel": ((384, 270), 2),
        "moon_probe_wreck": ((640, 270), 2),
    }
    for asset_id, (center, scale) in positions.items():
        image = Image.open(OUT / f"{asset_id}.png").convert("RGBA")
        draw_labeled_asset(overview, image, asset_id.replace("moon_", ""), center, scale)
    ImageDraw.Draw(overview).text((20, 18), "MOON MAP PROPS // V9 REMAINING REVIEW", fill=(126, 232, 237, 255))
    overview.save(REVIEW / "moon_props_v9_remaining_overview.png", format="PNG", optimize=False)

    # A compact old/new comparison for the six assets.
    comparison = panel_background((960, 432))
    draw = ImageDraw.Draw(comparison)
    for index, asset_id in enumerate(SPECS):
        spec = SPECS[asset_id]
        old = Image.open(RUNTIME / f"{asset_id}.png").convert("RGBA")
        new = Image.open(OUT / f"{asset_id}.png").convert("RGBA")
        x0 = 80 + (index % 3) * 320
        y0 = 98 + (index // 3) * 170
        scale = 2 if max(spec["size"]) >= 64 else 3
        paste_checker(comparison, old, (x0, y0), scale)
        paste_checker(comparison, new, (x0 + 150, y0), scale)
        draw.text((x0 - 15, y0 + 60), "OLD", fill=(229, 239, 239, 255))
        draw.text((x0 + 135, y0 + 60), "NEW", fill=(229, 239, 239, 255))
        draw.text((x0 - 36, y0 + 84), asset_id.replace("moon_", ""), fill=(181, 239, 243, 255))
    draw.text((22, 18), "MOON MAP PROPS // OLD RUNTIME VS GPT-IMAGE 2", fill=(126, 232, 237, 255))
    comparison.save(REVIEW / "moon_props_v9_remaining_comparison.png", format="PNG", optimize=False)

    generation = {
        "package": "v9_moon_props_review",
        "batch": "remaining_moon_props",
        "provider": "codex",
        "quality": "medium",
        "modelArgument": None,
        "delegatedImageModel": "gpt-image-2",
        "cli": "scripts/gpt_image_2_skill.cjs",
        "generationCommand": "images generate --provider codex --quality medium --size 2K --format png (no --model)",
        "assets": {
            asset_id: {
                "prompt": spec["prompt"],
                "master": str(TMP / f"{asset_id}_master.png"),
                "extracted": str(TMP / f"{asset_id}_alpha.png"),
                "sourceReference": f"assets/game/props/moon/{asset_id}.png",
                "output": outputs[asset_id],
            }
            for asset_id, spec in SPECS.items()
        },
        "transparentExtraction": {"method": "chroma", "material": "sticker", "matteColor": "auto", "strict": True},
        "runtimeSourceSha256BeforeReview": runtime_hashes,
        "reviewOnly": True,
    }
    (REVIEW / "v9_moon_props_remaining_generation.json").write_text(json.dumps(generation, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "assets": list(SPECS), "review": str(REVIEW)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
