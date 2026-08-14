"""Verify the V15 perspective meteor assets installed in the runtime slots."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
MANIFEST = GAME / "v15_meteor_runtime_manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_png(path: Path, size: tuple[int, int]) -> list[str]:
    errors: list[str] = []
    with Image.open(path) as image:
        if image.mode != "RGBA" or image.size != size:
            errors.append(f"{path.name}: expected RGBA {size}, got {image.mode} {image.size}")
        rgba = image.convert("RGBA")
        alpha = list(rgba.getchannel("A").getdata())
        if any(value not in (0, 255) for value in alpha):
            errors.append(f"{path.name}: non-binary alpha")
        if rgba.getchannel("A").getbbox() is None:
            errors.append(f"{path.name}: empty alpha")
        edge = [rgba.getpixel((x, 0))[3] for x in range(rgba.width)]
        edge += [rgba.getpixel((x, rgba.height - 1))[3] for x in range(rgba.width)]
        edge += [rgba.getpixel((0, y))[3] for y in range(rgba.height)]
        edge += [rgba.getpixel((rgba.width - 1, y))[3] for y in range(rgba.height)]
        if any(edge):
            errors.append(f"{path.name}: alpha touches edge")
    return errors


def main() -> None:
    if not MANIFEST.exists():
        raise SystemExit(f"missing {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    errors: list[str] = []
    checked = []
    expected = {
        "meteor_warning": ((96, 64), 6, 12, True),
        "meteor_impact": ((128, 128), 10, 18, False),
    }
    for asset_id, (size, count, fps, loop) in expected.items():
        item = manifest.get("vfx", {}).get(asset_id, {})
        folder = GAME / "skills" / "gunner" / "vfx" / asset_id
        metadata_path = folder / f"{asset_id}.json"
        if item.get("sourceReviewId") not in {"meteor_warning_v8", "meteor_impact_v6"}:
            errors.append(f"{asset_id}: wrong V15 sourceReviewId {item.get('sourceReviewId')!r}")
        if not metadata_path.exists():
            errors.append(f"{asset_id}: missing runtime metadata")
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        for key, value in {"frameWidth": size[0], "frameHeight": size[1], "frameCount": count, "fps": fps, "loop": loop}.items():
            if metadata.get(key) != value:
                errors.append(f"{asset_id}: metadata {key} mismatch")
        sheet = folder / f"{asset_id}.png"
        gif = folder / f"{asset_id}.gif"
        errors.extend(check_png(sheet, (size[0] * count, size[1])))
        for index in range(count):
            errors.extend(check_png(folder / f"frame_{index:02d}.png", size))
        hashes = item.get("sha256", {})
        if hashes.get(rel(sheet)) != sha256(sheet):
            errors.append(f"{asset_id}: sheet hash mismatch")
        if hashes.get(rel(gif)) != sha256(gif):
            errors.append(f"{asset_id}: GIF hash mismatch")
        checked.append({"id": asset_id, "sourceReviewId": item.get("sourceReviewId"), "frameSize": list(size), "frameCount": count, "fps": fps, "loop": loop})
    result = {"id": "v15_meteor_perspective_runtime_validation", "passed": not errors, "manifest": rel(MANIFEST), "perspective": manifest.get("perspective"), "checked": checked, "errors": errors}
    output = GAME / "v15_meteor_runtime_validation.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


if __name__ == "__main__":
    main()
