from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v4_role_redraw"
SOURCES = OUT / "_sources"

CHARACTER_ORDER = ["front", "right", "back", "left"]

ROLE_SKILLS = {
    "warrior": {
        "classId": "warrior",
        "ids": [
            "cleave", "double_slash", "sword_wave", "orbit_blade", "strength",
            "attack_speed", "battle_fury", "guard", "dodge", "counter",
            "lifesteal", "unyielding", "rift_slash", "star_ring", "phantom_counter",
        ],
        "types": {
            "cleave": "core", "double_slash": "core", "sword_wave": "core", "orbit_blade": "core",
            "strength": "modifier", "attack_speed": "modifier", "battle_fury": "modifier",
            "guard": "survival", "dodge": "survival", "counter": "survival", "lifesteal": "survival", "unyielding": "survival",
            "rift_slash": "evolution", "star_ring": "evolution", "phantom_counter": "evolution",
        },
    },
    "mechanic": {
        "classId": "mechanic",
        "ids": [
            "drone", "turret", "repair_bot", "mech_count", "overclock",
            "salvage", "arc", "self_destruct", "shield", "quick_deploy",
            "recycle_heal", "magnet", "swarm_protocol", "mobile_fortress", "infinite_recycle",
        ],
        "types": {
            "drone": "core", "turret": "core", "repair_bot": "core",
            "mech_count": "modifier", "overclock": "modifier", "salvage": "modifier", "arc": "modifier",
            "self_destruct": "modifier", "quick_deploy": "modifier",
            "shield": "survival", "recycle_heal": "survival", "magnet": "survival",
            "swarm_protocol": "evolution", "mobile_fortress": "evolution", "infinite_recycle": "evolution",
        },
    },
}


def hard_alpha(image: Image.Image, threshold: int = 96, border: int = 4) -> Image.Image:
    """Harden the extracted matte to true pixel alpha and clear gutter residue."""
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, alpha = pixels[x, y]
            pixels[x, y] = (r, g, b, 255 if alpha >= threshold else 0)
    if border:
        draw = ImageDraw.Draw(image)
        transparent = (0, 0, 0, 0)
        draw.rectangle((0, 0, width - 1, border - 1), fill=transparent)
        draw.rectangle((0, height - border, width - 1, height - 1), fill=transparent)
        draw.rectangle((0, 0, border - 1, height - 1), fill=transparent)
        draw.rectangle((width - border, 0, width - 1, height - 1), fill=transparent)
    return image


def alpha_bbox(image: Image.Image):
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("asset crop has no opaque pixels")
    return bbox


def fit_subject(image: Image.Image, size: int, max_width: int, max_height: int, bottom: int | None = None) -> Image.Image:
    bbox = alpha_bbox(image)
    subject = image.crop(bbox)
    width, height = subject.size
    scale = min(max_width / width, max_height / height)
    new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
    subject = subject.resize(new_size, Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - subject.width) // 2
    if bottom is None:
        y = (size - subject.height) // 2
    else:
        y = bottom - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def crop_character_sheet(path: Path, role: str) -> list[Image.Image]:
    sheet = hard_alpha(Image.open(path), threshold=96, border=4)
    width, height = sheet.size
    frames: list[Image.Image] = []
    for index in range(4):
        col = index % 2
        row = index // 2
        left = round(col * width / 2)
        top = round(row * height / 2)
        right = round((col + 1) * width / 2)
        bottom = round((row + 1) * height / 2)
        crop = sheet.crop((left, top, right, bottom))
        crop = hard_alpha(crop, threshold=96, border=4)
        frames.append(fit_subject(crop, 64, max_width=58, max_height=55, bottom=56))
    return frames


def save_character(role: str, source_name: str, output_name: str) -> Image.Image:
    target = OUT / "characters" / output_name
    target.mkdir(parents=True, exist_ok=True)
    frames = crop_character_sheet(SOURCES / "characters" / source_name, role)
    for direction, frame in zip(CHARACTER_ORDER, frames):
        frame.save(target / f"{direction}.png", optimize=True)
    sheet = Image.new("RGBA", (256, 64), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 64, 0))
    sheet.save(target / f"{output_name}_4dir.png", optimize=True)
    preview = Image.new("RGBA", (4 * 96, 96), (12, 18, 21, 255))
    for index, frame in enumerate(frames):
        preview.alpha_composite(frame.resize((96, 96), Image.Resampling.NEAREST), (index * 96, 0))
    preview.save(target / f"{output_name}_preview.png", optimize=True)
    data = {
        "id": output_name,
        "role": role,
        "spriteType": "astronaut",
        "blendMode": "source-over",
        "image": f"{output_name}_4dir.png",
        "frameWidth": 64,
        "frameHeight": 64,
        "frameCount": 4,
        "directions": {direction: index for index, direction in enumerate(CHARACTER_ORDER)},
        "frames": [f"{direction}.png" for direction in CHARACTER_ORDER],
        "anchor": {"x": 32, "y": 56},
        "imageSmoothingEnabled": False,
    }
    (target / f"{output_name}_4dir.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return frames[0]


def crop_icon_sheet(path: Path) -> list[Image.Image]:
    sheet = hard_alpha(Image.open(path), threshold=96, border=4)
    width, height = sheet.size
    icons: list[Image.Image] = []
    for index in range(15):
        col = index % 5
        row = index // 5
        left = round(col * width / 5)
        top = round(row * height / 3)
        right = round((col + 1) * width / 5)
        bottom = round((row + 1) * height / 3)
        crop = hard_alpha(sheet.crop((left, top, right, bottom)), threshold=96, border=4)
        icons.append(fit_subject(crop, 64, max_width=52, max_height=52))
    return icons


def save_skill_icons(role: str, source_name: str) -> list[Image.Image]:
    spec = ROLE_SKILLS[role]
    target = OUT / "skills" / role / "icons"
    target.mkdir(parents=True, exist_ok=True)
    icons = crop_icon_sheet(SOURCES / "skills" / source_name)
    for skill_id, icon in zip(spec["ids"], icons):
        icon.save(target / f"{skill_id}.png", optimize=True)
    preview = Image.new("RGBA", (5 * 80, 3 * 80), (12, 18, 21, 255))
    for index, icon in enumerate(icons):
        enlarged = icon.resize((64, 64), Image.Resampling.NEAREST)
        x = (index % 5) * 80 + 8
        y = (index // 5) * 80 + 8
        preview.alpha_composite(enlarged, (x, y))
    preview.save(target.parent / f"{role}_skill_icons_preview.png", optimize=True)
    data = {
        "classId": spec["classId"],
        "frameWidth": 64,
        "frameHeight": 64,
        "anchor": {"x": 32, "y": 32},
        "icons": {
            skill_id: {"image": f"{skill_id}.png", "type": spec["types"][skill_id]}
            for skill_id in spec["ids"]
        },
        "imageSmoothingEnabled": False,
    }
    (target / f"{role}_skill_icons.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return icons


def save_style_comparison(mia_front: Image.Image, kade_front: Image.Image, locke_front: Image.Image):
    canvas = Image.new("RGBA", (3 * 128, 144), (12, 18, 21, 255))
    for index, frame in enumerate((mia_front, kade_front, locke_front)):
        enlarged = frame.resize((128, 128), Image.Resampling.NEAREST)
        canvas.alpha_composite(enlarged, (index * 128, 8))
    canvas.save(OUT / "characters_style_comparison.png", optimize=True)


def main():
    kade = save_character("warrior", "warrior_kade_2x2_alpha.png", "warrior_kade")
    locke = save_character("mechanic", "mechanic_locke_2x2_alpha.png", "mechanic_locke")
    save_skill_icons("warrior", "warrior_5x3_alpha.png")
    save_skill_icons("mechanic", "mechanic_5x3_alpha.png")
    mia = Image.open(ROOT / "assets" / "game" / "characters" / "gunner_mia" / "front.png").convert("RGBA")
    save_style_comparison(mia, kade, locke)
    print("v4 role redraw assets built")


if __name__ == "__main__":
    main()
