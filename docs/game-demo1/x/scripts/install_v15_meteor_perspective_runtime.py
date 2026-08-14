"""Install the perspective-correct V15 meteor assets into the existing IDs."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
REVIEW = ROOT / "assets" / "concepts" / "v15_meteor_perspective_review"
BACKUP = ROOT / "assets" / "concepts" / "v15_runtime_backup" / datetime.now().strftime("%Y%m%d_%H%M%S")
RUNTIME_MANIFEST = GAME / "v15_meteor_runtime_manifest.json"

INSTALLS = {
    "meteor_warning": {"review": REVIEW / "vfx" / "meteor_warning_v8", "review_id": "meteor_warning_v8", "size": (96, 64), "count": 6, "fps": 12, "loop": True, "anchor": {"x": 48, "y": 32}},
    "meteor_impact": {"review": REVIEW / "vfx" / "meteor_impact_v6", "review_id": "meteor_impact_v6", "size": (128, 128), "count": 10, "fps": 18, "loop": False, "anchor": {"x": 64, "y": 64}},
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_png(path: Path, size: tuple[int, int]) -> None:
    with Image.open(path) as image:
        if image.mode != "RGBA" or image.size != size:
            raise RuntimeError(f"{rel(path)} must be RGBA {size}, got {image.mode} {image.size}")
        alpha = list(image.getchannel("A").getdata())
        if any(value not in (0, 255) for value in alpha):
            raise RuntimeError(f"{rel(path)} contains non-binary alpha")
        if image.getchannel("A").getbbox() is None:
            raise RuntimeError(f"{rel(path)} is empty")
        edge = [image.getpixel((x, 0))[3] for x in range(image.width)]
        edge += [image.getpixel((x, image.height - 1))[3] for x in range(image.width)]
        edge += [image.getpixel((0, y))[3] for y in range(image.height)]
        edge += [image.getpixel((image.width - 1, y))[3] for y in range(image.height)]
        if any(edge):
            raise RuntimeError(f"{rel(path)} touches canvas edge")


def preflight() -> None:
    for runtime_id, spec in INSTALLS.items():
        folder = spec["review"]
        meta = json.loads((folder / f"{spec['review_id']}.json").read_text(encoding="utf-8"))
        expected = (spec["size"][0], spec["size"][1], spec["count"], spec["fps"], spec["loop"])
        got = (meta["frameWidth"], meta["frameHeight"], meta["frameCount"], meta["fps"], meta["loop"])
        if got != expected:
            raise RuntimeError(f"{runtime_id} metadata mismatch: {got} != {expected}")
        for index in range(spec["count"]):
            check_png(folder / "frames" / f"frame_{index:02d}.png", spec["size"])
        check_png(folder / f"{spec['review_id']}.png", (spec["size"][0] * spec["count"], spec["size"][1]))


def install(runtime_id: str, spec: dict) -> dict:
    source = spec["review"]
    target = GAME / "skills" / "gunner" / "vfx" / runtime_id
    if target.exists():
        backup = BACKUP / target.relative_to(GAME)
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(target, backup, dirs_exist_ok=True)
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)
    frames = []
    for index in range(spec["count"]):
        out = target / f"frame_{index:02d}.png"
        shutil.copy2(source / "frames" / f"frame_{index:02d}.png", out)
        frames.append(rel(out))
    sheet = target / f"{runtime_id}.png"
    gif = target / f"{runtime_id}.gif"
    shutil.copy2(source / f"{spec['review_id']}.png", sheet)
    shutil.copy2(source / f"{spec['review_id']}.gif", gif)
    metadata = json.loads((source / f"{spec['review_id']}.json").read_text(encoding="utf-8"))
    metadata.update({
        "id": runtime_id,
        "reviewId": spec["review_id"],
        "sourceReviewId": spec["review_id"],
        "sourceReviewPath": rel(source),
        "sheet": f"{runtime_id}.png",
        "previewGif": f"{runtime_id}.gif",
        "runtimePath": rel(sheet),
        "runtimeInstallManifest": rel(RUNTIME_MANIFEST),
        "frames": [f"frames/frame_{index:02d}.png" for index in range(spec["count"])],
    })
    metadata_path = target / f"{runtime_id}.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    files = [sheet, gif, metadata_path, *[target / f"frame_{index:02d}.png" for index in range(spec["count"])]]
    return {
        "id": runtime_id,
        "sourceReviewId": spec["review_id"],
        "sourceReviewPath": rel(source),
        "path": rel(sheet),
        "frameWidth": spec["size"][0],
        "frameHeight": spec["size"][1],
        "frameCount": spec["count"],
        "fps": spec["fps"],
        "loop": spec["loop"],
        "anchor": spec["anchor"],
        "files": [rel(file) for file in files],
        "sha256": {rel(file): sha256(file) for file in files},
        "imageSmoothingEnabled": False,
    }


def update_dynamic_manifest(installed: dict) -> None:
    path = GAME / "dynamic_assets_manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for entry in manifest.get("vfx", []):
        item = installed.get(entry.get("id"))
        if not item:
            continue
        entry.update({
            "sourceReviewId": item["sourceReviewId"],
            "sourceReviewPath": item["sourceReviewPath"],
            "path": item["path"],
            "image": Path(item["path"]).name,
            "frameWidth": item["frameWidth"],
            "frameHeight": item["frameHeight"],
            "frameCount": item["frameCount"],
            "fps": item["fps"],
            "loop": item["loop"],
            "anchor": item["anchor"],
            "previewGif": f"{entry['id']}.gif",
        })
    manifest["v15Runtime"] = {"manifest": rel(RUNTIME_MANIFEST), "backup": rel(BACKUP), "sourceReview": rel(REVIEW), "vfx": sorted(installed)}
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    preflight()
    BACKUP.mkdir(parents=True, exist_ok=True)
    installed = {runtime_id: install(runtime_id, spec) for runtime_id, spec in INSTALLS.items()}
    manifest = {
        "version": 15,
        "installedAt": BACKUP.name,
        "sourceReview": rel(REVIEW),
        "backup": rel(BACKUP),
        "perspective": {"camera": "angled-top-down-2.5D", "groundFootprint": "flattened-horizontal-ellipse", "meteorRemainsVolumetric": True},
        "vfx": installed,
        "transition": {"warningLastFrame": "meteor_warning/frame_05.png", "impactFirstFrame": "meteor_impact/frame_00.png", "warningPlacement": {"x": 16, "y": 32}, "sharedAnchor": {"x": 64, "y": 64}},
    }
    RUNTIME_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_dynamic_manifest(installed)
    print(json.dumps({"installed": sorted(installed), "backup": rel(BACKUP), "manifest": rel(RUNTIME_MANIFEST)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
