from __future__ import annotations

"""Install the reviewed V16 combo VFX into the runtime asset contract.

The command is intentionally transactional at the filesystem level: review
assets are validated before any runtime directory is touched, existing
directories are copied to a timestamped backup, and the runtime manifest is
updated only after all nine assets have been copied successfully.
"""

import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v16_combo_vfx_review" / "vfx"
RUNTIME = ROOT / "assets" / "game" / "skills"
BACKUP_ROOT = ROOT / "assets" / "concepts" / "v16_runtime_backup"
DYNAMIC_MANIFEST = ROOT / "assets" / "game" / "dynamic_assets_manifest.json"

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


def check_review_asset(asset_id: str) -> dict:
    role, width, height, count, fps, loop = JOBS[asset_id]
    folder = REVIEW / asset_id
    errors: list[str] = []
    metadata_path = folder / f"{asset_id}.json"
    if not metadata_path.exists():
        errors.append(f"missing {metadata_path}")
        return {"id": asset_id, "errors": errors}
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    expected = {"frameWidth": width, "frameHeight": height, "frameCount": count, "fps": fps, "loop": loop}
    for key, value in expected.items():
        if metadata.get(key) != value:
            errors.append(f"{asset_id}: {key}={metadata.get(key)!r}, expected {value!r}")
    sheet_path = folder / f"{asset_id}.png"
    expected_sheet = (width * count, height)
    if not sheet_path.exists():
        errors.append(f"missing {sheet_path}")
    else:
        image = Image.open(sheet_path).convert("RGBA")
        if image.size != expected_sheet:
            errors.append(f"{asset_id}: sheet size {image.size}, expected {expected_sheet}")
    frame_paths = []
    for index in range(count):
        frame_path = folder / "frames" / f"frame_{index:02d}.png"
        frame_paths.append(frame_path)
        if not frame_path.exists():
            errors.append(f"missing {frame_path}")
            continue
        image = Image.open(frame_path).convert("RGBA")
        if image.size != (width, height):
            errors.append(f"{asset_id}: frame {index} size {image.size}, expected {(width, height)}")
        alpha = list(image.getchannel("A").getdata())
        if any(value not in (0, 255) for value in alpha):
            errors.append(f"{asset_id}: frame {index} has non-binary alpha")
        if image.getchannel("A").getbbox() is None:
            errors.append(f"{asset_id}: frame {index} is empty")
    for required in (folder / f"{asset_id}.gif", folder / f"{asset_id}_4x.png"):
        if not required.exists():
            errors.append(f"missing {required}")
    return {
        "id": asset_id,
        "role": role,
        "folder": str(folder.relative_to(ROOT)).replace("\\", "/"),
        "metadata": metadata,
        "framePaths": frame_paths,
        "errors": errors,
    }


def validate_review() -> list[dict]:
    checks = [check_review_asset(asset_id) for asset_id in JOBS]
    errors = [error for check in checks for error in check["errors"]]
    if errors:
        raise SystemExit("V16 review validation failed:\n" + "\n".join(errors))
    return checks


def runtime_folder(role: str, asset_id: str) -> Path:
    return RUNTIME / role / "vfx" / asset_id


def normalized_metadata(asset_id: str, source_metadata: dict) -> dict:
    role, width, height, count, fps, loop = JOBS[asset_id]
    payload = dict(source_metadata)
    payload.update({
        "id": asset_id,
        "role": role,
        "frameWidth": width,
        "frameHeight": height,
        "frameCount": count,
        "fps": fps,
        "loop": loop,
        "sheet": f"{asset_id}.png",
        "frames": [f"frame_{index:02d}.png" for index in range(count)],
        "previewGif": f"{asset_id}.gif",
        "previewImage": f"{asset_id}_preview.png",
        "sourceReviewId": f"v16_{asset_id}",
        "sourceReviewPath": f"assets/concepts/v16_combo_vfx_review/vfx/{asset_id}",
        "runtimePath": f"assets/game/skills/{role}/vfx/{asset_id}/{asset_id}.png",
        "imageSmoothingEnabled": False,
    })
    return payload


def update_dynamic_manifest(entries: list[dict], backup_path: str) -> None:
    manifest = json.loads(DYNAMIC_MANIFEST.read_text(encoding="utf-8"))
    by_id = {entry["id"]: entry for entry in entries}
    for entry in manifest.get("vfx", []):
        asset_id = entry.get("id")
        if asset_id not in by_id:
            continue
        installed = by_id[asset_id]
        _, width, height, count, fps, loop = JOBS[asset_id]
        entry.update({
            "frameWidth": width,
            "frameHeight": height,
            "frameCount": count,
            "fps": fps,
            "loop": loop,
            "anchor": installed.get("anchor"),
            "frames": [f"frame_{index:02d}.png" for index in range(count)],
            "previewGif": f"{asset_id}.gif",
            "previewImage": f"{asset_id}_preview.png",
            "sourceReviewId": f"v16_{asset_id}",
            "sourceReviewPath": f"assets/concepts/v16_combo_vfx_review/vfx/{asset_id}",
        })
    manifest["v16Runtime"] = {
        "sourceReview": "assets/concepts/v16_combo_vfx_review",
        "backup": backup_path,
        "assets": list(by_id),
    }
    DYNAMIC_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def install(dry_run: bool = False) -> None:
    checks = validate_review()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = BACKUP_ROOT / timestamp / "skills"
    if dry_run:
        print(json.dumps({
            "dryRun": True,
            "assets": list(JOBS),
            "backup": str(backup_root.relative_to(ROOT)).replace("\\", "/"),
            "reviewChecks": len(checks),
        }, ensure_ascii=False, indent=2))
        return

    # Back up all nine directories before copying any new pixels. A missing
    # old directory is recorded but does not prevent installation.
    for asset_id, (role, *_rest) in JOBS.items():
        source = runtime_folder(role, asset_id)
        destination = backup_root / role / "vfx" / asset_id
        if source.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, destination)

    installed_entries: list[dict] = []
    for asset_id, (role, width, height, count, fps, loop) in JOBS.items():
        source = REVIEW / asset_id
        destination = runtime_folder(role, asset_id)
        destination.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / f"{asset_id}.png", destination / f"{asset_id}.png")
        shutil.copy2(source / f"{asset_id}.gif", destination / f"{asset_id}.gif")
        shutil.copy2(source / f"{asset_id}_4x.png", destination / f"{asset_id}_preview.png")
        for index in range(count):
            shutil.copy2(source / "frames" / f"frame_{index:02d}.png", destination / f"frame_{index:02d}.png")
        source_metadata = json.loads((source / f"{asset_id}.json").read_text(encoding="utf-8"))
        metadata = normalized_metadata(asset_id, source_metadata)
        (destination / f"{asset_id}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        installed_entries.append({
            "id": asset_id,
            "role": role,
            "sourceReviewId": f"v16_{asset_id}",
            "path": str((destination / f"{asset_id}.png").relative_to(ROOT)).replace("\\", "/"),
            "backup": str((backup_root / role / "vfx" / asset_id).relative_to(ROOT)).replace("\\", "/"),
            "frameWidth": width,
            "frameHeight": height,
            "frameCount": count,
            "fps": fps,
            "loop": loop,
            "anchor": metadata.get("anchor"),
            "files": [f"frame_{index:02d}.png" for index in range(count)],
            "hashes": {name: sha256(destination / name) for name in [f"{asset_id}.png", f"{asset_id}.json", f"{asset_id}.gif"]},
        })

    backup_rel = str(backup_root.parent.relative_to(ROOT)).replace("\\", "/")
    update_dynamic_manifest(installed_entries, backup_rel)
    runtime_manifest = {
        "id": "v16_combo_runtime",
        "installedAt": timestamp,
        "sourceReview": "assets/concepts/v16_combo_vfx_review",
        "backup": backup_rel,
        "assets": installed_entries,
        "imageSmoothingEnabled": False,
    }
    (ROOT / "assets" / "game" / "v16_combo_runtime_manifest.json").write_text(json.dumps(runtime_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"installed": True, "assets": len(installed_entries), "backup": backup_rel}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    install(args.dry_run)
