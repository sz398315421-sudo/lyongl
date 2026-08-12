"""Validate the V7 runtime install and its normalized VFX contracts."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
MANIFEST_PATH = GAME / "v7_runtime_manifest.json"
REPORT_PATH = GAME / "v7_runtime_validation.json"


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def check_png(path: Path, expected: tuple[int, int], errors: list[str], transparent_edges: bool = True) -> None:
    if not path.exists():
        errors.append(f"missing {rel(path)}")
        return
    try:
        image = Image.open(path)
        if image.mode != "RGBA":
            errors.append(f"{rel(path)} mode={image.mode}, expected RGBA")
        if image.size != expected:
            errors.append(f"{rel(path)} size={image.size}, expected {expected}")
        alpha = image.getchannel("A")
        if alpha.getbbox() is None:
            errors.append(f"{rel(path)} empty alpha")
        if transparent_edges:
            edges = (
                alpha.crop((0, 0, image.width, 1)).getbbox(),
                alpha.crop((0, image.height - 1, image.width, image.height)).getbbox(),
                alpha.crop((0, 0, 1, image.height)).getbbox(),
                alpha.crop((image.width - 1, 0, image.width, image.height)).getbbox(),
            )
            if any(edges):
                errors.append(f"{rel(path)} alpha touches canvas edge")
    except Exception as exc:
        errors.append(f"{rel(path)} unreadable: {exc}")


def connected_components(image: Image.Image) -> int:
    alpha = image.getchannel("A")
    width, height = image.size
    occupied = {(x, y) for y in range(height) for x in range(width) if alpha.getpixel((x, y)) > 0}
    components = 0
    while occupied:
        components += 1
        stack = [occupied.pop()]
        while stack:
            x, y = stack.pop()
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if (nx, ny) in occupied:
                    occupied.remove((nx, ny))
                    stack.append((nx, ny))
    return components


def main() -> None:
    errors: list[str] = []
    if not MANIFEST_PATH.exists():
        raise SystemExit(f"missing {rel(MANIFEST_PATH)}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    check_png(GAME / "planets" / "moon" / "planet_moon.png", (32, 32), errors)
    check_png(GAME / "planets" / "moon" / "moon_cover.png", (128, 128), errors)

    moon_props = manifest.get("moonProps", [])
    for item in moon_props:
        metadata_path = ROOT / item["metadata"]
        image_path = ROOT / item["image"]
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        check_png(image_path, (int(metadata["width"]), int(metadata["height"])), errors)
    if len(moon_props) != 8:
        errors.append(f"moon prop count={len(moon_props)}, expected 8")

    danger = manifest.get("enemyDanger", [])
    for item in danger:
        metadata = json.loads((ROOT / item["metadata"]).read_text(encoding="utf-8"))
        check_png(ROOT / item["sheet"], (int(metadata["frameWidth"]) * 4, int(metadata["frameHeight"])), errors)
        if metadata.get("anchor") != {"x": 32, "y": 56}:
            errors.append(f"{item['enemyId']} danger anchor mismatch")
    if len(danger) != 9:
        errors.append(f"danger count={len(danger)}, expected 9")

    elites = manifest.get("elites", [])
    for item in elites:
        metadata = json.loads((ROOT / item["metadata"]).read_text(encoding="utf-8"))
        check_png(ROOT / item["sheet"], (int(metadata["frameWidth"]) * 4, int(metadata["frameHeight"])), errors)
        if metadata.get("anchor") != {"x": 48, "y": 82}:
            errors.append(f"{item['enemyId']} elite anchor mismatch")
        if metadata.get("crown") is not False or metadata.get("triangleMarker") is not False:
            errors.append(f"{item['enemyId']} still has an elite marker")
        if item.get("dangerSheet"):
            check_png(ROOT / item["dangerSheet"], (384, 96), errors)
    if len(elites) != 12:
        errors.append(f"elite count={len(elites)}, expected 12")

    vfx = manifest.get("vfx", {})
    expected_vfx = {
        "meteor_warning": (96, 64, 6, {"x": 48, "y": 32}),
        "meteor_impact": (128, 128, 10, {"x": 64, "y": 64}),
        "railgun_beam": (128, 32, 4, {"x": 0, "y": 16}),
    }
    for effect_id, (width, height, count, anchor) in expected_vfx.items():
        item = vfx.get(effect_id)
        if not item:
            errors.append(f"missing VFX {effect_id}")
            continue
        check_png(ROOT / item["path"], (width * count, height), errors)
        if item.get("frameCount") != count or item.get("anchor") != anchor:
            errors.append(f"{effect_id} metadata mismatch")
        for index in range(count):
            check_png(ROOT / Path(item["path"]).parent / f"frame_{index:02d}.png", (width, height), errors)
    rail = vfx.get("railgun_beam")
    if rail:
        for index in range(4):
            frame_path = ROOT / Path(rail["path"]).parent / f"frame_{index:02d}.png"
            if frame_path.exists() and connected_components(Image.open(frame_path).convert("RGBA")) != 1:
                errors.append(f"railgun_beam frame {index} is not one connected beam")

    exit_dir = GAME / "ui" / "exit_run"
    for name in ("return_hq_button_normal.png", "return_hq_button_pressed.png", "return_hq_button_disabled.png",
                 "exit_danger_button_normal.png", "exit_danger_button_pressed.png", "exit_danger_button_disabled.png"):
        check_png(exit_dir / name, (160, 36), errors)
    check_png(exit_dir / "exit_warning_panel.png", (280, 128), errors)
    check_png(exit_dir / "loss_warning_icon.png", (32, 32), errors)

    report = {
        "passed": not errors,
        "moonProps": len(moon_props),
        "enemyDanger": len(danger),
        "elites": len(elites),
        "vfx": {key: value[2] for key, value in expected_vfx.items()},
        "errors": errors,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
