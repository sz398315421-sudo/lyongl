from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "game"
DIRECTIONS = ["front", "right", "back", "left"]


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def check_png(path: Path, expected_size: tuple[int, int], errors: list[str], require_content: bool = True) -> None:
    if not path.exists():
        errors.append(f"missing {relative(path)}")
        return
    try:
        image = Image.open(path)
        if image.mode != "RGBA":
            errors.append(f"{relative(path)}: mode {image.mode}, expected RGBA")
        if image.size != expected_size:
            errors.append(f"{relative(path)}: size {image.size}, expected {expected_size}")
        alpha = image.getchannel("A")
        if require_content and alpha.getbbox() is None:
            errors.append(f"{relative(path)}: empty alpha")
        if alpha.getbbox() is not None:
            edge = (
                alpha.crop((0, 0, image.width, 1)).tobytes()
                + alpha.crop((0, image.height - 1, image.width, image.height)).tobytes()
                + alpha.crop((0, 0, 1, image.height)).tobytes()
                + alpha.crop((image.width - 1, 0, image.width, image.height)).tobytes()
            )
            if any(edge):
                errors.append(f"{relative(path)}: alpha touches canvas edge")
    except Exception as exc:  # pragma: no cover - report malformed files rather than aborting the full audit
        errors.append(f"{relative(path)}: unreadable ({exc})")


def check_action(entry: dict, errors: list[str]) -> None:
    frame_width = int(entry["frameWidth"])
    frame_height = int(entry["frameHeight"])
    frame_count = int(entry["frameCount"])
    if entry.get("sheetLayout") != "rows-by-direction":
        errors.append(f"{entry.get('id')}: invalid action sheet layout")
    if entry.get("directionOrder") != DIRECTIONS:
        errors.append(f"{entry.get('id')}: direction order mismatch")
    if entry.get("anchor") != {"x": 32, "y": 56}:
        errors.append(f"{entry.get('id')}: anchor mismatch")
    sheet_path = ROOT / entry["path"]
    check_png(sheet_path, (frame_width * frame_count, frame_height * 4), errors)
    for direction in DIRECTIONS:
        row = entry.get("directions", {}).get(direction, {}).get("row")
        if row != DIRECTIONS.index(direction):
            errors.append(f"{entry.get('id')}: row mismatch for {direction}")
        for frame_name in entry.get("frames", {}).get(direction, []):
            check_png(sheet_path.parent / frame_name, (frame_width, frame_height), errors)
    gif_path = sheet_path.parent / entry.get("previewGif", "")
    if not gif_path.exists():
        errors.append(f"{entry.get('id')}: missing preview GIF")
    else:
        try:
            if int(getattr(Image.open(gif_path), "n_frames", 1)) < 1:
                errors.append(f"{entry.get('id')}: GIF has no frames")
        except Exception as exc:
            errors.append(f"{entry.get('id')}: unreadable preview GIF ({exc})")


def check_vfx(entry: dict, errors: list[str]) -> None:
    required = ["frameWidth", "frameHeight", "frameCount", "fps", "loop", "anchor", "blendMode", "event", "paletteVariant", "imageSmoothingEnabled"]
    missing = [key for key in required if key not in entry]
    if missing:
        errors.append(f"{entry.get('id')}: missing metadata {','.join(missing)}")
        return
    width, height = int(entry["frameWidth"]), int(entry["frameHeight"])
    count = int(entry["frameCount"])
    if entry["anchor"] != {"x": width // 2, "y": height // 2} and entry.get("id") != "railgun_beam":
        errors.append(f"{entry.get('id')}: anchor mismatch")
    sheet_path = ROOT / entry["path"]
    check_png(sheet_path, (width * count, height), errors)
    for frame_name in entry.get("frames", []):
        check_png(sheet_path.parent / frame_name, (width, height), errors)
    gif_path = sheet_path.parent / entry.get("previewGif", "")
    if not gif_path.exists():
        errors.append(f"{entry.get('id')}: missing preview GIF")
    else:
        try:
            if int(getattr(Image.open(gif_path), "n_frames", 1)) < 1:
                errors.append(f"{entry.get('id')}: GIF has no frames")
        except Exception as exc:
            errors.append(f"{entry.get('id')}: unreadable preview GIF ({exc})")


def main() -> None:
    errors: list[str] = []
    manifest_path = ASSETS / "dynamic_assets_manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"missing {relative(manifest_path)}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    actions = manifest.get("actions", [])
    vfx = manifest.get("vfx", [])
    for entry in actions:
        check_action(entry, errors)
    for entry in vfx:
        check_vfx(entry, errors)
    for overview in (
        ASSETS / "characters" / "character_actions_overview.gif",
        ASSETS / "enemies" / "enemy_actions_overview.gif",
        ASSETS / "skills" / "dynamic_vfx_overview.gif",
    ):
        if not overview.exists():
            errors.append(f"missing {relative(overview)}")

    # V5 contains the existing character/enemy actions plus 3 walk sheets,
    # 3 default attack sheets and 45 four-direction skill sheets.
    expected_actions = 127
    # V6 adds meteor warning/impact, a dedicated spore pool effect, and
    # replaces the three-planet behavior variants in place. V19 adds nine
    # additive combo feedback sheets.
    expected_vfx = 12 + 8 + 10 + 36 + 3 + 9
    if len(actions) != expected_actions:
        errors.append(f"action count {len(actions)}, expected {expected_actions}")
    if len(vfx) != expected_vfx:
        errors.append(f"vfx count {len(vfx)}, expected {expected_vfx}")

    report = {
        "passed": not errors,
        "actionCount": len(actions),
        "vfxCount": len(vfx),
        "checkedActionFrames": sum(len(entry.get("frames", {}).get(direction, [])) for entry in actions for direction in DIRECTIONS),
        "checkedVfxFrames": sum(len(entry.get("frames", [])) for entry in vfx),
        "errors": errors,
    }
    (ASSETS / "dynamic_assets_validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
