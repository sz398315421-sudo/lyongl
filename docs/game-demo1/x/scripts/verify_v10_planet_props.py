#!/usr/bin/env python3
"""Strict validation for the V10 review-only planet prop package."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'assets' / 'concepts' / 'v10_planet_props_review'
OUT = REVIEW / 'props'
RUST_RUNTIME = ROOT / 'assets' / 'game' / 'props' / 'rust'

SPECS = {
    'rust_scrap_plate': ('rust', 'objects', 'scrap_plate', (32, 32), {'x': 16, 'y': 28}, True),
    'rust_cable_coil': ('rust', 'objects', 'cable_coil', (32, 32), {'x': 16, 'y': 28}, True),
    'rust_pipe_junction': ('rust', 'objects', 'pipe_junction', (64, 64), {'x': 32, 'y': 56}, True),
    'rust_power_pylon': ('rust', 'objects', 'power_pylon', (64, 64), {'x': 32, 'y': 56}, True),
    'rust_scorch_mark': ('rust', 'decals', 'scorch_mark', (64, 64), {'x': 32, 'y': 32}, False),
    'rust_oil_stain': ('rust', 'decals', 'oil_stain', (64, 64), {'x': 32, 'y': 32}, False),
    'rust_metal_seam': ('rust', 'decals', 'metal_seam', (64, 64), {'x': 32, 'y': 32}, False),
    'rust_cable_run': ('rust', 'decals', 'cable_run', (64, 64), {'x': 32, 'y': 32}, False),
    'spore_spore_pod_cluster': ('spore', 'objects', 'spore_pod_cluster', (32, 32), {'x': 16, 'y': 28}, True),
    'spore_mycelium_stump': ('spore', 'objects', 'mycelium_stump', (32, 32), {'x': 16, 'y': 28}, True),
    'spore_fungal_mound': ('spore', 'objects', 'fungal_mound', (64, 64), {'x': 32, 'y': 56}, True),
    'spore_husk_remains': ('spore', 'objects', 'husk_remains', (64, 64), {'x': 32, 'y': 56}, True),
    'spore_spore_pool_decal': ('spore', 'decals', 'spore_pool_decal', (64, 64), {'x': 32, 'y': 32}, False),
    'spore_mycelium_rift': ('spore', 'decals', 'mycelium_rift', (64, 64), {'x': 32, 'y': 32}, False),
    'spore_acid_stain': ('spore', 'decals', 'acid_stain', (64, 64), {'x': 32, 'y': 32}, False),
    'spore_root_trail': ('spore', 'decals', 'root_trail', (64, 64), {'x': 32, 'y': 32}, False),
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def validate_image(path: Path, size, has_shadow) -> Dict:
    r = {'path': str(path), 'passed': False, 'errors': []}
    if not path.exists():
        r['errors'].append('missing')
        return r
    im = Image.open(path)
    r.update({'size': [im.width, im.height], 'mode': im.mode})
    if im.mode != 'RGBA': r['errors'].append('not RGBA')
    if im.size != size: r['errors'].append('wrong size')
    alpha = im.getchannel('A')
    values = set(alpha.getdata())
    r['alphaValues'] = sorted(values)
    if not values.issubset({0, 255}): r['errors'].append('partial alpha')
    bbox = alpha.getbbox()
    r['bbox'] = list(bbox) if bbox else None
    if not bbox: r['errors'].append('empty')
    elif bbox[0] == 0 or bbox[1] == 0 or bbox[2] == im.width or bbox[3] == im.height: r['errors'].append('canvas touch')
    magenta = 0
    transparent_rgb = 0
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            rr, gg, bb, aa = px[x, y]
            if aa == 0 and (rr or gg or bb): transparent_rgb += 1
            if aa and rr > 145 and bb > 115 and gg < max(125, min(rr, bb) * 0.72): magenta += 1
    r['magentaPixels'] = magenta
    r['transparentRgbPixels'] = transparent_rgb
    if magenta: r['errors'].append('magenta residue')
    if transparent_rgb: r['errors'].append('transparent RGB residue')
    r['hasShadowExpected'] = has_shadow
    r['sha256'] = sha256(path)
    r['passed'] = not r['errors']
    return r


def validate_preview(source: Path, preview: Path) -> Dict:
    r = {'path': str(preview), 'passed': False, 'errors': []}
    if not source.exists() or not preview.exists():
        r['errors'].append('missing source or preview')
        return r
    src = Image.open(source).convert('RGBA')
    actual = Image.open(preview).convert('RGBA')
    expected = src.resize((src.width * 4, src.height * 4), Image.Resampling.NEAREST)
    if actual.size != expected.size: r['errors'].append('wrong preview size')
    elif actual.tobytes() != expected.tobytes(): r['errors'].append('not nearest-neighbor identical')
    r['passed'] = not r['errors']
    return r


def main() -> None:
    checks = []
    for key, (planet, group, asset_id, size, anchor, has_shadow) in SPECS.items():
        base = OUT / planet / group
        image = base / f'{asset_id}.png'
        checks.append({'asset': key, 'kind': 'png', **validate_image(image, size, has_shadow)})
        checks.append({'asset': key, 'kind': 'preview', **validate_preview(image, base / f'{asset_id}_4x.png')})
        meta_path = base / f'{asset_id}.json'
        meta_result = {'asset': key, 'kind': 'json', 'path': str(meta_path), 'passed': False, 'errors': []}
        if not meta_path.exists():
            meta_result['errors'].append('missing')
        else:
            data = json.loads(meta_path.read_text(encoding='utf-8'))
            expected = {'id': asset_id, 'planet': planet, 'width': size[0], 'height': size[1], 'anchor': anchor, 'imageSmoothingEnabled': False, 'generationModel': 'gpt-image-2', 'alphaMethod': 'chroma-key', 'pixelization': 'nearest-neighbor'}
            for field, value in expected.items():
                if data.get(field) != value: meta_result['errors'].append(f'{field} mismatch')
            meta_result['passed'] = not meta_result['errors']
        checks.append(meta_result)

    generation_path = REVIEW / 'v10_planet_props_generation.json'
    generation = json.loads(generation_path.read_text(encoding='utf-8')) if generation_path.exists() else {}
    runtime = {}
    for _, (planet, group, asset_id, *_rest) in SPECS.items():
        if planet != 'rust': continue
        path = RUST_RUNTIME / group / f'{asset_id}.png'
        before = generation.get('runtimeRustHashesBeforeReview', {}).get(asset_id)
        after = sha256(path) if path.exists() else None
        runtime[asset_id] = {'before': before, 'after': after, 'unchanged': bool(before and before == after)}
    passed = all(c.get('passed', False) for c in checks) and all(v['unchanged'] for v in runtime.values())
    report = {'package': 'v10_planet_props_review', 'passed': passed, 'assetCount': len(SPECS), 'checks': checks, 'rustRuntimeUnchanged': runtime, 'reviewOnly': True, 'runtimeReplacementPerformed': False}
    output = REVIEW / 'v10_planet_props_validation.json'
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=False))
    raise SystemExit(0 if passed else 1)


if __name__ == '__main__':
    main()
