from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v4_role_redraw"
CHARACTERS = ("warrior_kade", "mechanic_locke")
ROLE_SKILLS = {
    "warrior": [
        "cleave", "double_slash", "sword_wave", "orbit_blade", "strength", "attack_speed", "battle_fury",
        "guard", "dodge", "counter", "lifesteal", "unyielding", "rift_slash", "star_ring", "phantom_counter",
    ],
    "mechanic": [
        "drone", "turret", "repair_bot", "mech_count", "overclock", "salvage", "arc", "self_destruct",
        "shield", "quick_deploy", "recycle_heal", "magnet", "swarm_protocol", "mobile_fortress", "infinite_recycle",
    ],
}


def png_check(path: Path, expected: tuple[int, int]) -> dict:
    image = Image.open(path)
    rgba = image.mode == "RGBA"
    alpha = image.getchannel("A") if rgba else None
    bbox = alpha.getbbox() if alpha else None
    edge = False
    if alpha:
        pixels = alpha.load()
        width, height = image.size
        for x in range(width):
            edge |= pixels[x, 0] > 0 or pixels[x, height - 1] > 0
        for y in range(height):
            edge |= pixels[0, y] > 0 or pixels[width - 1, y] > 0
    return {
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "size": list(image.size),
        "expected": list(expected),
        "rgba": rgba,
        "alpha": bool(alpha),
        "alpha_bbox": list(bbox) if bbox else None,
        "touches_edge": edge,
        "passed": rgba and image.size == expected and bool(alpha) and not edge,
    }


def main() -> None:
    checks = []
    for character in CHARACTERS:
        directory = OUT / "characters" / character
        for direction in ("front", "right", "back", "left"):
            checks.append(png_check(directory / f"{direction}.png", (64, 64)))
        checks.append(png_check(directory / f"{character}_4dir.png", (256, 64)))
        metadata = json.loads((directory / f"{character}_4dir.json").read_text(encoding="utf-8"))
        checks.append({
            "path": str((directory / f"{character}_4dir.json").relative_to(ROOT)).replace("\\", "/"),
            "frameCount": metadata.get("frameCount"),
            "anchor": metadata.get("anchor"),
            "passed": metadata.get("frameWidth") == 64 and metadata.get("frameHeight") == 64
            and metadata.get("frameCount") == 4 and metadata.get("anchor") == {"x": 32, "y": 56}
            and metadata.get("imageSmoothingEnabled") is False,
        })
    for role, skill_ids in ROLE_SKILLS.items():
        directory = OUT / "skills" / role / "icons"
        for skill_id in skill_ids:
            checks.append(png_check(directory / f"{skill_id}.png", (64, 64)))
        metadata = json.loads((directory / f"{role}_skill_icons.json").read_text(encoding="utf-8"))
        checks.append({
            "path": str((directory / f"{role}_skill_icons.json").relative_to(ROOT)).replace("\\", "/"),
            "iconCount": len(metadata.get("icons", {})),
            "passed": metadata.get("frameWidth") == 64 and metadata.get("frameHeight") == 64
            and metadata.get("anchor") == {"x": 32, "y": 32}
            and metadata.get("imageSmoothingEnabled") is False
            and list(metadata.get("icons", {})) == skill_ids,
        })
    result = {
        "version": "v4-role-redraw-1",
        "assetRoot": str(OUT.relative_to(ROOT)).replace("\\", "/"),
        "checked": len(checks),
        "passed": all(item["passed"] for item in checks),
        "checks": checks,
    }
    (OUT / "v4_role_redraw_validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": result["passed"], "checked": result["checked"]}, ensure_ascii=False))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
