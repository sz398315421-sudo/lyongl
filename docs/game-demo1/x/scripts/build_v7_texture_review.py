"""Build the V7 texture-only review package.

This pass intentionally writes only to assets/concepts/v7_texture_review.  It
uses the shipped V6 sprites and ground textures as identity references, then
performs deterministic nearest-neighbour pixel processing for danger palettes,
elite scale variants, moon props and combat/UI review assets.  No runtime file
is overwritten.
"""

from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
OUT = ROOT / "assets" / "concepts" / "v7_texture_review"
DIRECTIONS = ["front", "right", "back", "left"]

ENEMIES = {
    "rust": {
        "scrap_mite": ("swarm", "scrap_mite"),
        "plasma_watcher": ("shooter", "plasma_watcher"),
        "rivethorn_ram": ("charger", "rivethorn_ram"),
        "pressure_bloater": ("bloater", "pressure_bloater"),
    },
    "spore": {
        "mycelium_skitter": ("swarm", "mycelium_skitter"),
        "acid_eye_pod": ("shooter", "acid_eye_pod"),
        "fungal_ram": ("charger", "fungal_ram"),
        "spore_bloater": ("bloater", "spore_bloater"),
    },
    "moon": {
        "static_crawler": ("swarm", "static_crawler"),
        "prism_sentry": ("shooter", "prism_sentry"),
        "crater_ram": ("charger", "crater_ram"),
        "void_bloater": ("bloater", "void_bloater"),
    },
}

SPECIAL_BEHAVIORS = {"shooter", "charger", "bloater"}

PALETTES = {
    "rust": {"dark": (32, 20, 22), "mid": (126, 38, 36), "hot": (255, 92, 65), "light": (255, 188, 96)},
    # Danger tint stays distinctly red on the spore palette; purple remains
    # reserved for the normal spore ecosystem so the warning state reads
    # as a full-body hazard rather than a purple overlay.
    "spore": {"dark": (43, 16, 23), "mid": (144, 38, 50), "hot": (255, 70, 62), "light": (255, 186, 112)},
    "moon": {"dark": (28, 27, 36), "mid": (112, 43, 70), "hot": (255, 73, 67), "light": (255, 188, 105)},
}

MOON_PROPS = {
    "moon_shallow_crater": (64, 32, "decal"),
    "moon_regolith_chunk": (48, 48, "small"),
    "moon_crystal_cluster": (64, 64, "medium"),
    "moon_energy_seam": (64, 32, "decal"),
    "moon_probe_wreck": (96, 64, "large"),
    "moon_antenna_fragment": (64, 96, "medium"),
    "moon_lander_panel": (96, 64, "large"),
    "moon_dust_ridge": (96, 48, "decal"),
}


def rgba_image(width: int, height: int) -> Image.Image:
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def clear_edges(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for x in range(image.width):
        pixels[x, 0] = (*pixels[x, 0][:3], 0)
        pixels[x, image.height - 1] = (*pixels[x, image.height - 1][:3], 0)
    for y in range(image.height):
        pixels[0, y] = (*pixels[0, y][:3], 0)
        pixels[image.width - 1, y] = (*pixels[image.width - 1, y][:3], 0)
    # Scrub RGB from transparent pixels so compositors cannot reveal a
    # hidden matte when the effect is layered over the game scene.
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0 and (r or g or b):
                pixels[x, y] = (0, 0, 0, 0)
    return image


def clear_magenta_residue(image: Image.Image) -> Image.Image:
    """Remove low-alpha chroma-key residue from the V6 source sprites."""
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a and r > 235 and g < 35 and b > 170:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sheet(frames: list[Image.Image]) -> Image.Image:
    if not frames:
        return rgba_image(1, 1)
    result = rgba_image(frames[0].width * len(frames), frames[0].height)
    for index, frame in enumerate(frames):
        result.alpha_composite(frame, (index * frame.width, 0))
    return result


def save_gif(frames: list[Image.Image], path: Path, fps: int, background=(12, 16, 19, 255)) -> None:
    rendered = []
    for frame in frames:
        canvas = Image.new("RGBA", frame.size, background)
        canvas.alpha_composite(frame)
        rendered.append(canvas.convert("P", palette=Image.Palette.ADAPTIVE, colors=96))
    if rendered:
        rendered[0].save(path, save_all=True, append_images=rendered[1:], duration=max(1, 1000 // fps), loop=0, disposal=2)


def load_enemy_frame(planet: str, asset_id: str, direction: str) -> Image.Image:
    path = GAME / "enemies" / planet / asset_id / f"{direction}.png"
    if not path.exists():
        path = GAME / "enemies" / "rust" / asset_id / f"{direction}.png"
    return Image.open(path).convert("RGBA")


def danger_palette(image: Image.Image, planet: str) -> Image.Image:
    palette = PALETTES[planet]
    source = image.convert("RGBA")
    output = rgba_image(source.width, source.height)
    src = source.load()
    dst = output.load()
    for y in range(source.height):
        for x in range(source.width):
            r, g, b, a = src[x, y]
            if a == 0:
                continue
            luminance = (r * 3 + g * 6 + b) / 10
            if luminance < 42:
                color = palette["dark"]
            elif luminance < 115:
                color = palette["mid"]
            elif luminance < 205:
                color = palette["hot"]
            else:
                color = palette["light"]
            dst[x, y] = (*color, a)
    return clear_edges(clear_magenta_residue(output))


def elite_variant(image: Image.Image, planet: str, behavior: str, direction: str) -> Image.Image:
    result = rgba_image(96, 96)
    scaled = image.resize((96, 96), Image.Resampling.NEAREST)
    result.alpha_composite(scaled, (0, -1))
    draw = ImageDraw.Draw(result)
    p = PALETTES[planet]
    # Reinforced silhouette details stay inside the 8px transparent safety margin.
    # Elite accents are embedded in the body silhouette.  Nothing is placed
    # above the head, so the enlarged form never resembles a crown/triangle
    # UI marker.
    if behavior == "shooter":
        draw.rectangle((39, 39, 57, 45), fill=p["dark"] + (255,))
        draw.rectangle((44, 40, 52, 43), fill=p["light"] + (255,))
        draw.rectangle((56, 47, 64, 54), fill=p["mid"] + (255,))
    elif behavior == "charger":
        # A stepped chest plate, deliberately rectangular rather than a
        # floating diamond/crown silhouette.
        draw.rectangle((40, 41, 64, 46), fill=p["hot"] + (255,))
        draw.rectangle((45, 47, 59, 50), fill=p["mid"] + (255,))
        draw.rectangle((35, 52, 61, 58), fill=p["dark"] + (255,))
        draw.rectangle((43, 53, 53, 56), fill=p["light"] + (255,))
    elif behavior == "bloater":
        draw.rectangle((39, 34, 57, 42), fill=p["dark"] + (255,))
        draw.rectangle((44, 36, 52, 40), fill=p["hot"] + (255,))
        draw.rectangle((28, 66, 36, 72), fill=p["light"] + (255,))
        draw.rectangle((60, 66, 68, 72), fill=p["light"] + (255,))
    else:
        draw.rectangle((39, 40, 57, 45), fill=p["dark"] + (255,))
        draw.rectangle((46, 41, 50, 44), fill=p["light"] + (255,))
    # Rear/side panels are deliberately directional rather than mirrored.
    if direction == "right":
        draw.rectangle((52, 48, 59, 53), fill=p["mid"] + (255,))
    elif direction == "left":
        draw.rectangle((37, 48, 44, 53), fill=p["mid"] + (255,))
    elif direction == "back":
        draw.rectangle((39, 30, 57, 42), fill=p["dark"] + (255,))
        draw.rectangle((45, 33, 51, 39), fill=p["light"] + (255,))
    return clear_edges(clear_magenta_residue(result))


def make_planet_mark(size: int) -> Image.Image:
    result = rgba_image(size, size)
    draw = ImageDraw.Draw(result)
    scale = size / 32
    def rect(box, fill):
        draw.rectangle(tuple(int(v * scale) for v in box), fill=fill + (255,))
    # Stepped moon silhouette, intentionally not a smooth ellipse.
    points = [(9, 2), (23, 2), (28, 6), (30, 12), (30, 21), (25, 27), (19, 30), (9, 29), (3, 24), (2, 12), (5, 6)]
    draw.polygon([(int(x * scale), int(y * scale)) for x, y in points], fill=(52, 61, 67, 255))
    rect((6, 7, 25, 24), (64, 72, 76))
    rect((8, 9, 12, 13), (92, 101, 103))
    rect((20, 16, 25, 20), (35, 43, 48))
    rect((14, 22, 17, 25), (26, 35, 39))
    rect((16, 5, 18, 8), (103, 114, 112))
    # Cold cyan energy seam and two crystal pixels.
    for x, y in [(7, 17), (10, 18), (13, 18), (16, 17), (19, 16), (22, 15)]:
        rect((x, y, x + 2, y + 1), (91, 232, 227))
    rect((24, 7, 26, 10), (126, 245, 235))
    rect((5, 21, 7, 23), (126, 245, 235))
    return clear_edges(result)


def make_moon_prop(prop_id: str, width: int, height: int) -> Image.Image:
    result = rgba_image(width, height)
    draw = ImageDraw.Draw(result)
    cx, cy = width // 2, height // 2
    dark = (20, 27, 31, 255)
    mid = (70, 82, 86, 255)
    light = (136, 149, 145, 255)
    cyan = (92, 235, 226, 255)
    rust = (121, 77, 65, 255)
    if prop_id == "moon_shallow_crater":
        draw.polygon([(8, cy), (14, 8), (width - 14, 8), (width - 7, cy), (width - 14, height - 8), (14, height - 8)], fill=dark)
        draw.line((14, cy, width - 14, cy), fill=light, width=2)
        draw.rectangle((width // 2 - 9, cy - 2, width // 2 + 9, cy + 1), fill=mid)
    elif prop_id == "moon_regolith_chunk":
        draw.polygon([(8, height - 12), (12, 18), (25, 8), (39, 15), (width - 8, height - 14)], fill=mid)
        draw.polygon([(15, 18), (25, 10), (31, 18), (22, 24)], fill=light)
        draw.rectangle((10, height - 11, width - 8, height - 7), fill=dark)
    elif prop_id == "moon_crystal_cluster":
        draw.ellipse((10, height - 16, width - 10, height - 7), fill=dark)
        for x, top, color in [(18, 18, cyan), (28, 8, (170, 251, 242, 255)), (39, 15, cyan), (47, 25, (77, 203, 203, 255))]:
            draw.polygon([(x - 6, height - 14), (x - 3, top + 7), (x, top), (x + 5, top + 9), (x + 7, height - 14)], fill=color)
            draw.line((x, top + 3, x + 3, height - 18), fill=(225, 255, 247, 255), width=1)
    elif prop_id == "moon_energy_seam":
        draw.rectangle((8, cy - 3, width - 8, cy + 3), fill=dark)
        for x in range(12, width - 12, 11):
            draw.rectangle((x, cy - 1, min(width - 10, x + 6), cy + 1), fill=cyan)
    elif prop_id == "moon_probe_wreck":
        draw.ellipse((14, height - 20, width - 14, height - 8), fill=dark)
        draw.polygon([(16, height - 23), (27, 20), (72, 13), (82, height - 21)], fill=mid)
        draw.rectangle((28, 18, 69, 27), fill=light)
        draw.rectangle((38, 26, 61, 36), fill=dark)
        draw.rectangle((47, 29, 54, 34), fill=cyan)
        draw.line((22, 19, 5, 7), fill=rust, width=3)
    elif prop_id == "moon_antenna_fragment":
        draw.ellipse((12, height - 17, width - 12, height - 7), fill=dark)
        draw.line((cx, height - 14, cx + 10, 18), fill=mid, width=4)
        draw.line((cx + 10, 18, cx + 28, 8), fill=light, width=2)
        draw.rectangle((cx + 23, 6, cx + 32, 10), fill=cyan)
    elif prop_id == "moon_lander_panel":
        draw.ellipse((14, height - 17, width - 12, height - 7), fill=dark)
        draw.polygon([(16, height - 20), (18, 19), (76, 13), (82, height - 20)], fill=mid)
        draw.rectangle((23, 21, 71, 28), fill=dark)
        draw.rectangle((27, 23, 66, 25), fill=cyan)
        draw.rectangle((35, 33, 58, 43), fill=light)
        draw.rectangle((43, 35, 50, 41), fill=rust)
    else:  # moon_dust_ridge
        draw.polygon([(5, height - 10), (16, 19), (30, 10), (52, 14), (75, 8), (width - 5, height - 10)], fill=mid)
        draw.line((14, 20, 35, 15, 54, 18, 75, 12), fill=light, width=2)
        draw.rectangle((8, height - 9, width - 8, height - 6), fill=dark)
    return clear_edges(result)


def meteor_frame(index: int, count: int = 10) -> Image.Image:
    image = rgba_image(128, 128)
    draw = ImageDraw.Draw(image)
    rock = (72, 75, 74, 255)
    rock_light = (173, 157, 127, 255)
    hot = (255, 173, 70, 255)
    white = (255, 238, 190, 255)
    orange = (205, 75, 44, 255)
    t = index / (count - 1)
    if index < 3:
        x = 84 - index * 9
        y = 13 + index * 15
        draw.polygon([(x - 8, y - 12), (x + 6, y - 7), (x + 11, y + 4), (x + 2, y + 12), (x - 10, y + 5)], fill=rock)
        draw.polygon([(x - 5, y - 8), (x + 4, y - 5), (x + 7, y + 1), (x - 1, y + 5)], fill=rock_light)
        draw.line((x - 20, y - 18, x - 7, y - 8), fill=hot, width=3)
        draw.line((x - 25, y - 10, x - 9, y - 2), fill=orange, width=2)
    radius = int(7 + max(0, index - 2) * 14)
    if index >= 2:
        cx, cy = 64, 73
        draw.polygon([(cx - 17, cy + 9), (cx - 10, cy + 1), (cx + 12, cy + 1), (cx + 20, cy + 9), (cx + 13, cy + 15), (cx - 12, cy + 15)], fill=rock)
        if index == 2:
            draw.rectangle((cx - 7, cy - 5, cx + 7, cy + 7), fill=white)
            draw.rectangle((cx - 3, cy - 10, cx + 3, cy + 2), fill=hot)
        else:
            draw.ellipse((cx - radius, cy - radius // 2, cx + radius, cy + radius // 2), outline=hot, width=3)
            draw.ellipse((cx - max(4, radius - 8), cy - max(3, radius // 2 - 5), cx + max(4, radius - 8), cy + max(3, radius // 2 - 5)), outline=orange, width=2)
            for ray in range(8):
                angle = ray / 8 * math.tau + t
                start = max(5, radius // 3)
                end = max(start + 3, radius - 3)
                draw.line((cx + math.cos(angle) * start, cy + math.sin(angle) * start * 0.5,
                           cx + math.cos(angle) * end, cy + math.sin(angle) * end * 0.5), fill=hot if ray % 2 else white, width=2)
            dust = max(1, 10 - index)
            for dust_index in range(dust):
                px = cx - 30 + ((dust_index * 17 + index * 9) % 61)
                py = cy + 17 + ((dust_index * 11 + index * 5) % 20)
                draw.rectangle((px, py, px + 3, py + 3), fill=orange if dust_index % 2 else rock_light)
    return clear_edges(image)


def railgun_frame(index: int) -> Image.Image:
    image = rgba_image(128, 32)
    draw = ImageDraw.Draw(image)
    width = 2 + index
    # One centered connected beam, never a second parallel ray.
    draw.rectangle((2, 16 - width, 125, 16 + width), fill=(103, 227, 238, 255))
    draw.rectangle((10, 16 - max(1, width - 1), 118, 16 + max(1, width - 1)), fill=(239, 255, 245, 255))
    draw.rectangle((20 + index * 2, 15, 111, 17), fill=(122, 255, 246, 255))
    draw.rectangle((0, 15, 7, 17), fill=(255, 255, 218, 255))
    draw.rectangle((121, 14 - index // 2, 127, 18 + index // 2), fill=(255, 179, 73, 255))
    return clear_edges(image)


def button_texture(fill, edge, pressed=False, disabled=False) -> Image.Image:
    image = rgba_image(160, 36)
    draw = ImageDraw.Draw(image)
    if disabled:
        fill, edge = (38, 47, 49), (86, 96, 92)
    elif pressed:
        fill = tuple(max(0, int(value * 0.72)) for value in fill[:3]) + (255,)
    else:
        fill = fill + (255,)
    edge = edge + (255,)
    draw.polygon([(4, 0), (156, 0), (160, 4), (160, 31), (156, 35), (4, 35), (0, 31), (0, 4)], fill=fill)
    draw.line([(5, 1), (155, 1), (158, 4)], fill=edge, width=2)
    draw.line([(2, 5), (2, 30), (5, 33), (155, 33)], fill=edge, width=2)
    draw.rectangle((12, 7, 148, 9), fill=(edge[0], edge[1], edge[2], 170))
    draw.rectangle((12, 27, 148, 29), fill=(7, 13, 15, 255))
    return clear_edges(image)


def warning_panel() -> Image.Image:
    image = rgba_image(280, 128)
    draw = ImageDraw.Draw(image)
    fill = (12, 22, 25, 245)
    edge = (200, 79, 62, 255)
    draw.polygon([(7, 0), (273, 0), (280, 7), (280, 121), (273, 128), (7, 128), (0, 121), (0, 7)], fill=fill)
    draw.line([(8, 2), (272, 2), (278, 8)], fill=edge, width=2)
    draw.line([(2, 8), (2, 120), (8, 126), (272, 126)], fill=edge, width=2)
    draw.rectangle((11, 13, 269, 16), fill=(92, 223, 219, 255))
    draw.rectangle((11, 109, 269, 112), fill=(92, 223, 219, 255))
    draw.rectangle((14, 23, 266, 102), outline=(69, 103, 101, 255), width=1)
    return clear_edges(image)


def warning_icon() -> Image.Image:
    image = rgba_image(32, 32)
    draw = ImageDraw.Draw(image)
    draw.polygon([(16, 3), (29, 27), (3, 27)], fill=(194, 62, 55, 255))
    draw.rectangle((14, 10, 17, 20), fill=(255, 226, 159, 255))
    draw.rectangle((14, 23, 17, 25), fill=(255, 226, 159, 255))
    return clear_edges(image)


def font(size: int):
    path = GAME / "fonts" / "fusion_pixel_12" / "fusion-pixel-12px-proportional-zh_hans.ttf"
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default()


def save_enemy_danger(manifest: dict, validation: dict) -> None:
    for planet, entries in ENEMIES.items():
        for asset_id, (behavior, _) in entries.items():
            if behavior not in SPECIAL_BEHAVIORS:
                continue
            folder = OUT / "enemies" / "danger" / planet / asset_id
            folder.mkdir(parents=True, exist_ok=True)
            frames = []
            for direction in DIRECTIONS:
                frame = danger_palette(load_enemy_frame(planet, asset_id, direction), planet)
                frame.save(folder / f"{direction}.png")
                frames.append(frame)
            sheet(frames).save(folder / f"{asset_id}_attack_danger_4dir.png")
            preview = Image.new("RGBA", (512, 128), (16, 20, 23, 255))
            for index, frame in enumerate(frames):
                preview.alpha_composite(frame.resize((128, 128), Image.Resampling.NEAREST), (index * 128, 0))
            preview.save(folder / f"{asset_id}_attack_danger_preview.png")
            write_json(folder / f"{asset_id}_attack_danger_4dir.json", {
                "id": f"{asset_id}.attack_danger", "assetType": "enemy_attack_danger", "planet": planet,
                "enemyId": asset_id, "enemyType": behavior, "frameWidth": 64, "frameHeight": 64,
                "frameCount": 4, "anchor": {"x": 32, "y": 56}, "order": DIRECTIONS,
                "sheet": f"{asset_id}_attack_danger_4dir.png", "imageSmoothingEnabled": False,
                "palette": "full-body-danger-red", "source": "v6_static_four_direction"
            })
            manifest["enemyDanger"].append({"planet": planet, "enemyId": asset_id, "enemyType": behavior,
                                             "path": str((folder / f"{asset_id}_attack_danger_4dir.png").relative_to(ROOT)).replace("\\", "/")})
            validation["dangerSpecies"] += 1


def save_elites(manifest: dict, validation: dict) -> None:
    for planet, entries in ENEMIES.items():
        for asset_id, (behavior, _) in entries.items():
            folder = OUT / "enemies" / "elites" / planet / asset_id
            folder.mkdir(parents=True, exist_ok=True)
            frames = []
            for direction in DIRECTIONS:
                frame = elite_variant(load_enemy_frame(planet, asset_id, direction), planet, behavior, direction)
                frame.save(folder / f"{direction}.png")
                frames.append(frame)
            sheet(frames).save(folder / f"{asset_id}_elite_4dir.png")
            preview = Image.new("RGBA", (512, 128), (16, 20, 23, 255))
            for index, frame in enumerate(frames):
                preview.alpha_composite(frame.resize((128, 128), Image.Resampling.NEAREST), (index * 128, 0))
            preview.save(folder / f"{asset_id}_elite_preview.png")
            # A direction-cycle GIF is kept as a review artifact; the runtime
            # interface remains the four static direction frames above.
            save_gif(frames, folder / f"{asset_id}_elite_4dir.gif", 4)
            write_json(folder / f"{asset_id}_elite_4dir.json", {
                "id": f"{asset_id}.elite", "assetType": "elite_enemy", "planet": planet,
                "enemyId": asset_id, "enemyType": behavior, "frameWidth": 96, "frameHeight": 96,
                "frameCount": 4, "anchor": {"x": 48, "y": 82}, "order": DIRECTIONS,
                "sheet": f"{asset_id}_elite_4dir.png", "imageSmoothingEnabled": False,
                "badge": None, "crown": False, "triangleMarker": False
            })
            manifest["elites"].append({"planet": planet, "enemyId": asset_id, "enemyType": behavior,
                                       "path": str((folder / f"{asset_id}_elite_4dir.png").relative_to(ROOT)).replace("\\", "/")})
            validation["eliteSpecies"] += 1
            if behavior in SPECIAL_BEHAVIORS:
                danger_frames = [danger_palette(frame, planet) for frame in frames]
                danger_folder = folder / "attack_danger"
                danger_folder.mkdir(parents=True, exist_ok=True)
                for direction, frame in zip(DIRECTIONS, danger_frames):
                    frame.save(danger_folder / f"{direction}.png")
                sheet(danger_frames).save(danger_folder / f"{asset_id}_elite_attack_danger_4dir.png")
                write_json(danger_folder / f"{asset_id}_elite_attack_danger_4dir.json", {
                    "id": f"{asset_id}.elite_attack_danger", "assetType": "elite_attack_danger",
                    "planet": planet, "enemyId": asset_id, "enemyType": behavior, "frameWidth": 96,
                    "frameHeight": 96, "frameCount": 4, "anchor": {"x": 48, "y": 82}, "order": DIRECTIONS,
                    "sheet": f"{asset_id}_elite_attack_danger_4dir.png", "imageSmoothingEnabled": False
                })
                validation["eliteDangerSpecies"] += 1


def save_moon_props(manifest: dict, validation: dict) -> None:
    folder = OUT / "props" / "moon"
    folder.mkdir(parents=True, exist_ok=True)
    for prop_id, (width, height, size_class) in MOON_PROPS.items():
        image = make_moon_prop(prop_id, width, height)
        path = folder / f"{prop_id}.png"
        image.save(path)
        image.resize((width * 4, height * 4), Image.Resampling.NEAREST).save(folder / f"{prop_id}_4x.png")
        write_json(folder / f"{prop_id}.json", {
            "id": prop_id, "planet": "moon", "assetType": "prop", "width": width, "height": height,
            "anchor": {"x": width // 2, "y": max(1, height - 8)}, "sizeClass": size_class,
            "suggestedScale": [0.72, 1.15], "occupancyRadius": max(10, min(width, height) // 3),
            "weight": 1, "hasShadow": size_class != "decal", "imageSmoothingEnabled": False
        })
        manifest["moonProps"].append({"id": prop_id, "path": str(path.relative_to(ROOT)).replace("\\", "/")})
        validation["moonProps"] += 1
    board = Image.new("RGBA", (768, 512), (12, 17, 20, 255))
    ground = Image.open(GAME / "planets" / "moon_ground.png").convert("RGBA").resize((512, 512), Image.Resampling.NEAREST)
    board.alpha_composite(ground, (0, 0))
    for index, prop_id in enumerate(MOON_PROPS):
        image = Image.open(folder / f"{prop_id}.png").convert("RGBA")
        x = 545 + (index % 2) * 100
        y = 45 + (index // 2) * 112
        board.alpha_composite(image, (x - image.width // 2, y - image.height // 2))
    board.save(OUT / "moon_props_overview.png")


def save_planet_assets(manifest: dict, validation: dict) -> None:
    folder = OUT / "planets" / "moon"
    icon = make_planet_mark(32)
    icon.save(folder / "planet_moon.png")
    cover = make_planet_mark(128)
    cover.save(folder / "moon_cover.png")
    cover.resize((512, 512), Image.Resampling.NEAREST).save(folder / "moon_cover_4x.png")
    write_json(folder / "planet_moon.json", {
        "id": "planet_moon", "assetType": "planet_mark", "width": 32, "height": 32,
        "anchor": {"x": 16, "y": 16}, "planet": "moon", "imageSmoothingEnabled": False
    })
    write_json(folder / "moon_cover.json", {
        "id": "moon_cover", "assetType": "planet_cover", "width": 128, "height": 128,
        "anchor": {"x": 64, "y": 64}, "planet": "moon", "imageSmoothingEnabled": False
    })
    manifest["planetMoon"] = {"icon": str((folder / "planet_moon.png").relative_to(ROOT)).replace("\\", "/"),
                               "cover": str((folder / "moon_cover.png").relative_to(ROOT)).replace("\\", "/")}
    validation["planetMoon"] = True


def save_vfx(manifest: dict, validation: dict) -> None:
    meteor_folder = OUT / "vfx" / "meteor_impact_v2"
    meteor_folder.mkdir(parents=True, exist_ok=True)
    meteor_frames = [meteor_frame(index) for index in range(10)]
    for index, frame in enumerate(meteor_frames):
        frame.save(meteor_folder / f"frame_{index:02d}.png")
    sheet(meteor_frames).save(meteor_folder / "meteor_impact_v2.png")
    save_gif(meteor_frames, meteor_folder / "meteor_impact_v2.gif", 18)
    write_json(meteor_folder / "meteor_impact_v2.json", {
        "id": "meteor_impact_v2", "assetType": "vfx", "event": "meteor_impact", "frameWidth": 128,
        "frameHeight": 128, "frameCount": 10, "fps": 18, "loop": False, "anchor": {"x": 64, "y": 64},
        "blendMode": "source-over", "sheet": "meteor_impact_v2.png", "imageSmoothingEnabled": False
    })
    manifest["vfx"].append({"id": "meteor_impact_v2", "path": str((meteor_folder / "meteor_impact_v2.png").relative_to(ROOT)).replace("\\", "/")})
    validation["meteorFrames"] = len(meteor_frames)

    rail_folder = OUT / "vfx" / "railgun_beam_single"
    rail_folder.mkdir(parents=True, exist_ok=True)
    rail_frames = [railgun_frame(index) for index in range(4)]
    for index, frame in enumerate(rail_frames):
        frame.save(rail_folder / f"frame_{index:02d}.png")
    sheet(rail_frames).save(rail_folder / "railgun_beam_single.png")
    save_gif(rail_frames, rail_folder / "railgun_beam_single.gif", 20)
    write_json(rail_folder / "railgun_beam_single.json", {
        "id": "railgun_beam_single", "assetType": "vfx", "event": "railgun_beam", "frameWidth": 128,
        "frameHeight": 32, "frameCount": 4, "fps": 20, "loop": True, "anchor": {"x": 0, "y": 16},
        "blendMode": "lighter", "sheet": "railgun_beam_single.png", "beamCount": 1,
        "imageSmoothingEnabled": False
    })
    # A high-contrast alpha inspection board catches accidental double beams.
    alpha_board = Image.new("RGBA", (512, 96), (10, 14, 16, 255))
    for index, frame in enumerate(rail_frames):
        mask = frame.getchannel("A").convert("L")
        mask = Image.merge("RGBA", (mask, mask, mask, Image.new("L", mask.size, 255)))
        alpha_board.alpha_composite(mask.resize((128, 32), Image.Resampling.NEAREST), (index * 128, 32))
    alpha_board.save(rail_folder / "railgun_beam_single_alpha_check.png")
    manifest["vfx"].append({"id": "railgun_beam_single", "path": str((rail_folder / "railgun_beam_single.png").relative_to(ROOT)).replace("\\", "/"),
                             "comparison": "assets/concepts/v7_texture_review/railgun_single_legacy_comparison.png"})
    validation["railgunFrames"] = len(rail_frames)

    overview = Image.new("RGBA", (768, 256), (13, 18, 20, 255))
    meteor_sheet = Image.open(meteor_folder / "meteor_impact_v2.png").convert("RGBA").crop((0, 0, 128, 128)).resize((192, 192), Image.Resampling.NEAREST)
    rail_sheet = Image.open(rail_folder / "railgun_beam_single.png").convert("RGBA").crop((0, 0, 128, 32)).resize((384, 96), Image.Resampling.NEAREST)
    overview.alpha_composite(meteor_sheet, (20, 20))
    overview.alpha_composite(rail_sheet, (330, 80))
    overview.save(OUT / "meteor_railgun_overview.png")

    # Explicitly compare the new single-beam strip against the shipped legacy
    # strip so the review can confirm that no parallel beam remains.
    comparison = Image.new("RGBA", (768, 220), (13, 18, 20, 255))
    old_path = GAME / "skills" / "gunner" / "vfx" / "railgun_beam" / "railgun_beam.png"
    if old_path.exists():
        old = Image.open(old_path).convert("RGBA").crop((0, 0, 128, 32)).resize((384, 96), Image.Resampling.NEAREST)
        comparison.alpha_composite(old, (18, 88))
        ImageDraw.Draw(comparison).text((18, 68), "LEGACY / 可能出现双束", fill=(255, 179, 132, 255), font=font(10))
    comparison.alpha_composite(rail_sheet, (366, 88))
    ImageDraw.Draw(comparison).text((366, 68), "V7 SINGLE / 单束中心光", fill=(137, 255, 247, 255), font=font(10))
    comparison.save(OUT / "railgun_single_legacy_comparison.png")


def save_ui(manifest: dict, validation: dict) -> None:
    folder = OUT / "ui" / "exit_run"
    folder.mkdir(parents=True, exist_ok=True)
    colors = {
        "return_hq_button_normal": ((24, 47, 51), (104, 219, 211), False, False),
        "return_hq_button_pressed": ((24, 47, 51), (104, 219, 211), True, False),
        "return_hq_button_disabled": ((24, 47, 51), (104, 219, 211), False, True),
        "exit_danger_button_normal": ((73, 32, 34), (236, 104, 74), False, False),
        "exit_danger_button_pressed": ((73, 32, 34), (236, 104, 74), True, False),
        "exit_danger_button_disabled": ((73, 32, 34), (236, 104, 74), False, True),
    }
    for name, (fill, edge, pressed, disabled) in colors.items():
        image = button_texture(fill, edge, pressed, disabled)
        image.save(folder / f"{name}.png")
        manifest["ui"].append({"id": name, "path": str((folder / f"{name}.png").relative_to(ROOT)).replace("\\", "/")})
    panel = warning_panel()
    panel.save(folder / "exit_warning_panel.png")
    warning_icon().save(folder / "loss_warning_icon.png")
    write_json(folder / "exit_warning_panel.json", {
        "id": "exit_warning_panel", "assetType": "ui_panel", "width": 280, "height": 128,
        "nineSlice": {"left": 8, "top": 8, "right": 8, "bottom": 8}, "imageSmoothingEnabled": False
    })
    write_json(folder / "loss_warning_icon.json", {
        "id": "loss_warning_icon", "assetType": "ui_icon", "width": 32, "height": 32,
        "anchor": {"x": 16, "y": 16}, "imageSmoothingEnabled": False
    })
    manifest["ui"].extend([
        {"id": "exit_warning_panel", "path": str((folder / "exit_warning_panel.png").relative_to(ROOT)).replace("\\", "/")},
        {"id": "loss_warning_icon", "path": str((folder / "loss_warning_icon.png").relative_to(ROOT)).replace("\\", "/")},
    ])
    validation["uiAssets"] = len(manifest["ui"])
    board = Image.new("RGBA", (360, 640), (9, 14, 17, 255))
    draw = ImageDraw.Draw(board)
    draw.rectangle((17, 16, 343, 74), fill=(10, 20, 23, 255), outline=(92, 226, 219, 255), width=2)
    draw.text((30, 37), "外勤 // 任务进行中", fill=(226, 237, 219, 255), font=font(13))
    board.alpha_composite(panel, (40, 190))
    board.alpha_composite(warning_icon(), (56, 208))
    draw.text((99, 213), "退出外勤？", fill=(236, 104, 74, 255), font=font(15))
    draw.text((99, 242), "退出将失去未撤离的额外战利品", fill=(222, 225, 203, 255), font=font(10))
    board.alpha_composite(Image.open(folder / "return_hq_button_normal.png"), (26, 336))
    board.alpha_composite(Image.open(folder / "exit_danger_button_normal.png"), (174, 336))
    draw.text((55, 347), "继续任务", fill=(213, 240, 231, 255), font=font(12))
    draw.text((202, 347), "返回总部", fill=(255, 220, 182, 255), font=font(12))
    board.save(OUT / "exit_confirm_preview_360x640.png")
    board.resize((720, 1280), Image.Resampling.NEAREST).save(OUT / "exit_confirm_preview_720x1280.png")


def build_overviews(manifest: dict) -> None:
    # Elite and danger overviews use the first frame of every generated sheet.
    elite_board = Image.new("RGBA", (1024, 768), (14, 19, 22, 255))
    draw = ImageDraw.Draw(elite_board)
    for index, item in enumerate(manifest["elites"]):
        image = Image.open(ROOT / item["path"]).convert("RGBA").crop((0, 0, 96, 96)).resize((128, 128), Image.Resampling.NEAREST)
        x = (index % 8) * 128
        y = (index // 8) * 250 + 26
        elite_board.alpha_composite(image, (x, y))
        draw.text((x + 4, y + 136), f"{item['planet']} // {item['enemyId'][:14]}", fill=(228, 238, 224, 255), font=font(8))
    elite_board.save(OUT / "elite_overview.png")
    elite_board.resize((2048, 1536), Image.Resampling.NEAREST).save(OUT / "elite_overview_2x.png")

    danger_board = Image.new("RGBA", (1024, 432), (14, 19, 22, 255))
    draw = ImageDraw.Draw(danger_board)
    for index, item in enumerate(manifest["enemyDanger"]):
        image = Image.open(ROOT / item["path"]).convert("RGBA").crop((0, 0, 64, 64)).resize((96, 96), Image.Resampling.NEAREST)
        x = (index % 9) * 112 + 8
        y = (index // 9) * 190 + 18
        danger_board.alpha_composite(image, (x, y))
        draw.text((x, y + 104), f"{item['planet']} {item['enemyId'][:10]}", fill=(247, 200, 180, 255), font=font(8))
    danger_board.save(OUT / "danger_overview.png")
    danger_board.resize((2048, 864), Image.Resampling.NEAREST).save(OUT / "danger_overview_2x.png")

    # A combined 360x640 review frame brings the requested assets together.
    combined = Image.new("RGBA", (360, 640), (9, 14, 17, 255))
    moon_ground = Image.open(GAME / "planets" / "moon_ground.png").convert("RGBA").resize((360, 640), Image.Resampling.NEAREST)
    combined.alpha_composite(moon_ground)
    combined.alpha_composite(Image.open(OUT / "planets" / "moon" / "moon_cover.png").resize((96, 96), Image.Resampling.NEAREST), (18, 44))
    combined.alpha_composite(Image.open(OUT / "enemies" / "elites" / "moon" / "prism_sentry" / "prism_sentry_elite_4dir.png").crop((0, 0, 96, 96)).resize((96, 96), Image.Resampling.NEAREST), (240, 225))
    meteor = Image.open(OUT / "vfx" / "meteor_impact_v2" / "meteor_impact_v2.png").crop((0, 0, 128, 128)).resize((112, 112), Image.Resampling.NEAREST)
    combined.alpha_composite(meteor, (120, 370))
    draw = ImageDraw.Draw(combined)
    draw.rectangle((7, 7, 353, 31), fill=(7, 12, 15, 225), outline=(102, 226, 220, 255), width=2)
    draw.text((15, 13), "V7 TEXTURE REVIEW // MOON + ELITE + IMPACT", fill=(233, 240, 222, 255), font=font(8))
    combined.save(OUT / "v7_texture_overview_360x640.png")
    combined.resize((720, 1280), Image.Resampling.NEAREST).save(OUT / "v7_texture_overview_720x1280.png")


def verify_png(path: Path, expected_size: tuple[int, int]) -> list[str]:
    errors = []
    try:
        image = Image.open(path).convert("RGBA")
        if image.size != expected_size:
            errors.append(f"{path}: expected {expected_size}, got {image.size}")
        if image.getpixel((0, 0))[3] != 0 or image.getpixel((image.width - 1, image.height - 1))[3] != 0:
            errors.append(f"{path}: edge alpha is not transparent")
        for pixel in image.getdata():
            if pixel[3] > 0 and pixel[0] > 235 and pixel[1] < 35 and pixel[2] > 170:
                errors.append(f"{path}: possible magenta residue")
                break
    except Exception as error:  # pragma: no cover - report in validation JSON
        errors.append(f"{path}: {error}")
    return errors


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    for directory in [OUT / "planets" / "moon", OUT / "props" / "moon", OUT / "enemies", OUT / "vfx", OUT / "ui" / "exit_run"]:
        directory.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 7, "reviewOnly": True, "runtimeModified": False, "planetMoon": {}, "moonProps": [], "enemyDanger": [], "elites": [], "vfx": [], "ui": []}
    validation = {"passed": True, "planetMoon": False, "moonProps": 0, "dangerSpecies": 0, "eliteSpecies": 0, "eliteDangerSpecies": 0, "meteorFrames": 0, "railgunFrames": 0, "uiAssets": 0, "errors": []}
    save_planet_assets(manifest, validation)
    save_moon_props(manifest, validation)
    save_enemy_danger(manifest, validation)
    save_elites(manifest, validation)
    save_vfx(manifest, validation)
    save_ui(manifest, validation)
    build_overviews(manifest)

    for path, size in [
        (OUT / "planets" / "moon" / "planet_moon.png", (32, 32)),
        (OUT / "planets" / "moon" / "moon_cover.png", (128, 128)),
    ]:
        validation["errors"].extend(verify_png(path, size))
    for item in manifest["enemyDanger"]:
        validation["errors"].extend(verify_png(ROOT / item["path"], (256, 64)))
    for item in manifest["elites"]:
        validation["errors"].extend(verify_png(ROOT / item["path"], (384, 96)))
    validation["errors"].extend(verify_png(OUT / "vfx" / "meteor_impact_v2" / "meteor_impact_v2.png", (1280, 128)))
    validation["errors"].extend(verify_png(OUT / "vfx" / "railgun_beam_single" / "railgun_beam_single.png", (512, 32)))
    validation["passed"] = not validation["errors"]
    write_json(OUT / "v7_texture_manifest.json", manifest)
    write_json(OUT / "v7_texture_validation.json", validation)
    write_json(OUT / "v7_generation_notes.json", {
        "sourceReference": "assets/concepts/v6_enemy_vfx_review/imagegen_enemy_reference.png",
        "style": "hard-edge 8-bit pixel art, deterministic nearest-neighbour processing",
        "imagegenAttempt": "network_error_fallback_to_existing_v6_reference",
        "runtimeModified": False,
    })
    print(json.dumps({"passed": validation["passed"], "moonProps": validation["moonProps"], "dangerSpecies": validation["dangerSpecies"], "eliteSpecies": validation["eliteSpecies"], "meteorFrames": validation["meteorFrames"], "railgunFrames": validation["railgunFrames"], "uiAssets": validation["uiAssets"], "errors": len(validation["errors"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
