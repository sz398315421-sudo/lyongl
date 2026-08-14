"""Install the V19 combo VFX review sheets into the runtime asset tree.

The new IDs are additive. Existing runtime folders are copied to a timestamped
backup before any replacement, so this script is safe to rerun while tuning.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v19_combo_vfx_review" / "vfx"
RUNTIME = ROOT / "assets" / "game" / "skills"
BACKUP_ROOT = ROOT / "assets" / "concepts" / "v19_runtime_backup"

ASSETS = {
    "gunner": ["burst_overdrive", "railgun_overcharge", "critical_dash"],
    "warrior": ["fury_combo", "iron_fury", "blood_oath"],
    "mechanic": ["parallel_overclock", "field_reconstruction", "magnetic_reclaim"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = BACKUP_ROOT / stamp
    manifest = {
        "version": 1,
        "sourceReview": "assets/concepts/v19_combo_vfx_review",
        "backup": None,
        "installedAt": datetime.now().isoformat(timespec="seconds"),
        "assets": {},
    }
    for role, ids in ASSETS.items():
        for vfx_id in ids:
            source = REVIEW / vfx_id
            target = RUNTIME / role / "vfx" / vfx_id
            if not source.exists():
                raise SystemExit(f"Missing review asset: {source}")
            if target.exists():
                backup = backup_root / "skills" / role / "vfx" / vfx_id
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(target, backup)
                manifest["backup"] = str(backup_root.relative_to(ROOT)).replace("\\", "/")
                shutil.rmtree(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, target)
            source_json = target / f"{vfx_id}.json"
            data = json.loads(source_json.read_text(encoding="utf-8"))
            data.update({
                "id": vfx_id,
                "runtimePath": str(target.relative_to(ROOT)).replace("\\", "/"),
                "sourceReviewId": vfx_id,
                "sheet": f"{vfx_id}.png",
            })
            source_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            manifest["assets"][vfx_id] = {
                "classId": role,
                "sourceReviewId": vfx_id,
                "source": str(source.relative_to(ROOT)).replace("\\", "/"),
                "runtime": str(target.relative_to(ROOT)).replace("\\", "/"),
                "frameWidth": data["frameWidth"],
                "frameHeight": data["frameHeight"],
                "frameCount": data["frameCount"],
                "fps": data["fps"],
                "loop": data["loop"],
                "anchor": data["anchor"],
                "blendMode": data["blendMode"],
                "sheetSha256": sha256(target / f"{vfx_id}.png"),
            }

    runtime_manifest = ROOT / "assets" / "game" / "v19_combo_runtime_manifest.json"
    runtime_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    dynamic_path = ROOT / "assets" / "game" / "dynamic_assets_manifest.json"
    dynamic = json.loads(dynamic_path.read_text(encoding="utf-8"))
    dynamic["v19Runtime"] = manifest
    existing = {item.get("id"): item for item in dynamic.get("vfx", []) if isinstance(item, dict)}
    for vfx_id, item in manifest["assets"].items():
        existing[vfx_id] = {
            "id": vfx_id,
            "category": "vfx",
            "sourceReviewId": vfx_id,
            "classId": item["classId"],
            "event": "combo_activation",
            "paletteVariant": item["classId"],
            "image": f"{vfx_id}.png",
            "sheetLayout": "horizontal",
            "path": f"assets/game/skills/{item['classId']}/vfx/{vfx_id}/{vfx_id}.png",
            "frameWidth": item["frameWidth"],
            "frameHeight": item["frameHeight"],
            "frameCount": item["frameCount"],
            "fps": item["fps"],
            "loop": item["loop"],
            "anchor": item["anchor"],
            "blendMode": item["blendMode"],
            "frames": [f"frames/frame_{index:02d}.png" for index in range(item["frameCount"])],
            "previewGif": f"{vfx_id}.gif",
            "imageSmoothingEnabled": False,
        }
    dynamic["vfx"] = list(existing.values())
    dynamic_path.write_text(json.dumps(dynamic, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"installed": list(manifest["assets"]), "manifest": str(runtime_manifest)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
