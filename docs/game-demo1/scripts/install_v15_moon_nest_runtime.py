"""Install the reviewed moon-nest idle animation into the runtime object set."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v15_moon_nest_review" / "objects" / "moon_nest_v2"
TARGET = ROOT / "assets" / "game" / "objects" / "moon" / "moon_nest"
BACKUPS = ROOT / "assets" / "concepts" / "v15_runtime_backup"
MANIFEST = ROOT / "assets" / "game" / "v15_moon_nest_runtime_manifest.json"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def validate_review() -> dict:
    checks = []
    for index in range(4):
        path = REVIEW / "frames" / f"frame_{index:02d}.png"
        image = Image.open(path).convert("RGBA")
        alpha = image.getchannel("A")
        edge = alpha.crop((0, 0, 64, 1)).tobytes() + alpha.crop((0, 63, 64, 64)).tobytes()
        edge += alpha.crop((0, 0, 1, 64)).tobytes() + alpha.crop((63, 0, 64, 64)).tobytes()
        checks.append({"frame": index, "size": list(image.size), "mode": image.mode,
                       "alphaBinary": set(alpha.getdata()) <= {0, 255},
                       "transparentBorder": not any(edge), "hasContent": alpha.getbbox() is not None})
    sheet = Image.open(REVIEW / "moon_nest_v2.png")
    gif = Image.open(REVIEW / "moon_nest_v2.gif")
    passed = all(c["size"] == [64, 64] and c["mode"] == "RGBA" and c["alphaBinary"]
                 and c["transparentBorder"] and c["hasContent"] for c in checks)
    passed = passed and sheet.size == (256, 64) and sheet.mode == "RGBA" and getattr(gif, "n_frames", 1) == 4
    if not passed:
        raise RuntimeError({"frames": checks, "sheet": sheet.size, "gifFrames": getattr(gif, "n_frames", 1)})
    return {"passed": True, "frames": checks, "sheet": list(sheet.size), "gifFrames": gif.n_frames}


def main() -> None:
    review_validation = validate_review()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = BACKUPS / stamp / "objects" / "moon" / "moon_nest"
    if TARGET.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(TARGET, backup)

    temp = TARGET.parent / ".moon_nest_v15_install_tmp"
    if temp.exists():
        shutil.rmtree(temp)
    (temp / "frames").mkdir(parents=True, exist_ok=True)
    shutil.copy2(REVIEW / "moon_nest_v2.png", temp / "moon_nest.png")
    shutil.copy2(REVIEW / "moon_nest_v2.gif", temp / "moon_nest.gif")
    for index in range(4):
        source = REVIEW / "frames" / f"frame_{index:02d}.png"
        shutil.copy2(source, temp / f"idle_{index:02d}.png")
        shutil.copy2(source, temp / "frames" / f"frame_{index:02d}.png")
    metadata = {
        "id": "moon_nest",
        "planet": "moon",
        "image": "moon_nest.png",
        "frameWidth": 64,
        "frameHeight": 64,
        "frameCount": 4,
        "anchor": {"x": 32, "y": 56},
        "states": {"idle": {"startFrame": 0, "frameCount": 4, "fps": 7, "loop": True}},
        "frames": [f"idle_{index:02d}.png" for index in range(4)],
        "previewGif": "moon_nest.gif",
        "interactionRadius": 34,
        "blendMode": "source-over",
        "imageSmoothingEnabled": False,
        "sourceReviewId": "moon_nest_v2",
        "sourceReviewPath": "assets/concepts/v15_moon_nest_review/objects/moon_nest_v2",
        "generationModel": "gpt-image-2",
        "generationProvider": "codex",
        "pixelization": "nearest-neighbor",
        "alphaMethod": "chroma-key auto matte + hard-alpha threshold",
    }
    (temp / "moon_nest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.move(str(temp), str(TARGET))

    files = {}
    for path in sorted(TARGET.rglob("*")):
        if path.is_file():
            files[str(path.relative_to(ROOT)).replace("\\", "/")] = {"bytes": path.stat().st_size, "sha256": digest(path)}
    report = {
        "id": "v15_moon_nest_runtime",
        "sourceReviewId": "moon_nest_v2",
        "sourceReviewPath": "assets/concepts/v15_moon_nest_review/objects/moon_nest_v2",
        "installedAt": stamp,
        "backupPath": str(backup.relative_to(ROOT)).replace("\\", "/") if backup.exists() else None,
        "targetPath": str(TARGET.relative_to(ROOT)).replace("\\", "/"),
        "runtime": metadata,
        "files": files,
        "reviewValidation": review_validation,
        "runtimeChanged": True,
    }
    MANIFEST.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": True, "target": report["targetPath"], "backup": report["backupPath"], "files": files}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
