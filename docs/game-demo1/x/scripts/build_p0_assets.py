from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
GAME = ASSETS / "game"
WORK = ASSETS / "work" / "p0"

RUST_MASTER = WORK / "rust_p0_concept_master.png"
ICON_MASTER = WORK / "ui_icon_concept_master.png"
RUST_GROUND = GAME / "planets" / "rust_ground.png"
MIA_SHEET = GAME / "characters" / "gunner_mia" / "gunner_mia_4dir.png"

FONT_DOWNLOADS = WORK / "font_downloads"
FONT_TTF_SOURCE = FONT_DOWNLOADS / "ttf" / "fusion-pixel-12px-proportional-zh_hans.ttf"
FONT_WOFF2_SOURCE = FONT_DOWNLOADS / "woff2" / "fusion-pixel-12px-proportional-zh_hans.ttf.woff2"
FONT_LICENSE_SOURCE = FONT_DOWNLOADS / "OFL-1.1.txt"

OBJECTS_DIR = GAME / "objects" / "rust"
PICKUPS_DIR = GAME / "pickups"
PROPS_DIR = GAME / "props" / "rust"
UI_DIR = GAME / "ui"
FONT_DIR = GAME / "fonts" / "fusion_pixel_12"

PALETTE = {
    "ink": (9, 13, 16, 255),
    "deep": (15, 20, 21, 255),
    "panel": (20, 26, 29, 255),
    "panel2": (31, 39, 40, 255),
    "frame": (82, 91, 84, 255),
    "paper": (221, 213, 186, 255),
    "muted": (129, 127, 114, 255),
    "acid": (217, 255, 87, 255),
    "cyan": (81, 217, 209, 255),
    "cyan_hi": (180, 255, 249, 255),
    "orange": (255, 117, 71, 255),
    "danger": (255, 64, 87, 255),
    "rust": (185, 101, 62, 255),
    "rust_dark": (76, 43, 35, 255),
    "gold": (236, 177, 54, 255),
}


def ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path, data: dict) -> None:
    ensure(path.parent)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def matte_to_alpha(image: Image.Image) -> Image.Image:
    src = image.convert("RGBA")
    pixels = src.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b, _ = pixels[x, y]
            is_matte = r > 155 and b > 145 and g < 145 and (r + b) > (g * 2.55 + 100)
            if is_matte:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                # Suppress darker magenta spill left by the controlled matte on hard pixel edges.
                is_spill = r > 28 and b > 28 and r > g * 1.28 and b > g * 1.28 and abs(r - b) < 105
                if is_spill:
                    level = max(18, min(120, (r + g + b) // 3))
                    pixels[x, y] = (int(level * 0.72), int(level * 0.42), int(level * 0.31), 255)
                else:
                    pixels[x, y] = (r, g, b, 255)
    return remove_strays(src)


def remove_strays(image: Image.Image, minimum: int = 4) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    px = alpha.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            if px[x, y] == 0 or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < image.width and 0 <= ny < image.height and px[nx, ny] and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            components.append(component)
    if not components:
        return image
    largest = max(len(item) for item in components)
    keep_threshold = max(minimum, int(largest * 0.0025))
    out = image.copy()
    out_px = out.load()
    for component in components:
        if len(component) < keep_threshold:
            for x, y in component:
                out_px[x, y] = (0, 0, 0, 0)
    return out


def extract_subject(master: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    cell = matte_to_alpha(master.crop(box))
    bbox = cell.getbbox()
    if bbox is None:
        raise RuntimeError(f"No subject in source box {box}")
    left, top, right, bottom = bbox
    left = max(0, left - 2)
    top = max(0, top - 2)
    right = min(cell.width, right + 2)
    bottom = min(cell.height, bottom + 2)
    return cell.crop((left, top, right, bottom))


def fit_sprite(source: Image.Image, canvas: tuple[int, int], content: tuple[int, int], anchor: tuple[int, int]) -> Image.Image:
    source = source.convert("RGBA")
    scale = min(content[0] / source.width, content[1] / source.height)
    width = max(1, int(round(source.width * scale)))
    height = max(1, int(round(source.height * scale)))
    scaled = source.resize((width, height), Image.Resampling.NEAREST)
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    x = anchor[0] - width // 2
    y = anchor[1] - height
    out.alpha_composite(scaled, (x, y))
    return scrub_transparent_rgb(out)


def fit_centered(source: Image.Image, canvas: tuple[int, int], content: tuple[int, int], center: tuple[int, int]) -> Image.Image:
    source = source.convert("RGBA")
    scale = min(content[0] / source.width, content[1] / source.height)
    width = max(1, int(round(source.width * scale)))
    height = max(1, int(round(source.height * scale)))
    scaled = source.resize((width, height), Image.Resampling.NEAREST)
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    out.alpha_composite(scaled, (center[0] - width // 2, center[1] - height // 2))
    return scrub_transparent_rgb(out)


def scrub_transparent_rgb(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def recolor_lights(image: Image.Image, factor: float, accent: tuple[int, int, int, int]) -> Image.Image:
    out = image.copy().convert("RGBA")
    pixels = out.load()
    ar, ag, ab, _ = accent
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if not a:
                continue
            is_cyan = g > r * 1.25 and b > r * 1.15 and (g + b) > 170
            is_warm = r > 95 and r > g * 1.25 and g > b * 0.65
            if is_cyan or is_warm:
                mix = 0.28 + 0.38 * factor
                nr = int(min(255, r * (0.72 + factor * 0.42) * (1 - mix) + ar * mix))
                ng = int(min(255, g * (0.72 + factor * 0.42) * (1 - mix) + ag * mix))
                nb = int(min(255, b * (0.72 + factor * 0.42) * (1 - mix) + ab * mix))
                pixels[x, y] = (nr, ng, nb, a)
    return out


def darken(image: Image.Image, amount: float = 0.55) -> Image.Image:
    out = image.copy().convert("RGBA")
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a:
                gray = (r + g + b) // 3
                pixels[x, y] = (
                    int((r * 0.68 + gray * 0.32) * amount),
                    int((g * 0.68 + gray * 0.32) * amount),
                    int((b * 0.68 + gray * 0.32) * amount),
                    a,
                )
    return out


def destroyed(image: Image.Image, anchor: tuple[int, int]) -> Image.Image:
    flat_height = max(10, int(image.height * 0.58))
    flattened = image.resize((image.width, flat_height), Image.Resampling.NEAREST)
    flattened = darken(flattened, 0.62)
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    out.alpha_composite(flattened, (0, anchor[1] - flat_height))
    draw = ImageDraw.Draw(out)
    debris = [(12, 54), (17, 50), (45, 53), (50, 49), (29, 55), (37, 52)]
    for index, (x, y) in enumerate(debris):
        color = PALETTE["rust_dark"] if index % 2 else PALETTE["rust"]
        draw.rectangle((x, y, x + 2, y + 1), fill=color)
    return out


def add_pixels(image: Image.Image, pixels: list[tuple[int, int]], color: tuple[int, int, int, int], size: int = 1) -> Image.Image:
    out = image.copy()
    draw = ImageDraw.Draw(out)
    for x, y in pixels:
        draw.rectangle((x, y, x + size - 1, y + size - 1), fill=color)
    return out


def save_sheet(frames: list[Image.Image], path: Path) -> None:
    if not frames:
        raise ValueError("Empty frame list")
    width, height = frames[0].size
    sheet = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * width, 0))
    ensure(path.parent)
    sheet.save(path)


def checkerboard(size: tuple[int, int], block: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, (34, 40, 41, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], block):
        for x in range(0, size[0], block):
            if ((x // block) + (y // block)) % 2:
                draw.rectangle((x, y, x + block - 1, y + block - 1), fill=(53, 60, 61, 255))
    return image


def frame_preview(frames: list[Image.Image], labels: list[str], path: Path, scale: int = 6) -> None:
    fw, fh = frames[0].size
    gap = 12
    cell_w = fw * scale + gap * 2
    cell_h = fh * scale + 34
    preview = checkerboard((cell_w * len(frames), cell_h), 12)
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default()
    for index, frame in enumerate(frames):
        enlarged = frame.resize((fw * scale, fh * scale), Image.Resampling.NEAREST)
        preview.alpha_composite(enlarged, (index * cell_w + gap, 8))
        label = labels[index] if index < len(labels) else f"FRAME {index}"
        draw.text((index * cell_w + gap, fh * scale + 14), label, fill=PALETTE["paper"], font=font)
    ensure(path.parent)
    preview.save(path)


def build_facilities(master: Image.Image) -> dict[str, list[Image.Image]]:
    specs = {
        "rust_nest": {
            "box": (0, 0, 260, 330), "canvas": (64, 64), "content": (58, 54), "anchor": (32, 56),
            "radius": 34, "states": [("idle", 4, 7, True), ("destroyed", 1, 0, False)],
        },
        "company_beacon": {
            "box": (260, 0, 520, 330), "canvas": (64, 64), "content": (54, 54), "anchor": (32, 56),
            "radius": 44, "states": [("inactive", 1, 0, False), ("charging", 4, 8, True), ("completed", 1, 0, False)],
        },
        "mining_drill": {
            "box": (500, 0, 790, 330), "canvas": (96, 96), "content": (88, 82), "anchor": (48, 84),
            "radius": None, "guardRadius": 142, "states": [("idle", 1, 0, False), ("running", 4, 9, True), ("completed", 1, 0, False)],
        },
        "reward_cache": {
            "box": (760, 0, 1024, 330), "canvas": (64, 64), "content": (56, 48), "anchor": (32, 56),
            "radius": 42, "states": [("locked", 1, 0, False), ("ready", 4, 8, True), ("opened", 1, 0, False)],
        },
        "extraction_terminal": {
            "box": (0, 330, 320, 575), "canvas": (64, 64), "content": (58, 50), "anchor": (32, 56),
            "radius": 82, "states": [("offline", 1, 0, False), ("uploading", 4, 8, True), ("completed", 1, 0, False)],
        },
        "extraction_field": {
            "box": (300, 330, 680, 575), "canvas": (128, 64), "content": (120, 52), "anchor": (64, 32),
            "radius": 82, "states": [("active", 4, 10, True)], "blendMode": "lighter",
        },
    }
    built: dict[str, list[Image.Image]] = {}
    pulse = [0.42, 0.75, 1.0, 0.68]
    for asset_id, spec in specs.items():
        source = extract_subject(master, spec["box"])
        if asset_id == "extraction_field":
            base = fit_centered(source, spec["canvas"], spec["content"], spec["anchor"])
        else:
            base = fit_sprite(source, spec["canvas"], spec["content"], spec["anchor"])
        frames: list[Image.Image] = []
        filenames: list[str] = []
        state_meta: dict[str, dict] = {}
        start = 0
        for state, count, fps, loop in spec["states"]:
            state_frames: list[Image.Image] = []
            for index in range(count):
                if state in {"inactive", "idle", "locked", "offline"} and count == 1:
                    frame = darken(base, 0.58 if state in {"inactive", "offline"} else 0.82)
                elif state == "destroyed":
                    frame = destroyed(base, spec["anchor"])
                elif state == "opened":
                    frame = darken(base, 0.72)
                    draw = ImageDraw.Draw(frame)
                    interior = [(13, 31), (28, 23), (51, 28), (36, 37)]
                    lid = [(14, 25), (28, 17), (50, 22), (36, 30)]
                    draw.polygon(interior, fill=PALETTE["ink"])
                    draw.line(interior + [interior[0]], fill=(112, 65, 45, 255), width=2)
                    draw.polygon(lid, fill=(72, 41, 33, 255))
                    draw.line(lid + [lid[0]], fill=(18, 17, 16, 255), width=2)
                    draw.line((18, 24, 29, 19, 45, 22), fill=(151, 82, 51, 255), width=2)
                    draw.rectangle((26, 31, 39, 34), fill=(35, 27, 22, 255))
                    draw.rectangle((29, 31, 37, 33), fill=PALETTE["gold"])
                    draw.rectangle((31, 30, 35, 30), fill=PALETTE["paper"])
                elif state == "completed":
                    frame = recolor_lights(base, 1.0, PALETTE["acid"])
                    frame = add_pixels(frame, [(spec["anchor"][0] - 1, max(4, spec["anchor"][1] - 34))], PALETTE["acid"], 2)
                else:
                    factor = pulse[index % len(pulse)]
                    accent = PALETTE["orange"] if asset_id == "rust_nest" else PALETTE["cyan_hi"]
                    frame = recolor_lights(base, factor, accent)
                    cx = spec["anchor"][0]
                    cy = max(8, spec["anchor"][1] - (20 if asset_id == "extraction_field" else 30))
                    points = [(cx - 1, cy), (cx + ((index % 2) * 2 - 1) * 5, cy + 3)]
                    frame = add_pixels(frame, points, accent, 1 + int(factor > 0.9))
                    if asset_id == "extraction_field":
                        alpha = frame.getchannel("A").point(lambda a: int(a * (0.48 + factor * 0.42)))
                        frame.putalpha(alpha)
                        draw = ImageDraw.Draw(frame)
                        phase = index * 8
                        for angle in range(phase, 360, 90):
                            x = int(cx + math.cos(math.radians(angle)) * 47)
                            y = int(cy + 12 + math.sin(math.radians(angle)) * 15)
                            draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=(180, 255, 249, 185))
                frame = scrub_transparent_rgb(frame)
                state_frames.append(frame)
                filename = f"{state}_{index:02d}.png" if count > 1 else f"{state}.png"
                filenames.append(filename)
            frames.extend(state_frames)
            state_meta[state] = {"startFrame": start, "frameCount": count, "fps": fps, "loop": loop}
            start += count
        asset_dir = ensure(OBJECTS_DIR / asset_id)
        for frame, filename in zip(frames, filenames):
            frame.save(asset_dir / filename)
        save_sheet(frames, asset_dir / f"{asset_id}.png")
        frame_preview(frames, filenames, asset_dir / f"{asset_id}_preview.png", scale=4 if spec["canvas"][0] > 64 else 6)
        metadata = {
            "id": asset_id,
            "planet": "rust",
            "image": f"{asset_id}.png",
            "frameWidth": spec["canvas"][0],
            "frameHeight": spec["canvas"][1],
            "frameCount": len(frames),
            "anchor": {"x": spec["anchor"][0], "y": spec["anchor"][1]},
            "states": state_meta,
            "frames": filenames,
            "interactionRadius": spec.get("radius"),
            "guardRadius": spec.get("guardRadius"),
            "blendMode": spec.get("blendMode", "source-over"),
            "imageSmoothingEnabled": False,
        }
        write_json(asset_dir / f"{asset_id}.json", metadata)
        built[asset_id] = frames
    return built


def build_pickups(master: Image.Image) -> dict[str, list[Image.Image]]:
    specs = [
        ("xp_crystal", (630, 330, 830, 575), "player", "#d9ff57"),
        ("mission_coin", (810, 330, 1024, 575), "player", "#ecb136"),
        ("mechanical_scrap", (220, 575, 520, 750), "player", "#b9653e"),
        ("medical_unit", (500, 575, 820, 750), "player", "#51d9d1"),
    ]
    built: dict[str, list[Image.Image]] = {}
    atlas = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    atlas_frames: dict[str, dict] = {}
    for row, (asset_id, box, faction, color) in enumerate(specs):
        source = extract_subject(master, box)
        base = fit_sprite(source, (24, 24), (18, 18), (12, 20))
        frames: list[Image.Image] = []
        shifts = [0, -1, 0, 1]
        for index, shift in enumerate(shifts):
            frame = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
            frame.alpha_composite(base, (0, shift))
            if index == 1:
                frame = add_pixels(frame, [(17, 4), (19, 7)], PALETTE["paper"], 1)
            frames.append(frame)
            frame.save(ensure(PICKUPS_DIR / asset_id) / f"frame_{index:02d}.png")
            atlas.alpha_composite(frame, (index * 24, row * 24))
        save_sheet(frames, PICKUPS_DIR / asset_id / f"{asset_id}.png")
        frame_preview(frames, [f"FRAME {i}" for i in range(4)], PICKUPS_DIR / asset_id / f"{asset_id}_preview.png", scale=10)
        write_json(PICKUPS_DIR / asset_id / f"{asset_id}.json", {
            "id": asset_id,
            "image": f"{asset_id}.png",
            "frameWidth": 24,
            "frameHeight": 24,
            "frameCount": 4,
            "fps": 8,
            "loop": True,
            "anchor": {"x": 12, "y": 12},
            "faction": faction,
            "color": color,
            "frames": [f"frame_{i:02d}.png" for i in range(4)],
            "blendMode": "source-over",
            "imageSmoothingEnabled": False,
        })
        atlas_frames[asset_id] = {"x": 0, "y": row * 24, "width": 96, "height": 24, "frameCount": 4}
        built[asset_id] = frames
    ensure(PICKUPS_DIR)
    atlas.save(PICKUPS_DIR / "pickups_atlas.png")
    write_json(PICKUPS_DIR / "pickups_atlas.json", {
        "image": "pickups_atlas.png",
        "frameWidth": 24,
        "frameHeight": 24,
        "layout": "4 frames per row",
        "pickups": atlas_frames,
        "imageSmoothingEnabled": False,
    })
    return built


def build_props(master: Image.Image) -> dict[str, Image.Image]:
    cells = [
        ("rock_cluster", "small", (0, 750, 250, 930)),
        ("scrap_plate", "small", (250, 750, 500, 930)),
        ("cable_coil", "small", (500, 750, 760, 930)),
        ("gear_debris", "small", (760, 750, 1024, 930)),
        ("broken_pipe", "small", (0, 930, 250, 1110)),
        ("vent_grate", "small", (250, 930, 500, 1110)),
        ("warning_sign", "small", (500, 930, 760, 1110)),
        ("pipe_junction", "medium", (760, 930, 1024, 1110)),
        ("rust_barrels", "medium", (0, 1110, 250, 1300)),
        ("antenna_mast", "medium", (250, 1110, 500, 1300)),
        ("machine_carcass", "medium", (500, 1110, 760, 1300)),
        ("wrecked_rover", "medium", (760, 1110, 1024, 1300)),
        ("collapsed_pump", "medium", (0, 1300, 250, 1536)),
        ("power_pylon", "medium", (250, 1300, 500, 1536)),
        ("broken_mining_crane", "large", (500, 1300, 760, 1536)),
        ("crashed_shuttle_hull", "large", (760, 1300, 1024, 1536)),
    ]
    size_map = {
        "small": ((32, 32), (28, 25), (16, 28), [0.75, 1.25], 10, 8),
        "medium": ((64, 64), (56, 50), (32, 56), [0.75, 1.25], 20, 4),
        "large": ((128, 96), (116, 78), (64, 84), [0.85, 1.1], 42, 1),
    }
    props: dict[str, Image.Image] = {}
    catalog: dict[str, dict] = {}
    for asset_id, size_class, box in cells:
        canvas, content, anchor, scale_range, radius, weight = size_map[size_class]
        source = extract_subject(master, box)
        sprite = fit_sprite(source, canvas, content, anchor)
        sprite.save(ensure(PROPS_DIR / "objects") / f"{asset_id}.png")
        props[asset_id] = sprite
        catalog[asset_id] = {
            "image": f"objects/{asset_id}.png",
            "kind": "object",
            "sizeClass": size_class,
            "frameWidth": canvas[0],
            "frameHeight": canvas[1],
            "anchor": {"x": anchor[0], "y": anchor[1]},
            "suggestedScaleRange": scale_range,
            "footprintRadius": radius,
            "densityWeight": weight,
            "collision": False,
            "contactShadowIncluded": True,
        }
    decals = build_decals()
    for asset_id, sprite in decals.items():
        props[asset_id] = sprite
        catalog[asset_id] = {
            "image": f"decals/{asset_id}.png",
            "kind": "decal",
            "sizeClass": "decal",
            "frameWidth": 64,
            "frameHeight": 64,
            "anchor": {"x": 32, "y": 32},
            "suggestedScaleRange": [0.8, 1.35],
            "footprintRadius": 0,
            "densityWeight": 7,
            "collision": False,
            "contactShadowIncluded": False,
        }
    write_json(PROPS_DIR / "rust_props.json", {
        "planet": "rust",
        "objectCount": 16,
        "decalCount": 8,
        "props": catalog,
        "imageSmoothingEnabled": False,
    })
    return props


def build_decals() -> dict[str, Image.Image]:
    ensure(PROPS_DIR / "decals")
    result: dict[str, Image.Image] = {}
    names = ["scorch_mark", "oil_stain", "rust_patch", "tire_track", "warning_stripe", "shallow_crater", "metal_seam", "cable_run"]
    for name in names:
        image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        if name == "scorch_mark":
            draw.ellipse((10, 19, 55, 49), fill=(16, 13, 12, 175))
            draw.ellipse((18, 23, 49, 44), fill=(37, 23, 19, 210))
            for x, y in [(8, 30), (54, 24), (48, 51), (20, 50), (31, 17)]:
                draw.rectangle((x, y, x + 3, y + 2), fill=(22, 15, 13, 180))
        elif name == "oil_stain":
            draw.polygon([(9, 31), (17, 19), (31, 16), (41, 22), (55, 25), (51, 42), (38, 48), (22, 45), (12, 51)], fill=(10, 13, 15, 190))
            draw.rectangle((21, 23, 29, 27), fill=(49, 57, 54, 120))
            draw.rectangle((42, 31, 47, 34), fill=(49, 57, 54, 110))
        elif name == "rust_patch":
            draw.polygon([(10, 29), (18, 18), (32, 20), (39, 13), (54, 23), (50, 37), (57, 45), (38, 50), (29, 44), (14, 47)], fill=(115, 54, 34, 190))
            for x, y in [(18, 24), (35, 25), (45, 37), (26, 39)]:
                draw.rectangle((x, y, x + 4, y + 3), fill=(185, 101, 62, 185))
        elif name == "tire_track":
            for offset in (18, 38):
                for i in range(-2, 8):
                    y = i * 8
                    x = offset + i * 3
                    draw.rectangle((x, y, x + 5, y + 3), fill=(22, 19, 18, 180))
        elif name == "warning_stripe":
            draw.rectangle((4, 25, 59, 40), fill=(28, 25, 22, 230))
            for x in range(-12, 72, 18):
                draw.polygon([(x, 25), (x + 8, 25), (x + 21, 40), (x + 13, 40)], fill=(218, 111, 45, 235))
        elif name == "shallow_crater":
            draw.ellipse((7, 15, 57, 50), fill=(31, 23, 21, 165))
            draw.ellipse((12, 18, 52, 46), outline=(101, 55, 39, 220), width=3)
            draw.arc((17, 22, 48, 42), 180, 340, fill=(150, 84, 52, 210), width=2)
        elif name == "metal_seam":
            draw.line((0, 48, 64, 17), fill=(18, 17, 17, 220), width=5)
            draw.line((0, 44, 64, 13), fill=(103, 61, 44, 230), width=2)
            for i in range(8, 64, 15):
                y = 46 - i // 2
                draw.rectangle((i, y, i + 2, y + 2), fill=(192, 111, 64, 235))
        elif name == "cable_run":
            points = [(0, 45), (14, 44), (18, 33), (33, 31), (40, 20), (64, 18)]
            draw.line(points, fill=(10, 11, 12, 240), width=6, joint="curve")
            draw.line(points, fill=(95, 55, 43, 245), width=2, joint="curve")
            for x, y in [(16, 39), (37, 26), (52, 19)]:
                draw.rectangle((x - 2, y - 2, x + 3, y + 3), outline=(32, 29, 27, 245), width=2)
        # Ground decals use hard alpha so nearest-neighbor scaling cannot create soft seams.
        alpha = image.getchannel("A").point(lambda value: 255 if value else 0)
        image.putalpha(alpha)
        image = scrub_transparent_rgb(image)
        image.save(PROPS_DIR / "decals" / f"{name}.png")
        result[name] = image
    return result


def build_icon_atlas(master: Image.Image) -> dict[str, Image.Image]:
    ids = [
        "health", "xp", "timer", "cargo", "credits", "mission", "anomaly", "level",
        "reroll", "lock", "success", "failure", "dispatch", "crew", "ship", "back",
        "confirm", "mission_nest", "mission_beacon", "mission_drill", "low_gravity", "meteor", "spore_bloom", "energy_tide",
        "scanner", "fabricator", "cargo_hold", "life_support", "printer", "planet_rust", "planet_spore", "company_logo",
    ]
    categories = ["status"] * 12 + ["navigation"] * 5 + ["mission"] * 3 + ["anomaly"] * 4 + ["module"] * 5 + ["planet"] * 2 + ["brand"]
    icon_dir = ensure(UI_DIR / "icons")
    atlas = Image.new("RGBA", (256, 128), (0, 0, 0, 0))
    built: dict[str, Image.Image] = {}
    frames: dict[str, dict] = {}
    for index, (asset_id, category) in enumerate(zip(ids, categories)):
        col = index % 8
        row = index // 8
        x0 = round(col * master.width / 8)
        x1 = round((col + 1) * master.width / 8)
        y0 = round(row * master.height / 4)
        y1 = round((row + 1) * master.height / 4)
        source = extract_subject(master, (x0, y0, x1, y1))
        icon = fit_sprite(source, (32, 32), (28, 28), (16, 30))
        icon.save(icon_dir / f"{asset_id}.png")
        atlas.alpha_composite(icon, (col * 32, row * 32))
        built[asset_id] = icon
        frames[asset_id] = {"x": col * 32, "y": row * 32, "width": 32, "height": 32, "category": category, "image": f"icons/{asset_id}.png"}
    atlas.save(UI_DIR / "ui_icons_atlas.png")
    write_json(UI_DIR / "ui_icons_atlas.json", {
        "image": "ui_icons_atlas.png",
        "frameWidth": 32,
        "frameHeight": 32,
        "columns": 8,
        "rows": 4,
        "icons": frames,
        "imageSmoothingEnabled": False,
    })
    return built


def cut_corner_polygon(width: int, height: int, cut: int) -> list[tuple[int, int]]:
    return [(cut, 0), (width - cut - 1, 0), (width - 1, cut), (width - 1, height - cut - 1), (width - cut - 1, height - 1), (cut, height - 1), (0, height - cut - 1), (0, cut)]


def make_panel(accent: tuple[int, int, int, int], inner: tuple[int, int, int, int], variant: str) -> Image.Image:
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(cut_corner_polygon(64, 64, 8), fill=PALETTE["ink"])
    draw.polygon([(9, 2), (54, 2), (61, 9), (61, 54), (54, 61), (9, 61), (2, 54), (2, 9)], fill=PALETTE["frame"])
    draw.polygon([(10, 5), (53, 5), (58, 10), (58, 53), (53, 58), (10, 58), (5, 53), (5, 10)], fill=PALETTE["deep"])
    draw.rectangle((10, 10, 53, 53), fill=inner)
    draw.line((10, 9, 53, 9), fill=PALETTE["paper"], width=1)
    draw.line((9, 10, 9, 53), fill=(115, 113, 96, 255), width=1)
    draw.line((10, 54, 53, 54), fill=(4, 7, 8, 255), width=2)
    draw.rectangle((13, 6, 26, 7), fill=accent)
    draw.rectangle((38, 56, 51, 57), fill=accent)
    for x, y in [(7, 7), (56, 7), (7, 56), (56, 56)]:
        draw.rectangle((x, y, x + 1, y + 1), fill=PALETTE["gold"] if variant == "result" else accent)
    if variant == "inset":
        draw.rectangle((13, 13, 50, 50), outline=(5, 9, 10, 255), width=2)
    elif variant == "upgrade":
        draw.line((12, 48, 51, 48), fill=accent, width=2)
    elif variant == "result":
        draw.rectangle((12, 12, 51, 15), fill=(47, 35, 26, 255))
    return image


def make_button(theme: str, state: str) -> Image.Image:
    colors = {
        "primary": (PALETTE["acid"], (37, 49, 24, 255), PALETTE["ink"]),
        "secondary": (PALETTE["cyan"], (21, 45, 47, 255), PALETTE["paper"]),
        "danger": (PALETTE["danger"], (60, 22, 29, 255), PALETTE["paper"]),
        "locked": (PALETTE["muted"], (33, 35, 34, 255), PALETTE["muted"]),
    }
    accent, fill, _ = colors[theme]
    if state == "pressed":
        fill = tuple(max(0, c - 14) for c in fill[:3]) + (255,)
        accent = tuple(max(0, c - 35) for c in accent[:3]) + (255,)
    if state == "disabled":
        fill = (31, 34, 33, 255)
        accent = (79, 80, 74, 255)
    image = Image.new("RGBA", (96, 48), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.polygon(cut_corner_polygon(96, 48, 7), fill=PALETTE["ink"])
    draw.polygon([(8, 2), (87, 2), (93, 8), (93, 39), (86, 46), (8, 46), (2, 40), (2, 8)], fill=accent)
    y_shift = 2 if state == "pressed" else 0
    draw.polygon([(9, 6 + y_shift), (86, 6 + y_shift), (89, 9 + y_shift), (89, 37 + y_shift), (84, 42 + y_shift), (11, 42 + y_shift), (6, 37 + y_shift), (6, 10 + y_shift)], fill=fill)
    draw.rectangle((13, 7 + y_shift, 45, 8 + y_shift), fill=tuple(min(255, c + 45) for c in accent[:3]) + (255,))
    draw.rectangle((74, 39 + y_shift, 84, 40 + y_shift), fill=accent)
    draw.rectangle((5, 17 + y_shift, 7, 29 + y_shift), fill=accent)
    return image


def make_progress_fill(color: tuple[int, int, int, int]) -> Image.Image:
    image = Image.new("RGBA", (128, 8), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 1, 127, 6), fill=tuple(max(0, c - 42) for c in color[:3]) + (255,))
    for x in range(0, 128, 8):
        draw.rectangle((x, 1, min(127, x + 5), 4), fill=color)
        draw.line((x + 1, 1, min(127, x + 4), 1), fill=tuple(min(255, c + 45) for c in color[:3]) + (255,))
    return image


def build_ui_components(icons: dict[str, Image.Image]) -> dict[str, Image.Image]:
    ensure(UI_DIR / "panels")
    ensure(UI_DIR / "buttons")
    ensure(UI_DIR / "controls")
    ensure(UI_DIR / "bars")
    panels = {
        "panel_standard": make_panel(PALETTE["cyan"], PALETTE["panel"], "standard"),
        "panel_inset": make_panel(PALETTE["muted"], (13, 19, 20, 255), "inset"),
        "panel_upgrade": make_panel(PALETTE["acid"], (18, 25, 23, 255), "upgrade"),
        "panel_result": make_panel(PALETTE["orange"], (27, 23, 20, 255), "result"),
    }
    components: dict[str, Image.Image] = {}
    panel_meta: dict[str, dict] = {}
    for asset_id, image in panels.items():
        image.save(UI_DIR / "panels" / f"{asset_id}.png")
        components[asset_id] = image
        panel_meta[asset_id] = {"image": f"panels/{asset_id}.png", "width": 64, "height": 64, "sliceInsets": {"left": 12, "top": 12, "right": 12, "bottom": 12}}
    button_meta: dict[str, dict] = {}
    for theme in ["primary", "secondary", "danger", "locked"]:
        states: dict[str, str] = {}
        for state in ["normal", "pressed", "disabled"]:
            image = make_button(theme, state)
            name = f"button_{theme}_{state}"
            image.save(UI_DIR / "buttons" / f"{name}.png")
            components[name] = image
            states[state] = f"buttons/{name}.png"
        button_meta[theme] = {"states": states, "width": 96, "height": 48, "sliceInsets": {"left": 12, "top": 12, "right": 12, "bottom": 12}}
    accents: dict[str, str] = {}
    for name, color in [("cyan", PALETTE["cyan"]), ("acid", PALETTE["acid"]), ("orange", PALETTE["orange"]), ("danger", PALETTE["danger"])]:
        image = Image.new("RGBA", (16, 16), PALETTE["deep"])
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 5, 15, 10), fill=tuple(max(0, c - 60) for c in color[:3]) + (255,))
        draw.rectangle((0, 6, 11, 8), fill=color)
        draw.rectangle((13, 7, 15, 9), fill=color)
        image.save(UI_DIR / "panels" / f"accent_{name}.png")
        accents[name] = f"panels/accent_{name}.png"
    slot = Image.new("RGBA", (72, 88), (0, 0, 0, 0))
    d = ImageDraw.Draw(slot)
    d.polygon(cut_corner_polygon(72, 88, 8), fill=PALETTE["ink"])
    d.polygon([(9, 2), (62, 2), (69, 9), (69, 78), (61, 85), (10, 85), (2, 77), (2, 9)], fill=PALETTE["frame"])
    d.rectangle((8, 9, 63, 77), fill=PALETTE["panel"])
    d.rectangle((12, 13, 59, 59), outline=PALETTE["cyan"], width=2)
    d.rectangle((13, 66, 49, 68), fill=PALETTE["acid"])
    slot.save(UI_DIR / "panels" / "icon_slot.png")
    components["icon_slot"] = slot
    frame = Image.new("RGBA", (128, 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(frame)
    d.rectangle((0, 1, 127, 10), fill=PALETTE["ink"])
    d.rectangle((2, 3, 125, 8), fill=(29, 36, 36, 255))
    d.rectangle((2, 2, 125, 2), fill=PALETTE["frame"])
    frame.save(UI_DIR / "bars" / "progress_frame.png")
    fills = {}
    for name, color in [("health", PALETTE["danger"]), ("xp", PALETTE["acid"]), ("mission", PALETTE["orange"]), ("extraction", PALETTE["cyan"])]:
        fill = make_progress_fill(color)
        fill.save(UI_DIR / "bars" / f"progress_{name}.png")
        fills[name] = f"bars/progress_{name}.png"
        components[f"progress_{name}"] = fill
    base = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.ellipse((3, 3, 92, 92), fill=(5, 8, 9, 195), outline=PALETTE["ink"], width=4)
    d.ellipse((10, 10, 85, 85), outline=PALETTE["frame"], width=3)
    d.ellipse((22, 22, 73, 73), outline=(73, 78, 72, 210), width=2)
    for x, y in [(46, 10), (46, 80), (10, 46), (80, 46)]:
        d.rectangle((x, y, x + 4, y + 4), fill=PALETTE["paper"])
    base.save(UI_DIR / "controls" / "joystick_base.png")
    knob = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(knob)
    d.ellipse((2, 2, 37, 37), fill=PALETTE["ink"], outline=PALETTE["paper"], width=2)
    d.ellipse((8, 8, 31, 31), fill=(77, 72, 62, 255), outline=PALETTE["frame"], width=2)
    knob.save(UI_DIR / "controls" / "joystick_knob.png")
    components["joystick_base"] = base
    components["joystick_knob"] = knob
    right = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(right)
    d.polygon([(3, 8), (12, 8), (12, 4), (21, 12), (12, 20), (12, 16), (3, 16)], fill=PALETTE["ink"])
    d.polygon([(5, 10), (14, 10), (14, 8), (19, 12), (14, 16), (14, 14), (5, 14)], fill=PALETTE["orange"])
    direction_names = ["right", "down_right", "down", "down_left", "left", "up_left", "up", "up_right"]
    arrow_sheet = Image.new("RGBA", (192, 24), (0, 0, 0, 0))
    arrow_frames: dict[str, int] = {}
    for index, name in enumerate(direction_names):
        arrow = right.rotate(-45 * index, resample=Image.Resampling.NEAREST, expand=False)
        arrow = scrub_transparent_rgb(arrow)
        arrow.save(UI_DIR / "controls" / f"objective_arrow_{name}.png")
        arrow_sheet.alpha_composite(arrow, (index * 24, 0))
        arrow_frames[name] = index
    arrow_sheet.save(UI_DIR / "controls" / "objective_arrow_8dir.png")
    cache_marker = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    mini = icons["cargo"].resize((20, 20), Image.Resampling.NEAREST)
    cache_marker.alpha_composite(mini, (2, 2))
    cache_marker = add_pixels(cache_marker, [(19, 2), (21, 4)], PALETTE["orange"], 2)
    cache_marker.save(UI_DIR / "controls" / "cache_marker.png")
    write_json(UI_DIR / "ui_components.json", {
        "panels": panel_meta,
        "buttons": button_meta,
        "accentStrips": accents,
        "iconSlot": {"image": "panels/icon_slot.png", "width": 72, "height": 88, "sliceInsets": {"left": 10, "top": 10, "right": 10, "bottom": 10}},
        "progress": {"frame": "bars/progress_frame.png", "fills": fills, "frameSize": [128, 12], "fillSize": [128, 8]},
        "joystick": {"base": "controls/joystick_base.png", "knob": "controls/joystick_knob.png", "baseSize": [96, 96], "knobSize": [40, 40]},
        "objectiveArrow": {"image": "controls/objective_arrow_8dir.png", "frameWidth": 24, "frameHeight": 24, "anchor": {"x": 12, "y": 12}, "frames": arrow_frames},
        "cacheMarker": {"image": "controls/cache_marker.png", "width": 24, "height": 24},
        "imageSmoothingEnabled": False,
    })
    return components


def nine_slice(source: Image.Image, size: tuple[int, int], inset: int = 12) -> Image.Image:
    sw, sh = source.size
    tw, th = size
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    regions = [
        ((0, 0, inset, inset), (0, 0, inset, inset)),
        ((inset, 0, sw - inset, inset), (inset, 0, tw - inset, inset)),
        ((sw - inset, 0, sw, inset), (tw - inset, 0, tw, inset)),
        ((0, inset, inset, sh - inset), (0, inset, inset, th - inset)),
        ((inset, inset, sw - inset, sh - inset), (inset, inset, tw - inset, th - inset)),
        ((sw - inset, inset, sw, sh - inset), (tw - inset, inset, tw, th - inset)),
        ((0, sh - inset, inset, sh), (0, th - inset, inset, th)),
        ((inset, sh - inset, sw - inset, sh), (inset, th - inset, tw - inset, th)),
        ((sw - inset, sh - inset, sw, sh), (tw - inset, th - inset, tw, th)),
    ]
    for src_box, dst_box in regions:
        tile = source.crop(src_box)
        dw = max(1, dst_box[2] - dst_box[0])
        dh = max(1, dst_box[3] - dst_box[1])
        tile = tile.resize((dw, dh), Image.Resampling.NEAREST)
        out.alpha_composite(tile, (dst_box[0], dst_box[1]))
    return out


def copy_font_package() -> Path:
    ensure(FONT_DIR)
    ttf_target = FONT_DIR / "fusion-pixel-12px-proportional-zh_hans.ttf"
    woff_target = FONT_DIR / "fusion-pixel-12px-proportional-zh_hans.woff2"
    shutil.copy2(FONT_TTF_SOURCE, ttf_target)
    shutil.copy2(FONT_WOFF2_SOURCE, woff_target)
    shutil.copy2(FONT_LICENSE_SOURCE, FONT_DIR / "OFL-1.1.txt")
    return ttf_target


def draw_pixel_text(image: Image.Image, position: tuple[int, int], text: str, font: ImageFont.FreeTypeFont, fill: tuple[int, int, int, int], anchor: str = "la") -> None:
    bbox = font.getbbox(text)
    width = max(1, bbox[2] - bbox[0] + 4)
    height = max(1, bbox[3] - bbox[1] + 4)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.text((2 - bbox[0], 2 - bbox[1]), text, font=font, fill=255)
    mask = mask.point(lambda value: 255 if value >= 100 else 0)
    colored = Image.new("RGBA", mask.size, fill)
    colored.putalpha(mask)
    x, y = position
    if "m" in anchor:
        x -= width // 2
    elif "r" in anchor:
        x -= width
    if anchor.startswith("m"):
        y -= height // 2
    image.alpha_composite(colored, (int(x), int(y)))


def paste_center(canvas: Image.Image, sprite: Image.Image, center: tuple[int, int], scale: int = 1) -> None:
    if scale != 1:
        sprite = sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST)
    canvas.alpha_composite(sprite, (center[0] - sprite.width // 2, center[1] - sprite.height // 2))


def build_previews(facilities: dict[str, list[Image.Image]], pickups: dict[str, list[Image.Image]], props: dict[str, Image.Image], icons: dict[str, Image.Image], ui: dict[str, Image.Image], font_path: Path) -> None:
    preview_dir = ensure(UI_DIR / "previews")
    font12 = ImageFont.truetype(str(font_path), 12)
    font24 = ImageFont.truetype(str(font_path), 24)
    ground = Image.open(RUST_GROUND).convert("RGBA")
    mia = Image.open(MIA_SHEET).convert("RGBA").crop((0, 0, 64, 64))

    scale_preview = Image.new("RGBA", (720, 960), (0, 0, 0, 255))
    for y in range(0, 960, 512):
        for x in range(0, 720, 512):
            scale_preview.alpha_composite(ground, (x, y))
    overlay = Image.new("RGBA", scale_preview.size, (4, 7, 8, 80))
    scale_preview.alpha_composite(overlay)
    items = ["rust_nest", "company_beacon", "mining_drill", "reward_cache", "extraction_terminal", "extraction_field"]
    positions = [(120, 180), (360, 170), (595, 180), (120, 430), (360, 430), (575, 430)]
    for item, position in zip(items, positions):
        paste_center(scale_preview, facilities[item][0], position, 2)
        draw_pixel_text(scale_preview, (position[0], position[1] + 80), item.upper(), font12, PALETTE["paper"], "ma")
    paste_center(scale_preview, mia, (360, 690), 2)
    for index, frames in enumerate(pickups.values()):
        paste_center(scale_preview, frames[0], (245 + index * 75, 805), 2)
    draw_pixel_text(scale_preview, (360, 60), "RUST OBJECTS / ACTUAL SCALE CHECK", font24, PALETTE["paper"], "ma")
    ensure(OBJECTS_DIR / "previews")
    scale_preview.save(OBJECTS_DIR / "previews" / "rust_objects_scale_preview.png")

    prop_preview = Image.new("RGBA", (720, 960), (0, 0, 0, 255))
    for y in range(0, 960, 512):
        for x in range(0, 720, 512):
            prop_preview.alpha_composite(ground, (x, y))
    object_ids = [key for key in props if key not in {"scorch_mark", "oil_stain", "rust_patch", "tire_track", "warning_stripe", "shallow_crater", "metal_seam", "cable_run"}]
    for index, item in enumerate(object_ids):
        col, row = index % 4, index // 4
        center = (90 + col * 180, 130 + row * 190)
        paste_center(prop_preview, props[item], center, 2 if props[item].width <= 64 else 1)
        draw_pixel_text(prop_preview, (center[0], center[1] + 72), item.upper(), font12, PALETTE["paper"], "ma")
    prop_preview.save(PROPS_DIR / "rust_props_preview.png")

    hq = Image.new("RGBA", (360, 640), (5, 10, 11, 255))
    d = ImageDraw.Draw(hq)
    for x in range(12, 360, 32):
        d.line((x, 0, x, 640), fill=(15, 27, 27, 255), width=1)
    for y in range(20, 640, 28):
        d.line((0, y, 360, y), fill=(13, 23, 23, 255), width=1)
    hq.alpha_composite(nine_slice(ui["panel_standard"], (340, 74)), (10, 10))
    paste_center(hq, icons["company_logo"], (38, 46), 1)
    draw_pixel_text(hq, (62, 27), "泛星际资产再利用公司", font24, PALETTE["paper"])
    draw_pixel_text(hq, (62, 58), "外勤调度终端", font12, PALETTE["acid"])
    hq.alpha_composite(nine_slice(ui["panel_inset"], (316, 312)), (22, 104))
    paste_center(hq, mia, (180, 240), 3)
    hq.alpha_composite(nine_slice(ui["panel_upgrade"], (150, 78)), (24, 430))
    hq.alpha_composite(nine_slice(ui["panel_standard"], (150, 78)), (186, 430))
    paste_center(hq, icons["crew"], (50, 468))
    paste_center(hq, icons["ship"], (212, 468))
    draw_pixel_text(hq, (72, 454), "员工档案", font12, PALETTE["paper"])
    draw_pixel_text(hq, (234, 454), "飞船模块", font12, PALETTE["paper"])
    button = nine_slice(ui["button_primary_normal"], (310, 58))
    hq.alpha_composite(button, (25, 530))
    paste_center(hq, icons["dispatch"], (58, 558))
    draw_pixel_text(hq, (180, 548), "接受随机派遣", font24, PALETTE["ink"], "ma")
    draw_pixel_text(hq, (180, 610), "打印体损失将计入个人季度绩效", font12, PALETTE["orange"], "ma")

    hud = Image.new("RGBA", (360, 640), (0, 0, 0, 255))
    for y in range(0, 640, 512):
        for x in range(0, 360, 512):
            hud.alpha_composite(ground, (x, y))
    hud.alpha_composite(nine_slice(ui["panel_standard"], (174, 80)), (8, 8))
    hud.alpha_composite(ui["progress_health"].crop((0, 0, 104, 8)), (55, 26))
    hud.alpha_composite(ui["progress_xp"].crop((0, 0, 82, 8)), (55, 51))
    paste_center(hud, icons["health"], (29, 28))
    paste_center(hud, icons["xp"], (29, 56))
    draw_pixel_text(hud, (190, 15), "06:42", font24, PALETTE["paper"])
    draw_pixel_text(hud, (190, 51), "摧毁巢穴 2/3", font12, PALETTE["orange"])
    paste_center(hud, facilities["rust_nest"][2], (250, 205), 2)
    paste_center(hud, facilities["reward_cache"][2], (75, 335), 1)
    paste_center(hud, mia, (182, 405), 2)
    enemy = Image.open(GAME / "enemies" / "rust" / "scrap_mite" / "front.png").convert("RGBA")
    for pos in [(80, 220), (285, 365), (112, 470), (270, 500)]:
        paste_center(hud, enemy, pos)
    for index, frames in enumerate(pickups.values()):
        paste_center(hud, frames[index % 4], (125 + index * 30, 315))
    hud.alpha_composite(ui["joystick_base"], (16, 518))
    hud.alpha_composite(ui["joystick_knob"], (44, 546))
    arrow = Image.open(UI_DIR / "controls" / "objective_arrow_up_right.png").convert("RGBA").resize((48, 48), Image.Resampling.NEAREST)
    hud.alpha_composite(arrow, (292, 100))
    draw_pixel_text(hud, (180, 620), "警告：磁暴浓度 87%", font12, PALETTE["orange"], "ma")

    upgrade = Image.new("RGBA", (360, 640), (7, 11, 12, 255))
    d = ImageDraw.Draw(upgrade)
    d.rectangle((0, 0, 359, 639), fill=(6, 10, 11, 255))
    draw_pixel_text(upgrade, (24, 24), "LEVEL UP // 绩效提升", font24, PALETTE["paper"])
    draw_pixel_text(upgrade, (25, 58), "LV.7  选择一项职业升级", font12, PALETTE["acid"])
    card_ids = ["burst", "railgun", "explosive"]
    skill_names = ["三点连发", "轨道枪", "爆裂弹"]
    for index, (skill_id, skill_name) in enumerate(zip(card_ids, skill_names)):
        y = 92 + index * 142
        card = nine_slice(ui["panel_upgrade"], (324, 128))
        upgrade.alpha_composite(card, (18, y))
        skill_icon = Image.open(GAME / "skills" / "gunner" / "icons" / f"{skill_id}.png").convert("RGBA")
        paste_center(upgrade, skill_icon, (67, y + 54))
        draw_pixel_text(upgrade, (112, y + 26), skill_name, font24, PALETTE["paper"])
        draw_pixel_text(upgrade, (112, y + 64), "职业升级 / 自动装配", font12, PALETTE["cyan"])
        draw_pixel_text(upgrade, (112, y + 88), "当前卡片将提升至下一级", font12, PALETTE["muted"])
    reroll = nine_slice(ui["button_secondary_normal"], (216, 44))
    upgrade.alpha_composite(reroll, (72, 548))
    paste_center(upgrade, icons["reroll"], (96, 570))
    draw_pixel_text(upgrade, (130, 560), "重新打印选项 × 2", font12, PALETTE["paper"])

    for name, image in [("hq_preview", hq), ("hud_preview", hud), ("upgrade_preview", upgrade)]:
        image.save(preview_dir / f"{name}.png")
        image.resize((720, 1280), Image.Resampling.NEAREST).save(preview_dir / f"{name}_2x.png")

    test = checkerboard((720, 520), 12)
    draw_pixel_text(test, (24, 20), "NINE-SLICE STRETCH TEST", font24, PALETTE["paper"])
    tests = [((96, 40), "96x40"), ((180, 80), "180x80"), ((340, 154), "340x154")]
    y = 70
    for size, label in tests:
        rendered = nine_slice(ui["panel_standard"], size)
        test.alpha_composite(rendered, (24, y))
        draw_pixel_text(test, (390, y + 8), label, font12, PALETTE["acid"])
        y += size[1] + 38
    test.save(preview_dir / "nine_slice_test.png")


def ttf_has_codepoint(path: Path, codepoint: int) -> bool:
    data = path.read_bytes()
    if data[:4] not in (b"\x00\x01\x00\x00", b"true", b"typ1"):
        return False
    num_tables = struct.unpack_from(">H", data, 4)[0]
    cmap_offset = None
    for index in range(num_tables):
        offset = 12 + index * 16
        tag, _, table_offset, _ = struct.unpack_from(">4sIII", data, offset)
        if tag == b"cmap":
            cmap_offset = table_offset
            break
    if cmap_offset is None:
        return False
    _, num_subtables = struct.unpack_from(">HH", data, cmap_offset)
    subtables = []
    for index in range(num_subtables):
        platform_id, encoding_id, relative = struct.unpack_from(">HHI", data, cmap_offset + 4 + index * 8)
        table = cmap_offset + relative
        fmt = struct.unpack_from(">H", data, table)[0]
        if platform_id == 0 or (platform_id == 3 and encoding_id in (1, 10)):
            subtables.append((fmt, table))
    for fmt, table in subtables:
        if fmt == 4 and codepoint <= 0xFFFF:
            seg_count = struct.unpack_from(">H", data, table + 6)[0] // 2
            end_start = table + 14
            start_start = end_start + seg_count * 2 + 2
            delta_start = start_start + seg_count * 2
            range_start = delta_start + seg_count * 2
            for i in range(seg_count):
                end_code = struct.unpack_from(">H", data, end_start + i * 2)[0]
                start_code = struct.unpack_from(">H", data, start_start + i * 2)[0]
                if start_code <= codepoint <= end_code:
                    delta = struct.unpack_from(">h", data, delta_start + i * 2)[0]
                    range_offset = struct.unpack_from(">H", data, range_start + i * 2)[0]
                    if range_offset == 0:
                        return ((codepoint + delta) & 0xFFFF) != 0
                    glyph_addr = range_start + i * 2 + range_offset + 2 * (codepoint - start_code)
                    if glyph_addr + 2 > len(data):
                        return False
                    glyph = struct.unpack_from(">H", data, glyph_addr)[0]
                    return glyph != 0 and ((glyph + delta) & 0xFFFF) != 0
        elif fmt == 12:
            groups = struct.unpack_from(">I", data, table + 12)[0]
            for i in range(groups):
                start_char, end_char, start_glyph = struct.unpack_from(">III", data, table + 16 + i * 12)
                if start_char <= codepoint <= end_char:
                    return start_glyph + codepoint - start_char != 0
    return False


def build_font_manifest(ttf_path: Path) -> dict:
    source_text = (ROOT / "src" / "data.js").read_text(encoding="utf-8") + (ROOT / "src" / "game-core.js").read_text(encoding="utf-8")
    required = sorted({ord(char) for char in source_text if ord(char) >= 0x80 and not char.isspace()})
    missing = [cp for cp in required if not ttf_has_codepoint(ttf_path, cp)]
    missing_cjk = [cp for cp in missing if "CJK" in unicodedata.name(chr(cp), "") or 0x3400 <= cp <= 0x9FFF]
    icon_replacements = {
        "×": "ui/icons/failure.png",
        "◇": "ui/icons/mission_beacon.png",
        "▣": "ui/icons/mission_drill.png",
        "⌁": "ui/icons/scanner.png",
        "⌘": "ui/icons/fabricator.png",
        "▤": "ui/icons/cargo_hold.png",
        "◎": "ui/icons/printer.png",
        "¤": "ui/icons/credits.png",
        "⚡": "ui/icons/energy_tide.png",
        "▼": "ui/controls/objective_arrow_down.png",
        "^": "ui/controls/objective_arrow_up.png",
    }
    manifest = {
        "family": "Fusion Pixel Font",
        "variant": "12px proportional zh_hans",
        "release": "2026.07.20",
        "source": "https://github.com/TakWolf/fusion-pixel-font",
        "license": "SIL Open Font License 1.1",
        "files": {
            ttf_path.name: {"sha256": sha256(ttf_path), "bytes": ttf_path.stat().st_size},
            "fusion-pixel-12px-proportional-zh_hans.woff2": {"sha256": sha256(FONT_DIR / "fusion-pixel-12px-proportional-zh_hans.woff2"), "bytes": (FONT_DIR / "fusion-pixel-12px-proportional-zh_hans.woff2").stat().st_size},
        },
        "sourceArchives": {
            "fusion-pixel-font-12px-proportional-ttf-v2026.07.20.zip": "a6b32fe3e663bc3575dc8a71e1f5f1c17b5951558b0fba9e5e75a33afc2ab2da",
            "fusion-pixel-font-12px-proportional-ttf.woff2-v2026.07.20.zip": "9151c602b6ea3fcd8fe575426414cfdab2a27a8b2f0585191759dbc72aa12b4b",
        },
        "coverage": {
            "requiredNonAsciiCodepoints": len(required),
            "missingCodepoints": [f"U+{cp:04X} {chr(cp)} {unicodedata.name(chr(cp), 'UNKNOWN')}" for cp in missing],
            "missingCjkCodepoints": [f"U+{cp:04X} {chr(cp)}" for cp in missing_cjk],
            "currentChineseTextCovered": not missing_cjk,
        },
        "iconReplacements": icon_replacements,
        "recommendedNativeSize": 12,
        "recommendedIntegerSizes": [12, 24, 36],
    }
    write_json(FONT_DIR / "font_manifest.json", manifest)
    return manifest


def validate_png(path: Path, expected: tuple[int, int] | None = None, allow_partial: bool = False, margin_required: bool = True) -> list[str]:
    failures: list[str] = []
    image = Image.open(path)
    if image.mode != "RGBA":
        failures.append(f"{path}: mode {image.mode}, expected RGBA")
        image = image.convert("RGBA")
    if expected and image.size != expected:
        failures.append(f"{path}: size {image.size}, expected {expected}")
    alpha = list(image.getchannel("A").getdata())
    if min(alpha) != 0:
        failures.append(f"{path}: missing fully transparent pixels")
    if not allow_partial and max(alpha) != 255:
        failures.append(f"{path}: missing fully opaque pixels")
    if allow_partial and max(alpha) == 0:
        failures.append(f"{path}: translucent asset is empty")
    partial = sum(1 for value in alpha if value not in (0, 255))
    if partial and not allow_partial:
        failures.append(f"{path}: unexpected partial alpha pixels {partial}")
    if allow_partial and partial == 0:
        failures.append(f"{path}: expected partial alpha pixels")
    if margin_required:
        edge = []
        edge.extend(image.getpixel((x, 0))[3] for x in range(image.width))
        edge.extend(image.getpixel((x, image.height - 1))[3] for x in range(image.width))
        edge.extend(image.getpixel((0, y))[3] for y in range(image.height))
        edge.extend(image.getpixel((image.width - 1, y))[3] for y in range(image.height))
        if any(edge):
            failures.append(f"{path}: opaque pixels touch canvas edge")
    residue = 0
    for r, g, b, a in image.getdata():
        if a and r > 28 and b > 28 and r > g * 1.28 and b > g * 1.28 and abs(r - b) < 105:
            residue += 1
    if residue:
        failures.append(f"{path}: magenta residue pixels {residue}")
    return failures


def validate_outputs(facilities: dict[str, list[Image.Image]], pickups: dict[str, list[Image.Image]], props: dict[str, Image.Image], icons: dict[str, Image.Image], font_manifest: dict) -> dict:
    failures: list[str] = []
    checked = 0
    facility_sizes = {"rust_nest": (64, 64), "company_beacon": (64, 64), "mining_drill": (96, 96), "reward_cache": (64, 64), "extraction_terminal": (64, 64), "extraction_field": (128, 64)}
    for asset_id, frames in facilities.items():
        folder = OBJECTS_DIR / asset_id
        meta = json.loads((folder / f"{asset_id}.json").read_text(encoding="utf-8"))
        if meta["frameCount"] != len(frames):
            failures.append(f"{asset_id}: metadata frameCount mismatch")
        for name in meta["frames"]:
            checked += 1
            failures += validate_png(folder / name, facility_sizes[asset_id], allow_partial=asset_id == "extraction_field")
        sheet = Image.open(folder / f"{asset_id}.png")
        expected_sheet = (facility_sizes[asset_id][0] * len(frames), facility_sizes[asset_id][1])
        if sheet.size != expected_sheet:
            failures.append(f"{asset_id}: sheet size {sheet.size}, expected {expected_sheet}")
    for asset_id in pickups:
        folder = PICKUPS_DIR / asset_id
        for index in range(4):
            checked += 1
            failures += validate_png(folder / f"frame_{index:02d}.png", (24, 24))
        if Image.open(folder / f"{asset_id}.png").size != (96, 24):
            failures.append(f"{asset_id}: invalid sheet size")
    for asset_id, image in props.items():
        path = PROPS_DIR / ("decals" if image.size == (64, 64) and asset_id in {"scorch_mark", "oil_stain", "rust_patch", "tire_track", "warning_stripe", "shallow_crater", "metal_seam", "cable_run"} else "objects") / f"{asset_id}.png"
        checked += 1
        failures += validate_png(path, image.size, allow_partial=False, margin_required=False)
    for asset_id in icons:
        checked += 1
        failures += validate_png(UI_DIR / "icons" / f"{asset_id}.png", (32, 32))
    if font_manifest["coverage"]["missingCjkCodepoints"]:
        failures.append("Fusion Pixel Font is missing current CJK codepoints")
    report = {
        "passed": not failures,
        "checkedTransparentPngs": checked,
        "facilityCount": len(facilities),
        "pickupCount": len(pickups),
        "propObjectCount": 16,
        "decalCount": 8,
        "uiIconCount": len(icons),
        "fontCjkCoveragePassed": not font_manifest["coverage"]["missingCjkCodepoints"],
        "nineSliceTestSizes": [[96, 40], [180, 80], [340, 154]],
        "failures": failures,
    }
    write_json(GAME / "p0_validation_report.json", report)
    if failures:
        raise RuntimeError("P0 validation failed:\n" + "\n".join(failures[:30]))
    return report


def main() -> None:
    for required in [RUST_MASTER, ICON_MASTER, RUST_GROUND, MIA_SHEET, FONT_TTF_SOURCE, FONT_WOFF2_SOURCE, FONT_LICENSE_SOURCE]:
        if not required.exists():
            raise FileNotFoundError(required)
    for directory in [OBJECTS_DIR, PICKUPS_DIR, PROPS_DIR, UI_DIR, FONT_DIR]:
        ensure(directory)
    rust_master = Image.open(RUST_MASTER).convert("RGBA")
    icon_master = Image.open(ICON_MASTER).convert("RGBA")
    facilities = build_facilities(rust_master)
    pickups = build_pickups(rust_master)
    props = build_props(rust_master)
    icons = build_icon_atlas(icon_master)
    ui = build_ui_components(icons)
    font_path = copy_font_package()
    font_manifest = build_font_manifest(font_path)
    build_previews(facilities, pickups, props, icons, ui, font_path)
    report = validate_outputs(facilities, pickups, props, icons, font_manifest)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
