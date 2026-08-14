from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
CONCEPTS = ROOT / "assets" / "concepts"
V4 = CONCEPTS / "v4_role_redraw"
PREVIEWS = CONCEPTS / "v5_action_previews"
DIRECTIONS = ["front", "right", "back", "left"]
FRAME_W = 64
FRAME_H = 64

ROLES = {
    "gunner_mia": {
        "role": "gunner",
        "source": GAME / "characters" / "gunner_mia",
        "static_source": GAME / "characters" / "gunner_mia",
        "primary": "burst",
        "color": (89, 219, 232, 255),
        "accent": (217, 255, 87, 255),
        "skills": [
            "burst", "scatter", "railgun", "magazine", "reload", "piercing", "ricochet", "crit",
            "explosive", "knockback", "weakspot", "emergency_dash", "piercing_star", "hunt_barrage", "zero_storm",
        ],
    },
    "warrior_kade": {
        "role": "warrior",
        "source": GAME / "characters" / "warrior_kade",
        "static_source": V4 / "characters" / "warrior_kade",
        "primary": "cleave",
        "color": (255, 118, 84, 255),
        "accent": (255, 215, 90, 255),
        "skills": [
            "cleave", "double_slash", "sword_wave", "orbit_blade", "strength", "attack_speed", "battle_fury",
            "guard", "dodge", "counter", "lifesteal", "unyielding", "rift_slash", "star_ring", "phantom_counter",
        ],
    },
    "mechanic_locke": {
        "role": "mechanic",
        "source": GAME / "characters" / "mechanic_locke",
        "static_source": V4 / "characters" / "mechanic_locke",
        "primary": "drone",
        "color": (217, 255, 87, 255),
        "accent": (84, 185, 255, 255),
        "skills": [
            "drone", "turret", "repair_bot", "mech_count", "overclock", "salvage", "arc", "self_destruct",
            "shield", "quick_deploy", "recycle_heal", "magnet", "swarm_protocol", "mobile_fortress", "infinite_recycle",
        ],
    },
}

COMBOS = {
    "piercing_star", "hunt_barrage", "zero_storm",
    "rift_slash", "star_ring", "phantom_counter",
    "swarm_protocol", "mobile_fortress", "infinite_recycle",
}

# The motion profile controls the body/weapon pose only. VFX remain separate assets.
MOTION = {
    # Gunner
    "burst": ("weapon", 3), "scatter": ("weapon", 4), "railgun": ("charge", 5),
    "magazine": ("reload", 3), "reload": ("reload", 4), "piercing": ("charge", 3),
    "ricochet": ("aim", 3), "crit": ("aim", 2), "explosive": ("reload", 3),
    "knockback": ("brace", 3), "weakspot": ("scan", 2), "emergency_dash": ("dash", 5),
    "piercing_star": ("charge", 6), "hunt_barrage": ("scan", 5), "zero_storm": ("spin", 6),
    # Warrior
    "cleave": ("slash", 4), "double_slash": ("slash", 4), "sword_wave": ("wave", 5),
    "orbit_blade": ("summon", 4), "strength": ("brace", 3), "attack_speed": ("stance", 3),
    "battle_fury": ("fury", 3), "guard": ("guard", 3), "dodge": ("dash", 4),
    "counter": ("counter", 4), "lifesteal": ("slash", 3), "unyielding": ("guard", 3),
    "rift_slash": ("slash", 6), "star_ring": ("summon", 6), "phantom_counter": ("counter", 6),
    # Mechanic
    "drone": ("deploy", 3), "turret": ("deploy", 4), "repair_bot": ("repair", 3),
    "mech_count": ("split", 3), "overclock": ("charge", 3), "salvage": ("repair", 3),
    "arc": ("arc", 4), "self_destruct": ("charge", 4), "shield": ("guard", 3),
    "quick_deploy": ("deploy", 4), "recycle_heal": ("repair", 3), "magnet": ("scan", 3),
    "swarm_protocol": ("deploy", 6), "mobile_fortress": ("guard", 6), "infinite_recycle": ("repair", 6),
}

VFX_MAP = {
    "gunner": {
        "burst": "muzzle_flash", "scatter": "muzzle_flash", "railgun": "railgun_beam", "reload": "muzzle_flash",
        "piercing_star": "piercing_star_burst", "hunt_barrage": "hunt_barrage_lock", "zero_storm": "zero_storm_burst",
        "weakspot": "weakspot_lock", "emergency_dash": "emergency_dash",
    },
    "warrior": {
        "cleave": "slash_arc", "sword_wave": "sword_wave", "orbit_blade": "orbit_blade", "guard": "guard",
        "counter": "counter", "rift_slash": "sword_wave", "star_ring": "star_ring", "phantom_counter": "phantom_counter",
    },
    "mechanic": {
        "drone": "drone_muzzle", "turret": "turret_deploy", "repair_bot": "repair_pulse", "arc": "drone_arc",
        "self_destruct": "self_destruct_burst", "shield": "shield_pulse", "swarm_protocol": "swarm_protocol",
        "mobile_fortress": "mobile_fortress", "infinite_recycle": "recycle_burst",
    },
}


def hard_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, alpha = pixels[x, y]
            pixels[x, y] = (r, g, b, 255 if alpha >= 96 else 0)
    for x in range(width):
        pixels[x, 0] = (*pixels[x, 0][:3], 0)
        pixels[x, height - 1] = (*pixels[x, height - 1][:3], 0)
    for y in range(height):
        pixels[0, y] = (*pixels[0, y][:3], 0)
        pixels[width - 1, y] = (*pixels[width - 1, y][:3], 0)
    return image


def load_direction_frames(config: dict) -> dict[str, Image.Image]:
    return {
        direction: hard_alpha(Image.open(config["source"] / f"{direction}.png"))
        for direction in DIRECTIONS
    }


def copy_v4_static(config: dict) -> None:
    if config["static_source"] == config["source"]:
        return
    for filename in ("front.png", "right.png", "back.png", "left.png", "warrior_kade_4dir.png", "warrior_kade_4dir.json", "warrior_kade_preview.png", "mechanic_locke_4dir.png", "mechanic_locke_4dir.json", "mechanic_locke_preview.png"):
        source = config["static_source"] / filename
        if source.exists():
            shutil.copy2(source, config["source"] / filename)


def clear_box(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    ImageDraw.Draw(image).rectangle(box, fill=(0, 0, 0, 0))


def shift_region(image: Image.Image, box: tuple[int, int, int, int], dx: int, dy: int) -> Image.Image:
    result = image.copy()
    crop = image.crop(box)
    clear_box(result, box)
    result.alpha_composite(crop, (box[0] + dx, box[1] + dy))
    return result


def walk_frame(base: Image.Image, frame: int) -> Image.Image:
    # Keep the boot line fixed while alternating the leg silhouettes and bobbing the torso.
    bob = [0, -1, 0, 1, 0, -1][frame]
    leg_a = [1, 0, -1, 0, 1, 0][frame]
    leg_b = [-1, 0, 1, 0, -1, 0][frame]
    result = shift_region(base, (8, 7, 56, 39), 0, bob)
    legs = base.crop((16, 37, 49, 61))
    clear_box(result, (16, 37, 49, 61))
    left = legs.crop((0, 0, 17, 24))
    right = legs.crop((16, 0, 33, 24))
    result.alpha_composite(left, (16 + leg_a, 37))
    result.alpha_composite(right, (32 + leg_b, 37))
    return hard_alpha(result)


def pose_boxes(role: str, direction: str) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    if role == "gunner":
        return (16, 20, 60, 49), (9, 23, 56, 44)
    if role == "warrior":
        return (14, 21, 61, 51), (10, 22, 55, 45)
    return (14, 18, 61, 53), (9, 19, 56, 48)


def skill_frame(base: Image.Image, role: str, direction: str, skill_id: str, frame: int, count: int, color: tuple[int, int, int, int], accent: tuple[int, int, int, int]) -> Image.Image:
    mode, amplitude = MOTION.get(skill_id, ("stance", 2))
    progress = frame / max(1, count - 1)
    pulse = math.sin(progress * math.pi)
    side = -1 if direction == "left" else 1
    if direction in {"front", "back"}:
        side = 1
    bob = [0, -1, 0, 1, 0, 0][min(frame, 5)] if count == 6 else [0, -1, 0, 1, 0][frame]
    result = shift_region(base, (8, 7, 56, 40), 0, bob)
    weapon_box, accessory_box = pose_boxes(role, direction)
    if mode in {"weapon", "charge", "aim", "reload", "brace", "scan", "slash", "wave", "guard", "counter", "spin", "arc"}:
        dx = side * round(pulse * amplitude)
        dy = -1 if frame == 1 else (1 if frame == count - 2 else 0)
        result = shift_region(result, weapon_box, dx, dy)
    elif mode in {"dash", "fury", "stance"}:
        result = shift_region(result, (10, 13, 54, 54), side * round(pulse * amplitude / 2), -round(pulse))
    elif mode in {"deploy", "repair", "split", "summon"}:
        dx = side * round(pulse * amplitude)
        result = shift_region(result, accessory_box, dx, -1 if frame == 1 else 0)

    # Keep the action layer strictly character-only.  VFX such as drones,
    # slash arcs and muzzle flashes are emitted on the independent VFX layer;
    # detached accent pixels here would read as stray sprites at 1x scale.
    return hard_alpha(result)


def save_gif(frames: list[Image.Image], path: Path, fps: int) -> None:
    rendered = []
    for frame in frames:
        canvas = Image.new("RGBA", (512, 512), (13, 18, 20, 255))
        canvas.alpha_composite(frame.resize((256, 256), Image.Resampling.NEAREST), (128, 128))
        rendered.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=64))
    rendered[0].save(path, save_all=True, append_images=rendered[1:], duration=max(1, round(1000 / fps)), loop=0, disposal=2)


def write_action(config: dict, state: str, frames_by_direction: dict[str, list[Image.Image]], fps: int, loop: bool, skill_id: str | None = None, event_frame: int | None = None) -> dict:
    root = config["source"] / "actions"
    action_dir = root / "skills" / skill_id if skill_id else root / state
    action_dir.mkdir(parents=True, exist_ok=True)
    count = len(frames_by_direction["front"])
    for direction in DIRECTIONS:
        for index, frame in enumerate(frames_by_direction[direction]):
            frame.save(action_dir / f"{direction}_{index:02d}.png", optimize=True)
    sheet = Image.new("RGBA", (FRAME_W * count, FRAME_H * 4), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for index, frame in enumerate(frames_by_direction[direction]):
            sheet.alpha_composite(frame, (index * FRAME_W, row * FRAME_H))
    name = f"{config['asset_id']}_{skill_id or state}_4dir"
    sheet.save(action_dir / f"{name}.png", optimize=True)
    gif_frames = []
    for index in range(count):
        canvas = Image.new("RGBA", (512, 512), (13, 18, 20, 255))
        for row, direction in enumerate(DIRECTIONS):
            canvas.alpha_composite(frames_by_direction[direction][index].resize((112, 112), Image.Resampling.NEAREST), (200, row * 112 + 32))
        gif_frames.append(canvas)
    gif_name = f"{config['asset_id']}_{skill_id or state}.gif"
    save_gif(gif_frames, action_dir / gif_name, fps)
    metadata = {
        "id": f"{config['asset_id']}.skill.{skill_id}" if skill_id else f"{config['asset_id']}.{state}",
        "assetType": "character_skill_action" if skill_id else "character_action",
        "assetId": config["asset_id"],
        "role": config["role"],
        "state": "skill" if skill_id else state,
        "skillId": skill_id,
        "sheet": f"{name}.png",
        "sheetLayout": "rows-by-direction",
        "frameWidth": FRAME_W,
        "frameHeight": FRAME_H,
        "frameCount": count,
        "directionOrder": DIRECTIONS,
        "directions": {direction: {"row": index} for index, direction in enumerate(DIRECTIONS)},
        "frames": {direction: [f"{direction}_{i:02d}.png" for i in range(count)] for direction in DIRECTIONS},
        "anchor": {"x": 32, "y": 56},
        "fps": fps,
        "loop": loop,
        "eventFrame": event_frame,
        "blendMode": "source-over",
        "vfx": VFX_MAP.get(config["role"], {}).get(skill_id) if skill_id else None,
        "previewGif": gif_name,
        "imageSmoothingEnabled": False,
    }
    json_name = f"{name}.json"
    (action_dir / json_name).write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"category": metadata["assetType"], **metadata, "path": str((action_dir / f"{name}.png").relative_to(ROOT)).replace("\\", "/")}


def make_previews(config: dict, base: dict[str, Image.Image], skill_frames: dict[str, dict[str, list[Image.Image]]]) -> None:
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    walk_frames = {direction: [walk_frame(base[direction], index) for index in range(6)] for direction in DIRECTIONS}
    walk_page = Image.new("RGBA", (6 * 96, 4 * 96), (13, 18, 20, 255))
    for row, direction in enumerate(DIRECTIONS):
        for index, frame in enumerate(walk_frames[direction]):
            walk_page.alpha_composite(frame.resize((96, 96), Image.Resampling.NEAREST), (index * 96, row * 96))
    walk_page.save(PREVIEWS / f"{config['asset_id']}_walk_overview.png", optimize=True)
    skill_ids = config["skills"]
    page = Image.new("RGBA", (5 * 112, 3 * 112), (13, 18, 20, 255))
    for index, skill_id in enumerate(skill_ids):
        frame = skill_frames[skill_id]["front"][len(skill_frames[skill_id]["front"]) // 2]
        page.alpha_composite(frame.resize((96, 96), Image.Resampling.NEAREST), ((index % 5) * 112 + 8, (index // 5) * 112 + 8))
    page.save(PREVIEWS / f"{config['asset_id']}_skill_actions_overview.png", optimize=True)


def make_combined_previews(snapshots: list[dict]) -> None:
    """Create the review sheets requested for the V5 handoff.

    These are intentionally review-only PNGs.  Runtime keeps transparent
    frames and VFX in separate assets; the composite is only a visual timing
    check for artists and QA.
    """
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    bg = (13, 18, 20, 255)
    walk_page = Image.new("RGBA", (6 * 96, len(snapshots) * 4 * 96), bg)
    for role_index, snapshot in enumerate(snapshots):
        y_base = role_index * 4 * 96
        for row, direction in enumerate(DIRECTIONS):
            for index, frame in enumerate(snapshot["walk"][direction]):
                walk_page.alpha_composite(frame.resize((96, 96), Image.Resampling.NEAREST), (index * 96, y_base + row * 96))
    walk_page.save(PREVIEWS / "v5_walk_overview_all_roles.png", optimize=True)

    skill_page = Image.new("RGBA", (5 * 112, len(snapshots) * 3 * 112), bg)
    for role_index, snapshot in enumerate(snapshots):
        y_base = role_index * 3 * 112
        for index, skill_id in enumerate(snapshot["config"]["skills"]):
            frames = snapshot["skills"][skill_id]["front"]
            frame = frames[len(frames) // 2]
            skill_page.alpha_composite(frame.resize((96, 96), Image.Resampling.NEAREST), ((index % 5) * 112 + 8, y_base + (index // 5) * 112 + 8))
    skill_page.save(PREVIEWS / "v5_skill_actions_overview_all_roles.png", optimize=True)

    # One representative primary-skill frame with its independent VFX frame.
    composite = Image.new("RGBA", (3 * 192, 192), bg)
    dynamic_manifest = json.loads((GAME / "dynamic_assets_manifest.json").read_text(encoding="utf-8"))
    vfx_by_id = {entry["id"]: entry for entry in dynamic_manifest.get("vfx", [])}
    for index, snapshot in enumerate(snapshots):
        panel = Image.new("RGBA", (192, 192), bg)
        character = snapshot["skills"][snapshot["config"]["primary"]]["front"][2]
        panel.alpha_composite(character.resize((128, 128), Image.Resampling.NEAREST), (32, 56))
        vfx_id = VFX_MAP.get(snapshot["config"]["role"], {}).get(snapshot["config"]["primary"])
        if vfx_id and vfx_id in vfx_by_id:
            entry = vfx_by_id[vfx_id]
            sheet = Image.open(ROOT / entry["path"]).convert("RGBA")
            fw, fh = int(entry["frameWidth"]), int(entry["frameHeight"])
            frame_index = min(int(entry["frameCount"]) - 1, 2)
            fx = sheet.crop((frame_index * fw, 0, (frame_index + 1) * fw, fh)).resize((fw * 2, fh * 2), Image.Resampling.NEAREST)
            panel.alpha_composite(fx, ((192 - fx.width) // 2, (192 - fx.height) // 2 - 18))
        composite.alpha_composite(panel, (index * 192, 0))
    composite.save(PREVIEWS / "v5_action_vfx_composite.png", optimize=True)

    # Four-direction anchor check: the orange line is exactly y=56 in each
    # transparent frame before the 2x review scale.
    anchor_page = Image.new("RGBA", (4 * 128, len(snapshots) * 128), bg)
    draw = ImageDraw.Draw(anchor_page)
    for role_index, snapshot in enumerate(snapshots):
        for direction_index, direction in enumerate(DIRECTIONS):
            frame = snapshot["walk"][direction][0].resize((128, 128), Image.Resampling.NEAREST)
            x = direction_index * 128
            y = role_index * 128
            anchor_page.alpha_composite(frame, (x, y))
            draw.line((x, y + 112, x + 127, y + 112), fill=(255, 118, 84, 255), width=2)
            draw.line((x + 64, y + 106, x + 64, y + 120), fill=(217, 255, 87, 255), width=1)
    anchor_page.save(PREVIEWS / "v5_four_direction_anchor_check.png", optimize=True)

    (PREVIEWS / "v5_review_previews.json").write_text(json.dumps({
        "walkOverview": "v5_walk_overview_all_roles.png",
        "skillOverview": "v5_skill_actions_overview_all_roles.png",
        "vfxComposite": "v5_action_vfx_composite.png",
        "anchorCheck": "v5_four_direction_anchor_check.png",
        "roles": [snapshot["config"]["asset_id"] for snapshot in snapshots]
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_manifest(entries: list[dict]) -> None:
    path = GAME / "dynamic_assets_manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    ids = {entry["id"] for entry in entries}
    keep = [entry for entry in manifest.get("actions", []) if entry.get("id") not in ids and not (entry.get("assetId") in ROLES and entry.get("state") == "walk")]
    manifest["actions"] = keep + entries
    manifest["version"] = 2
    manifest["characterSkillActions"] = {asset_id: config["skills"] for asset_id, config in ROLES.items()}
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    entries = []
    snapshots = []
    for asset_id, raw in ROLES.items():
        config = dict(raw)
        config["asset_id"] = asset_id
        copy_v4_static(config)
        base = load_direction_frames(config)
        walk = {direction: [walk_frame(base[direction], index) for index in range(6)] for direction in DIRECTIONS}
        entries.append(write_action(config, "walk", walk, 10, True))
        primary_count = 5
        primary = {direction: [skill_frame(base[direction], config["role"], direction, config["primary"], index, primary_count, config["color"], config["accent"]) for index in range(primary_count)] for direction in DIRECTIONS}
        attack_entry = write_action(config, "attack", primary, 12, False)
        attack_entry["skillId"] = config["primary"]
        attack_entry["vfx"] = VFX_MAP.get(config["role"], {}).get(config["primary"])
        entries.append(attack_entry)
        all_skill_frames = {config["primary"]: primary}
        entries.append(write_action(config, "skill", primary, 12, False, config["primary"], 2))
        for skill_id in config["skills"]:
            if skill_id == config["primary"]:
                continue
            count = 6 if skill_id in COMBOS else 5
            frames = {direction: [skill_frame(base[direction], config["role"], direction, skill_id, index, count, config["color"], config["accent"]) for index in range(count)] for direction in DIRECTIONS}
            all_skill_frames[skill_id] = frames
            entries.append(write_action(config, "skill", frames, 12, False, skill_id, 3 if count == 6 else 2))
        make_previews(config, base, all_skill_frames)
        snapshots.append({"config": config, "base": base, "walk": walk, "skills": all_skill_frames})

    update_manifest(entries)
    make_combined_previews(snapshots)
    print(json.dumps({"characterActionEntries": len(entries), "skillActionEntries": 45, "roles": list(ROLES)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
