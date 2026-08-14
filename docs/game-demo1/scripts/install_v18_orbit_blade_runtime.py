from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v18_orbit_blade_review" / "vfx" / "orbit_blade"
RUNTIME = ROOT / "assets" / "game" / "skills" / "warrior" / "vfx" / "orbit_blade"
BACKUPS = ROOT / "assets" / "concepts" / "v18_runtime_backup"


def validate() -> dict:
    errors = []
    frames = sorted(REVIEW.glob("frame_*.png"))
    if len(frames) != 6:
        errors.append(f"expected 6 frames, got {len(frames)}")
    for frame in frames:
        from PIL import Image
        image = Image.open(frame)
        if image.mode != "RGBA" or image.size != (64, 64):
            errors.append(f"{frame.name}: invalid {image.mode} {image.size}")
        if set(image.getchannel("A").getdata()) - {0, 255}:
            errors.append(f"{frame.name}: non-hard alpha")
    sheet = REVIEW / "orbit_blade.png"
    if not sheet.exists():
        errors.append("missing orbit_blade.png")
    else:
        from PIL import Image
        if Image.open(sheet).size != (384, 64):
            errors.append("orbit_blade.png: expected 384x64")
    return {"passed": not errors, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    result = validate()
    if not result["passed"]:
        raise SystemExit(json.dumps(result, ensure_ascii=False))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = BACKUPS / timestamp / "skills" / "warrior" / "vfx" / "orbit_blade"
    if not args.dry_run:
        if RUNTIME.exists():
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(RUNTIME, backup)
        RUNTIME.mkdir(parents=True, exist_ok=True)
        for source in REVIEW.iterdir():
            if source.is_file() and source.suffix.lower() in {".png", ".gif", ".json"}:
                shutil.copy2(source, RUNTIME / source.name)
        manifest = {
            "id": "v18_orbit_blade_runtime",
            "installedAt": datetime.now().isoformat(timespec="seconds"),
            "sourceReview": str(REVIEW.relative_to(ROOT)),
            "backup": str(backup.relative_to(ROOT)),
            "runtime": str(RUNTIME.relative_to(ROOT)),
            "validation": dict(result),
        }
        (ROOT / "assets" / "game" / "v18_orbit_blade_runtime_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        result["installedManifest"] = dict(manifest)
    else:
        result["dryRun"] = True
        result["wouldBackup"] = str(backup.relative_to(ROOT))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
