"""Install the reviewed V13 spore-pool animation into the runtime.

The installer validates the review asset first, snapshots the old runtime
directory, normalizes the V2 filenames to the existing ``spore_pool`` API and
records hashes/manifests.  It does not touch code or any other VFX.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v13_spore_burst_review" / "vfx" / "spore_pool_v2"
TARGET = ROOT / "assets" / "game" / "enemies" / "vfx" / "spore" / "spore_pool"
BACKUPS = ROOT / "assets" / "concepts" / "v13_props_runtime_backup"
DYNAMIC_MANIFEST = ROOT / "assets" / "game" / "dynamic_assets_manifest.json"
RUNTIME_MANIFEST = ROOT / "assets" / "game" / "v13_spore_pool_runtime_manifest.json"
RUNTIME_VALIDATION = ROOT / "assets" / "game" / "v13_spore_pool_runtime_validation.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_review() -> dict:
    if not REVIEW.exists():
        raise FileNotFoundError(REVIEW)
    checks = []
    for index in range(6):
        path = REVIEW / "frames" / f"frame_{index:02d}.png"
        if not path.exists():
            raise FileNotFoundError(path)
        image = Image.open(path).convert("RGBA")
        alpha = {pixel[3] for pixel in image.getdata()}
        border = [image.getpixel((x, 0))[3] for x in range(image.width)]
        border += [image.getpixel((x, image.height - 1))[3] for x in range(image.width)]
        border += [image.getpixel((0, y))[3] for y in range(image.height)]
        border += [image.getpixel((image.width - 1, y))[3] for y in range(image.height)]
        checks.append({
            "frame": index,
            "size": list(image.size),
            "mode": image.mode,
            "alphaBinary": alpha <= {0, 255},
            "transparentBorder": not any(border),
            "opaquePixels": sum(1 for pixel in image.getdata() if pixel[3] == 255),
        })
    sheet = Image.open(REVIEW / "spore_pool_v2.png")
    gif = Image.open(REVIEW / "spore_pool_v2.gif")
    passed = (
        all(check["size"] == [96, 96] and check["mode"] == "RGBA"
            and check["alphaBinary"] and check["transparentBorder"]
            and check["opaquePixels"] > 0 for check in checks)
        and sheet.size == (576, 96)
        and sheet.mode == "RGBA"
        and getattr(gif, "n_frames", 1) == 6
    )
    if not passed:
        raise RuntimeError({"reviewChecks": checks, "sheet": sheet.size,
                            "gifFrames": getattr(gif, "n_frames", 1)})
    return {"passed": True, "frames": checks, "sheet": list(sheet.size), "gifFrames": gif.n_frames}


def normalized_runtime_json() -> dict:
    return {
        "id": "spore_pool",
        "category": "vfx",
        "event": "spore_pool",
        "paletteVariant": "spore",
        "image": "spore_pool.png",
        "sheetLayout": "horizontal",
        "frameWidth": 96,
        "frameHeight": 96,
        "frameCount": 6,
        "fps": 10,
        "loop": True,
        "anchor": {"x": 48, "y": 48},
        "blendMode": "lighter",
        "frames": [f"frame_{i:02d}.png" for i in range(6)],
        "previewGif": "spore_pool.gif",
        "imageSmoothingEnabled": False,
        "sourceReviewId": "spore_pool_v2",
        "sourceReviewPath": "assets/concepts/v13_spore_burst_review/vfx/spore_pool_v2",
        "generationModel": "gpt-image-2",
        "generationProvider": "codex",
        "pixelization": "nearest-neighbor",
        "alphaMethod": "chroma-key auto matte + hard-alpha threshold",
    }


def install() -> dict:
    review_validation = validate_review()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # If a previous invocation already installed this exact review package,
    # reuse its original snapshot instead of backing up the new files again.
    backup_candidates = sorted(BACKUPS.glob("*/enemies/vfx/spore/spore_pool"))
    already_v13 = False
    runtime_meta = TARGET / "spore_pool.json"
    if runtime_meta.exists():
        try:
            already_v13 = json.loads(runtime_meta.read_text(encoding="utf-8")).get("sourceReviewId") == "spore_pool_v2"
        except (OSError, json.JSONDecodeError):
            already_v13 = False
    if already_v13 and backup_candidates:
        backup = backup_candidates[0]
    else:
        backup = BACKUPS / stamp / "enemies" / "vfx" / "spore" / "spore_pool"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if TARGET.exists():
            shutil.copytree(TARGET, backup)

    temp = TARGET.parent / ".spore_pool_v13_install_tmp"
    if temp.exists():
        shutil.rmtree(temp)
    temp.mkdir(parents=True, exist_ok=True)
    shutil.copy2(REVIEW / "spore_pool_v2.png", temp / "spore_pool.png")
    shutil.copy2(REVIEW / "spore_pool_v2.gif", temp / "spore_pool.gif")
    for index in range(6):
        # The established runtime interface keeps frame PNGs beside the
        # horizontal sheet (the review package keeps them in ``frames/``).
        shutil.copy2(REVIEW / "frames" / f"frame_{index:02d}.png", temp / f"frame_{index:02d}.png")
    runtime_json = normalized_runtime_json()
    (temp / "spore_pool.json").write_text(json.dumps(runtime_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.move(str(temp), str(TARGET))

    files = {}
    for path in sorted(TARGET.rglob("*")):
        if path.is_file():
            files[str(path.relative_to(ROOT)).replace("\\", "/")] = {
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
            }

    dynamic = json.loads(DYNAMIC_MANIFEST.read_text(encoding="utf-8"))
    updated = False
    for entry in dynamic.get("vfx", []):
        if entry.get("id") == "spore_pool":
            entry.update({
                "sourceReviewId": "spore_pool_v2",
                "sourceReviewPath": "assets/concepts/v13_spore_burst_review/vfx/spore_pool_v2/spore_pool_v2.png",
                "runtimeInstalledAt": stamp,
                "runtimeSha256": files["assets/game/enemies/vfx/spore/spore_pool/spore_pool.png"]["sha256"],
            })
            updated = True
            break
    if not updated:
        raise RuntimeError("spore_pool entry missing from dynamic_assets_manifest.json")
    DYNAMIC_MANIFEST.write_text(json.dumps(dynamic, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    runtime_manifest = {
        "id": "v13_spore_pool_runtime",
        "sourceReviewId": "spore_pool_v2",
        "sourceReviewPath": "assets/concepts/v13_spore_burst_review/vfx/spore_pool_v2",
        "installedAt": stamp,
        "backupPath": str(backup.relative_to(ROOT)).replace("\\", "/") if backup.exists() else None,
        "targetPath": str(TARGET.relative_to(ROOT)).replace("\\", "/"),
        "runtime": runtime_json,
        "files": files,
        "runtimeChanged": True,
    }
    RUNTIME_MANIFEST.write_text(json.dumps(runtime_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    validation = {
        "id": "v13_spore_pool_runtime_validation",
        "passed": True,
        "review": review_validation,
        "runtimeFiles": files,
        "checks": {
            "sheet": {"size": list(Image.open(TARGET / "spore_pool.png").size), "expected": [576, 96]},
            "frameCount": 6,
            "frameSize": [96, 96],
            "anchor": [48, 48],
            "loop": True,
            "runtimeChanged": True,
        },
        "backupPath": runtime_manifest["backupPath"],
    }
    RUNTIME_VALIDATION.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"passed": True, "backup": runtime_manifest["backupPath"], "target": runtime_manifest["targetPath"], "files": files}


if __name__ == "__main__":
    print(json.dumps(install(), ensure_ascii=False, indent=2))
