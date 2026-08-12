#!/usr/bin/env python3
"""Process V10 Rust Wasteland and Spore Swamp prop masters into review assets."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "tmp" / "imagegen" / "v10_planet_props"
REVIEW = ROOT / "assets" / "concepts" / "v10_planet_props_review"
OUT = REVIEW / "props"
RUST_OUT = OUT / "rust"
SPORE_OUT = OUT / "spore"
RUNTIME_RUST = ROOT / "assets" / "game" / "props" / "rust"
RUST_GROUND = ROOT / "assets" / "game" / "planets" / "rust_ground.png"
SPORE_GROUND = ROOT / "assets" / "game" / "planets" / "spore_ground.png"


SPECS: Dict[str, Dict] = {
    "rust_scrap_plate": {"id": "scrap_plate", "planet": "rust", "group": "objects", "size": (32, 32), "anchor": {"x": 16, "y": 28}, "sizeClass": "small", "occupancyRadius": 10, "hasShadow": True, "ref": "assets/game/props/rust/objects/scrap_plate.png"},
    "rust_cable_coil": {"id": "cable_coil", "planet": "rust", "group": "objects", "size": (32, 32), "anchor": {"x": 16, "y": 28}, "sizeClass": "small", "occupancyRadius": 10, "hasShadow": True, "ref": "assets/game/props/rust/objects/cable_coil.png"},
    "rust_pipe_junction": {"id": "pipe_junction", "planet": "rust", "group": "objects", "size": (64, 64), "anchor": {"x": 32, "y": 56}, "sizeClass": "medium", "occupancyRadius": 20, "hasShadow": True, "ref": "assets/game/props/rust/objects/pipe_junction.png"},
    "rust_power_pylon": {"id": "power_pylon", "planet": "rust", "group": "objects", "size": (64, 64), "anchor": {"x": 32, "y": 56}, "sizeClass": "medium", "occupancyRadius": 20, "hasShadow": True, "ref": "assets/game/props/rust/objects/power_pylon.png"},
    "rust_scorch_mark": {"id": "scorch_mark", "planet": "rust", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False, "ref": "assets/game/props/rust/decals/scorch_mark.png"},
    "rust_oil_stain": {"id": "oil_stain", "planet": "rust", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False, "ref": "assets/game/props/rust/decals/oil_stain.png"},
    "rust_metal_seam": {"id": "metal_seam", "planet": "rust", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False, "ref": "assets/game/props/rust/decals/metal_seam.png"},
    "rust_cable_run": {"id": "cable_run", "planet": "rust", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False, "ref": "assets/game/props/rust/decals/cable_run.png"},
    "spore_spore_pod_cluster": {"id": "spore_pod_cluster", "planet": "spore", "group": "objects", "size": (32, 32), "anchor": {"x": 16, "y": 28}, "sizeClass": "small", "occupancyRadius": 10, "hasShadow": True},
    "spore_mycelium_stump": {"id": "mycelium_stump", "planet": "spore", "group": "objects", "size": (32, 32), "anchor": {"x": 16, "y": 28}, "sizeClass": "small", "occupancyRadius": 10, "hasShadow": True},
    "spore_fungal_mound": {"id": "fungal_mound", "planet": "spore", "group": "objects", "size": (64, 64), "anchor": {"x": 32, "y": 56}, "sizeClass": "medium", "occupancyRadius": 20, "hasShadow": True},
    "spore_husk_remains": {"id": "husk_remains", "planet": "spore", "group": "objects", "size": (64, 64), "anchor": {"x": 32, "y": 56}, "sizeClass": "medium", "occupancyRadius": 20, "hasShadow": True},
    "spore_spore_pool_decal": {"id": "spore_pool_decal", "planet": "spore", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False},
    "spore_mycelium_rift": {"id": "mycelium_rift", "planet": "spore", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False},
    "spore_acid_stain": {"id": "acid_stain", "planet": "spore", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False},
    "spore_root_trail": {"id": "root_trail", "planet": "spore", "group": "decals", "size": (64, 64), "anchor": {"x": 32, "y": 32}, "sizeClass": "decal", "occupancyRadius": 0, "hasShadow": False},
}

SPORE_PROMPTS = {
    "spore_spore_pod_cluster": "Create a single isolated alien spore pod cluster game prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching the established Spore Swamp map style: three to five low bulbous pods with deep violet skin, dark green seams, tiny acid-lime bioluminescent pores and a compact hard-edged contact shadow. One centered 32x32-style object with generous magenta margin. No text, UI, scene, terrain, border, gradient, soft glow, or extra objects, and no magenta inside the subject.",
    "spore_mycelium_stump": "Create a single isolated alien mycelium stump game prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching the established Spore Swamp map style: short stepped fungal stalk, dark green-black base, layered purple cap, a few acid-lime spore dots and a compact hard-edged contact shadow. One centered 32x32-style object with generous magenta margin. No text, UI, scene, terrain, border, gradient, soft glow, or extra objects, and no magenta inside the subject.",
    "spore_fungal_mound": "Create a single isolated broad fungal mound game prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching the established Spore Swamp map style: layered dark green organic mound, violet mycelium shelves, purple contour blocks, small acid-lime luminous pores and a compact hard-edged contact shadow. One centered 64x64-style object with generous magenta margin. No text, UI, scene, terrain, border, gradient, soft glow, or extra objects, and no magenta inside the subject.",
    "spore_husk_remains": "Create a single isolated alien husk remains game prop on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged medium-detail 8-bit pixel art matching the established Spore Swamp map style: collapsed insectoid shell plates, dark olive and violet organic armor, a few purple fungal threads, tiny acid-lime residue pixels and a compact hard-edged contact shadow. One centered 64x64-style object with generous magenta margin. No text, UI, scene, terrain, border, gradient, soft glow, or extra objects, and no magenta inside the subject.",
    "spore_spore_pool_decal": "Create a single isolated alien spore pool ground decal on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged 8-bit pixel art matching the established Spore Swamp surface: irregular dark purple pool, deep green inner islands, a few acid-lime bubbles and broken violet rim pixels. Flat decal only, centered in a 64x64-style canvas. No cast shadow, no scene, no terrain tile, no border, no text, no gradient, no soft glow, and no magenta inside the decal.",
    "spore_mycelium_rift": "Create a single isolated branching mycelium rift ground decal on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged 8-bit pixel art matching the established Spore Swamp surface: dark green-black organic fissure, branching violet mycelium edges and a few dim acid-lime nodes. Flat decal only, centered in a 64x64-style canvas. No cast shadow, no scene, no terrain tile, no border, no text, no gradient, no soft glow, and no magenta inside the decal.",
    "spore_acid_stain": "Create a single isolated acidic corrosion stain ground decal on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged 8-bit pixel art matching the established Spore Swamp surface: uneven dark violet and olive stain, broken acid-lime edge pixels, tiny bubbles and sparse cyan-green glints. Flat decal only, centered in a 64x64-style canvas. No cast shadow, no scene, no terrain tile, no border, no text, no gradient, no soft glow, and no magenta inside the decal.",
    "spore_root_trail": "Create a single isolated branching alien root trail ground decal on a completely flat solid pure magenta #ff00ff background for later chroma-key extraction. Hard-edged 8-bit pixel art matching the established Spore Swamp surface: several irregular dark green root lines, violet mycelium tips, a few dim acid-lime nodes and broken square ends. Flat decal only, centered in a 64x64-style canvas. No cast shadow, no scene, no terrain tile, no border, no text, no gradient, no soft glow, and no magenta inside the decal.",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def hard_alpha(image: Image.Image) -> Image.Image:
    image = image.convert('RGBA')
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            magenta = r > 145 and b > 115 and g < max(125, min(r, b) * 0.72)
            if magenta or a < 128:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)
    return image


def build_sprite(source: Path, spec: Dict) -> Image.Image:
    image = hard_alpha(Image.open(source))
    bbox = image.getchannel('A').getbbox()
    if not bbox:
        raise RuntimeError(f'empty extracted image: {source}')
    cropped = image.crop(bbox)
    w, h = spec['size']
    max_w, max_h = ((26, 24) if spec['sizeClass'] == 'small' else (52, 50) if spec['sizeClass'] == 'medium' else (56, 56))
    scale = min(max_w / cropped.width, max_h / cropped.height)
    new_size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    scaled = cropped.resize(new_size, Image.Resampling.NEAREST)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = (w - scaled.width) // 2
    if spec['sizeClass'] == 'decal':
        y = (h - scaled.height) // 2
    else:
        y = spec['anchor']['y'] - scaled.height
    if x < 1 or y < 1 or x + scaled.width >= w or y + scaled.height >= h:
        raise RuntimeError(f'canvas touch risk for {spec["id"]}: {new_size} at {(x, y)}')
    canvas.alpha_composite(scaled, (x, y))
    return hard_alpha(canvas)


def save_png(image: Image.Image, path: Path, factor: int = 1) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if factor == 1:
        image.save(path, format='PNG', optimize=False)
    else:
        image.resize((image.width * factor, image.height * factor), Image.Resampling.NEAREST).save(path, format='PNG', optimize=False)


def metadata(spec: Dict) -> Dict:
    return {
        'id': spec['id'], 'planet': spec['planet'], 'assetType': 'prop',
        'width': spec['size'][0], 'height': spec['size'][1], 'anchor': spec['anchor'],
        'sizeClass': spec['sizeClass'], 'suggestedScale': [0.72, 1.15],
        'occupancyRadius': spec['occupancyRadius'], 'weight': 1, 'hasShadow': spec['hasShadow'],
        'imageSmoothingEnabled': False, 'generationModel': 'gpt-image-2',
        'sourceReference': spec.get('ref') or 'assets/game/planets/spore_ground.png',
        'alphaMethod': 'chroma-key', 'pixelization': 'nearest-neighbor',
    }


def backdrop(size: Tuple[int, int], ground_path: Path) -> Image.Image:
    ground = Image.open(ground_path).convert('RGBA').resize(size, Image.Resampling.NEAREST)
    overlay = Image.new('RGBA', size, (5, 10, 12, 70))
    ground.alpha_composite(overlay)
    return ground


def paste_sprite(canvas: Image.Image, image: Image.Image, x: int, y: int, scale: int = 2) -> None:
    shown = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    canvas.alpha_composite(shown, (x - shown.width // 2, y - shown.height // 2))


def main() -> None:
    for d in (RUST_OUT / 'objects', RUST_OUT / 'decals', SPORE_OUT / 'objects', SPORE_OUT / 'decals'):
        d.mkdir(parents=True, exist_ok=True)
    output_records = {}
    for key, spec in SPECS.items():
        alpha = TMP / f'{key}_alpha.png'
        if not alpha.exists():
            raise SystemExit(f'missing extracted alpha: {alpha}')
        image = build_sprite(alpha, spec)
        dest_dir = (RUST_OUT if spec['planet'] == 'rust' else SPORE_OUT) / spec['group']
        out = dest_dir / f'{spec["id"]}.png'
        save_png(image, out)
        save_png(image, dest_dir / f'{spec["id"]}_4x.png', 4)
        (dest_dir / f'{spec["id"]}.json').write_text(json.dumps(metadata(spec), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        output_records[key] = {'output': str(out), 'spec': spec}

    # Rust old/new review on the existing Rust ground tile.
    rust_review = backdrop((960, 560), RUST_GROUND)
    draw = ImageDraw.Draw(rust_review)
    rust_keys = [k for k, s in SPECS.items() if s['planet'] == 'rust']
    for index, key in enumerate(rust_keys):
        spec = SPECS[key]
        old = Image.open(RUNTIME_RUST / spec['group'] / f'{spec["id"]}.png').convert('RGBA')
        new = Image.open(output_records[key]['output']).convert('RGBA')
        col = index % 4
        row = index // 4
        cx = 120 + col * 240
        cy = 180 + row * 220
        paste_sprite(rust_review, old, cx - 50, cy, 2)
        paste_sprite(rust_review, new, cx + 50, cy, 2)
        draw.text((cx - 80, cy + 70), 'OLD', fill=(240, 230, 210, 255))
        draw.text((cx + 30, cy + 70), 'NEW', fill=(240, 230, 210, 255))
        draw.text((cx - 100, cy + 94), spec['id'], fill=(245, 170, 105, 255))
    draw.text((20, 18), 'RUST WASTELAND // OLD VS V10 GPT-IMAGE 2', fill=(255, 175, 90, 255))
    rust_review.save(REVIEW / 'v10_rust_props_comparison.png', format='PNG', optimize=False)

    # Spore overview and actual-scale preview.
    spore_review = backdrop((960, 560), SPORE_GROUND)
    draw = ImageDraw.Draw(spore_review)
    spore_keys = [k for k, s in SPECS.items() if s['planet'] == 'spore']
    for index, key in enumerate(spore_keys):
        image = Image.open(output_records[key]['output']).convert('RGBA')
        col = index % 4
        row = index // 4
        cx = 120 + col * 240
        cy = 180 + row * 220
        paste_sprite(spore_review, image, cx, cy, 2)
        draw.text((cx - 75, cy + 72), SPECS[key]['id'], fill=(190, 239, 170, 255))
    draw.text((20, 18), 'SPORE SWAMP // V10 GPT-IMAGE 2 PROPS', fill=(210, 160, 250, 255))
    spore_review.save(REVIEW / 'v10_spore_props_overview.png', format='PNG', optimize=False)

    combined = Image.new('RGBA', (1200, 760), (8, 13, 16, 255))
    rust_panel = backdrop((580, 330), RUST_GROUND)
    spore_panel = backdrop((580, 330), SPORE_GROUND)
    small_positions = [(100, 110), (250, 110), (400, 110), (520, 110), (100, 250), (250, 250), (400, 250), (520, 250)]
    for idx, key in enumerate(rust_keys):
        paste_sprite(rust_panel, Image.open(output_records[key]['output']).convert('RGBA'), *small_positions[idx], 1)
    for idx, key in enumerate(spore_keys):
        paste_sprite(spore_panel, Image.open(output_records[key]['output']).convert('RGBA'), *small_positions[idx], 1)
    combined.alpha_composite(rust_panel, (10, 80))
    combined.alpha_composite(spore_panel, (610, 80))
    draw = ImageDraw.Draw(combined)
    draw.text((26, 24), 'RUST WASTELAND', fill=(255, 175, 90, 255))
    draw.text((626, 24), 'SPORE SWAMP', fill=(210, 160, 250, 255))
    combined.save(REVIEW / 'v10_planet_props_overview.png', format='PNG', optimize=False)

    manifest = {
        'package': 'v10_planet_props_review', 'reviewOnly': True,
        'provider': 'codex', 'generationModel': 'gpt-image-2', 'quality': 'medium', 'modelArgument': None,
        'assets': {key: metadata(spec) for key, spec in SPECS.items()},
        'outputRoot': str(OUT), 'runtimeReplacementPerformed': False,
    }
    (REVIEW / 'v10_planet_props_manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    generation = {
        'package': 'v10_planet_props_review', 'provider': 'codex', 'quality': 'medium', 'modelArgument': None,
        'delegatedImageModel': 'gpt-image-2', 'cli': 'scripts/gpt_image_2_skill.cjs',
        'generationCommand': 'images edit/generate --provider codex --quality medium --size 2K --format png (no --model)',
        'assets': {key: {'master': str(TMP / f'{key}_master.png'), 'extracted': str(TMP / f'{key}_alpha.png'), 'sourceReference': spec.get('ref') or 'assets/game/planets/spore_ground.png'} for key, spec in SPECS.items()},
        'transparentExtraction': {'method': 'chroma', 'material': 'sticker', 'matteColor': 'auto', 'strict': True},
        'runtimeRustHashesBeforeReview': {spec['id']: sha256(RUNTIME_RUST / spec['group'] / f'{spec["id"]}.png') for spec in SPECS.values() if spec['planet'] == 'rust'},
        'reviewOnly': True,
    }
    (REVIEW / 'v10_planet_props_generation.json').write_text(json.dumps(generation, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'ok': True, 'assetCount': len(SPECS), 'review': str(REVIEW)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
