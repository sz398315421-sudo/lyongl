from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def check_frame(path: Path) -> list[str]:
    errors: list[str] = []
    image = Image.open(path)
    if image.mode != "RGBA": errors.append(f"{path}: not RGBA")
    if image.size != (64, 64): errors.append(f"{path}: size {image.size}")
    alpha = image.getchannel("A")
    if alpha.getbbox() is None: errors.append(f"{path}: empty")
    edge = [alpha.getpixel((x, 0)) for x in range(64)] + [alpha.getpixel((x, 63)) for x in range(64)]
    edge += [alpha.getpixel((0, y)) for y in range(64)] + [alpha.getpixel((63, y)) for y in range(64)]
    if any(edge): errors.append(f"{path}: touches edge")
    return errors


def main() -> None:
    errors: list[str] = []
    enemy_sets = {
        "spore": ["mycelium_skitter", "acid_eye_pod", "fungal_ram", "spore_bloater"],
        "moon": ["static_crawler", "prism_sentry", "crater_ram", "void_bloater"],
    }
    for planet, ids in enemy_sets.items():
        for asset_id in ids:
            folder = ROOT / "assets" / "game" / "enemies" / planet / asset_id
            meta_path = folder / f"{asset_id}_4dir.json"
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta["frameCount"] != 4 or meta["anchor"] != {"x": 32, "y": 56}: errors.append(f"{meta_path}: metadata")
            for direction in ("front", "right", "back", "left"):
                errors.extend(check_frame(folder / f"{direction}.png"))
            if Image.open(folder / f"{asset_id}_4dir.png").size != (256, 64): errors.append(f"{folder}: sheet size")
    for asset_id in ["warrior_kade", "mechanic_locke"]:
        folder = ROOT / "assets" / "game" / "characters" / asset_id
        meta = json.loads((folder / f"{asset_id}_4dir.json").read_text(encoding="utf-8"))
        for direction in ("front", "right", "back", "left"):
            errors.extend(check_frame(folder / f"{direction}.png"))
        if Image.open(folder / f"{asset_id}_4dir.png").size != (256, 64): errors.append(f"{folder}: sheet size")
    report = {"passed": not errors, "errors": errors, "checked": 40}
    (ROOT / "assets" / "game" / "runtime_assets_validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors: raise SystemExit(1)


if __name__ == "__main__":
    main()
