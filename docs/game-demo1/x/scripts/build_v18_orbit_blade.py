from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "imagegen" / "v18_orbit_blade" / "orbit_blade_source.png"
REVIEW = ROOT / "assets" / "concepts" / "v18_orbit_blade_review" / "vfx" / "orbit_blade"
RUNTIME = ROOT / "assets" / "game" / "skills" / "warrior" / "vfx" / "orbit_blade"
BACKUP_ROOT = ROOT / "assets" / "concepts" / "v18_runtime_backup"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def hard_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a >= 128:
                pixels[x, y] = (r, g, b, 255)
            else:
                pixels[x, y] = (0, 0, 0, 0)
    # Keep a one-pixel transparent safety border for runtime scaling.
    for x in range(image.width):
        pixels[x, 0] = (0, 0, 0, 0)
        pixels[x, image.height - 1] = (0, 0, 0, 0)
    for y in range(image.height):
        pixels[0, y] = (0, 0, 0, 0)
        pixels[image.width - 1, y] = (0, 0, 0, 0)
    return image


def build() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing GPT-Image 2 source: {SOURCE}")
    source = Image.open(SOURCE).convert("RGBA")
    if source.width < 3 or source.height < 2:
        raise SystemExit(f"unexpected storyboard size: {source.size}")
    REVIEW.mkdir(parents=True, exist_ok=True)
    frames = []
    cell_w = source.width // 3
    cell_h = source.height // 2
    for index in range(6):
        col = index % 3
        row = index // 3
        cell = source.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        # Crop only a small transparent-safe border; keep the sword's authored
        # pivot and silhouette, then use nearest-neighbor pixelization.
        inset = max(8, min(cell.width, cell.height) // 32)
        cell = cell.crop((inset, inset, cell.width - inset, cell.height - inset))
        frame = hard_alpha(cell.resize((64, 64), Image.Resampling.NEAREST))
        frame.save(REVIEW / f"frame_{index:02d}.png")
        frames.append(frame)

    sheet = Image.new("RGBA", (384, 64), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 64, 0))
    sheet.save(REVIEW / "orbit_blade.png")

    preview = Image.new("RGBA", (384, 64), (8, 10, 11, 255))
    for index, frame in enumerate(frames):
        preview.alpha_composite(frame, (index * 64, 0))
    preview.resize((768, 128), Image.Resampling.NEAREST).save(REVIEW / "orbit_blade_2x.png")

    frames[0].save(
        REVIEW / "orbit_blade.gif",
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / 14),
        loop=0,
        disposal=2,
        transparency=0,
    )

    spec = {
        "id": "orbit_blade",
        "classId": "warrior",
        "assetType": "orbiting_companion_vfx",
        "image": "orbit_blade.png",
        "sheetLayout": "horizontal",
        "frameWidth": 64,
        "frameHeight": 64,
        "frameCount": 6,
        "fps": 14,
        "loop": True,
        "anchor": {"x": 32, "y": 32},
        "baseAngleDegrees": -45,
        "blendMode": "lighter",
        "event": "orbit_blade",
        "frames": [f"frame_{index:02d}.png" for index in range(6)],
        "preview": "orbit_blade_2x.png",
        "previewGif": "orbit_blade.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "codex",
        "alphaMethod": "hard-threshold-after-generated-alpha",
        "pixelization": "nearest-neighbor",
        "sourceReference": "tmp/imagegen/v18_orbit_blade/orbit_blade_source.png",
    }
    (REVIEW / "orbit_blade.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    (REVIEW.parent.parent / "v18_orbit_blade_generation.json").write_text(json.dumps({
        "id": "v18_orbit_blade",
        "model": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "source": str(SOURCE.relative_to(ROOT)),
        "frames": 6,
        "cli": "scripts/gpt_image_2_skill.cjs",
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def validate(folder: Path) -> dict:
    errors = []
    files = sorted(folder.glob("frame_*.png"))
    if len(files) != 6:
        errors.append(f"expected 6 frames, found {len(files)}")
    for path in files:
        image = Image.open(path)
        if image.mode != "RGBA" or image.size != (64, 64):
            errors.append(f"{path.name}: expected RGBA 64x64, got {image.mode} {image.size}")
        alpha = image.getchannel("A")
        values = set(alpha.getdata())
        if values - {0, 255}:
            errors.append(f"{path.name}: non-hard alpha")
        if any(alpha.getpixel((x, y)) for x, y in [(0, 0), (63, 0), (0, 63), (63, 63)]):
            errors.append(f"{path.name}: corner touches alpha")
    sheet = folder / "orbit_blade.png"
    if not sheet.exists() or Image.open(sheet).size != (384, 64):
        errors.append("orbit_blade.png: expected 384x64")
    return {"passed": not errors, "errors": errors, "frameCount": len(files), "sha256": sha256(sheet) if sheet.exists() else None}


def install() -> dict:
    validation = validate(REVIEW)
    if not validation["passed"]:
        raise SystemExit(json.dumps(validation, ensure_ascii=False))
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = BACKUP_ROOT / stamp / "skills" / "warrior" / "vfx" / "orbit_blade"
    if RUNTIME.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(RUNTIME, backup)
    else:
        backup.mkdir(parents=True, exist_ok=True)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    for path in REVIEW.iterdir():
        if path.is_file() and path.suffix.lower() in {".png", ".gif", ".json"}:
            shutil.copy2(path, RUNTIME / path.name)
    manifest = {
        "id": "v18_orbit_blade_runtime",
        "installedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceReview": "assets/concepts/v18_orbit_blade_review/vfx/orbit_blade",
        "backup": str(backup.relative_to(ROOT)),
        "runtime": str(RUNTIME.relative_to(ROOT)),
        "validation": validation,
    }
    (ROOT / "assets" / "game" / "v18_orbit_blade_runtime_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["build", "validate", "install"])
    args = parser.parse_args()
    if args.command == "build":
        build()
    elif args.command == "validate":
        print(json.dumps(validate(REVIEW), ensure_ascii=False, indent=2))
    else:
        print(json.dumps(install(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
