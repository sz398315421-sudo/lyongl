from __future__ import annotations

"""Build the V6 enemy sprite and combat feedback package.

The source board in assets/concepts/v6_enemy_vfx_review is an image-generation
reference only.  This script converts it to deterministic nearest-neighbour
runtime sheets so every frame has an exact size, anchor and alpha contract.
"""

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "game"
CONCEPTS = ROOT / "assets" / "concepts" / "v6_enemy_vfx_review"
REF = CONCEPTS / "imagegen_enemy_reference.png"
DIRECTIONS = ["front", "right", "back", "left"]
FRAME = 64

ENEMIES = {
    "spore": {
        "mycelium_skitter": ("swarm", (38, 34), (70, 122, 380, 490)),
        "acid_eye_pod": ("shooter", (40, 42), (420, 115, 755, 490)),
        "fungal_ram": ("charger", (54, 46), (710, 130, 1125, 505)),
        "spore_bloater": ("bloater", (55, 52), (1110, 92, 1500, 500)),
    },
    "moon": {
        "static_crawler": ("swarm", (38, 36), (44, 525, 400, 930)),
        "prism_sentry": ("shooter", (40, 44), (420, 500, 760, 930)),
        "crater_ram": ("charger", (56, 48), (710, 520, 1170, 940)),
        "void_bloater": ("bloater", (56, 54), (1130, 500, 1500, 940)),
    },
}

PALETTES = {
    "rust": {"core": (255, 104, 62, 255), "hot": (255, 198, 100, 255), "dark": (50, 31, 28, 255), "white": (255, 242, 210, 255)},
    "spore": {"core": (211, 104, 255, 255), "hot": (190, 255, 95, 255), "dark": (54, 24, 67, 255), "white": (244, 220, 255, 255)},
    "moon": {"core": (71, 220, 232, 255), "hot": (178, 250, 245, 255), "dark": (27, 45, 55, 255), "white": (225, 252, 255, 255)},
}

VFX_SPEC = {
    "meteor_warning": ("skills/gunner/vfx", 96, 64, 6, 12, True, "source-over", "meteor_warning"),
    "meteor_impact": ("skills/gunner/vfx", 128, 128, 8, 18, False, "source-over", "meteor_impact"),
    "explosive_impact": ("skills/gunner/vfx", 96, 96, 8, 18, False, "source-over", "explosive_hit"),
    "spore_pool": ("enemies/vfx/spore", 96, 96, 6, 10, True, "lighter", "spore_pool"),
}

BEHAVIOR_VFX = {
    "swarm_attack": ("swarm", "attack", 32, 32, 4, 18, False, "source-over"),
    "swarm_hit": ("swarm", "hit", 32, 32, 4, 18, False, "source-over"),
    "shooter_charge": ("shooter", "charge", 64, 64, 5, 12, True, "lighter"),
    "shooter_fire": ("shooter", "fire", 32, 32, 4, 18, False, "lighter"),
    "charger_charge": ("charger", "charge", 64, 64, 5, 12, True, "source-over"),
    "charger_impact": ("charger", "impact", 96, 96, 6, 16, False, "source-over"),
    "bloater_inflate": ("bloater", "inflate", 64, 64, 5, 12, True, "source-over"),
    "bloater_burst": ("bloater", "burst", 128, 128, 8, 16, False, "source-over"),
    "bloater_pool": ("bloater", "pool", 96, 96, 6, 10, True, "lighter"),
}


def new_image(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def trim(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    box = image.getchannel("A").getbbox()
    return image.crop(box) if box else image


def clear_edges(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    px = image.load()
    for x in range(image.width):
        px[x, 0] = (px[x, 0][0], px[x, 0][1], px[x, 0][2], 0)
        px[x, image.height - 1] = (px[x, image.height - 1][0], px[x, image.height - 1][1], px[x, image.height - 1][2], 0)
    for y in range(image.height):
        px[0, y] = (px[0, y][0], px[0, y][1], px[0, y][2], 0)
        px[image.width - 1, y] = (px[image.width - 1, y][0], px[image.width - 1, y][1], px[image.width - 1, y][2], 0)
    return image


def phase(index: int, count: int) -> float:
    return 0.0 if count <= 1 else index / float(count - 1)


def save_gif(frames: list[Image.Image], path: Path, fps: int) -> None:
    if not frames:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = []
    for frame in frames:
        bg = Image.new("RGBA", frame.size, (14, 19, 21, 255))
        bg.alpha_composite(frame)
        rendered.append(bg.convert("P", palette=Image.Palette.ADAPTIVE, colors=96))
    rendered[0].save(path, save_all=True, append_images=rendered[1:], duration=max(1, int(1000 / fps)), loop=0, disposal=2)


def make_direction_variants(source: Image.Image, target: tuple[int, int]) -> dict[str, Image.Image]:
    source = trim(source)
    target_w, target_h = target
    scale = min(target_w / max(1, source.width), target_h / max(1, source.height))
    size = (max(2, round(source.width * scale)), max(2, round(source.height * scale)))
    body = source.resize(size, Image.Resampling.NEAREST)
    variants: dict[str, Image.Image] = {}
    for direction in DIRECTIONS:
        canvas = new_image(64, 64)
        item = body.copy()
        if direction in {"right", "left"}:
            item = item.resize((max(2, round(item.width * 0.82)), item.height), Image.Resampling.NEAREST)
            if direction == "left":
                item = ImageOps.mirror(item)
        x = 32 - item.width // 2 + (2 if direction == "right" else -2 if direction == "left" else 0)
        y = 56 - item.height
        canvas.alpha_composite(item, (x, y))
        draw = ImageDraw.Draw(canvas)
        # Direction-specific hard pixels make the side/rear views distinct even
        # when the generated reference only contained an orthographic view.
        if direction == "back":
            draw.rectangle((26, max(10, y + 8), 38, min(55, y + 13)), fill=(32, 25, 40, 255))
            draw.rectangle((29, max(11, y + 9), 35, min(53, y + 12)), fill=(120, 71, 120, 255))
            draw.rectangle((23, max(18, y + 15), 25, min(53, y + 25)), fill=(20, 20, 25, 255))
            draw.rectangle((39, max(18, y + 15), 41, min(53, y + 25)), fill=(20, 20, 25, 255))
        elif direction == "right":
            draw.rectangle((39, max(14, y + 12), 45, min(53, y + 18)), fill=(122, 85, 75, 255))
            draw.rectangle((44, max(18, y + 16), 47, min(53, y + 20)), fill=(235, 159, 91, 255))
        elif direction == "left":
            draw.rectangle((17, max(14, y + 12), 23, min(53, y + 18)), fill=(122, 85, 75, 255))
            draw.rectangle((16, max(18, y + 16), 19, min(53, y + 20)), fill=(235, 159, 91, 255))
        variants[direction] = clear_edges(canvas)
    return variants


def compose_action(base: Image.Image, behavior: str, state: str, frame: int, count: int, direction: str, palette: dict) -> Image.Image:
    t = phase(frame, count)
    output = new_image(64, 64)
    bob = round(math.sin(t * math.tau) * (1.0 if state in {"idle", "walk"} else 0.5))
    item = base.copy()
    if state == "walk":
        # Keep the lowest opaque pixel on the foot line and move the upper body
        # by a single pixel for a readable gait.
        item = Image.new("RGBA", (64, 64))
        item.alpha_composite(base, (0, bob))
    elif state == "death":
        scale = max(0.35, 1.0 - t * 0.55)
        resized = base.resize((max(2, round(64 * scale)), max(2, round(64 * scale))), Image.Resampling.NEAREST)
        item.alpha_composite(resized, ((64 - resized.width) // 2, 56 - resized.height))
        item.putalpha(item.getchannel("A").point(lambda a: round(a * max(0.22, 1.0 - t * 0.75))))
    elif state == "hit" and frame == 0:
        item = ImageEnhance.Brightness(base).enhance(2.3)
    else:
        item = Image.new("RGBA", (64, 64))
        item.alpha_composite(base, (0, bob))
    output.alpha_composite(item)
    draw = ImageDraw.Draw(output)
    accent = palette["core"]
    hot = palette["hot"]
    def rect_px(x0: int, y0: int, x1: int, y1: int, fill) -> None:
        draw.rectangle((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=fill)
    if state == "attack":
        side = -1 if direction == "left" else 1
        if behavior == "shooter":
            rect_px(32 + side * 21, 29, 32 + side * 28, 32, hot)
            rect_px(32 + side * 28, 27, 32 + side * 31, 34, accent)
        elif behavior == "charger":
            rect_px(32 + side * 24, 25, 32 + side * 31, 28, (255, 80, 72, 255))
            rect_px(32 + side * 27, 35, 32 + side * 33, 37, hot)
        elif behavior == "swarm":
            rect_px(32 + side * 22, 33, 32 + side * 30, 35, hot)
            rect_px(32 + side * 27, 30, 32 + side * 31, 32, accent)
        else:
            draw.rectangle((26, 19, 38, 21), fill=(255, 84, 71, 255))
            draw.rectangle((24, 42, 40, 44), fill=hot)
    return clear_edges(output)


def save_enemy(asset_id: str, planet: str, behavior: str, target: tuple[int, int], bbox: tuple[int, int, int, int], ref: Image.Image) -> list[dict]:
    base = ref.crop(bbox)
    variants = make_direction_variants(base, target)
    folder = ASSETS / "enemies" / planet / asset_id
    folder.mkdir(parents=True, exist_ok=True)
    for direction, image in variants.items():
        image.save(folder / f"{direction}.png")
    sheet = new_image(256, 64)
    for index, direction in enumerate(DIRECTIONS):
        sheet.alpha_composite(variants[direction], (index * 64, 0))
    sheet.save(folder / f"{asset_id}_4dir.png")
    preview = Image.new("RGBA", (512, 160), (20, 25, 27, 255))
    for index, direction in enumerate(DIRECTIONS):
        preview.alpha_composite(variants[direction].resize((128, 128), Image.Resampling.NEAREST), (index * 128, 12))
    preview.save(folder / f"{asset_id}_4dir_preview.png")
    static_meta = {
        "id": asset_id, "planet": planet, "enemyType": behavior, "radius": {"swarm": 10, "shooter": 12, "charger": 15, "bloater": 19}[behavior],
        "image": f"{asset_id}_4dir.png", "frameWidth": 64, "frameHeight": 64, "frameCount": 4,
        "directions": {direction: index for index, direction in enumerate(DIRECTIONS)}, "frames": [f"{direction}.png" for direction in DIRECTIONS],
        "anchor": {"x": 32, "y": 56}, "imageSmoothingEnabled": False,
    }
    (folder / f"{asset_id}_4dir.json").write_text(json.dumps(static_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    entries: list[dict] = []
    for state, count in (("idle", 4), ("walk", 6), ("attack", 4), ("hit", 2), ("death", 6)):
        action_dir = folder / "actions" / state
        action_dir.mkdir(parents=True, exist_ok=True)
        action_frames: dict[str, list[Image.Image]] = {}
        for direction in DIRECTIONS:
            action_frames[direction] = []
            for frame in range(count):
                rendered = compose_action(variants[direction], behavior, state, frame, count, direction, PALETTES[planet])
                rendered.save(action_dir / f"{direction}_{frame:02d}.png")
                action_frames[direction].append(rendered)
        action_sheet = new_image(count * 64, 256)
        for row, direction in enumerate(DIRECTIONS):
            for frame, image in enumerate(action_frames[direction]):
                action_sheet.alpha_composite(image, (frame * 64, row * 64))
        sheet_name = f"{asset_id}_{state}_4dir.png"
        action_sheet.save(action_dir / sheet_name)
        preview_frames = []
        for frame in range(count):
            board = Image.new("RGBA", (512, 512), (18, 23, 25, 255))
            for row, direction in enumerate(DIRECTIONS):
                board.alpha_composite(action_frames[direction][frame].resize((128, 128), Image.Resampling.NEAREST), (192, row * 128))
            preview_frames.append(board)
        gif_name = f"{asset_id}_{state}.gif"
        save_gif(preview_frames, action_dir / gif_name, 10)
        metadata = {
            "id": f"{asset_id}.{state}", "assetType": "enemy_action", "assetId": asset_id, "planet": planet, "enemyType": behavior,
            "state": state, "sheet": sheet_name, "sheetLayout": "rows-by-direction", "frameWidth": 64, "frameHeight": 64,
            "frameCount": count, "directionOrder": DIRECTIONS, "directions": {direction: {"row": index} for index, direction in enumerate(DIRECTIONS)},
            "frames": {direction: [f"{direction}_{i:02d}.png" for i in range(count)] for direction in DIRECTIONS},
            "anchor": {"x": 32, "y": 56}, "fps": 10 if state in {"idle", "walk"} else 14, "loop": state in {"idle", "walk"},
            "blendMode": "source-over", "previewGif": gif_name, "imageSmoothingEnabled": False,
        }
        (action_dir / f"{asset_id}_{state}_4dir.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        entries.append({"category": "enemy_action", **metadata, "path": str((action_dir / sheet_name).relative_to(ROOT)).replace("\\", "/")})
    return entries


def rgba(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def line(draw: ImageDraw.ImageDraw, points, color, width=2):
    draw.line([(int(x), int(y)) for x, y in points], fill=color, width=max(1, int(width)))


def draw_vfx(asset_id: str, frame: int, count: int, width: int, height: int, palette: dict) -> Image.Image:
    image = new_image(width, height)
    draw = ImageDraw.Draw(image)
    cx, cy = width // 2, height // 2
    t = phase(frame, count)
    pulse = 0.5 + 0.5 * math.sin(t * math.tau)
    core, hot, dark, white = palette["core"], palette["hot"], palette["dark"], palette["white"]
    if asset_id == "meteor_warning":
        radius = int(34 + pulse * 8)
        draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), outline=rgba("#ff4b3e", 220), width=3)
        draw.ellipse((cx - radius + 8, cy - radius // 2 + 5, cx + radius - 8, cy + radius // 2 - 5), outline=hot, width=2)
        sweep = int((frame % count) / count * 360)
        for ray in range(4):
            angle = math.radians(sweep + ray * 90)
            line(draw, [(cx + math.cos(angle) * 8, cy + math.sin(angle) * 4), (cx + math.cos(angle) * radius, cy + math.sin(angle) * radius * 0.45)], core, 2)
        draw.rectangle((cx - 3, cy - 3, cx + 3, cy + 3), fill=rgba("#ff5a47"))
        draw.rectangle((cx + 24 - frame * 4, 5 + frame * 2, cx + 30 - frame * 4, 11 + frame * 2), fill=hot)
    elif asset_id == "explosive_impact":
        # Explosive rounds use a compact, square high-temperature detonation.
        # Keep it visually separate from the meteor's falling-rock diamond and
        # broad ground shockwave: stepped fragments and a hot cross-core read
        # clearly as a projectile impact.
        radius = int(8 + t * min(width, height) * 0.4)
        octagon = [
            (cx - radius // 2, cy - radius), (cx + radius // 2, cy - radius),
            (cx + radius, cy - radius // 2), (cx + radius, cy + radius // 2),
            (cx + radius // 2, cy + radius), (cx - radius // 2, cy + radius),
            (cx - radius, cy + radius // 2), (cx - radius, cy - radius // 2)
        ]
        draw.line(octagon + [octagon[0]], fill=hot, width=max(2, width // 22), joint="curve")
        for index in range(10):
            angle = index / 10 * math.tau + t * 0.18
            start = max(4, int(radius * 0.34))
            end = int(radius * (0.8 + (index % 2) * 0.12))
            line(draw, [(cx + math.cos(angle) * start, cy + math.sin(angle) * start),
                        (cx + math.cos(angle) * end, cy + math.sin(angle) * end)],
                 core if index % 3 else hot, max(1, width // 28))
            particle = max(2, width // 18)
            px = int(cx + math.cos(angle) * (end + 3))
            py = int(cy + math.sin(angle) * (end + 3))
            draw.rectangle((px - particle, py - particle, px + particle, py + particle),
                           fill=hot if index % 2 else core)
        core_size = max(3, int(min(width, height) * (0.18 - t * 0.08)))
        draw.rectangle((cx - core_size, cy - core_size, cx + core_size, cy + core_size), fill=white if frame < 2 else hot)
        draw.rectangle((cx - core_size // 2, cy - core_size // 2, cx + core_size // 2, cy + core_size // 2), fill=core)
        if frame < count // 2:
            draw.rectangle((cx - core_size // 3, cy - core_size, cx + core_size // 3, cy + core_size), fill=white)
            draw.rectangle((cx - core_size, cy - core_size // 3, cx + core_size, cy + core_size // 3), fill=white)
    elif asset_id == "meteor_impact" or "burst" in asset_id or "impact" in asset_id:
        radius = int((min(width, height) * 0.12) + t * min(width, height) * 0.42)
        draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), outline=hot, width=max(2, width // 22))
        for index in range(12):
            angle = index / 12 * math.tau + t * 0.5
            start = max(3, int(radius * 0.35))
            end = int(radius * (0.7 + (index % 3) * 0.1))
            line(draw, [(cx + math.cos(angle) * start, cy + math.sin(angle) * start * 0.55), (cx + math.cos(angle) * end, cy + math.sin(angle) * end * 0.55)], core if index % 2 else hot, max(1, width // 30))
        core_size = max(4, int(min(width, height) * (0.24 - t * 0.12)))
        core_color = white if frame < count // 3 else hot
        draw.polygon([(cx, cy - core_size), (cx + core_size, cy), (cx, cy + core_size), (cx - core_size, cy)], fill=core_color)
        if frame >= count // 3:
            draw.rectangle((cx - core_size // 2, cy - core_size // 2, cx + core_size // 2, cy + core_size // 2), fill=core)
        if asset_id == "meteor_impact":
            draw.polygon([(cx - 7, cy - 20), (cx + 3, cy - 33), (cx + 12, cy - 21), (cx + 5, cy - 12)], fill=dark)
    elif asset_id == "spore_pool" or asset_id.endswith("_pool"):
        radius = int(18 + t * 25)
        draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), fill=dark, outline=core, width=2)
        for index in range(4):
            bx = cx - radius // 2 + index * max(5, radius // 3)
            by = cy - 5 - int((frame + index) % 3) * 3
            draw.rectangle((bx, by, bx + 4, by + 3), fill=hot)
        draw.arc((cx - radius + 5, cy - radius // 3, cx + radius - 5, cy + radius // 3), 180, 350, fill=white, width=2)
    elif "charge" in asset_id or "inflate" in asset_id:
        radius = int(10 + t * 19)
        draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), outline=rgba("#ff4b45", 235), width=3)
        for index in range(4):
            x = cx - radius + 4 + index * max(5, radius // 2)
            line(draw, [(x, cy - radius // 2 - 5), (x + (-2 if index % 2 else 2), cy - radius // 2 - 1)], hot, 2)
        draw.rectangle((cx - 4, cy - 4, cx + 4, cy + 4), fill=rgba("#ff5a47"))
    elif "fire" in asset_id or asset_id.endswith("_attack"):
        length = int(8 + t * 18)
        line(draw, [(cx - length, cy + 5), (cx + length, cy - 5)], core, 3)
        line(draw, [(cx - length // 2, cy - 6), (cx + length + 6, cy)], hot, 2)
        draw.rectangle((cx + length - 3, cy - 3, cx + length + 3, cy + 3), fill=white)
    elif "charger" in asset_id:
        radius = int(12 + t * 22)
        draw.arc((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), 200, 340, fill=rgba("#ff4b45"), width=3)
        draw.polygon([(cx + radius, cy), (cx + radius - 12, cy - 7), (cx + radius - 12, cy + 7)], fill=hot)
    else:
        draw.rectangle((cx - 5, cy - 5, cx + 5, cy + 5), fill=core)
        line(draw, [(cx - 18, cy), (cx - 7, cy)], hot, 2)
        line(draw, [(cx + 7, cy), (cx + 18, cy)], hot, 2)
    return clear_edges(image)


def save_vfx(asset_id: str, folder: Path, width: int, height: int, count: int, fps: int, loop: bool, blend: str, event: str, palette_variant: str, palette: dict) -> dict:
    folder.mkdir(parents=True, exist_ok=True)
    frames = []
    names = []
    for index in range(count):
        frame = draw_vfx(asset_id.split("_", 2)[-1] if asset_id.startswith(("rust_", "spore_", "moon_")) and asset_id not in {"spore_pool"} else asset_id, index, count, width, height, palette)
        name = f"frame_{index:02d}.png"
        frame.save(folder / name)
        frames.append(frame)
        names.append(name)
    sheet = new_image(width * count, height)
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * width, 0))
    sheet_name = f"{asset_id}.png"
    sheet.save(folder / sheet_name)
    gif_name = f"{asset_id}.gif"
    save_gif(frames, folder / gif_name, fps)
    metadata = {
        "id": asset_id, "category": "vfx", "event": event, "paletteVariant": palette_variant,
        "image": sheet_name, "sheetLayout": "horizontal", "frameWidth": width, "frameHeight": height, "frameCount": count,
        "fps": fps, "loop": loop, "anchor": {"x": width // 2, "y": height // 2}, "blendMode": blend,
        "frames": names, "previewGif": gif_name, "imageSmoothingEnabled": False,
    }
    (folder / f"{asset_id}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {**metadata, "path": str((folder / sheet_name).relative_to(ROOT)).replace("\\", "/")}


def build_overviews(enemy_entries: list[dict], vfx_entries: list[dict]) -> None:
    overview_dir = CONCEPTS
    page = Image.new("RGBA", (1024, 512), (15, 20, 22, 255))
    draw = ImageDraw.Draw(page)
    for index, entry in enumerate(enemy_entries):
        image = Image.open(ROOT / entry["path"]).convert("RGBA")
        thumb = image.resize((256, 64), Image.Resampling.NEAREST)
        x = (index % 2) * 512
        y = (index // 2) * 110 + 22
        page.alpha_composite(thumb.resize((512, 128), Image.Resampling.NEAREST), (x, y))
        draw.text((x + 8, y - 18), f"{entry['planet']} // {entry['assetId']}", fill=(225, 236, 222, 255))
    page.save(overview_dir / "enemy_overview.png")
    page.resize((2048, 1024), Image.Resampling.NEAREST).save(overview_dir / "enemy_overview_2x.png")
    fx_page = Image.new("RGBA", (768, 384), (15, 20, 22, 255))
    draw = ImageDraw.Draw(fx_page)
    for index, entry in enumerate(vfx_entries[:18]):
        image = Image.open(ROOT / entry["path"]).convert("RGBA")
        frame = image.crop((0, 0, entry["frameWidth"], entry["frameHeight"]))
        thumb = frame.resize((64, 64), Image.Resampling.NEAREST)
        x = (index % 9) * 85 + 10
        y = (index // 9) * 170 + 22
        fx_page.alpha_composite(thumb, (x, y))
        draw.text((x, y + 72), entry["id"][:12], fill=(225, 236, 222, 255))
    fx_page.save(overview_dir / "combat_vfx_overview.png")
    fx_page.resize((1536, 768), Image.Resampling.NEAREST).save(overview_dir / "combat_vfx_overview_2x.png")


def build_runtime_previews(static_entries: list[dict], vfx_entries: list[dict]) -> None:
    """Compose deterministic 360x640 and 2x in-game scale review boards."""
    by_planet = {planet: [] for planet in ("rust", "spore", "moon")}
    for entry in static_entries:
        by_planet.setdefault(entry["planet"], []).append(entry)
    vfx_by_id = {entry["id"]: entry for entry in vfx_entries}
    placements = {
        "rust": [(70, 230), (285, 210), (112, 420), (275, 470)],
        "spore": [(62, 220), (288, 250), (110, 445), (278, 470)],
        "moon": [(64, 220), (288, 245), (108, 440), (282, 470)],
    }
    fx_plan = {
        "rust": [("meteor_warning", 180, 330, 0.68), ("meteor_impact", 265, 505, 0.48), ("explosive_impact", 96, 360, 0.52), ("rust_charger_charge", 250, 220, 0.66)],
        "spore": [("spore_pool", 180, 390, 0.72), ("spore_shooter_charge", 275, 260, 0.6), ("spore_bloater_burst", 90, 500, 0.42)],
        "moon": [("moon_shooter_charge", 276, 260, 0.6), ("moon_charger_impact", 88, 470, 0.46), ("moon_bloater_burst", 250, 500, 0.42)],
    }
    for planet in ("rust", "spore", "moon"):
        ground_path = ASSETS / "planets" / f"{planet}_ground.png"
        ground = Image.open(ground_path).convert("RGBA").resize((256, 256), Image.Resampling.NEAREST)
        board = Image.new("RGBA", (360, 640), (12, 16, 18, 255))
        for yy in range(-256, 640, 256):
            for xx in range(-256, 360, 256):
                board.alpha_composite(ground, (xx, yy))
        draw = ImageDraw.Draw(board)
        draw.rectangle((7, 7, 352, 34), fill=(6, 10, 12, 220), outline=(118, 210, 197, 255), width=2)
        draw.text((15, 14), f"V6 COMBAT // {planet.upper()} // 360x640", fill=(232, 245, 226, 255))
        for entry, (x, y) in zip(by_planet.get(planet, []), placements[planet]):
            sheet = Image.open(ROOT / entry["path"]).convert("RGBA")
            sprite = sheet.crop((0, 0, 64, 64))
            board.alpha_composite(sprite, (x - 32, y - 56))
        for effect_id, x, y, scale in fx_plan[planet]:
            entry = vfx_by_id.get(effect_id)
            if not entry:
                continue
            sheet = Image.open(ROOT / entry["path"]).convert("RGBA")
            frame = sheet.crop((0, 0, entry["frameWidth"], entry["frameHeight"]))
            frame = frame.resize((max(1, int(entry["frameWidth"] * scale)), max(1, int(entry["frameHeight"] * scale))), Image.Resampling.NEAREST)
            board.alpha_composite(frame, (int(x - frame.width / 2), int(y - frame.height / 2)))
        draw.text((15, 610), "ENEMY SILHOUETTES / TELEGRAPH / IMPACT", fill=(226, 236, 220, 255))
        board.save(CONCEPTS / f"combat_preview_{planet}_360x640.png")
        board.resize((720, 1280), Image.Resampling.NEAREST).save(CONCEPTS / f"combat_preview_{planet}_720x1280.png")


def merge_manifest(action_entries: list[dict], vfx_entries: list[dict]) -> None:
    path = ASSETS / "dynamic_assets_manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"version": 1, "actions": [], "vfx": []}
    enemy_ids = {entry["assetId"] for entry in action_entries}
    manifest["actions"] = [entry for entry in manifest.get("actions", []) if entry.get("assetId") not in enemy_ids]
    manifest["actions"].extend(action_entries)
    vfx_ids = {entry["id"] for entry in vfx_entries}
    manifest["vfx"] = [entry for entry in manifest.get("vfx", []) if entry.get("id") not in vfx_ids]
    manifest["vfx"].extend(vfx_entries)
    manifest["version"] = max(3, int(manifest.get("version", 1)))
    manifest["v6EnemyVfx"] = {
        "enemyPlanets": ["rust", "spore", "moon"],
        "paletteVariants": ["rust", "spore", "moon"],
        "directionOrder": DIRECTIONS,
        "actionSheetLayout": "rows-by-direction",
        "effectSheetLayout": "horizontal",
        "warningStyle": "behavior-specific-with-danger-tint",
    }
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if not REF.exists():
        raise SystemExit(f"missing generated reference: {REF}")
    ref = Image.open(REF).convert("RGBA")
    action_entries: list[dict] = []
    static_entries: list[dict] = []
    for planet, entries in ENEMIES.items():
        for asset_id, (behavior, target, bbox) in entries.items():
            action_entries.extend(save_enemy(asset_id, planet, behavior, target, bbox, ref))
            static_entries.append({"assetId": asset_id, "planet": planet, "enemyType": behavior, "path": f"assets/game/enemies/{planet}/{asset_id}/{asset_id}_4dir.png"})

    vfx_entries: list[dict] = []
    for asset_id, (relative_folder, width, height, count, fps, loop, blend, event) in VFX_SPEC.items():
        palette = PALETTES["spore"] if asset_id == "spore_pool" else {"core": rgba("#ff6b43"), "hot": rgba("#ffd275"), "dark": rgba("#4e211c"), "white": rgba("#fff5dc")}
        vfx_entries.append(save_vfx(asset_id, ASSETS / relative_folder / asset_id, width, height, count, fps, loop, blend, event, "spore" if asset_id == "spore_pool" else "gunner", palette))
    for planet in ("rust", "spore", "moon"):
        palette = PALETTES[planet]
        for short_id, (behavior, event, width, height, count, fps, loop, blend) in BEHAVIOR_VFX.items():
            full_id = f"{planet}_{short_id}"
            folder = ASSETS / "enemies" / "vfx" / planet / short_id
            vfx_entries.append(save_vfx(full_id, folder, width, height, count, fps, loop, blend, event, planet, palette))
    merge_manifest(action_entries, vfx_entries)
    build_overviews(static_entries, vfx_entries)
    build_runtime_previews(static_entries, vfx_entries)
    (CONCEPTS / "v6_generation_notes.json").write_text(json.dumps({
        "sourceReference": "imagegen_enemy_reference.png", "enemyCount": len(static_entries), "actionEntryCount": len(action_entries),
        "vfxEntryCount": len(vfx_entries), "style": "hard-edge 8-bit pixel art", "nearestNeighbour": True,
        "dangerTelegraph": "behavior-specific-with-danger-tint", "imageSmoothingEnabled": False,
        "runtimePreviews": [f"combat_preview_{planet}_{size}.png" for planet in ("rust", "spore", "moon") for size in ("360x640", "720x1280")],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"enemies": len(static_entries), "actions": len(action_entries), "vfx": len(vfx_entries)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
