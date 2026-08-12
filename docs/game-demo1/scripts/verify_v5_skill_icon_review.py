"""Validate the V5 review pack and its runtime copies."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "assets" / "concepts" / "v5_skill_icon_review"
REVIEW_SKILLS = PACK / "skills"
RUNTIME_SKILLS = ROOT / "assets" / "game" / "skills"

EXPECTED = {
    "warrior": [
        "cleave", "double_slash", "sword_wave", "orbit_blade", "strength",
        "attack_speed", "battle_fury", "guard", "dodge", "counter",
        "lifesteal", "unyielding", "rift_slash", "star_ring", "phantom_counter",
    ],
    "mechanic": [
        "drone", "turret", "repair_bot", "mech_count", "overclock", "salvage",
        "arc", "self_destruct", "shield", "quick_deploy", "recycle_heal", "magnet",
        "swarm_protocol", "mobile_fortress", "infinite_recycle",
    ],
}


def icon_report(path: Path) -> dict:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    alpha_values = list(alpha.getdata())
    opaque = sum(value == 255 for value in alpha_values)
    partial = sum(0 < value < 255 for value in alpha_values)
    edge = []
    for x in range(image.width):
        edge.extend((alpha.getpixel((x, 0)), alpha.getpixel((x, image.height - 1))))
    for y in range(image.height):
        edge.extend((alpha.getpixel((0, y)), alpha.getpixel((image.width - 1, y))))
    colours = list(image.getdata())
    magenta_pixels = sum(1 for r, g, b, a in colours if a and r > 190 and b > 150 and g < 90)
    return {
        "path": str(path.relative_to(ROOT)),
        "mode": image.mode,
        "size": list(image.size),
        "alphaMin": min(alpha_values),
        "alphaMax": max(alpha_values),
        "partialPixels": partial,
        "opaquePixels": opaque,
        "edgePixels": sum(value > 0 for value in edge),
        "magentaPixels": magenta_pixels,
        "passed": (
            image.mode == "RGBA"
            and image.size == (64, 64)
            and partial == 0
            and sum(value > 0 for value in edge) == 0
            and magenta_pixels == 0
        ),
    }


def validate_root(skill_root: Path) -> tuple[dict, list[str]]:
    roles = {}
    failures = []
    for role, expected in EXPECTED.items():
        role_dir = skill_root / role / "icons"
        manifest_path = role_dir / f"{role}_skill_icons.json"
        if not manifest_path.exists():
            failures.append(str(manifest_path.relative_to(ROOT)))
            roles[role] = {"iconCount": 0, "manifestOk": False, "icons": []}
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        actual = list(manifest.get("icons", {}).keys())
        manifest_ok = actual == expected
        if not manifest_ok:
            failures.append(f"{role}: manifest order or IDs differ")
        reports = []
        for skill_id in expected:
            path = role_dir / f"{skill_id}.png"
            if not path.exists():
                failures.append(str(path.relative_to(ROOT)))
                continue
            report = icon_report(path)
            reports.append(report)
            if not report["passed"]:
                failures.append(report["path"])
        roles[role] = {
            "iconCount": len(reports),
            "manifestOk": manifest_ok,
            "icons": reports,
        }
    return roles, failures


def main() -> None:
    roles, failures = validate_root(REVIEW_SKILLS)
    runtime_roles, runtime_failures = validate_root(RUNTIME_SKILLS)
    failures.extend(runtime_failures)

    result = {
        "pack": "v5_skill_icon_review",
        "styleReference": "assets/game/skills/gunner/icons",
        "roles": roles,
        "runtimeRoles": runtime_roles,
        "expectedTotalIcons": sum(len(items) for items in EXPECTED.values()),
        "runtimeExpectedTotalIcons": sum(len(items) for items in EXPECTED.values()),
        "passed": not failures,
        "failures": failures,
    }
    output = PACK / "v5_skill_icon_review_validation.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": result["passed"], "failures": failures}, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
