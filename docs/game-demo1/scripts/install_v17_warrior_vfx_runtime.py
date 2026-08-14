"""Install the reviewed V17 warrior VFX into the runtime slots.

The installer is deliberately transactional: every source sheet and frame is
validated before an existing runtime directory is touched.  Existing runtime
pixels are copied to a timestamped review backup so a visual regression can be
rolled back without relying on source control.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v17_warrior_vfx_review" / "vfx"
GAME = ROOT / "assets" / "game"
RUNTIME = GAME / "skills" / "warrior" / "vfx"
BACKUP_ROOT = ROOT / "assets" / "concepts" / "v17_runtime_backup"

SPECS = {
    "star_ring": {"size": (96, 96), "count": 8, "fps": 12, "loop": True, "anchor": {"x": 48, "y": 48}},
    "slash_arc": {"size": (64, 64), "count": 5, "fps": 16, "loop": False, "anchor": {"x": 32, "y": 32}},
    "sword_wave": {"size": (96, 96), "count": 8, "fps": 15, "loop": False, "anchor": {"x": 48, "y": 48}},
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_source(asset_id: str, spec: dict) -> dict:
    folder = REVIEW / asset_id
    metadata_path = folder / f"{asset_id}.json"
    sheet_path = folder / f"{asset_id}.png"
    gif_path = folder / f"{asset_id}.gif"
    errors: list[str] = []
    if not metadata_path.exists() or not sheet_path.exists() or not gif_path.exists():
        errors.append(f"{asset_id}: source metadata/sheet/gif missing")
        return {"errors": errors}
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    for key, expected in {
        "frameWidth": spec["size"][0],
        "frameHeight": spec["size"][1],
        "frameCount": spec["count"],
        "fps": spec["fps"],
        "loop": spec["loop"],
        "anchor": spec["anchor"],
    }.items():
        if metadata.get(key) != expected:
            errors.append(f"{asset_id}: metadata {key} mismatch")
    try:
        sheet = Image.open(sheet_path).convert("RGBA")
        if sheet.size != (spec["size"][0] * spec["count"], spec["size"][1]):
            errors.append(f"{asset_id}: sheet size {sheet.size}")
        for index in range(spec["count"]):
            frame_path = folder / "frames" / f"frame_{index:02d}.png"
            if not frame_path.exists():
                errors.append(f"{asset_id}: missing frame {index:02d}")
                continue
            frame = Image.open(frame_path)
            if frame.mode != "RGBA" or frame.size != spec["size"]:
                errors.append(f"{asset_id}: frame {index:02d} has {frame.mode} {frame.size}")
            alpha = frame.convert("RGBA").getchannel("A")
            if set(alpha.getdata()) - {0, 255}:
                errors.append(f"{asset_id}: frame {index:02d} has non-binary alpha")
            if alpha.getbbox() is None:
                errors.append(f"{asset_id}: frame {index:02d} is empty")
            edge = [alpha.getpixel((x, 0)) for x in range(frame.width)]
            edge += [alpha.getpixel((x, frame.height - 1)) for x in range(frame.width)]
            edge += [alpha.getpixel((0, y)) for y in range(frame.height)]
            edge += [alpha.getpixel((frame.width - 1, y)) for y in range(frame.height)]
            if any(edge):
                errors.append(f"{asset_id}: frame {index:02d} touches canvas edge")
    except Exception as error:  # pragma: no cover - surfaced as a validation error
        errors.append(f"{asset_id}: unable to inspect source ({error})")
    return {"errors": errors, "metadata": metadata, "sheet": sheet_path, "gif": gif_path}


def normalize_asset(asset_id: str, spec: dict, source: dict, target: Path) -> dict:
    target.mkdir(parents=True, exist_ok=True)
    source_folder = REVIEW / asset_id
    shutil.copy2(source["sheet"], target / f"{asset_id}.png")
    shutil.copy2(source["gif"], target / f"{asset_id}.gif")
    shutil.copy2(source_folder / f"{asset_id}_4x.png", target / f"{asset_id}_preview.png")
    frames = []
    for index in range(spec["count"]):
        name = f"frame_{index:02d}.png"
        shutil.copy2(source_folder / "frames" / name, target / name)
        frames.append(name)
    metadata = dict(source["metadata"])
    metadata.update({
        "id": asset_id,
        "runtimeId": asset_id,
        "sourceReviewId": f"v17_{asset_id}",
        "sourceReviewPath": f"assets/concepts/v17_warrior_vfx_review/vfx/{asset_id}",
        "sheet": f"{asset_id}.png",
        "frames": frames,
        "previewGif": f"{asset_id}.gif",
        "previewImage": f"{asset_id}_preview.png",
        "imageSmoothingEnabled": False,
    })
    (target / f"{asset_id}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metadata


def update_dynamic_manifest(installed: dict) -> None:
    path = GAME / "dynamic_assets_manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for asset_id, metadata in installed.items():
        entry = next((item for item in manifest.get("vfx", []) if item.get("id") == asset_id), None)
        if entry is None:
            raise RuntimeError(f"dynamic manifest entry missing: {asset_id}")
        entry.update({
            "sourceReviewId": metadata["sourceReviewId"],
            "sourceReviewPath": metadata["sourceReviewPath"],
            "frameWidth": metadata["frameWidth"],
            "frameHeight": metadata["frameHeight"],
            "frameCount": metadata["frameCount"],
            "fps": metadata["fps"],
            "loop": metadata["loop"],
            "anchor": metadata["anchor"],
            "blendMode": metadata["blendMode"],
            "previewGif": metadata["previewGif"],
            "path": f"assets/game/skills/warrior/vfx/{asset_id}/{asset_id}.png",
        })
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    dry_run = "--dry-run" in __import__("sys").argv
    checked = {asset_id: validate_source(asset_id, spec) for asset_id, spec in SPECS.items()}
    errors = [error for result in checked.values() for error in result["errors"]]
    if errors:
        raise SystemExit(json.dumps({"passed": False, "errors": errors}, ensure_ascii=False, indent=2))
    if dry_run:
        print(json.dumps({"passed": True, "dryRun": True, "assets": list(SPECS)}, ensure_ascii=False))
        return

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = BACKUP_ROOT / stamp / "skills" / "warrior" / "vfx"
    backup_root.mkdir(parents=True, exist_ok=True)
    installed: dict[str, dict] = {}
    backups: dict[str, str | None] = {}
    for asset_id, spec in SPECS.items():
        target = RUNTIME / asset_id
        backup_target = backup_root / asset_id
        if target.exists():
            shutil.copytree(target, backup_target)
            backups[asset_id] = rel(backup_target)
            shutil.rmtree(target)
        else:
            backups[asset_id] = None
        installed[asset_id] = normalize_asset(asset_id, spec, checked[asset_id], target)

    update_dynamic_manifest(installed)
    manifest = {
        "version": 17,
        "installedAt": stamp,
        "sourceReview": "assets/concepts/v17_warrior_vfx_review",
        "backupRoot": rel(backup_root),
        "vfx": {},
    }
    for asset_id, metadata in installed.items():
        target = RUNTIME / asset_id
        files = [target / f"{asset_id}.png", target / f"{asset_id}.gif", target / f"{asset_id}.json"]
        files += [target / f"frame_{index:02d}.png" for index in range(SPECS[asset_id]["count"])]
        files.append(target / f"{asset_id}_preview.png")
        manifest["vfx"][asset_id] = {
            "id": asset_id,
            "sourceReviewId": metadata["sourceReviewId"],
            "sourceReviewPath": metadata["sourceReviewPath"],
            "backup": backups[asset_id],
            "path": rel(target / f"{asset_id}.png"),
            "frameWidth": metadata["frameWidth"],
            "frameHeight": metadata["frameHeight"],
            "frameCount": metadata["frameCount"],
            "fps": metadata["fps"],
            "loop": metadata["loop"],
            "anchor": metadata["anchor"],
            "blendMode": metadata["blendMode"],
            "files": [rel(path) for path in files],
            "sha256": {rel(path): sha256(path) for path in files},
        }
    (GAME / "v17_warrior_vfx_runtime_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "installed": list(SPECS), "backupRoot": rel(backup_root)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
