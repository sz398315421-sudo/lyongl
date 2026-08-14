"""Install the reviewed V14 meteor sequence into the two runtime VFX slots.

The installer is intentionally narrow and reversible: it validates the V14
review package first, backs up both existing runtime directories, copies only
the normalized frame/sheet/GIF/JSON files, and records hashes plus the V14
source in a new runtime manifest. It does not change combat code or damage
timing.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
REVIEW = ROOT / "assets" / "concepts" / "v14_meteor_sequence_review"
VFX_REVIEW = REVIEW / "vfx"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP = ROOT / "assets" / "concepts" / "v14_runtime_backup" / TIMESTAMP
RUNTIME_MANIFEST = GAME / "v14_meteor_runtime_manifest.json"


INSTALLS = {
    "meteor_warning": {
        "review_id": "meteor_warning_v7",
        "source_dir": VFX_REVIEW / "meteor_warning_v7",
        "target_dir": GAME / "skills" / "gunner" / "vfx" / "meteor_warning",
        "frame_size": (96, 64),
        "frame_count": 6,
        "fps": 12,
        "loop": True,
        "anchor": {"x": 48, "y": 32},
    },
    "meteor_impact": {
        "review_id": "meteor_impact_v5",
        "source_dir": VFX_REVIEW / "meteor_impact_v5",
        "target_dir": GAME / "skills" / "gunner" / "vfx" / "meteor_impact",
        "frame_size": (128, 128),
        "frame_count": 10,
        "fps": 18,
        "loop": False,
        "anchor": {"x": 64, "y": 64},
    },
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def gif_frame_count(path: Path) -> tuple[int, int | None]:
    image = Image.open(path)
    count = 0
    try:
        while True:
            image.seek(count)
            count += 1
    except EOFError:
        pass
    return count, image.info.get("loop")


def check_png(path: Path, size: tuple[int, int], errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"missing {rel(path)}")
        return
    try:
        source = Image.open(path)
        if source.mode != "RGBA":
            errors.append(f"{rel(path)} mode={source.mode}, expected RGBA")
        image = source.convert("RGBA")
        if image.size != size:
            errors.append(f"{rel(path)} size={image.size}, expected {size}")
        alpha = list(image.getchannel("A").getdata())
        if any(value not in (0, 255) for value in alpha):
            errors.append(f"{rel(path)} has non-binary alpha")
        if image.getchannel("A").getbbox() is None:
            errors.append(f"{rel(path)} has empty alpha")
        edge = []
        edge.extend(image.getpixel((x, 0))[3] for x in range(image.width))
        edge.extend(image.getpixel((x, image.height - 1))[3] for x in range(image.width))
        edge.extend(image.getpixel((0, y))[3] for y in range(image.height))
        edge.extend(image.getpixel((image.width - 1, y))[3] for y in range(image.height))
        if any(edge):
            errors.append(f"{rel(path)} alpha touches edge")
        magenta = sum(
            1 for r, g, b, a in image.getdata()
            if a and r > 150 and b > 130 and g < 125 and abs(r - b) < 105
        )
        if magenta:
            errors.append(f"{rel(path)} opaque magenta pixels={magenta}")
    except Exception as exc:  # pragma: no cover
        errors.append(f"{rel(path)} unreadable: {exc}")


def validate_review_package() -> None:
    errors: list[str] = []
    for runtime_id, spec in INSTALLS.items():
        source_dir = spec["source_dir"]
        metadata_path = source_dir / f"{spec['review_id']}.json"
        if not source_dir.exists():
            errors.append(f"missing review directory {rel(source_dir)}")
            continue
        if not metadata_path.exists():
            errors.append(f"missing review metadata {rel(metadata_path)}")
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        expected = {
            "frameWidth": spec["frame_size"][0],
            "frameHeight": spec["frame_size"][1],
            "frameCount": spec["frame_count"],
            "fps": spec["fps"],
            "loop": spec["loop"],
        }
        for key, value in expected.items():
            if metadata.get(key) != value:
                errors.append(f"{runtime_id} metadata {key}={metadata.get(key)!r}, expected {value!r}")
        for index in range(spec["frame_count"]):
            check_png(source_dir / "frames" / f"frame_{index:02d}.png", spec["frame_size"], errors)
        sheet = source_dir / f"{spec['review_id']}.png"
        check_png(sheet, (spec["frame_size"][0] * spec["frame_count"], spec["frame_size"][1]), errors)
        gif = source_dir / f"{spec['review_id']}.gif"
        if not gif.exists():
            errors.append(f"missing review GIF {rel(gif)}")
        else:
            count, loop = gif_frame_count(gif)
            if count != spec["frame_count"]:
                errors.append(f"{runtime_id} review GIF frames={count}")
            if spec["loop"] and loop != 0:
                errors.append(f"{runtime_id} review GIF must loop")
            if not spec["loop"] and loop is not None:
                errors.append(f"{runtime_id} review GIF must not loop")

    warning = INSTALLS["meteor_warning"]["source_dir"] / "frames" / "frame_05.png"
    impact = INSTALLS["meteor_impact"]["source_dir"] / "frames" / "frame_00.png"
    if warning.exists() and impact.exists():
        warning_frame = Image.open(warning).convert("RGBA")
        impact_frame = Image.open(impact).convert("RGBA")
        world = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        world.alpha_composite(warning_frame, (16, 32))
        # Check the handoff using the common center rather than requiring
        # pixel-identical art: the impact frame is allowed to add the meteor.
        if world.getpixel((64, 64))[3] == 0:
            errors.append("warning handoff has no centered landing marker")
        if impact_frame.getpixel((64, 64))[3] == 0 and impact_frame.getchannel("A").getbbox() is None:
            errors.append("impact frame 00 is empty")

    if errors:
        raise SystemExit("V14 review preflight failed:\n- " + "\n- ".join(errors))


def backup_existing(target: Path) -> None:
    if not target.exists():
        return
    destination = BACKUP / target.relative_to(GAME)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(target, destination, dirs_exist_ok=True)


def copy_file(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def install_vfx(runtime_id: str, spec: dict) -> dict:
    source_dir = spec["source_dir"]
    target_dir = spec["target_dir"]
    backup_existing(target_dir)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    review_id = spec["review_id"]
    files: dict[str, object] = {}
    for index in range(spec["frame_count"]):
        target = target_dir / f"frame_{index:02d}.png"
        copy_file(source_dir / "frames" / f"frame_{index:02d}.png", target)
    files["frames"] = [rel(target_dir / f"frame_{index:02d}.png") for index in range(spec["frame_count"])]
    for suffix in ("png", "gif"):
        target = target_dir / f"{runtime_id}.{suffix}"
        copy_file(source_dir / f"{review_id}.{suffix}", target)
        files[suffix] = rel(target)

    metadata = json.loads((source_dir / f"{review_id}.json").read_text(encoding="utf-8"))
    metadata.update({
        "id": runtime_id,
        "reviewId": review_id,
        "sourceReviewId": review_id,
        "sourceReviewPath": rel(source_dir),
        "sheet": f"{runtime_id}.png",
        "previewGif": f"{runtime_id}.gif",
        "runtimePath": rel(target_dir / f"{runtime_id}.png"),
        "runtimeInstallManifest": rel(RUNTIME_MANIFEST),
        "frames": [f"frames/frame_{index:02d}.png" for index in range(spec["frame_count"])],
    })
    metadata_path = target_dir / f"{runtime_id}.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    files["json"] = rel(metadata_path)
    hashes = {name: sha256(ROOT / path) for name, path in files.items() if name != "frames"}
    hashes["frames"] = [sha256(ROOT / path) for path in files["frames"]]
    return {
        "id": runtime_id,
        "sourceReviewId": review_id,
        "sourceReviewPath": rel(source_dir),
        "path": files["png"],
        "frameWidth": spec["frame_size"][0],
        "frameHeight": spec["frame_size"][1],
        "frameCount": spec["frame_count"],
        "fps": spec["fps"],
        "loop": spec["loop"],
        "anchor": spec["anchor"],
        "blendMode": "source-over",
        "files": files,
        "sha256": hashes,
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
            "frames": [Path(frame).name for frame in item["files"]["frames"]],
            "previewGif": Path(item["files"]["gif"]).name,
        })
    manifest["v14Runtime"] = {
        "version": 14,
        "manifest": rel(RUNTIME_MANIFEST),
        "backup": rel(BACKUP),
        "sourceReview": rel(REVIEW),
        "vfx": sorted(installed),
    }
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    validate_review_package()
    BACKUP.mkdir(parents=True, exist_ok=True)
    installed = {runtime_id: install_vfx(runtime_id, spec) for runtime_id, spec in INSTALLS.items()}
    manifest = {
        "version": 14,
        "installedAt": TIMESTAMP,
        "sourceReview": rel(REVIEW),
        "backup": rel(BACKUP),
        "vfx": installed,
        "transition": {
            "warningLastFrame": "meteor_warning/frame_05.png",
            "impactFirstFrame": "meteor_impact/frame_00.png",
            "warningPlacement": {"x": 16, "y": 32},
            "sharedAnchor": {"x": 64, "y": 64},
            "meteorIntroducedAt": "meteor_impact.frame_00",
        },
        "runtimeContractUnchanged": True,
    }
    RUNTIME_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_dynamic_manifest(installed)
    print(json.dumps({"manifest": rel(RUNTIME_MANIFEST), "backup": rel(BACKUP), "vfx": sorted(installed)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
