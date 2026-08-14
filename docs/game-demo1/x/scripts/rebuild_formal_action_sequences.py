from __future__ import annotations

"""Rebuild placeholder action sequences from the project's formal pixel bases.

The runtime contract is intentionally kept identical to the existing dynamic
asset manifest: 64x64 RGBA frames, rows-by-direction sheets, directions in
front/right/back/left order, and anchor (32, 56).  This module is deterministic
and uses only integer/nearest-neighbour Pillow operations.  It is safe to call
from the dynamic asset builder after its generic output has been produced.
"""

import argparse
import json
import math
import shutil
import tempfile
from collections import Counter
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "game"
TMP = ROOT / "tmp"

DIRECTIONS = ("front", "right", "back", "left")
FRAME_W = 64
FRAME_H = 64
ANCHOR = {"x": 32, "y": 56}

RUST_ENEMIES = {
    "scrap_mite": "swarm",
    "plasma_watcher": "shooter",
    "rivethorn_ram": "charger",
    "pressure_bloater": "bloater",
}

CHARACTERS = {
    "gunner_mia": {
        "role": "gunner",
        "states": {"idle": 4, "hit": 2, "death": 6, "reload": 5, "dash": 5},
    },
    "warrior_kade": {
        "role": "warrior",
        "states": {"idle": 4, "hit": 2, "death": 6, "heavy_attack": 5, "guard": 4},
    },
    "mechanic_locke": {
        "role": "mechanic",
        "states": {"idle": 4, "hit": 2, "death": 6, "deploy": 5, "repair": 5, "self_destruct": 6},
    },
}

ENEMY_STATES = {"idle": 4, "walk": 6, "attack": 4, "hit": 2, "death": 6}
TARGET_SHEET_COUNT = len(RUST_ENEMIES) * len(ENEMY_STATES) + sum(len(spec["states"]) for spec in CHARACTERS.values())
TARGET_FRAME_COUNT = (
    len(RUST_ENEMIES) * sum(ENEMY_STATES.values()) * len(DIRECTIONS)
    + sum(sum(spec["states"].values()) for spec in CHARACTERS.values()) * len(DIRECTIONS)
)


def _rgba(rgb: tuple[int, int, int], alpha: int = 255) -> tuple[int, int, int, int]:
    return (int(rgb[0]), int(rgb[1]), int(rgb[2]), int(alpha))


def clear_transparent_rgb(image: Image.Image) -> Image.Image:
    """Scrub hidden RGB and hard-clear the four canvas edges."""

    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, alpha = pixels[x, y]
            if alpha == 0:
                pixels[x, y] = (0, 0, 0, 0)
    for x in range(image.width):
        pixels[x, 0] = (0, 0, 0, 0)
        pixels[x, image.height - 1] = (0, 0, 0, 0)
    for y in range(image.height):
        pixels[0, y] = (0, 0, 0, 0)
        pixels[image.width - 1, y] = (0, 0, 0, 0)
    return image


def load_formal_bases(folder: Path) -> dict[str, Image.Image]:
    """Load the existing individual formal direction sprites without editing them."""

    bases: dict[str, Image.Image] = {}
    for direction in DIRECTIONS:
        path = folder / f"{direction}.png"
        if not path.exists():
            raise FileNotFoundError(f"formal base is missing: {path}")
        image = Image.open(path).convert("RGBA")
        if image.size != (FRAME_W, FRAME_H):
            raise ValueError(f"formal base must be 64x64: {path} -> {image.size}")
        if image.getchannel("A").getbbox() is None:
            raise ValueError(f"formal base is empty: {path}")
        bases[direction] = clear_transparent_rgb(image)
    return bases


def base_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    box = image.getchannel("A").getbbox()
    if box is None:
        raise ValueError("an action frame lost its formal base")
    return box


def safe_translate(image: Image.Image, dx: int, dy: int) -> Image.Image:
    """Translate a sprite while keeping its anchor and alpha one pixel from edges."""

    image = image.convert("RGBA")
    left, top, right, bottom = base_bbox(image)
    min_dx = 1 - left
    max_dx = (FRAME_W - 2) - (right - 1)
    min_dy = 1 - top
    max_dy = (FRAME_H - 2) - (bottom - 1)
    dx = max(min_dx, min(max_dx, int(dx)))
    dy = max(min_dy, min(max_dy, int(dy)))
    result = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    result.alpha_composite(image, (dx, dy))
    return clear_transparent_rgb(result)


def extract_palette(image: Image.Image) -> dict[str, tuple[int, int, int, int]]:
    """Derive effect colours from the formal sprite rather than inventing a new palette."""

    counts: Counter[tuple[int, int, int]] = Counter()
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, alpha = pixels[x, y]
            if alpha >= 96:
                counts[(r, g, b)] += 1
    if not counts:
        return {
            "dark": (20, 20, 20, 255),
            "core": (180, 120, 70, 255),
            "hot": (240, 190, 100, 255),
            "white": (255, 245, 215, 255),
        }
    ordered = list(counts)
    dark = min(ordered, key=lambda c: sum(c))
    light = max(ordered, key=lambda c: sum(c))

    def saturation_score(color: tuple[int, int, int]) -> tuple[int, int]:
        return (max(color) - min(color), sum(color))

    core = max(ordered, key=saturation_score)
    # Keep the highlight readable but still close to the source sprite's print palette.
    hot = tuple(min(255, round(channel * 1.16 + 18)) for channel in light)
    white = tuple(min(255, round(channel * 0.60 + 102)) for channel in light)
    return {"dark": _rgba(dark), "core": _rgba(core), "hot": _rgba(hot), "white": _rgba(white)}


def phase(frame: int, count: int) -> float:
    return 0.0 if count <= 1 else frame / float(count - 1)


def normal_motion(base: Image.Image, frame: int, count: int, state: str) -> Image.Image:
    """Small integer motion that retains the exact source silhouette."""

    if state == "idle":
        bob = (0, 0, -1, 0)[frame % 4]
        dx = (0, 0, 0, 0)[frame % 4]
    else:
        bob = (0, -1, 0, 1, 0, -1)[frame % 6]
        dx = (0, 1, 1, 0, -1, -1)[frame % 6]
    return safe_translate(base, dx, bob)


def flash_frame(base: Image.Image, amount: float = 0.76) -> Image.Image:
    result = Image.new("RGBA", base.size, (0, 0, 0, 0))
    source = base.load()
    target = result.load()
    for y in range(base.height):
        for x in range(base.width):
            r, g, b, alpha = source[x, y]
            if alpha:
                target[x, y] = (
                    round(r + (255 - r) * amount),
                    round(g + (255 - g) * amount),
                    round(b + (255 - b) * amount),
                    alpha,
                )
    return clear_transparent_rgb(result)


def death_frame(base: Image.Image, frame: int, count: int) -> Image.Image:
    """Shrink and fade the formal sprite around the shared ground anchor."""

    t = phase(frame, count)
    scale = max(0.38, 1.0 - t * 0.58)
    width = max(2, round(FRAME_W * scale))
    height = max(2, round(FRAME_H * scale))
    resized = base.resize((width, height), Image.Resampling.NEAREST)
    # Map source anchor (32,56) to the same runtime anchor on every frame.
    x = ANCHOR["x"] - round(ANCHOR["x"] * scale)
    y = ANCHOR["y"] - round(ANCHOR["y"] * scale)
    result = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    result.alpha_composite(resized, (x, y))
    fade = max(42, round(255 * (1.0 - t * 0.78)))
    alpha = result.getchannel("A").point(lambda value: round(value * fade / 255))
    result.putalpha(alpha)
    return clear_transparent_rgb(result)


def _clamp(value: int, low: int = 1, high: int = 62) -> int:
    return max(low, min(high, int(value)))


def _side(direction: str) -> int:
    return -1 if direction == "left" else 1


def _line(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], color: tuple[int, int, int, int], width: int = 1) -> None:
    draw.line([(_clamp(x), _clamp(y)) for x, y in points], fill=color, width=max(1, int(width)))


def _rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    x0, x1 = sorted((_clamp(x0), _clamp(x1)))
    y0, y1 = sorted((_clamp(y0), _clamp(y1)))
    draw.rectangle((x0, y0, x1, y1), fill=color)


def add_enemy_attack_effect(image: Image.Image, base: Image.Image, behavior: str, direction: str, frame: int, count: int, palette: dict[str, tuple[int, int, int, int]]) -> None:
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = base_bbox(base)
    side = _side(direction)
    t = phase(frame, count)
    cx = (left + right - 1) // 2
    cy = (top + bottom - 1) // 2
    edge = right - 1 if side > 0 else left
    reach = 4 + round(t * 12)

    if behavior == "swarm":
        _line(draw, [(edge, cy + 5), (edge + side * reach, cy + 1)], palette["dark"], 1)
        _line(draw, [(edge + side * 2, cy + 6), (edge + side * max(3, reach - 3), cy + 4)], palette["hot"], 1)
        _rect(draw, (edge + side * reach - 1, cy, edge + side * reach + 1, cy + 1), palette["core"])
    elif behavior == "shooter":
        muzzle_y = cy - 2
        _rect(draw, (edge + side * 3, muzzle_y - 1, edge + side * (reach + 3), muzzle_y + 1), palette["hot"])
        _rect(draw, (edge + side * (reach + 2), muzzle_y - 2, edge + side * (reach + 4), muzzle_y + 2), palette["white"])
    elif behavior == "charger":
        tail = edge - side * 2
        _line(draw, [(tail, cy - 6), (tail - side * reach, cy - 8)], palette["core"], 1)
        _line(draw, [(tail, cy + 1), (tail - side * (reach + 3), cy + 3)], palette["hot"], 1)
        _rect(draw, (edge + side * 3, cy - 1, edge + side * 5, cy + 1), palette["white"])
    else:
        radius = max(4, min(12, round((right - left) * 0.24)))
        pulse = round(math.sin(t * math.pi) * 2)
        _line(draw, [(cx - radius, cy + pulse), (cx - radius - 2, cy + pulse + 2)], palette["core"], 1)
        _line(draw, [(cx + radius, cy - pulse), (cx + radius + 2, cy - pulse - 2)], palette["hot"], 1)
        _rect(draw, (cx - 1, cy - 1, cx + 1, cy + 1), palette["white"])


def add_character_special_effect(image: Image.Image, base: Image.Image, role: str, state: str, direction: str, frame: int, count: int, palette: dict[str, tuple[int, int, int, int]]) -> None:
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = base_bbox(base)
    side = _side(direction)
    t = phase(frame, count)
    edge = right - 1 if side > 0 else left
    center_y = (top + bottom - 1) // 2

    if state == "reload":
        _rect(draw, (edge + side * 3, center_y + 2, edge + side * 7, center_y + 4), palette["core"])
        if frame % 2:
            _rect(draw, (edge + side * 8, center_y, edge + side * 9, center_y + 1), palette["hot"])
    elif state == "dash":
        length = 5 + round(t * 10)
        _line(draw, [(edge - side * 2, bottom - 6), (edge - side * length, bottom - 9)], palette["dark"], 1)
        _line(draw, [(edge - side * 3, bottom - 2), (edge - side * (length - 2), bottom - 4)], palette["hot"], 1)
    elif state == "heavy_attack":
        reach = 5 + round(t * 13)
        _line(draw, [(edge, center_y + 7), (edge + side * reach, center_y - 5)], palette["hot"], 1)
        _line(draw, [(edge + side * 3, center_y + 8), (edge + side * (reach - 2), center_y)], palette["core"], 1)
    elif state == "guard":
        _line(draw, [(left - 3, center_y - 7), (left - 5, center_y), (left - 3, center_y + 7)], palette["hot"], 1)
        _line(draw, [(right + 2, center_y - 7), (right + 4, center_y), (right + 2, center_y + 7)], palette["core"], 1)
    elif state == "deploy":
        _rect(draw, (edge + side * 3, bottom - 12, edge + side * 7, bottom - 9), palette["core"])
        _rect(draw, (edge + side * 8, bottom - 13, edge + side * 9, bottom - 8), palette["hot"])
    elif state == "repair":
        x = _clamp(edge + side * 5)
        y = _clamp(center_y - 2)
        _line(draw, [(x - 3, y), (x + 3, y)], palette["hot"], 1)
        _line(draw, [(x, y - 3), (x, y + 3)], palette["core"], 1)
    elif state == "self_destruct":
        radius = 3 + round(t * 8)
        _line(draw, [(32 - radius, center_y), (32 + radius, center_y)], palette["hot"], 1)
        _line(draw, [(32, center_y - radius), (32, center_y + radius)], palette["core"], 1)
        _rect(draw, (30, center_y - 1, 34, center_y + 1), palette["white"])


def compose_frame(base: Image.Image, family: str, behavior_or_role: str, state: str, direction: str, frame: int, count: int, palette: dict[str, tuple[int, int, int, int]]) -> Image.Image:
    if state == "hit":
        return flash_frame(base)
    if state == "death":
        return death_frame(base, frame, count)

    result = normal_motion(base, frame, count, state if state in {"idle", "walk"} else "walk")
    if family == "enemy" and state == "attack":
        add_enemy_attack_effect(result, base, behavior_or_role, direction, frame, count, palette)
    elif family == "character" and state in {"reload", "dash", "heavy_attack", "guard", "deploy", "repair", "self_destruct"}:
        add_character_special_effect(result, base, behavior_or_role, state, direction, frame, count, palette)
    return clear_transparent_rgb(result)


def _metadata_for(asset_id: str, family: str, state: str, count: int, detail: dict) -> dict:
    if family == "enemy":
        metadata = {
            "id": f"{asset_id}.{state}",
            "assetType": "enemy_action",
            "assetId": asset_id,
            "planet": "rust",
            "enemyType": detail,
            "state": state,
        }
    else:
        metadata = {
            "id": f"{asset_id}.{state}",
            "assetType": "character_action",
            "assetId": asset_id,
            "role": detail,
            "state": state,
        }
    metadata.update(
        {
            "sheet": f"{asset_id}_{state}_4dir.png",
            "sheetLayout": "rows-by-direction",
            "frameWidth": FRAME_W,
            "frameHeight": FRAME_H,
            "frameCount": count,
            "directionOrder": list(DIRECTIONS),
            "directions": {direction: {"row": index} for index, direction in enumerate(DIRECTIONS)},
            "frames": {direction: [f"{direction}_{i:02d}.png" for i in range(count)] for direction in DIRECTIONS},
            "anchor": dict(ANCHOR),
            "fps": 10 if state in {"idle", "walk"} else 14,
            "loop": state in {"idle", "walk"},
            "blendMode": "source-over",
            "previewGif": f"{asset_id}_{state}.gif",
            "imageSmoothingEnabled": False,
        }
    )
    return metadata


def _write_gif(frames_by_direction: dict[str, list[Image.Image]], path: Path, count: int) -> None:
    boards: list[Image.Image] = []
    for frame in range(count):
        board = Image.new("RGBA", (512, 512), (18, 24, 26, 255))
        for row, direction in enumerate(DIRECTIONS):
            board.alpha_composite(frames_by_direction[direction][frame].resize((128, 128), Image.Resampling.NEAREST), (192, row * 128))
        boards.append(board.convert("P", palette=Image.Palette.ADAPTIVE, colors=96))
    boards[0].save(path, save_all=True, append_images=boards[1:], duration=100, loop=0, disposal=2, optimize=False)


def _write_staged_action(stage: Path, asset_id: str, state: str, frames_by_direction: dict[str, list[Image.Image]], metadata: dict) -> None:
    count = metadata["frameCount"]
    action_stage = stage / asset_id / state
    action_stage.mkdir(parents=True, exist_ok=True)
    for direction in DIRECTIONS:
        for index, frame in enumerate(frames_by_direction[direction]):
            frame.save(action_stage / f"{direction}_{index:02d}.png", optimize=True)
    sheet = Image.new("RGBA", (FRAME_W * count, FRAME_H * len(DIRECTIONS)), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for index, frame in enumerate(frames_by_direction[direction]):
            sheet.alpha_composite(frame, (index * FRAME_W, row * FRAME_H))
    sheet.save(action_stage / metadata["sheet"], optimize=True)
    _write_gif(frames_by_direction, action_stage / metadata["previewGif"], count)

    # Preserve existing runtime metadata byte-for-byte where available.  If a
    # checkout is missing it, create the same contract used by build_dynamic_assets.
    actual_json = _action_folder(asset_id, state, metadata) / f"{asset_id}_{state}_4dir.json"
    stage_json = action_stage / actual_json.name
    if actual_json.exists():
        shutil.copy2(actual_json, stage_json)
    else:
        stage_json.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _action_folder(asset_id: str, state: str, metadata: dict) -> Path:
    if metadata.get("assetType") == "enemy_action":
        return ASSETS / "enemies" / "rust" / asset_id / "actions" / state
    return ASSETS / "characters" / asset_id / "actions" / state


def _iter_targets() -> Iterable[tuple[str, str, str, str, dict[str, int]]]:
    for asset_id, behavior in RUST_ENEMIES.items():
        yield "enemy", asset_id, behavior, str(ASSETS / "enemies" / "rust" / asset_id), ENEMY_STATES
    for asset_id, spec in CHARACTERS.items():
        yield "character", asset_id, spec["role"], str(ASSETS / "characters" / asset_id), spec["states"]


def _validate_stage(stage: Path, targets: list[tuple[str, str, str, str, dict[str, int]]]) -> None:
    expected = 0
    for family, asset_id, detail, _folder, states in targets:
        for state, count in states.items():
            expected += count * len(DIRECTIONS)
            action_stage = stage / asset_id / state
            for direction in DIRECTIONS:
                for index in range(count):
                    path = action_stage / f"{direction}_{index:02d}.png"
                    image = Image.open(path).convert("RGBA")
                    if image.size != (FRAME_W, FRAME_H):
                        raise ValueError(f"staged frame has wrong size: {path}")
                    if image.getchannel("A").getbbox() is None:
                        raise ValueError(f"staged frame is empty: {path}")
                    if any(image.getpixel((x, y))[3] for x, y in [(0, 0), (63, 0), (0, 63), (63, 63)]):
                        raise ValueError(f"staged frame touches an alpha corner: {path}")
                    pixels = image.load()
                    for y in range(image.height):
                        for x in range(image.width):
                            r, g, b, alpha = pixels[x, y]
                            if alpha == 0 and (r or g or b):
                                raise ValueError(f"staged frame has hidden RGB: {path}")
            sheet = Image.open(action_stage / f"{asset_id}_{state}_4dir.png").convert("RGBA")
            if sheet.size != (FRAME_W * count, FRAME_H * len(DIRECTIONS)):
                raise ValueError(f"staged sheet has wrong size: {sheet.filename if hasattr(sheet, 'filename') else asset_id}.{state}")
            if not (action_stage / f"{asset_id}_{state}.gif").exists():
                raise ValueError(f"staged preview GIF is missing: {asset_id}.{state}")
    if expected != TARGET_FRAME_COUNT:
        raise ValueError(f"target frame count mismatch: expected {TARGET_FRAME_COUNT}, built {expected}")


def rebuild_target_actions() -> dict[str, int]:
    """Build all 36 target sheets and commit them only after all checks pass."""

    TMP.mkdir(parents=True, exist_ok=True)
    targets = list(_iter_targets())
    stage = Path(tempfile.mkdtemp(prefix="formal_action_sequences_", dir=str(TMP)))
    try:
        sheet_count = 0
        for family, asset_id, detail, folder_string, states in targets:
            folder = Path(folder_string)
            bases = load_formal_bases(folder)
            palettes = {direction: extract_palette(base) for direction, base in bases.items()}
            for state, count in states.items():
                frames_by_direction: dict[str, list[Image.Image]] = {}
                for direction in DIRECTIONS:
                    base = bases[direction]
                    frames_by_direction[direction] = [
                        compose_frame(base, family, detail, state, direction, frame, count, palettes[direction])
                        for frame in range(count)
                    ]
                metadata_path = _action_folder(asset_id, state, {"assetType": "enemy_action" if family == "enemy" else "character_action"}) / f"{asset_id}_{state}_4dir.json"
                if metadata_path.exists():
                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                    if int(metadata.get("frameCount", -1)) != count:
                        raise ValueError(f"existing metadata frame count mismatch: {metadata_path}")
                else:
                    metadata = _metadata_for(asset_id, family, state, count, detail)
                _write_staged_action(stage, asset_id, state, frames_by_direction, metadata)
                sheet_count += 1

        _validate_stage(stage, targets)

        for family, asset_id, detail, folder_string, states in targets:
            target_root = Path(folder_string) / "actions"
            for state in states:
                source_dir = stage / asset_id / state
                target_dir = target_root / state
                target_dir.mkdir(parents=True, exist_ok=True)
                for path in source_dir.iterdir():
                    shutil.copy2(path, target_dir / path.name)
    finally:
        shutil.rmtree(stage, ignore_errors=True)

    return {"targetSheets": sheet_count, "targetFrames": TARGET_FRAME_COUNT}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="validate formal bases and target counts without writing assets")
    args = parser.parse_args()
    targets = list(_iter_targets())
    if args.check_only:
        for _family, _asset_id, _detail, folder, _states in targets:
            load_formal_bases(Path(folder))
        print(json.dumps({"ok": True, "targetSheets": TARGET_SHEET_COUNT, "targetFrames": TARGET_FRAME_COUNT}, ensure_ascii=False))
        return
    print(json.dumps(rebuild_target_actions(), ensure_ascii=False))


if __name__ == "__main__":
    main()
