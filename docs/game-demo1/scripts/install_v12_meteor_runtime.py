"""Install the V12 meteor warning/impact review assets into the runtime.

The installer is deliberately narrow: it replaces only the two gunner VFX
directories, backs both up first, normalizes the V12 filenames to the runtime
IDs, and records hashes in a new runtime manifest.  Historical V7/V11/V12
review assets and the V7 install manifest are left untouched.
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
REVIEW = ROOT / "assets" / "concepts" / "v12_meteor_sequence_review"
VFX_REVIEW = REVIEW / "vfx"
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
BACKUP = ROOT / "assets" / "concepts" / "v12_runtime_backup" / TIMESTAMP
RUNTIME_MANIFEST = GAME / "v12_meteor_runtime_manifest.json"


INSTALLS = {
    "meteor_warning": {
        "source_id": "meteor_warning_v4",
        "source_dir": VFX_REVIEW / "meteor_warning_v4",
        "target_dir": GAME / "skills" / "gunner" / "vfx" / "meteor_warning",
        "frame_size": (96, 64),
        "frame_count": 6,
        "fps": 12,
        "loop": True,
        "anchor": {"x": 48, "y": 32},
    },
    "meteor_impact": {
        "source_id": "meteor_impact_v3",
        "source_dir": VFX_REVIEW / "meteor_impact_v3",
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
        alpha_values = set(image.getchannel("A").getdata())
        if not alpha_values - {0, 255}:
            pass
        else:
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
    except Exception as exc:  # pragma: no cover - diagnostic path
        errors.append(f"{rel(path)} unreadable: {exc}")


def validate_review_package() -> None:
    errors: list[str] = []
    for runtime_id, spec in INSTALLS.items():
        source_dir = spec["source_dir"]
        metadata_path = source_dir / f"{spec['source_id']}.json"
        if not source_dir.exists():
            errors.append(f"missing review directory {rel(source_dir)}")
            continue
        if not metadata_path.exists():
            errors.append(f"missing review metadata {rel(metadata_path)}")
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("frameCount") != spec["frame_count"]:
            errors.append(f"{runtime_id} review frameCount mismatch")
        if metadata.get("frameWidth") != spec["frame_size"][0] or metadata.get("frameHeight") != spec["frame_size"][1]:
            errors.append(f"{runtime_id} review frame size mismatch")
        for index in range(spec["frame_count"]):
            check_png(source_dir / "frames" / f"frame_{index:02d}.png", spec["frame_size"], errors)
        sheet = source_dir / f"{spec['source_id']}.png"
        expected_sheet = (spec["frame_size"][0] * spec["frame_count"], spec["frame_size"][1])
        check_png(sheet, expected_sheet, errors)
        gif = source_dir / f"{spec['source_id']}.gif"
        if not gif.exists():
            errors.append(f"missing review GIF {rel(gif)}")
        else:
            count, loop = gif_frame_count(gif)
            if count != spec["frame_count"]:
                errors.append(f"{runtime_id} review GIF frames={count}")
            if runtime_id == "meteor_warning" and loop != 0:
                errors.append("meteor_warning review GIF is not looping")
            if runtime_id == "meteor_impact" and loop is not None:
                errors.append("meteor_impact review GIF unexpectedly loops")

    warning = INSTALLS["meteor_warning"]["source_dir"] / "frames" / "frame_05.png"
    impact = INSTALLS["meteor_impact"]["source_dir"] / "frames" / "frame_00.png"
    if warning.exists() and impact.exists():
        warning_frame = Image.open(warning).convert("RGBA")
        world = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        world.alpha_composite(warning_frame, (16, 32))
        for point, color in {
            (64, 64): (255, 238, 148, 255),
            (63, 64): (255, 170, 76, 255),
            (65, 64): (255, 170, 76, 255),
        }.items():
            world.putpixel(point, color)
        if list(world.getdata()) != list(Image.open(impact).convert("RGBA").getdata()):
            errors.append("warning frame 05 and impact frame 00 handoff mismatch")

    if errors:
        raise SystemExit("V12 review preflight failed:\n- " + "\n- ".join(errors))


def backup_existing(target: Path) -> None:
    if not target.exists():
        return
    destination = BACKUP / target.relative_to(GAME)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if target.is_dir():
        shutil.copytree(target, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(target, destination)


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

    source_id = spec["source_id"]
    for index in range(spec["frame_count"]):
        copy_file(source_dir / "frames" / f"frame_{index:02d}.png", target_dir / f"frame_{index:02d}.png")
    copy_file(source_dir / f"{source_id}.png", target_dir / f"{runtime_id}.png")
    copy_file(source_dir / f"{source_id}.gif", target_dir / f"{runtime_id}.gif")

    metadata = json.loads((source_dir / f"{source_id}.json").read_text(encoding="utf-8"))
    metadata.update({
        "id": runtime_id,
        "reviewId": source_id,
        "sourceReviewId": source_id,
        "sheet": f"{runtime_id}.png",
        "previewGif": f"{runtime_id}.gif",
        "frames": [f"frames/frame_{index:02d}.png" for index in range(spec["frame_count"])],
        "runtimePath": rel(target_dir / f"{runtime_id}.png"),
        "runtimeInstallManifest": rel(RUNTIME_MANIFEST),
    })
    metadata_path = target_dir / f"{runtime_id}.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    files = {
        "sheet": rel(target_dir / f"{runtime_id}.png"),
        "gif": rel(target_dir / f"{runtime_id}.gif"),
        "json": rel(metadata_path),
        "frames": [rel(target_dir / f"frame_{index:02d}.png") for index in range(spec["frame_count"])],
    }
    hashes = {name: sha256(ROOT / path) if isinstance(path, str) else None for name, path in files.items() if name != "frames"}
    hashes["frames"] = [sha256(ROOT / path) for path in files["frames"]]
    return {
        "id": runtime_id,
        "sourceReviewId": source_id,
        "sourceReviewPath": rel(source_dir),
        "path": files["sheet"],
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
    manifest["v12Runtime"] = {
        "version": 12,
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
        "version": 12,
        "installedAt": TIMESTAMP,
        "sourceReview": rel(REVIEW),
        "backup": rel(BACKUP),
        "vfx": installed,
        "transition": {
            "warningLastFrame": "meteor_warning/frame_05.png",
            "impactFirstFrame": "meteor_impact/frame_00.png",
            "warningPlacement": {"x": 16, "y": 32},
            "sharedAnchor": {"x": 64, "y": 64},
            "impactFrameZeroSharedWithWarning": True,
        },
        "runtimeContractUnchanged": True,
    }
    RUNTIME_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_dynamic_manifest(installed)
    print(json.dumps({"manifest": rel(RUNTIME_MANIFEST), "backup": rel(BACKUP), "vfx": sorted(installed)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
