from __future__ import annotations

"""Verify the normalized V16 combo VFX runtime installation."""

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "assets" / "game" / "skills"
MANIFEST_PATH = ROOT / "assets" / "game" / "v16_combo_runtime_manifest.json"
JOBS = {
    "piercing_star_burst": ("gunner", 96, 96, 8, 16, False),
    "hunt_barrage_lock": ("gunner", 64, 64, 8, 12, False),
    "zero_storm_burst": ("gunner", 128, 128, 8, 15, False),
    "sword_wave": ("warrior", 96, 96, 8, 15, False),
    "star_ring": ("warrior", 96, 96, 8, 12, True),
    "phantom_counter": ("warrior", 96, 96, 8, 15, False),
    "swarm_protocol": ("mechanic", 96, 96, 8, 15, False),
    "mobile_fortress": ("mechanic", 96, 96, 8, 12, True),
    "recycle_burst": ("mechanic", 128, 128, 8, 15, False),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_png(path: Path, size: tuple[int, int], errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"missing {path.relative_to(ROOT)}")
        return
    image = Image.open(path).convert("RGBA")
    if image.size != size:
        errors.append(f"{path.relative_to(ROOT)} size {image.size}, expected {size}")
    alpha = list(image.getchannel("A").getdata())
    if any(value not in (0, 255) for value in alpha):
        errors.append(f"{path.relative_to(ROOT)} has non-binary alpha")
    if image.getchannel("A").getbbox() is None:
        errors.append(f"{path.relative_to(ROOT)} is empty")


def main() -> None:
    errors: list[str] = []
    if not MANIFEST_PATH.exists():
        errors.append("missing assets/game/v16_combo_runtime_manifest.json")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.exists() else {}
    installed = {entry.get("id"): entry for entry in manifest.get("assets", [])}
    if set(installed) != set(JOBS):
        errors.append(f"manifest assets {sorted(installed)}, expected {sorted(JOBS)}")
    for asset_id, (role, width, height, count, fps, loop) in JOBS.items():
        folder = RUNTIME / role / "vfx" / asset_id
        metadata_path = folder / f"{asset_id}.json"
        if not metadata_path.exists():
            errors.append(f"missing {metadata_path.relative_to(ROOT)}")
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        for key, expected in {"frameWidth": width, "frameHeight": height, "frameCount": count, "fps": fps, "loop": loop}.items():
            if metadata.get(key) != expected:
                errors.append(f"{asset_id} {key}={metadata.get(key)!r}, expected {expected!r}")
        check_png(folder / f"{asset_id}.png", (width * count, height), errors)
        for index in range(count):
            check_png(folder / f"frame_{index:02d}.png", (width, height), errors)
        gif_path = folder / f"{asset_id}.gif"
        if not gif_path.exists():
            errors.append(f"missing {gif_path.relative_to(ROOT)}")
        else:
            gif = Image.open(gif_path)
            if int(getattr(gif, "n_frames", 1)) != count:
                errors.append(f"{asset_id} GIF frames {getattr(gif, 'n_frames', 1)}, expected {count}")
        entry = installed.get(asset_id, {})
        hashes = entry.get("hashes", {})
        for name in (f"{asset_id}.png", f"{asset_id}.json", f"{asset_id}.gif"):
            path = folder / name
            if path.exists() and hashes.get(name) and hashes[name] != sha256(path):
                errors.append(f"{asset_id} hash mismatch for {name}")
    report = {"passed": not errors, "assetCount": len(JOBS), "errors": errors}
    out = ROOT / "assets" / "game" / "v16_combo_runtime_validation.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
