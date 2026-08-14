"""Verify the V17 warrior VFX installed in the runtime slots."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
MANIFEST = GAME / "v17_warrior_vfx_runtime_manifest.json"
EXPECTED = {
    "star_ring": ((96, 96), 8, 12, True, {"x": 48, "y": 48}),
    "slash_arc": ((64, 64), 5, 16, False, {"x": 32, "y": 32}),
    "sword_wave": ((96, 96), 8, 15, False, {"x": 48, "y": 48}),
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_png(path: Path, size: tuple[int, int], errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"missing {rel(path)}")
        return
    image = Image.open(path)
    if image.mode != "RGBA" or image.size != size:
        errors.append(f"{rel(path)} has {image.mode} {image.size}, expected RGBA {size}")
        return
    alpha = image.getchannel("A")
    if set(alpha.getdata()) - {0, 255}:
        errors.append(f"{rel(path)} has non-binary alpha")
    if alpha.getbbox() is None:
        errors.append(f"{rel(path)} is empty")
    edge = [alpha.getpixel((x, 0)) for x in range(image.width)]
    edge += [alpha.getpixel((x, image.height - 1)) for x in range(image.width)]
    edge += [alpha.getpixel((0, y)) for y in range(image.height)]
    edge += [alpha.getpixel((image.width - 1, y)) for y in range(image.height)]
    if any(edge):
        errors.append(f"{rel(path)} touches canvas edge")


def check_gif(path: Path, expected_count: int, errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"missing {rel(path)}")
        return
    image = Image.open(path)
    if int(getattr(image, "n_frames", 1)) != expected_count:
        errors.append(f"{rel(path)} frames={getattr(image, 'n_frames', 1)}, expected={expected_count}")
    if expected_count and image.info.get("loop") not in (0, None):
        errors.append(f"{rel(path)} has unexpected loop value {image.info.get('loop')}")


def main() -> None:
    errors: list[str] = []
    if not MANIFEST.exists():
        raise SystemExit(f"missing {rel(MANIFEST)}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    checked = []
    for asset_id, (size, count, fps, loop, anchor) in EXPECTED.items():
        item = manifest.get("vfx", {}).get(asset_id)
        if not item:
            errors.append(f"missing manifest entry {asset_id}")
            continue
        if item.get("sourceReviewId") != f"v17_{asset_id}":
            errors.append(f"{asset_id}: sourceReviewId mismatch")
        if (item.get("frameWidth"), item.get("frameHeight"), item.get("frameCount"), item.get("fps"), item.get("loop"), item.get("anchor")) != (size[0], size[1], count, fps, loop, anchor):
            errors.append(f"{asset_id}: timing/anchor metadata mismatch")
        folder = GAME / "skills" / "warrior" / "vfx" / asset_id
        sheet = folder / f"{asset_id}.png"
        check_png(sheet, (size[0] * count, size[1]), errors)
        for index in range(count):
            check_png(folder / f"frame_{index:02d}.png", size, errors)
        check_gif(folder / f"{asset_id}.gif", count, errors)
        for filename in (f"{asset_id}.json", f"{asset_id}_preview.png"):
            if not (folder / filename).exists():
                errors.append(f"{asset_id}: missing {filename}")
        for rel_file, expected_hash in (item.get("sha256") or {}).items():
            path = ROOT / rel_file
            if path.exists() and sha256(path) != expected_hash:
                errors.append(f"{asset_id}: hash mismatch {rel_file}")
        checked.append(asset_id)
    result = {"id": "v17_warrior_vfx_runtime_validation", "passed": not errors, "checked": checked, "errors": errors}
    (GAME / "v17_warrior_vfx_runtime_validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
