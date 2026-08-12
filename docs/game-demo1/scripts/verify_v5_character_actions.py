from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets" / "game" / "dynamic_assets_manifest.json"
ROLES = {
    "gunner_mia": 15,
    "warrior_kade": 15,
    "mechanic_locke": 15,
}
DIRECTIONS = ["front", "right", "back", "left"]


def check_png(path: Path, size: tuple[int, int], errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"missing {path.relative_to(ROOT)}")
        return
    try:
        image = Image.open(path)
        if image.mode != "RGBA":
            errors.append(f"{path.relative_to(ROOT)} mode={image.mode}")
        if image.size != size:
            errors.append(f"{path.relative_to(ROOT)} size={image.size}, expected={size}")
        alpha = image.getchannel("A")
        if alpha.getbbox() is None:
            errors.append(f"{path.relative_to(ROOT)} empty alpha")
        edge = (
            alpha.crop((0, 0, image.width, 1)).getbbox()
            or alpha.crop((0, image.height - 1, image.width, image.height)).getbbox()
            or alpha.crop((0, 0, 1, image.height)).getbbox()
            or alpha.crop((image.width - 1, 0, image.width, image.height)).getbbox()
        )
        if edge:
            errors.append(f"{path.relative_to(ROOT)} touches canvas edge")
    except Exception as exc:
        errors.append(f"{path.relative_to(ROOT)} unreadable: {exc}")


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    errors: list[str] = []
    actions = manifest.get("actions", [])
    skill_entries = [entry for entry in actions if entry.get("assetType") == "character_skill_action"]
    walk_entries = [entry for entry in actions if entry.get("assetType") == "character_action" and entry.get("state") == "walk"]
    if len(skill_entries) != 45:
        errors.append(f"skill action count={len(skill_entries)}, expected=45")
    if len(walk_entries) != 3:
        errors.append(f"walk action count={len(walk_entries)}, expected=3")
    for character_id, expected in ROLES.items():
        entries = [entry for entry in skill_entries if entry.get("assetId") == character_id]
        if len(entries) != expected:
            errors.append(f"{character_id} skill count={len(entries)}, expected={expected}")
    for entry in walk_entries + skill_entries:
        frame_count = int(entry.get("frameCount", 0))
        frame_width = int(entry.get("frameWidth", 0))
        frame_height = int(entry.get("frameHeight", 0))
        expected_count = 6 if entry.get("state") == "walk" else (6 if entry.get("skillId") in {
            "piercing_star", "hunt_barrage", "zero_storm", "rift_slash", "star_ring", "phantom_counter",
            "swarm_protocol", "mobile_fortress", "infinite_recycle",
        } else 5)
        if frame_count != expected_count:
            errors.append(f"{entry.get('id')} frameCount={frame_count}, expected={expected_count}")
        if entry.get("anchor") != {"x": 32, "y": 56}:
            errors.append(f"{entry.get('id')} anchor mismatch")
        if entry.get("directionOrder") != DIRECTIONS:
            errors.append(f"{entry.get('id')} direction order mismatch")
        if entry.get("state") == "walk":
            if entry.get("fps") != 10 or entry.get("loop") is not True:
                errors.append(f"{entry.get('id')} walk timing mismatch")
        else:
            expected_event = 3 if frame_count == 6 else 2
            if entry.get("fps") != 12 or entry.get("loop") is not False or entry.get("eventFrame") != expected_event:
                errors.append(f"{entry.get('id')} skill timing mismatch")
        check_png(ROOT / entry["path"], (frame_width * frame_count, frame_height * 4), errors)
        for direction in DIRECTIONS:
            row = entry.get("directions", {}).get(direction, {}).get("row")
            if row != DIRECTIONS.index(direction):
                errors.append(f"{entry.get('id')} row mismatch {direction}")
    report = {
        "passed": not errors,
        "walkCount": len(walk_entries),
        "skillCount": len(skill_entries),
        "roles": {role: len([entry for entry in skill_entries if entry.get("assetId") == role]) for role in ROLES},
        "errors": errors,
    }
    output = ROOT / "assets" / "game" / "v5_character_actions_validation.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
