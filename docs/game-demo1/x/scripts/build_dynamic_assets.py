from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

from rebuild_formal_action_sequences import rebuild_target_actions


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "game"

DIRECTIONS = ["front", "right", "back", "left"]
FRAME_SIZE = 64


def rgb(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


CHARACTER_PALETTES = {
    "gunner": {
        "outline": rgb("#090d10"), "armor": rgb("#d7d5c4"), "armor_dark": rgb("#6f7771"),
        "visor": rgb("#183338"), "visor_hi": rgb("#59dbe8"), "accent": rgb("#ff7547"),
        "weapon": rgb("#1c2728"), "weapon_hi": rgb("#d9ff57"), "pack": rgb("#303d3b"),
    },
    "warrior": {
        "outline": rgb("#090d10"), "armor": rgb("#e8dfc3"), "armor_dark": rgb("#646b63"),
        "visor": rgb("#233333"), "visor_hi": rgb("#ffd75a"), "accent": rgb("#ff7654"),
        "weapon": rgb("#d7d1b7"), "weapon_hi": rgb("#fff1a5"), "pack": rgb("#3d3934"),
    },
    "mechanic": {
        "outline": rgb("#090d10"), "armor": rgb("#d8e8db"), "armor_dark": rgb("#62736b"),
        "visor": rgb("#1f3538"), "visor_hi": rgb("#54b9ff"), "accent": rgb("#d9ff57"),
        "weapon": rgb("#253b3b"), "weapon_hi": rgb("#9cffd6"), "pack": rgb("#38514d"),
    },
}

PLANET_PALETTES = {
    "rust": {
        "outline": rgb("#090b0c"), "dark": rgb("#332725"), "body": rgb("#86503d"),
        "body_hi": rgb("#bd7048"), "accent": rgb("#ff8a4a"), "light": rgb("#dfae74"),
    },
    "spore": {
        "outline": rgb("#090b0d"), "dark": rgb("#2a2034"), "body": rgb("#704278"),
        "body_hi": rgb("#ae6ee8"), "accent": rgb("#c780ff"), "light": rgb("#d5ff87"),
    },
    "moon": {
        "outline": rgb("#080d10"), "dark": rgb("#263840"), "body": rgb("#486771"),
        "body_hi": rgb("#7195a4"), "accent": rgb("#8ee9e1"), "light": rgb("#d2ffff"),
    },
}

CHARACTERS = {
    "gunner_mia": {
        "role": "gunner", "states": {"idle": 4, "walk": 6, "attack": 4, "hit": 2, "death": 6, "reload": 5, "dash": 5}
    },
    "warrior_kade": {
        "role": "warrior", "states": {"idle": 4, "walk": 6, "attack": 4, "hit": 2, "death": 6, "heavy_attack": 5, "guard": 4}
    },
    "mechanic_locke": {
        "role": "mechanic", "states": {"idle": 4, "walk": 6, "attack": 4, "hit": 2, "death": 6, "deploy": 5, "repair": 5, "self_destruct": 6}
    },
}

ENEMIES = {
    "rust": {
        "scrap_mite": "swarm", "plasma_watcher": "shooter", "rivethorn_ram": "charger", "pressure_bloater": "bloater"
    },
    "spore": {
        "mycelium_skitter": "swarm", "acid_eye_pod": "shooter", "fungal_ram": "charger", "spore_bloater": "bloater"
    },
    "moon": {
        "static_crawler": "swarm", "prism_sentry": "shooter", "crater_ram": "charger", "void_bloater": "bloater"
    },
}

GUNNER_VFX = {
    "muzzle_flash": {"event": "gunner_shot", "fps": 18, "loop": False, "paletteVariant": "gunner"},
    "kinetic_impact": {"event": "projectile_hit", "fps": 16, "loop": False, "paletteVariant": "gunner"},
    "ricochet_spark": {"event": "projectile_bounce", "fps": 18, "loop": False, "paletteVariant": "gunner"},
    "explosive_impact": {"event": "explosive_hit", "fps": 14, "loop": False, "paletteVariant": "gunner"},
    "railgun_charge": {"event": "railgun_charge", "fps": 12, "loop": True, "paletteVariant": "gunner"},
    "railgun_beam": {"event": "railgun_fire", "fps": 20, "loop": True, "paletteVariant": "gunner"},
    "railgun_impact": {"event": "railgun_hit", "fps": 18, "loop": False, "paletteVariant": "gunner"},
    "weakspot_lock": {"event": "weakspot_lock", "fps": 10, "loop": True, "paletteVariant": "gunner"},
    "emergency_dash": {"event": "emergency_dash", "fps": 16, "loop": False, "paletteVariant": "gunner"},
    "piercing_star_burst": {"event": "piercing_star", "fps": 15, "loop": False, "paletteVariant": "gunner"},
    "hunt_barrage_lock": {"event": "hunt_barrage_lock", "fps": 12, "loop": False, "paletteVariant": "gunner"},
    "zero_storm_burst": {"event": "zero_storm", "fps": 15, "loop": False, "paletteVariant": "gunner"},
}

WARRIOR_VFX = {
    "slash_arc": ("melee_attack", 64, 64, 5, 16, False, "source-over"),
    "sword_wave": ("sword_wave", 64, 64, 5, 14, False, "lighter"),
    "orbit_blade": ("orbit_blade", 64, 64, 6, 14, True, "lighter"),
    "heavy_impact": ("heavy_attack", 96, 96, 6, 14, False, "source-over"),
    "guard": ("guard", 64, 64, 4, 10, True, "lighter"),
    "counter": ("counter", 96, 96, 6, 14, False, "lighter"),
    "star_ring": ("star_ring", 96, 96, 6, 12, True, "lighter"),
    "phantom_counter": ("phantom_counter", 96, 96, 6, 14, False, "lighter"),
}

MECHANIC_VFX = {
    "drone_muzzle": ("drone_shot", 32, 32, 4, 18, False, "lighter"),
    "drone_arc": ("drone_arc", 64, 64, 5, 16, False, "lighter"),
    "turret_deploy": ("turret_deploy", 64, 64, 5, 12, False, "source-over"),
    "turret_fire": ("turret_shot", 32, 32, 4, 18, False, "lighter"),
    "repair_pulse": ("repair", 64, 64, 6, 12, True, "lighter"),
    "shield_pulse": ("shield", 96, 96, 6, 12, True, "lighter"),
    "self_destruct_burst": ("self_destruct", 128, 128, 6, 15, False, "source-over"),
    "swarm_protocol": ("swarm_protocol", 96, 96, 6, 15, False, "lighter"),
    "mobile_fortress": ("mobile_fortress", 96, 96, 6, 12, True, "lighter"),
    "recycle_burst": ("recycle", 96, 96, 6, 15, False, "lighter"),
}

ENEMY_VFX = {
    "swarm_attack": ("swarm", "attack", 32, 32, 4, 16, False, "source-over"),
    "swarm_hit": ("swarm", "hit", 32, 32, 4, 18, False, "source-over"),
    "swarm_death": ("swarm", "death", 64, 64, 6, 14, False, "source-over"),
    "shooter_charge": ("shooter", "charge", 64, 64, 5, 12, True, "lighter"),
    "shooter_fire": ("shooter", "fire", 32, 32, 4, 18, False, "lighter"),
    "shooter_hit": ("shooter", "hit", 32, 32, 4, 18, False, "source-over"),
    "charger_charge": ("charger", "charge", 64, 64, 5, 12, True, "lighter"),
    "charger_impact": ("charger", "impact", 96, 96, 6, 14, False, "source-over"),
    "charger_death": ("charger", "death", 64, 64, 6, 14, False, "source-over"),
    "bloater_inflate": ("bloater", "inflate", 64, 64, 5, 12, True, "source-over"),
    "bloater_burst": ("bloater", "burst", 128, 128, 6, 15, False, "source-over"),
    "bloater_pool": ("bloater", "pool", 96, 96, 6, 12, True, "lighter"),
}

PALETTE_FX = {
    "gunner": {"core": rgb("#59dbe8"), "hot": rgb("#d9ff57"), "dark": rgb("#12343a"), "white": rgb("#e8fff8")},
    "warrior": {"core": rgb("#ff7654"), "hot": rgb("#ffd75a"), "dark": rgb("#4b2927"), "white": rgb("#fff1c4")},
    "mechanic": {"core": rgb("#d9ff57"), "hot": rgb("#54b9ff"), "dark": rgb("#1d4a45"), "white": rgb("#e3fff3")},
}


def rect(draw: ImageDraw.ImageDraw, box, fill) -> None:
    x0, y0, x1, y1 = (int(value) for value in box)
    draw.rectangle((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=fill)


def poly(draw: ImageDraw.ImageDraw, points, fill) -> None:
    draw.polygon([(int(x), int(y)) for x, y in points], fill=fill)


def line(draw: ImageDraw.ImageDraw, points, fill, width: int = 1) -> None:
    draw.line([(int(x), int(y)) for x, y in points], fill=fill, width=max(1, int(width)), joint="curve")


def new_image(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def clear_edge_alpha(image: Image.Image) -> Image.Image:
    """Keep a transparent safety pixel around every generated frame."""
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for x in range(width):
        pixels[x, 0] = (pixels[x, 0][0], pixels[x, 0][1], pixels[x, 0][2], 0)
        pixels[x, height - 1] = (pixels[x, height - 1][0], pixels[x, height - 1][1], pixels[x, height - 1][2], 0)
    for y in range(height):
        pixels[0, y] = (pixels[0, y][0], pixels[0, y][1], pixels[0, y][2], 0)
        pixels[width - 1, y] = (pixels[width - 1, y][0], pixels[width - 1, y][1], pixels[width - 1, y][2], 0)
    return image


def phase(frame: int, count: int) -> float:
    return 0.0 if count <= 1 else frame / float(count - 1)


def oscillation(frame: int, count: int, cycles: float = 1.0) -> float:
    return math.sin(phase(frame, count) * math.tau * cycles)


def save_gif(frames: list[Image.Image], path: Path, fps: int) -> None:
    if not frames:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    rgb_frames = []
    for frame in frames:
        canvas = Image.new("RGBA", frame.size, (13, 18, 20, 255))
        canvas.alpha_composite(frame)
        rgb_frames.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=64))
    rgb_frames[0].save(path, save_all=True, append_images=rgb_frames[1:], duration=max(1, int(1000 / fps)), loop=0, disposal=2)


def draw_character_frame(role: str, state: str, direction: str, frame: int, count: int) -> Image.Image:
    image = new_image(64, 64)
    draw = ImageDraw.Draw(image)
    p = CHARACTER_PALETTES[role]
    t = phase(frame, count)
    step = oscillation(frame, count, 1.0)
    moving = state == "walk"
    bob = round(step * 1.2) if moving else (
        round(step * 0.9) if state == "idle" else
        (round(step * 0.6) if state in {"attack", "heavy_attack", "deploy", "repair"} else 0)
    )
    leg = round(step * 2.0) if moving else 0
    side = -1 if direction == "left" else 1
    front = direction == "front"
    back = direction == "back"
    flash = state == "hit" and frame % 2 == 0
    alpha = 255
    if state == "death":
        alpha = max(90, int(255 * (1.0 - 0.62 * t)))
        bob = round(t * 4)
    def c(value):
        return (*value[:3], alpha)

    # Backpack and cable remain visible even in the side views, but move by a pixel during motion.
    pack_x = 17 if side > 0 else 39
    rect(draw, (pack_x - 3, 25 + bob, pack_x + 4, 45 + bob), c(p["pack"]))
    rect(draw, (pack_x - 1, 28 + bob, pack_x + 3, 39 + bob), c(p["armor_dark"]))
    line(draw, [(pack_x, 41 + bob), (pack_x + side * 7, 49 + bob)], c(p["accent"]), 2)

    # Legs use independent shifts to create a readable alternating walk while keeping the foot line at y=56.
    left_leg = leg if moving else 0
    right_leg = -leg if moving else 0
    rect(draw, (24 + left_leg, 39 + bob, 31 + left_leg, 55), c(p["armor_dark"]))
    rect(draw, (34 + right_leg, 39 + bob, 41 + right_leg, 55), c(p["armor_dark"]))
    rect(draw, (22 + left_leg, 53, 31 + left_leg, 58), c(p["outline"]))
    rect(draw, (34 + right_leg, 53, 43 + right_leg, 58), c(p["outline"]))

    # Torso and helmet.
    rect(draw, (20, 27 + bob, 44, 44 + bob), c(p["outline"]))
    rect(draw, (23, 29 + bob, 41, 42 + bob), c(p["armor"]))
    rect(draw, (26, 36 + bob, 38, 40 + bob), c(p["accent"]))
    rect(draw, (21, 14 + bob, 43, 31 + bob), c(p["outline"]))
    rect(draw, (24, 16 + bob, 40, 29 + bob), c(p["armor"]))
    rect(draw, (26, 19 + bob, 38, 26 + bob), c(p["visor"]))
    visor = p["visor_hi"] if front else p["accent"]
    rect(draw, (28, 21 + bob, 36, 24 + bob), c(visor))
    if back:
        rect(draw, (27, 17 + bob, 37, 20 + bob), c(p["pack"]))
        rect(draw, (29, 22 + bob, 35, 26 + bob), c(p["armor_dark"]))

    # Weapon and role-specific equipment.
    if role == "gunner":
        extend = 10 + round(t * 8) if state in {"attack", "reload"} else 7
        weapon_x = 43 if side > 0 else 21
        rect(draw, (weapon_x, 28 + bob, weapon_x + side * extend, 33 + bob), c(p["weapon"]))
        muzzle_x = weapon_x + side * extend
        rect(draw, (muzzle_x - 2, 29 + bob, muzzle_x + 2, 32 + bob), c(p["weapon_hi"]))
        if state == "reload":
            rect(draw, (weapon_x - 2, 35 + bob, weapon_x + 4, 39 + bob), c(p["accent"]))
        if state == "dash":
            for trail in range(3):
                tx = 19 - side * (trail * 5 + 5)
                rect(draw, (tx, 42 + bob + trail, tx + 3, 44 + bob + trail), c(p["visor_hi"]))
    elif role == "warrior":
        blade_len = 13 + round(t * 14) if state in {"attack", "heavy_attack", "counter"} else 11
        hand_x = 43 if side > 0 else 21
        rect(draw, (hand_x - 2, 31 + bob, hand_x + 4, 37 + bob), c(p["accent"]))
        rect(draw, (hand_x, 28 + bob, hand_x + side * blade_len, 31 + bob), c(p["weapon"]))
        rect(draw, (hand_x + side * blade_len - 2, 27 + bob, hand_x + side * blade_len + 3, 31 + bob), c(p["weapon_hi"]))
        if state == "guard":
            line(draw, [(hand_x, 23 + bob), (hand_x + side * 18, 39 + bob)], c(p["weapon_hi"]), 3)
    else:
        tool_x = 43 if side > 0 else 21
        rect(draw, (tool_x, 31 + bob, tool_x + side * 8, 36 + bob), c(p["weapon"]))
        rect(draw, (tool_x + side * 7, 29 + bob, tool_x + side * 12, 33 + bob), c(p["weapon_hi"]))
        if state in {"deploy", "repair"}:
            rect(draw, (18, 18 + bob, 25, 24 + bob), c(p["accent"]))
            rect(draw, (39, 18 + bob, 46, 24 + bob), c(p["accent"]))
        if state == "self_destruct":
            rect(draw, (28, 12 + bob, 36, 15 + bob), c(p["accent"]))

    if flash:
        # Hard-edged hit flash, kept inside the 64x64 frame.
        rect(draw, (22, 16 + bob, 42, 43 + bob), c((255, 255, 240, 255)))
    return image


def draw_enemy_frame(planet: str, behavior: str, state: str, direction: str, frame: int, count: int) -> Image.Image:
    image = new_image(64, 64)
    draw = ImageDraw.Draw(image)
    p = PLANET_PALETTES[planet]
    t = phase(frame, count)
    step = oscillation(frame, count)
    side = -1 if direction == "left" else 1
    front = direction == "front"
    back = direction == "back"
    walk = state == "walk"
    hit = state == "hit" and frame % 2 == 0
    death_scale = 1.0 if state != "death" else max(0.45, 1.0 - t * 0.52)
    bob = round(step * 1.2) if walk else (
        round(step * 0.9) if state == "idle" else
        (round(step * 1.0) if state in {"attack", "charge", "inflate"} else 0)
    )
    cx, cy = 32, 38 + bob + round((1.0 - death_scale) * 8)
    color_body = rgb("#fff8dc") if hit else p["body"]
    color_hi = rgb("#ffffff") if hit else p["body_hi"]

    if behavior == "swarm":
        width = round(17 * death_scale)
        poly(draw, [(cx - width, cy + 8), (cx - width + 5, cy - 10), (cx, cy - 18), (cx + width - 4, cy - 10), (cx + width, cy + 8), (cx + 10, cy + 15), (cx - 10, cy + 15)], color_body)
        rect(draw, (cx - 10, cy - 4, cx + 10, cy + 8), p["dark"])
        for index in range(3):
            x = cx - 8 + index * 8
            gait = round(step * 3) if walk else 0
            line(draw, [(x, cy + 7), (x - 7 * side + gait, cy + 18), (x - 10 * side + gait, cy + 22)], p["outline"], 2)
            line(draw, [(x, cy + 7), (x + 7 * side - gait, cy + 18), (x + 10 * side - gait, cy + 22)], p["accent"], 1)
        if front:
            rect(draw, (cx - 3, cy - 3, cx + 3, cy + 3), p["accent"])
        elif back:
            rect(draw, (cx - 5, cy - 2, cx + 5, cy + 2), p["dark"])
        else:
            rect(draw, (cx + side * 6 - 3, cy - 3, cx + side * 6 + 2, cy + 2), p["accent"])
        if state == "attack":
            line(draw, [(cx + side * 14, cy - 1), (cx + side * (23 + round(t * 8)), cy - 5)], p["light"], 2)
    elif behavior == "shooter":
        poly(draw, [(cx - 11, cy + 10), (cx - 13, cy - 4), (cx - 6, cy - 16), (cx + 9, cy - 14), (cx + 14, cy + 2), (cx + 9, cy + 12)], color_body)
        for x in (cx - 9, cx, cx + 9):
            line(draw, [(x, cy + 8), (x - 7 * side, cy + 20)], p["outline"], 2)
        rect(draw, (cx - 6, cy - 11, cx + 6, cy - 3), p["dark"])
        rect(draw, (cx - 2, cy - 9, cx + 3, cy - 5), p["accent"] if front else p["body_hi"])
        barrel = cx + side * (14 + (round(t * 5) if state == "attack" else 0))
        rect(draw, (min(cx + side * 4, barrel), cy - 3, max(cx + side * 4, barrel), cy + 2), p["dark"])
        rect(draw, (barrel - 3, cy - 3, barrel + 3, cy + 2), p["accent"])
        rect(draw, (cx - 15, cy - 20, cx - 8, cy - 14), p["body_hi"] if back else p["dark"])
    elif behavior == "charger":
        poly(draw, [(cx - 19, cy + 11), (cx - 14, cy - 8), (cx + 2, cy - 15), (cx + 19, cy - 6), (cx + 20, cy + 10), (cx + 9, cy + 16), (cx - 13, cy + 16)], color_body)
        rect(draw, (cx - 13, cy - 3, cx + 14, cy + 10), p["dark"])
        for x in (cx - 11, cx + 10):
            line(draw, [(x, cy + 7), (x - 8 * side, cy + 20)], p["outline"], 3)
        horn = cx + side * (18 + round(t * 12) if state == "attack" else 18)
        poly(draw, [(cx + side * 12, cy - 7), (horn, cy - 12), (horn, cy - 3)], p["light"])
        rect(draw, (cx - 6, cy - 12, cx + 7, cy - 7), p["accent"])
        if state == "attack":
            line(draw, [(cx - side * 20, cy + 2), (cx - side * 28, cy + 2)], p["accent"], 2)
    else:
        radius = round(17 * death_scale) + (round(t * 5) if state == "inflate" else 0)
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color_body, outline=p["outline"], width=2)
        draw.ellipse((cx - radius + 6, cy - radius + 6, cx + radius - 6, cy + radius - 6), fill=p["dark"])
        poly(draw, [(cx - 9, cy - 4), (cx, cy - 14), (cx + 10, cy - 5), (cx + 5, cy + 8), (cx - 6, cy + 8)], p["body_hi"])
        if front:
            rect(draw, (cx - 3, cy - 3, cx + 3, cy + 3), p["accent"])
        elif not back:
            rect(draw, (cx + side * 7 - 3, cy - 4, cx + side * 7 + 3, cy + 2), p["accent"])
        for x in (cx - 11, cx + 11):
            line(draw, [(x, cy + 12), (x - 4 * side, cy + 22)], p["outline"], 3)
        if state == "attack" or state == "inflate":
            rect(draw, (cx - radius - 6, cy - 2, cx - radius, cy + 2), p["accent"])
            rect(draw, (cx + radius, cy - 2, cx + radius + 6, cy + 2), p["accent"])

    if state == "hit":
        rect(draw, (cx - 14, cy - 17, cx + 14, cy + 14), color_hi)
    return image


def save_action_asset(folder: Path, asset_id: str, role: str, state: str, count: int, frame_factory) -> dict:
    action_dir = folder / "actions" / state
    action_dir.mkdir(parents=True, exist_ok=True)
    all_frames: dict[str, list[Image.Image]] = {}
    for row, direction in enumerate(DIRECTIONS):
        all_frames[direction] = []
        for frame_index in range(count):
            frame = clear_edge_alpha(frame_factory(direction, frame_index, count))
            all_frames[direction].append(frame)
            frame.save(action_dir / f"{direction}_{frame_index:02d}.png")

    sheet = new_image(count * FRAME_SIZE, len(DIRECTIONS) * FRAME_SIZE)
    for row, direction in enumerate(DIRECTIONS):
        for frame_index, frame in enumerate(all_frames[direction]):
            sheet.alpha_composite(frame, (frame_index * FRAME_SIZE, row * FRAME_SIZE))
    sheet_name = f"{asset_id}_{state}_4dir.png"
    sheet.save(action_dir / sheet_name)

    preview_frames: list[Image.Image] = []
    for frame_index in range(count):
        preview = Image.new("RGBA", (512, 512), (18, 24, 26, 255))
        for row, direction in enumerate(DIRECTIONS):
            preview.alpha_composite(all_frames[direction][frame_index].resize((128, 128), Image.Resampling.NEAREST), (192, row * 128))
        preview_frames.append(preview)
    gif_name = f"{asset_id}_{state}.gif"
    save_gif(preview_frames, action_dir / gif_name, 10)

    metadata = {
        "id": f"{asset_id}.{state}", "assetType": "character_action" if role in CHARACTER_PALETTES else "enemy_action",
        "assetId": asset_id, "role": role if role in CHARACTER_PALETTES else None,
        "state": state, "sheet": sheet_name, "sheetLayout": "rows-by-direction",
        "frameWidth": FRAME_SIZE, "frameHeight": FRAME_SIZE, "frameCount": count,
        "directionOrder": DIRECTIONS, "directions": {direction: {"row": index} for index, direction in enumerate(DIRECTIONS)},
        "frames": {direction: [f"{direction}_{i:02d}.png" for i in range(count)] for direction in DIRECTIONS},
        "anchor": {"x": 32, "y": 56}, "fps": 10, "loop": state not in {"hit", "death"},
        "blendMode": "source-over", "previewGif": gif_name, "imageSmoothingEnabled": False,
    }
    if role not in CHARACTER_PALETTES:
        metadata["planet"] = role.split(":", 1)[0]
        metadata["enemyType"] = role.split(":", 1)[1]
    (action_dir / f"{asset_id}_{state}_4dir.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"category": metadata["assetType"], **metadata, "path": str((action_dir / sheet_name).relative_to(ROOT)).replace("\\", "/")}


def fx_rect(draw: ImageDraw.ImageDraw, cx: int, cy: int, width: int, height: int, fill) -> None:
    rect(draw, (cx - width // 2, cy - height // 2, cx + width // 2, cy + height // 2), fill)


def radial_pixels(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int, color, rays: int = 8, width: int = 2, phase_offset: float = 0.0) -> None:
    for index in range(rays):
        angle = phase_offset + index / rays * math.tau
        x1 = cx + math.cos(angle) * max(3, radius * 0.28)
        y1 = cy + math.sin(angle) * max(3, radius * 0.28)
        x2 = cx + math.cos(angle) * radius
        y2 = cy + math.sin(angle) * radius
        line(draw, [(x1, y1), (x2, y2)], color, width)


def draw_effect(effect_id: str, frame: int, count: int, width: int, height: int, palette: dict[str, tuple[int, int, int, int]]) -> Image.Image:
    image = new_image(width, height)
    draw = ImageDraw.Draw(image)
    cx, cy = width // 2, height // 2
    t = phase(frame, count)
    pulse = 0.5 + 0.5 * math.sin(t * math.tau)
    core, hot, dark, white = palette["core"], palette["hot"], palette["dark"], palette["white"]
    scale = min(width, height)

    if "muzzle" in effect_id or effect_id.endswith("_fire"):
        length = int(scale * (0.22 + t * 0.34))
        for index, color in enumerate((dark, core, hot, white)):
            start = cx - length // 4 + index * 2
            poly(draw, [(start, cy - 4 - index), (cx + length, cy), (start, cy + 4 + index)], color)
        radial_pixels(draw, cx + length // 2, cy, max(5, int(scale * 0.22)), hot, 5, 2)
    elif "beam" in effect_id:
        y = cy
        thickness = max(2, int(2 + pulse * 5))
        rect(draw, (0, y - thickness, width, y + thickness), dark)
        rect(draw, (0, y - max(1, thickness // 2), width, y + max(1, thickness // 2)), core)
        rect(draw, (0, y - 1, width, y + 1), white)
        for x in range(8, width, 20):
            rect(draw, (x, y - thickness - 2, min(width - 1, x + 5), y - thickness), hot)
    elif "arc" in effect_id:
        draw.arc((cx - scale // 3, cy - scale // 3, cx + scale // 3, cy + scale // 3), int(210 - t * 70), int(340 + t * 70), fill=core, width=max(2, scale // 18))
        radial_pixels(draw, cx, cy, int(scale * 0.42), hot, 5, 1, t * 2)
    elif "lock" in effect_id or effect_id in {"guard", "shield_pulse", "repair_pulse", "weakspot_lock"}:
        radius = int(scale * (0.24 + pulse * 0.18))
        draw.rectangle((cx - radius, cy - radius, cx + radius, cy + radius), outline=core, width=max(2, scale // 22))
        draw.rectangle((cx - radius + 5, cy - radius + 5, cx + radius - 5, cy + radius - 5), outline=hot, width=2)
        for index in range(4):
            angle = t * math.tau + index * math.pi / 2
            x = cx + int(math.cos(angle) * radius)
            y = cy + int(math.sin(angle) * radius)
            fx_rect(draw, x, y, max(3, scale // 12), max(3, scale // 12), white)
    elif "pool" in effect_id:
        radius = int(scale * (0.25 + t * 0.2))
        draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), fill=dark, outline=core, width=2)
        for index in range(3):
            x = cx - radius // 2 + index * radius // 2
            rect(draw, (x, cy - 3 - index * 2, x + 4, cy + 2 - index * 2), hot)
    elif "charge" in effect_id or "inflate" in effect_id:
        radius = int(scale * (0.18 + t * 0.28))
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=core, width=max(2, scale // 18))
        fx_rect(draw, cx, cy, max(4, int(scale * 0.08)), max(4, int(scale * 0.08)), hot)
        radial_pixels(draw, cx, cy, max(5, radius), hot, 8, 1, t * math.pi)
    elif "death" in effect_id or "burst" in effect_id or "destruct" in effect_id or "impact" in effect_id or "counter" in effect_id or "recycle" in effect_id:
        radius = int(scale * (0.14 + t * 0.40))
        radial_pixels(draw, cx, cy, radius, core, 10, max(2, scale // 26), t * 0.8)
        radial_pixels(draw, cx, cy, max(4, radius // 2), hot, 8, max(1, scale // 32), -t * 0.8)
        fx_rect(draw, cx, cy, max(3, int(scale * (0.22 - t * 0.07))), max(3, int(scale * (0.22 - t * 0.07))), white)
    elif "slash" in effect_id or "sword" in effect_id or "blade" in effect_id:
        radius = int(scale * (0.28 + t * 0.20))
        draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), int(-65 + t * 90), int(50 + t * 90), fill=white, width=max(2, scale // 18))
        draw.arc((cx - radius + 5, cy - radius + 5, cx + radius - 5, cy + radius - 5), int(-65 + t * 90), int(50 + t * 90), fill=core, width=max(2, scale // 20))
    elif "deploy" in effect_id or "fortress" in effect_id:
        radius = int(scale * (0.20 + t * 0.22))
        draw.rectangle((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), outline=core, width=2)
        rect(draw, (cx - 3, cy - radius // 2 - 6, cx + 3, cy + radius // 2 + 6), hot)
        rect(draw, (cx - radius - 5, cy - 2, cx + radius + 5, cy + 2), white)
    elif "storm" in effect_id or "ring" in effect_id or "protocol" in effect_id:
        radius = int(scale * (0.20 + t * 0.30))
        draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), outline=core, width=max(2, scale // 20))
        radial_pixels(draw, cx, cy, radius, hot, 12, 2, t * math.tau)
    else:
        radial_pixels(draw, cx, cy, int(scale * (0.20 + t * 0.30)), core, 8, 2)
        fx_rect(draw, cx, cy, max(3, int(scale * 0.16)), max(3, int(scale * 0.16)), hot)
    return image


def save_fx_asset(folder: Path, asset_id: str, event: str, width: int, height: int, count: int, fps: int, loop: bool, blend_mode: str, palette_variant: str, palette: dict) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    frames: list[Image.Image] = []
    frame_names: list[str] = []
    for index in range(count):
        frame = clear_edge_alpha(draw_effect(asset_id, index, count, width, height, palette))
        name = f"frame_{index:02d}.png"
        frame.save(folder / name)
        frames.append(frame)
        frame_names.append(name)
    sheet = new_image(width * count, height)
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * width, 0))
    sheet_name = f"{asset_id}.png"
    sheet.save(folder / sheet_name)
    save_gif(frames, folder / f"{asset_id}.gif", fps)
    metadata = {
        "id": asset_id, "category": "vfx", "event": event, "paletteVariant": palette_variant,
        "image": sheet_name, "sheetLayout": "horizontal", "frameWidth": width, "frameHeight": height,
        "frameCount": count, "fps": fps, "loop": loop, "anchor": {"x": width // 2, "y": height // 2},
        "blendMode": blend_mode, "frames": frame_names, "previewGif": f"{asset_id}.gif", "imageSmoothingEnabled": False,
    }
    (folder / f"{asset_id}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {**metadata, "path": str((folder / sheet_name).relative_to(ROOT)).replace("\\", "/")}


def normalize_existing_gunner_vfx() -> list[dict]:
    entries: list[dict] = []
    base = ASSETS / "skills" / "gunner" / "vfx"
    for asset_id, spec in GUNNER_VFX.items():
        folder = base / asset_id
        json_path = folder / f"{asset_id}.json"
        metadata = json.loads(json_path.read_text(encoding="utf-8"))
        metadata.update({"category": "vfx", "event": spec["event"], "paletteVariant": spec["paletteVariant"], "sheetLayout": "horizontal", "previewGif": f"{asset_id}.gif", "imageSmoothingEnabled": False})
        frame_files = [folder / name for name in metadata.get("frames", [])]
        frames = [Image.open(path).convert("RGBA") for path in frame_files if path.exists()]
        if frames:
            save_gif(frames, folder / f"{asset_id}.gif", int(metadata.get("fps", spec["fps"])))
        json_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        entries.append({**metadata, "path": str((folder / metadata["image"]).relative_to(ROOT)).replace("\\", "/")})
    return entries


def make_overview(pages: Iterable[Image.Image], output: Path, fps: int = 3) -> None:
    page_list = list(pages)
    if not page_list:
        return
    save_gif(page_list, output, fps)


def action_overview_pages(action_entries: list[dict], group_key: str, columns: int = 4) -> list[Image.Image]:
    grouped: dict[str, list[dict]] = {}
    for entry in action_entries:
        key = entry[group_key]
        grouped.setdefault(key, []).append(entry)
    pages: list[Image.Image] = []
    font = ImageFont.load_default()
    for group, entries in grouped.items():
        entries = sorted(entries, key=lambda item: item["state"])
        rows = max(1, math.ceil(len(entries) / columns))
        page = Image.new("RGBA", (columns * 150, rows * 96), (18, 24, 26, 255))
        draw = ImageDraw.Draw(page)
        for index, entry in enumerate(entries):
            image = Image.open(ROOT / entry["path"]).convert("RGBA")
            thumb = image.resize((min(128, image.width), min(80, image.height)), Image.Resampling.NEAREST)
            x = (index % columns) * 150 + 10
            y = (index // columns) * 96 + 14
            page.alpha_composite(thumb, (x, y))
            draw.text((x, 2 + index // columns * 96), entry["state"], font=font, fill=(221, 213, 186, 255))
        pages.append(page)
    return pages


def build() -> None:
    action_entries: list[dict] = []
    for asset_id, spec in CHARACTERS.items():
        role = spec["role"]
        folder = ASSETS / "characters" / asset_id
        for state, count in spec["states"].items():
            entry = save_action_asset(folder, asset_id, role, state, count, lambda direction, frame, n, r=role, s=state: draw_character_frame(r, s, direction, frame, n))
            entry["role"] = role
            action_entries.append(entry)

    for planet, enemies in ENEMIES.items():
        for asset_id, behavior in enemies.items():
            folder = ASSETS / "enemies" / planet / asset_id
            for state, count in {"idle": 4, "walk": 6, "attack": 4, "hit": 2, "death": 6}.items():
                role = f"{planet}:{behavior}"
                entry = save_action_asset(folder, asset_id, role, state, count, lambda direction, frame, n, p=planet, b=behavior, s=state: draw_enemy_frame(p, b, s, direction, frame, n))
                entry["planet"] = planet
                entry["enemyType"] = behavior
                action_entries.append(entry)

    vfx_entries = normalize_existing_gunner_vfx()
    for asset_id, spec in WARRIOR_VFX.items():
        event, width, height, count, fps, loop, blend = spec
        folder = ASSETS / "skills" / "warrior" / "vfx" / asset_id
        vfx_entries.append(save_fx_asset(folder, asset_id, event, width, height, count, fps, loop, blend, "warrior", PALETTE_FX["warrior"]))
    for asset_id, spec in MECHANIC_VFX.items():
        event, width, height, count, fps, loop, blend = spec
        folder = ASSETS / "skills" / "mechanic" / "vfx" / asset_id
        vfx_entries.append(save_fx_asset(folder, asset_id, event, width, height, count, fps, loop, blend, "mechanic", PALETTE_FX["mechanic"]))
    for planet in PLANET_PALETTES:
        for asset_id, spec in ENEMY_VFX.items():
            behavior, event, width, height, count, fps, loop, blend = spec
            variant_id = f"{planet}_{asset_id}"
            folder = ASSETS / "enemies" / "vfx" / planet / asset_id
            entry = save_fx_asset(folder, variant_id, event, width, height, count, fps, loop, blend, planet, {"core": PLANET_PALETTES[planet]["accent"], "hot": PLANET_PALETTES[planet]["light"], "dark": PLANET_PALETTES[planet]["dark"], "white": PLANET_PALETTES[planet]["body_hi"]})
            entry["planet"] = planet
            entry["enemyType"] = behavior
            vfx_entries.append(entry)

    # The legacy generic action factory is retained for the rest of the
    # dynamic package, but it must never put geometric placeholder bodies back
    # over the formal rust enemy and auxiliary character action sequences.
    # Rebuild this protected subset before the manifest/overview images are
    # written so future dynamic builds remain deterministic and safe.
    rebuild_target_actions()

    manifest = {
        "version": 1,
        "directionOrder": DIRECTIONS,
        "actionSheetLayout": "rows-by-direction",
        "actionFrame": {"width": 64, "height": 64, "anchor": {"x": 32, "y": 56}},
        "vfxSheetLayout": "horizontal",
        "actions": action_entries,
        "vfx": vfx_entries,
        "imageSmoothingEnabled": False,
    }
    (ASSETS / "dynamic_assets_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    char_pages = action_overview_pages([entry for entry in action_entries if entry["category"] == "character_action"], "role")
    enemy_pages = action_overview_pages([entry for entry in action_entries if entry["category"] == "enemy_action"], "planet")
    vfx_pages = []
    for category in ("gunner", "warrior", "mechanic", "enemy"):
        filtered = []
        for entry in vfx_entries:
            if category == "enemy" and entry.get("planet") in PLANET_PALETTES:
                filtered.append(entry)
            elif category != "enemy" and entry.get("paletteVariant") == category:
                filtered.append(entry)
        if filtered:
            page = Image.new("RGBA", (640, 512), (18, 24, 26, 255))
            for index, entry in enumerate(filtered[:20]):
                image = Image.open(ROOT / entry["path"]).convert("RGBA")
                thumb = image.resize((min(96, image.width), min(64, image.height)), Image.Resampling.NEAREST)
                x = (index % 6) * 106 + 5
                y = (index // 6) * 120 + 20
                page.alpha_composite(thumb, (x + (96 - thumb.width) // 2, y))
            vfx_pages.append(page)
    make_overview(char_pages, ASSETS / "characters" / "character_actions_overview.gif")
    make_overview(enemy_pages, ASSETS / "enemies" / "enemy_actions_overview.gif")
    make_overview(vfx_pages, ASSETS / "skills" / "dynamic_vfx_overview.gif")
    print(json.dumps({"actions": len(action_entries), "vfx": len(vfx_entries), "manifest": str(ASSETS / "dynamic_assets_manifest.json")}, ensure_ascii=False))


if __name__ == "__main__":
    build()
