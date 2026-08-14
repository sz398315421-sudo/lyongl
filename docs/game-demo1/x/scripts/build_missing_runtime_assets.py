from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "game"

DIRECTIONS = ["front", "right", "back", "left"]

PALETTES = {
    "spore": {
        "ink": (10, 13, 17, 255), "dark": (38, 31, 48, 255), "metal": (83, 86, 88, 255),
        "violet": (150, 74, 190, 255), "light": (205, 126, 235, 255), "accent": (188, 255, 80, 255),
    },
    "moon": {
        "ink": (8, 13, 17, 255), "dark": (42, 57, 64, 255), "metal": (111, 127, 131, 255),
        "violet": (112, 145, 176, 255), "light": (183, 221, 223, 255), "accent": (142, 233, 225, 255),
    },
    "warrior": {
        "ink": (8, 12, 14, 255), "dark": (47, 51, 52, 255), "metal": (119, 125, 118, 255),
        "violet": (255, 112, 76, 255), "light": (235, 224, 195, 255), "accent": (255, 215, 90, 255),
    },
    "mechanic": {
        "ink": (8, 12, 14, 255), "dark": (37, 49, 48, 255), "metal": (112, 128, 121, 255),
        "violet": (83, 184, 255, 255), "light": (214, 236, 217, 255), "accent": (217, 255, 87, 255),
    },
}


def rect(draw: ImageDraw.ImageDraw, box, fill):
    draw.rectangle(tuple(int(v) for v in box), fill=fill)


def poly(draw: ImageDraw.ImageDraw, points, fill):
    draw.polygon([(int(x), int(y)) for x, y in points], fill=fill)


def line(draw: ImageDraw.ImageDraw, points, fill, width=1):
    draw.line([(int(x), int(y)) for x, y in points], fill=fill, width=width, joint="curve")


def enemy_frame(enemy_type: str, planet: str, direction: str) -> Image.Image:
    p = PALETTES[planet]
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    side = -1 if direction == "left" else 1
    rear = direction == "back"
    front = direction == "front"

    if enemy_type == "swarm":
        body = (32, 33, 42) if rear else (32, 30, 40)
        poly(d, [(15, 39), (19, 25), (29, 19), (42, 24), (49, 39), (42, 47), (21, 47)], body)
        poly(d, [(18, 35), (22, 25), (31, 21), (40, 25), (45, 37), (38, 42), (22, 42)], p["metal"])
        for leg in range(3):
            lx = 22 + leg * 9
            line(d, [(lx, 39), (lx - 7 * side, 48), (lx - 10 * side, 53)], p["ink"], 3)
            line(d, [(lx, 39), (lx + 7 * side, 48), (lx + 10 * side, 53)], p["violet"], 2)
        if front:
            rect(d, (28, 27, 36, 35), p["dark"])
            rect(d, (31, 28, 34, 34), p["accent"])
        elif rear:
            rect(d, (27, 28, 37, 34), p["dark"])
            rect(d, (30, 30, 35, 32), p["violet"])
        else:
            rect(d, (30 + 5 * side, 28, 35 + 5 * side, 33), p["accent"])
            rect(d, (23, 25, 29, 29), p["violet"])
    elif enemy_type == "shooter":
        rect(d, (23, 27, 41, 43), p["ink"])
        poly(d, [(20, 35), (26, 20), (39, 20), (46, 35), (40, 45), (24, 45)], p["metal"])
        for lx in (24, 32, 40):
            line(d, [(lx, 42), (lx - 8 * side, 53)], p["ink"], 3)
        rect(d, (28, 23, 37, 31), p["dark"])
        rect(d, (31, 25, 35, 29), p["accent"] if front else p["violet"])
        barrel_x = 44 if side > 0 else 20
        rect(d, (barrel_x - 9 if side > 0 else barrel_x, 29, barrel_x + 9 if side > 0 else barrel_x + 9, 34), p["violet"])
        rect(d, (barrel_x + 7 if side > 0 else barrel_x - 4, 30, barrel_x + 11 if side > 0 else barrel_x, 33), p["accent"])
        rect(d, (20, 16, 27, 23), p["dark"] if rear else p["violet"])
        rect(d, (22, 17, 25, 19), p["light"])
    elif enemy_type == "charger":
        poly(d, [(12, 40), (17, 24), (34, 20), (51, 29), (52, 42), (42, 48), (18, 48)], p["metal"])
        rect(d, (18, 32, 45, 43), p["dark"])
        for lx in (20, 39):
            line(d, [(lx, 40), (lx - 7 * side, 52)], p["ink"], 4)
        horn_x = 50 if side > 0 else 14
        poly(d, [(horn_x, 29), (horn_x + 12 * side, 25), (horn_x + 12 * side, 32)], p["light"])
        rect(d, (27, 24, 37, 29), p["violet"])
        rect(d, (30, 25, 34, 28), p["accent"])
        rect(d, (25, 17, 39, 22), p["dark"])
        rect(d, (29, 16, 35, 19), p["violet"])
        rect(d, (46, 38, 51, 43), p["accent"])
    else:
        d.ellipse((14, 14, 50, 48), fill=p["metal"], outline=p["ink"], width=3)
        d.ellipse((20, 19, 44, 42), fill=p["dark"])
        poly(d, [(22, 25), (31, 17), (41, 24), (36, 35), (25, 35)], p["violet"])
        if front:
            rect(d, (29, 26, 35, 31), p["accent"])
        elif rear:
            rect(d, (27, 25, 37, 30), p["ink"])
        else:
            rect(d, (32 + 4 * side, 25, 38 + 4 * side, 30), p["accent"])
        for lx in (22, 42):
            line(d, [(lx, 43), (lx - 4 * side, 54)], p["ink"], 4)
        rect(d, (12, 30, 18, 36), p["violet"])
        rect(d, (46, 30, 52, 36), p["violet"])

    return image


def character_frame(role: str, direction: str) -> Image.Image:
    p = PALETTES[role]
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    side = -1 if direction == "left" else 1
    front = direction == "front"
    rear = direction == "back"
    rect(d, (21, 15, 43, 43), p["ink"])
    rect(d, (24, 17, 40, 35), p["light"])
    rect(d, (26, 20, 38, 27), p["dark"])
    rect(d, (28, 22, 36, 25), p["accent"] if front else p["violet"])
    rect(d, (23, 30, 41, 43), p["metal"])
    rect(d, (27, 35, 37, 39), p["violet"])
    rect(d, (25, 42, 31, 56), p["dark"])
    rect(d, (34, 42, 40, 56), p["dark"])
    rect(d, (23, 54, 31, 58), p["ink"])
    rect(d, (34, 54, 42, 58), p["ink"])
    rect(d, (17, 31, 23, 45), p["dark"])
    rect(d, (41, 31, 47, 45), p["dark"])
    rect(d, (19, 35, 22, 39), p["accent"])
    rect(d, (42, 35, 45, 39), p["accent"])
    if role == "warrior":
        rect(d, (13 if side < 0 else 44, 28, 17 if side < 0 else 58, 31), p["light"])
        rect(d, (11 if side < 0 else 47, 26, 14 if side < 0 else 50, 33), p["accent"])
        if rear:
            rect(d, (27, 27, 37, 34), p["violet"])
    else:
        rect(d, (13 if side < 0 else 44, 26, 20 if side < 0 else 51, 43), p["dark"])
        rect(d, (15 if side < 0 else 46, 29, 18 if side < 0 else 49, 34), p["accent"])
        rect(d, (29, 13, 35, 17), p["violet"])
        if rear:
            rect(d, (20, 26, 44, 43), p["dark"])
            rect(d, (26, 30, 38, 36), p["violet"])
    return image


def save_sprite_set(folder: Path, asset_id: str, frames: list[Image.Image], metadata: dict) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    names = []
    for direction, frame in zip(DIRECTIONS, frames):
        name = f"{direction}.png"
        frame.save(folder / name)
        names.append(name)
    sheet = Image.new("RGBA", (256, 64), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 64, 0))
    sheet.save(folder / f"{asset_id}_4dir.png")
    preview = Image.new("RGBA", (512, 160), (26, 30, 31, 255))
    for index, frame in enumerate(frames):
        preview.alpha_composite(frame.resize((128, 128), Image.Resampling.NEAREST), (index * 128, 6))
    preview.save(folder / f"{asset_id}_4dir_preview.png")
    metadata.update({
        "image": f"{asset_id}_4dir.png",
        "frameWidth": 64,
        "frameHeight": 64,
        "frameCount": 4,
        "directions": {direction: index for index, direction in enumerate(DIRECTIONS)},
        "frames": names,
        "anchor": {"x": 32, "y": 56},
        "imageSmoothingEnabled": False,
    })
    (folder / f"{asset_id}_4dir.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_enemies() -> None:
    sets = {
        "spore": [
            ("mycelium_skitter", "swarm", 10), ("acid_eye_pod", "shooter", 12),
            ("fungal_ram", "charger", 15), ("spore_bloater", "bloater", 19)
        ],
        "moon": [
            ("static_crawler", "swarm", 10), ("prism_sentry", "shooter", 12),
            ("crater_ram", "charger", 15), ("void_bloater", "bloater", 19)
        ],
    }
    for planet, entries in sets.items():
        for asset_id, behavior, radius in entries:
            frames = [enemy_frame(behavior, planet, direction) for direction in DIRECTIONS]
            save_sprite_set(ASSETS / "enemies" / planet / asset_id, asset_id, frames, {
                "id": asset_id, "planet": planet, "enemyType": behavior, "radius": radius,
                "blendMode": "source-over"
            })


def build_characters() -> None:
    entries = [("warrior_kade", "warrior"), ("mechanic_locke", "mechanic")]
    for asset_id, role in entries:
        frames = [character_frame(role, direction) for direction in DIRECTIONS]
        save_sprite_set(ASSETS / "characters" / asset_id, asset_id, frames, {
            "id": asset_id, "role": role, "spriteType": "astronaut", "blendMode": "source-over"
        })


if __name__ == "__main__":
    build_enemies()
    build_characters()
    print("generated missing enemy and role runtime assets")
