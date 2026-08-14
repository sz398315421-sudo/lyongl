from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
GAME = ROOT.parents[2]
SOURCES = ROOT / "sources"
UI_DIR = ROOT / "ui"
CHAR_DIR = ROOT / "characters"
ENEMY_DIR = ROOT / "enemies"
MOTION_DIR = ROOT / "motion"
FONT_PATH = GAME / "assets/game/fonts/fusion_pixel_12/fusion-pixel-12px-proportional-zh_hans.ttf"

INK = "#080c0e"
PANEL = "#11191b"
PANEL_2 = "#182225"
PAPER = "#e2dbc2"
MUTED = "#8b8b7d"
CYAN = "#55dfe0"
ACID = "#d9ff57"
ORANGE = "#ff7b47"
DANGER = "#ff5550"

ROLES = {
    "mia": {
        "employee": "米娅 · 07", "class": "枪械师", "color": CYAN,
        "job": "拉开距离 · 弹道清线", "quote": "命中率低于92%的报告，我拒绝签字。",
        "stats": [("生命", 62), ("机动", 82), ("火力", 88)],
        "master": "mia_motion_master.png",
    },
    "kade": {
        "employee": "凯德 · 31", "class": "战士", "color": ORANGE,
        "job": "主动贴近 · 范围斩击", "quote": "怪物不危险，报销流程才危险。",
        "stats": [("生命", 92), ("机动", 65), ("火力", 80)],
        "master": "kade_motion_master.png",
    },
    "locke": {
        "employee": "洛克 · 88", "class": "机械师", "color": ACID,
        "job": "绕场布阵 · 机械火网", "quote": "无人机也应享有员工福利。",
        "stats": [("生命", 74), ("机动", 72), ("火力", 76)],
        "master": "locke_motion_master.png",
    },
}

ECOLOGIES = {
    "rust": {
        "name": "锈蚀荒原", "code": "RX-13", "accent": ORANGE,
        "ground": GAME / "assets/game/planets/rust_ground.png",
        "master": "rust_enemies_master.png",
        "enemies": ["废铁螨虫", "电浆观察者", "铆钉角兽", "泄压囊虫"],
        "ids": ["scrap_mite", "plasma_watcher", "rivethorn_ram", "pressure_bloater"],
    },
    "spore": {
        "name": "孢子沼泽", "code": "SP-09", "accent": "#c681ff",
        "ground": GAME / "assets/game/planets/spore_ground.png",
        "master": "spore_enemies_master.png",
        "enemies": ["菌丝爬虫", "酸液眼荚", "菌甲冲兽", "爆孢囊体"],
        "ids": ["mycelium_skitter", "acid_eye_pod", "fungal_ram", "spore_bloater"],
    },
    "moon": {
        "name": "低重力月面", "code": "LM-04", "accent": "#c5a5ff",
        "ground": GAME / "assets/game/planets/moon_ground.png",
        "master": "moon_enemies_master_v2.png", "sourceCols": 9, "extra": "moon_enemies_extra_frame.png",
        "enemies": ["静电晶虫", "棱镜哨兵", "月岩冲兽", "虚空气囊"],
        "ids": ["static_crawler", "prism_sentry", "crater_ram", "void_bloater"],
    },
}


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size=max(6, int(size)))


def text(draw: ImageDraw.ImageDraw, xy, value: str, size: int, fill=PAPER, anchor="la", stroke=0):
    draw.text(xy, value, font=font(size), fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=INK)


def panel(draw: ImageDraw.ImageDraw, box, accent=CYAN, fill=PANEL, border="#68716b"):
    x0, y0, x1, y1 = map(int, box)
    cut = 5
    points = [(x0 + cut, y0), (x1 - cut, y0), (x1, y0 + cut), (x1, y1 - cut),
              (x1 - cut, y1), (x0 + cut, y1), (x0, y1 - cut), (x0, y0 + cut)]
    draw.polygon(points, fill=fill, outline=border, width=2)
    draw.line((x0 + 8, y0 + 3, min(x1 - 8, x0 + 42), y0 + 3), fill=accent, width=2)
    draw.line((max(x0 + 8, x1 - 28), y1 - 3, x1 - 8, y1 - 3), fill=accent, width=2)


def button(draw: ImageDraw.ImageDraw, box, label: str, accent=CYAN, active=False, danger=False):
    fill = "#293814" if active else PANEL
    outline = DANGER if danger else accent
    panel(draw, box, accent=outline, fill=fill, border=outline if active else "#5e6964")
    x0, y0, x1, y1 = box
    text(draw, ((x0 + x1) // 2, (y0 + y1) // 2 + 4), label, 9 if len(label) <= 3 else 8,
         fill=INK if active else PAPER, anchor="mm")


def tile_ground(path: Path, size=(360, 640)) -> Image.Image:
    tile = Image.open(path).convert("RGB")
    canvas = Image.new("RGB", size)
    for y in range(0, size[1], tile.height):
        for x in range(0, size[0], tile.width):
            canvas.paste(tile, (x, y))
    return canvas


def chroma_alpha(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    arr = np.asarray(rgb).astype(np.int16)
    samples = np.concatenate([
        arr[:8, :8].reshape(-1, 3), arr[:8, -8:].reshape(-1, 3),
        arr[-8:, :8].reshape(-1, 3), arr[-8:, -8:].reshape(-1, 3),
    ])
    matte = np.median(samples, axis=0)
    distance = np.max(np.abs(arr - matte), axis=2)
    alpha = np.where(distance >= 38, 255, 0).astype(np.uint8)
    rgba = np.dstack([arr.clip(0, 255).astype(np.uint8), alpha])
    rgba[alpha == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def trim(image: Image.Image, pad=2) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return Image.new("RGBA", (1, 1))
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(image.width, x1 + pad), min(image.height, y1 + pad)
    return image.crop((x0, y0, x1, y1))


def cell(master: Image.Image, cols: int, rows: int, col: int, row: int) -> Image.Image:
    x0 = round(master.width * col / cols)
    x1 = round(master.width * (col + 1) / cols)
    y0 = round(master.height * row / rows)
    y1 = round(master.height * (row + 1) / rows)
    return trim(chroma_alpha(master.crop((x0, y0, x1, y1))))


def weighted_bounds(weights: np.ndarray, count: int) -> list[int]:
    centers = np.linspace(len(weights) / (count * 2), len(weights) - len(weights) / (count * 2), count)
    xs = np.arange(len(weights), dtype=np.float64)
    for _ in range(20):
        ownership = np.argmin(np.abs(xs[:, None] - centers[None, :]), axis=1)
        updated = centers.copy()
        for index in range(count):
            selected = ownership == index
            group_weight = weights[selected]
            if group_weight.sum() > 0:
                updated[index] = np.average(xs[selected], weights=group_weight)
        if np.max(np.abs(updated - centers)) < 0.1:
            break
        centers = updated
    bounds = [0]
    for index in range(count - 1):
        left = max(0, int(math.floor(centers[index])))
        right = min(len(weights), int(math.ceil(centers[index + 1])) + 1)
        segment = weights[left:right]
        if len(segment) == 0:
            bounds.append(round((centers[index] + centers[index + 1]) / 2))
            continue
        minimum = segment.min()
        candidates = np.where(segment == minimum)[0] + left
        midpoint = (centers[index] + centers[index + 1]) / 2
        bounds.append(int(candidates[np.argmin(np.abs(candidates - midpoint))]))
    bounds.append(len(weights))
    return bounds


def split_band_by_weight(band: Image.Image, count: int) -> list[Image.Image]:
    rgba = chroma_alpha(band)
    mask = np.asarray(rgba.getchannel("A")) > 0
    bounds = weighted_bounds(mask.sum(axis=0).astype(np.float64), count)
    return [trim(rgba.crop((bounds[index], 0, bounds[index + 1], band.height))) for index in range(count)]


def split_rows_by_weight(master: Image.Image, count: int) -> list[Image.Image]:
    rgba = chroma_alpha(master)
    mask = np.asarray(rgba.getchannel("A")) > 0
    bounds = weighted_bounds(mask.sum(axis=1).astype(np.float64), count)
    return [master.crop((0, bounds[index], master.width, bounds[index + 1])) for index in range(count)]


def split_character_master(master: Image.Image) -> tuple[list[Image.Image], list[Image.Image]]:
    rgba = chroma_alpha(master)
    mask = np.asarray(rgba.getchannel("A")) > 0
    row_weights = mask.sum(axis=1).astype(np.float64)
    smooth = np.convolve(row_weights, np.ones(17), mode="same")
    start = round(master.height * 0.38)
    end = round(master.height * 0.66)
    split_y = start + int(np.argmin(smooth[start:end]))
    top = master.crop((0, 0, master.width, split_y))
    bottom = master.crop((0, split_y, master.width, master.height))
    return split_band_by_weight(top, 4), split_band_by_weight(bottom, 6)


def split_enemy_master(master: Image.Image, columns: int) -> list[list[Image.Image]]:
    return [split_band_by_weight(band, columns) for band in split_rows_by_weight(master, 4)]


def fit_sprite(sprite: Image.Image, size=(64, 64), max_box=(58, 54), anchor=(32, 56)) -> Image.Image:
    scale = min(max_box[0] / sprite.width, max_box[1] / sprite.height)
    new_size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    sprite = sprite.resize(new_size, Image.Resampling.NEAREST)
    out = Image.new("RGBA", size)
    x = round(anchor[0] - sprite.width / 2)
    y = round(anchor[1] - sprite.height)
    out.alpha_composite(sprite, (x, y))
    return out


def fit_portrait(sprite: Image.Image) -> Image.Image:
    scale = min(112 / sprite.width, 116 / sprite.height)
    sprite = sprite.resize((max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))), Image.Resampling.NEAREST)
    out = Image.new("RGBA", (128, 128))
    out.alpha_composite(sprite, ((128 - sprite.width) // 2, 120 - sprite.height))
    return out


def load_character_assets():
    result = {}
    for role_id, role in ROLES.items():
        master = Image.open(SOURCES / role["master"]).convert("RGB")
        directions_raw, motion_raw = split_character_master(master)
        directions = [fit_sprite(sprite) for sprite in directions_raw]
        motion = [fit_sprite(sprite) for sprite in motion_raw]
        portrait = fit_portrait(directions_raw[0])
        portrait.save(CHAR_DIR / f"{role_id}_front.png")
        result[role_id] = {"portrait": portrait, "directions": directions, "motion": motion}
    return result


def load_enemy_assets():
    result = {}
    max_boxes = [(48, 34), (54, 43), (60, 50), (61, 56)]
    for eco_id, eco in ECOLOGIES.items():
        master = Image.open(SOURCES / eco["master"]).convert("RGB")
        raw_grid = split_enemy_master(master, eco.get("sourceCols", 10))
        extra_rows = None
        if eco.get("extra"):
            extra_master = Image.open(SOURCES / eco["extra"]).convert("RGB")
            extra_rows = [trim(chroma_alpha(band)) for band in split_rows_by_weight(extra_master, 4)]
        rows = []
        for row in range(4):
            directions = [fit_sprite(sprite, max_box=max_boxes[row]) for sprite in raw_grid[row][:4]]
            raw_motion = raw_grid[row][4:]
            if extra_rows is not None:
                raw_motion.append(extra_rows[row])
            motion = [fit_sprite(sprite, max_box=max_boxes[row]) for sprite in raw_motion[:6]]
            rows.append({"directions": directions, "motion": motion})
        result[eco_id] = rows
    return result


def save_gif(frames, path: Path, accent, duration=110):
    rendered = []
    for index, sprite in enumerate(frames):
        frame = Image.new("RGB", (256, 256), INK)
        draw = ImageDraw.Draw(frame)
        draw.rectangle((0, 0, 255, 255), fill="#0b1113")
        for x in range(0, 256, 32):
            draw.line((x, 0, x, 255), fill="#162124")
        for y in range(0, 256, 32):
            draw.line((0, y, 255, y), fill="#162124")
        draw.ellipse((55, 195, 201, 225), fill="#050708", outline=accent, width=2)
        large = sprite.resize((192, 192), Image.Resampling.NEAREST)
        frame.paste(large, (32, 25), large)
        text(draw, (128, 239), f"FRAME {index + 1}/6", 11, MUTED, anchor="mm")
        rendered.append(frame)
    rendered[0].save(path, save_all=True, append_images=rendered[1:], duration=duration, loop=0, optimize=False)


def character_board(role_id: str, role, assets):
    board = Image.new("RGB", (1024, 520), INK)
    draw = ImageDraw.Draw(board)
    panel(draw, (14, 14, 1010, 506), accent=role["color"], fill="#0d1517")
    text(draw, (42, 48), f"{role['class']}  {role['employee']}  // 动画视觉评审", 27, role["color"])
    text(draw, (42, 78), "四方向站立检查", 14, PAPER)
    labels = ["前", "右", "后", "左"]
    for index, sprite in enumerate(assets["directions"]):
        x = 74 + index * 150
        draw.rectangle((x, 100, x + 128, 245), fill="#111b1e", outline="#394b4a", width=2)
        large = sprite.resize((128, 128), Image.Resampling.NEAREST)
        board.paste(large, (x, 105), large)
        text(draw, (x + 64, 235), labels[index], 13, MUTED, anchor="mm")
    text(draw, (42, 285), "右向移动循环 // 6关键帧 // 8–10 FPS", 14, PAPER)
    for index, sprite in enumerate(assets["motion"]):
        x = 44 + index * 158
        draw.rectangle((x, 305, x + 138, 468), fill="#111b1e", outline="#394b4a", width=2)
        large = sprite.resize((128, 128), Image.Resampling.NEAREST)
        board.paste(large, (x + 5, 315), large)
        draw.line((x + 8, 432, x + 130, 432), fill=role["color"], width=2)
        text(draw, (x + 69, 455), str(index + 1), 11, MUTED, anchor="mm")
    text(draw, (985, 78), "ANCHOR (32,56)", 11, MUTED, anchor="ra")
    board.save(CHAR_DIR / f"{role_id}_motion_board.png")
    save_gif(assets["motion"], MOTION_DIR / f"character_{role_id}_walk.gif", role["color"], 111)


def enemy_board(eco_id: str, eco, rows):
    board = Image.new("RGB", (1024, 640), INK)
    ground = tile_ground(eco["ground"], (1024, 640)).convert("RGBA")
    ground.putalpha(75)
    board.paste(ground, (0, 0), ground)
    draw = ImageDraw.Draw(board)
    panel(draw, (12, 12, 1012, 628), accent=eco["accent"], fill="#0b1113cc")
    text(draw, (36, 46), f"{eco['name']}  {eco['code']}  // 敌人动画评审", 25, eco["accent"])
    text(draw, (484, 72), "前    右    后    左       移动 1–6", 12, MUTED, anchor="ma")
    roles = ["群袭", "远程", "冲锋", "膨胀"]
    for row_index, row in enumerate(rows):
        y = 96 + row_index * 130
        draw.rectangle((26, y, 998, y + 112), fill="#0b1113dd", outline="#3c4644", width=2)
        text(draw, (42, y + 31), eco["enemies"][row_index], 17, PAPER)
        text(draw, (42, y + 58), roles[row_index], 11, eco["accent"])
        sprites = row["directions"] + row["motion"]
        for col, sprite in enumerate(sprites):
            x = 215 + col * 76
            large = sprite.resize((72, 72), Image.Resampling.NEAREST)
            board.paste(large, (x, y + 12), large)
            draw.line((x + 5, y + 84, x + 67, y + 84), fill="#26302f")
        text(draw, (980, y + 103), f"64×64 / {eco['ids'][row_index]}", 9, MUTED, anchor="ra")
        duration = 100 if eco_id == "rust" else (125 if eco_id == "spore" else 140)
        save_gif(row["motion"], MOTION_DIR / f"{eco_id}_{eco['ids'][row_index]}.gif", eco["accent"], duration)
    board.save(ENEMY_DIR / f"{eco_id}_enemy_motion_board.png")


def load_icon(name: str, size=20):
    path = GAME / f"assets/game/ui/icons/{name}.png"
    if not path.exists():
        return None
    icon = Image.open(path).convert("RGBA")
    return icon.resize((size, size), Image.Resampling.NEAREST)


NAV = [
    ("员工档案", "crew"), ("活动", "timer"), ("派遣", "dispatch"),
    ("任务", "mission"), ("飞船模块", "ship")
]


def draw_nav(image: Image.Image, active: str | None):
    draw = ImageDraw.Draw(image)
    specs = [(4, 572, 68, 636), (75, 572, 127, 636), (130, 556, 202, 636), (205, 572, 257, 636), (260, 572, 356, 636)]
    for (label, icon_name), box in zip(NAV, specs):
        is_active = label == active or label == "派遣"
        accent = ACID if label == "派遣" else (CYAN if label in ("员工档案", "飞船模块") else ORANGE)
        panel(draw, box, accent=accent, fill="#263415" if label == "派遣" else "#101719", border=accent if is_active else "#56615d")
        icon = load_icon(icon_name, 18 if label != "派遣" else 23)
        if icon:
            ix = (box[0] + box[2] - icon.width) // 2
            image.alpha_composite(icon, (ix, box[1] + 7))
        text(draw, ((box[0] + box[2]) // 2, box[3] - 12), label, 7 if len(label) >= 4 else 8,
             INK if label == "派遣" else PAPER, anchor="mm")


def draw_topbar(image: Image.Image, title: str, subtitle: str = ""):
    draw = ImageDraw.Draw(image)
    panel(draw, (5, 5, 355, 51), accent=CYAN, fill="#0c1416", border="#65706a")
    logo = load_icon("company_logo", 28)
    if logo:
        image.alpha_composite(logo, (13, 12))
    text(draw, (48, 25), title, 15, PAPER, anchor="lm")
    if subtitle:
        text(draw, (48, 42), subtitle, 7, MUTED, anchor="lm")
    credits = load_icon("credits", 16)
    if credits:
        image.alpha_composite(credits, (306, 17))
    text(draw, (346, 29), "128", 11, ORANGE, anchor="rm")


def save_ui(image: Image.Image, name: str):
    logical = image.convert("RGB")
    logical.save(UI_DIR / f"{name}.png")
    logical.resize((720, 1280), Image.Resampling.NEAREST).save(UI_DIR / f"{name}_2x.png")


def home_screen(role_id: str, role, assets):
    cockpit = Image.open(SOURCES / "cockpit_master.png").convert("RGBA").resize((360, 640), Image.Resampling.NEAREST)
    dark = Image.new("RGBA", cockpit.size, (0, 0, 0, 38))
    cockpit.alpha_composite(dark)
    portrait = assets["portrait"].resize((174, 174), Image.Resampling.NEAREST)
    cockpit.alpha_composite(portrait, (93, 212))
    draw = ImageDraw.Draw(cockpit)
    panel(draw, (70, 348, 290, 470), accent=role["color"], fill="#101719", border="#6d736b")
    draw.rectangle((84, 367, 150, 424), fill="#061414", outline=CYAN, width=2)
    draw.ellipse((91, 376, 143, 419), outline=ACID, width=2)
    draw.line((117, 378, 117, 418), fill="#355d50")
    draw.line((93, 398, 141, 398), fill="#355d50")
    draw.rectangle((165, 371, 273, 410), fill="#071012", outline="#56615d")
    for index in range(5):
        draw.line((170, 402 - index * 6, 264, 394 - index * 4), fill=role["color"], width=1)
    for x in range(171, 274, 18):
        draw.rectangle((x, 423, x + 9, 433), fill=ORANGE if x % 36 else ACID)
    text(draw, (180, 454), "航线已锁定 // 等待派遣", 8, ACID, anchor="mm")
    draw_topbar(cockpit, "外勤驾驶舱", f"当前员工  {role['employee']}  /  {role['class']}")
    panel(draw, (16, 506, 344, 548), accent=role["color"], fill="#0d1517")
    text(draw, (30, 525), role["job"], 10, role["color"], anchor="lm")
    text(draw, (330, 525), "随机星球待命", 8, MUTED, anchor="rm")
    draw_nav(cockpit, None)
    save_ui(cockpit, f"home_{role_id}")


def archive_screen(role_id: str, role, char_assets):
    image = Image.new("RGBA", (360, 640), INK)
    draw = ImageDraw.Draw(image)
    for x in range(0, 360, 32):
        draw.line((x, 0, x, 640), fill="#111b1e")
    for y in range(0, 640, 32):
        draw.line((0, y, 360, y), fill="#111b1e")
    draw_topbar(image, "员工档案", "返回驾驶舱")
    tabs = [(8, 60, 120, 92), (124, 60, 236, 92), (240, 60, 352, 92)]
    for (other_id, other), box in zip(ROLES.items(), tabs):
        button(draw, box, other["class"], other["color"], active=other_id == role_id)
    panel(draw, (14, 101, 346, 555), accent=role["color"], fill="#0c1416")
    text(draw, (30, 128), role["employee"], 23, role["color"])
    text(draw, (329, 126), "已开放", 9, ACID, anchor="ra")
    portrait = char_assets["portrait"].resize((190, 190), Image.Resampling.NEAREST)
    image.alpha_composite(portrait, (85, 132))
    draw.line((74, 319, 286, 319), fill=role["color"], width=2)
    text(draw, (30, 350), role["class"], 18, PAPER)
    text(draw, (330, 350), role["job"], 9, role["color"], anchor="ra")
    y = 376
    for label, value in role["stats"]:
        text(draw, (30, y), label, 9, MUTED)
        draw.rectangle((78, y - 8, 242, y + 1), fill="#20292a")
        draw.rectangle((80, y - 6, 80 + round(158 * value / 100), y - 1), fill=role["color"])
        text(draw, (260, y), str(value), 8, PAPER)
        y += 25
    panel(draw, (28, 451, 332, 496), accent=role["color"], fill="#10191b")
    text(draw, (180, 474), f"“{role['quote']}”", 9, PAPER, anchor="mm")
    button(draw, (70, 507, 290, 545), "设为当前员工", role["color"], active=True)
    draw_nav(image, "员工档案")
    save_ui(image, f"archive_{role_id}")


def activity_screen():
    image = Image.new("RGBA", (360, 640), INK)
    draw = ImageDraw.Draw(image)
    draw_topbar(image, "活动中心", "返回驾驶舱")
    panel(draw, (14, 61, 346, 554), accent=ORANGE, fill="#0d1517")
    text(draw, (30, 91), "外勤出勤签到", 21, PAPER)
    text(draw, (330, 89), "连续 3 天", 9, ORANGE, anchor="ra")
    text(draw, (30, 113), "公司承诺：签到奖励不计入加班费。", 8, MUTED)
    rewards = [8, 10, 12, 15, 18, 22, 40]
    for index in range(7):
        col = index % 4
        row = index // 4
        x = 28 + col * 77
        y = 138 + row * 112
        w = 67 if index < 6 else 144
        if index == 6:
            x = 182
        completed = index < 3
        panel(draw, (x, y, x + w, y + 96), accent=ACID if completed else ORANGE, fill="#263415" if completed else PANEL)
        text(draw, (x + w // 2, y + 19), f"第{index + 1}天", 8, INK if completed else MUTED, anchor="mm")
        icon = load_icon("credits", 30)
        if icon:
            image.alpha_composite(icon, (x + (w - 30) // 2, y + 30))
        text(draw, (x + w // 2, y + 72), f"金币 × {rewards[index]}", 8, PAPER, anchor="mm")
        text(draw, (x + w // 2, y + 87), "已领取" if completed else "待签到", 7, ACID if completed else MUTED, anchor="mm")
    panel(draw, (28, 374, 332, 474), accent=CYAN, fill="#10191b")
    text(draw, (44, 399), "累计出勤奖励", 13, CYAN)
    draw.rectangle((44, 420, 316, 431), fill="#252e2f")
    draw.rectangle((46, 422, 46 + round(268 * 3 / 7), 429), fill=CYAN)
    text(draw, (44, 452), "3 / 7 天", 9, PAPER)
    text(draw, (316, 452), "终极奖励：任务金币 × 60", 8, ORANGE, anchor="ra")
    button(draw, (72, 492, 288, 538), "今日已签到", ACID, active=True)
    draw_nav(image, "活动")
    save_ui(image, "activity_checkin")


def daily_tasks_screen():
    image = Image.new("RGBA", (360, 640), INK)
    draw = ImageDraw.Draw(image)
    draw_topbar(image, "每日任务", "04:00 自动刷新")
    panel(draw, (14, 61, 346, 554), accent=ORANGE, fill="#0d1517")
    text(draw, (30, 89), "今日绩效", 20, PAPER)
    text(draw, (330, 89), "活跃度 55 / 100", 9, ORANGE, anchor="ra")
    draw.rectangle((30, 106, 330, 118), fill="#26302f")
    draw.rectangle((32, 108, 32 + round(296 * .55), 116), fill=ORANGE)
    for mark in (25, 50, 75, 100):
        x = 32 + round(296 * mark / 100)
        draw.line((x, 104, x, 121), fill=PAPER, width=1)
    tasks = [
        ("消灭 120 只怪物", "86 / 120", .72, 16),
        ("完成 1 次组合进化", "0 / 1", 0, 24),
        ("成功撤离 1 次", "1 / 1", 1, 35),
    ]
    y = 143
    for index, (label, progress, ratio, reward) in enumerate(tasks):
        panel(draw, (27, y, 333, y + 91), accent=ACID if ratio >= 1 else CYAN, fill="#111a1c")
        icon = load_icon("success" if ratio >= 1 else "mission", 28)
        if icon:
            image.alpha_composite(icon, (39, y + 15))
        text(draw, (77, y + 28), label, 12, PAPER)
        text(draw, (316, y + 28), progress, 9, ACID if ratio >= 1 else MUTED, anchor="ra")
        draw.rectangle((77, y + 45, 235, y + 54), fill="#252e2f")
        if ratio > 0:
            draw.rectangle((79, y + 47, 79 + round(154 * ratio), y + 52), fill=ACID if ratio >= 1 else CYAN)
        text(draw, (77, y + 72), f"奖励  任务金币 × {reward}", 8, ORANGE)
        button(draw, (250, y + 52, 319, y + 80), "领取" if ratio >= 1 else "进行中", ACID if ratio >= 1 else CYAN, active=ratio >= 1)
        y += 101
    text(draw, (180, 520), "完成每日绩效可获得阶段资源箱", 8, MUTED, anchor="mm")
    draw_nav(image, "任务")
    save_ui(image, "daily_tasks")


def modules_screen():
    image = Image.new("RGBA", (360, 640), INK)
    draw = ImageDraw.Draw(image)
    draw_topbar(image, "飞船模块", "返回驾驶舱")
    modules = [
        ("侦测阵列", "scanner", "提前揭示异常与奖励点", 2, 90),
        ("现场制造舱", "fabricator", "增加升级重抽次数", 1, 75),
        ("强化货舱", "cargo_hold", "失败时保护额外战利品", 2, 105),
        ("生命维持舱", "life_support", "提升生命与拾取范围", 1, 80),
        ("打印舱", "printer", "解锁新的具名宇航员", 3, 140),
    ]
    y = 62
    for name, icon_name, desc, level, cost in modules:
        panel(draw, (12, y, 348, y + 92), accent=CYAN if name != "打印舱" else ACID, fill="#0d1517")
        icon = load_icon(icon_name, 40)
        if icon:
            image.alpha_composite(icon, (24, y + 19))
        text(draw, (76, y + 27), name, 13, PAPER)
        text(draw, (76, y + 47), f"LV.{level} / 5", 8, CYAN)
        text(draw, (76, y + 66), desc, 8, MUTED)
        button(draw, (259, y + 18, 335, y + 72), f"升级\n{cost}", ACID, active=True)
        y += 98
    draw_nav(image, "飞船模块")
    save_ui(image, "ship_modules")


def beacon_sprite():
    sheet = Image.open(GAME / "assets/game/objects/rust/company_beacon/company_beacon.png").convert("RGBA")
    return sheet.crop((64, 0, 128, 64))


def battle_screen(eco_id: str, eco, enemy_rows, mia_assets):
    image = tile_ground(eco["ground"], (360, 640)).convert("RGBA")
    image.alpha_composite(Image.new("RGBA", image.size, (0, 0, 0, 28)))
    draw = ImageDraw.Draw(image)
    panel(draw, (5, 5, 120, 58), accent=CYAN, fill="#0b1214e8")
    health = load_icon("health", 18)
    xp = load_icon("xp", 14)
    if health: image.alpha_composite(health, (11, 12))
    if xp: image.alpha_composite(xp, (13, 38))
    text(draw, (34, 22), "枪械师  LV.4", 8, CYAN)
    draw.rectangle((34, 29, 108, 36), fill="#342226")
    draw.rectangle((35, 30, 94, 35), fill=DANGER)
    draw.rectangle((34, 44, 108, 51), fill="#25302e")
    draw.rectangle((35, 45, 82, 50), fill=ACID)
    panel(draw, (126, 5, 229, 58), accent=PAPER, fill="#0b1214e8")
    text(draw, (177, 20), "MISSION", 7, MUTED, anchor="mm")
    text(draw, (177, 44), "03:42", 17, PAPER, anchor="mm")
    panel(draw, (235, 5, 355, 58), accent=eco["accent"], fill="#0b1214e8")
    text(draw, (247, 22), eco["name"], 9, eco["accent"])
    text(draw, (343, 43), eco["code"], 11, PAPER, anchor="ra")
    panel(draw, (43, 66, 317, 96), accent=ACID, fill="#0b1214e8")
    text(draw, (180, 84), "激活信标  2 / 3    //    占领中 62%", 9, PAPER, anchor="mm")

    cx, cy = 180, 286
    zone = Image.new("RGBA", image.size)
    zone_draw = ImageDraw.Draw(zone)
    zone_draw.ellipse((cx - 48, cy - 23, cx + 48, cy + 23), fill=(80, 230, 205, 42), outline=(85, 223, 224, 230), width=2)
    zone_draw.ellipse((cx - 42, cy - 19, cx + 42, cy + 19), outline=(217, 255, 87, 240), width=2)
    for angle in range(0, 360, 45):
        a = math.radians(angle)
        x0 = cx + math.cos(a) * 43
        y0 = cy + math.sin(a) * 20
        x1 = cx + math.cos(a) * 50
        y1 = cy + math.sin(a) * 24
        zone_draw.line((x0, y0, x1, y1), fill=(217, 255, 87, 240), width=2)
    image.alpha_composite(zone)
    draw = ImageDraw.Draw(image)
    beacon = beacon_sprite().resize((64, 64), Image.Resampling.NEAREST)
    image.alpha_composite(beacon, (cx - 32, cy - 56))
    panel(draw, (124, 205, 236, 228), accent=ACID, fill="#071012")
    draw.rectangle((132, 214, 228, 220), fill="#27302d")
    draw.rectangle((133, 215, 133 + round(94 * .62), 219), fill=ACID)
    text(draw, (180, 211), "信标上传  62%", 7, PAPER, anchor="mm")

    positions = [(56, 180), (298, 194), (62, 350), (302, 370)]
    for row_index, (x, y) in enumerate(positions):
        sprite = enemy_rows[row_index]["directions"][1]
        large = sprite.resize((80, 80), Image.Resampling.NEAREST)
        image.alpha_composite(large, (x - 40, y - 64))
    player = mia_assets["directions"][0].resize((96, 96), Image.Resampling.NEAREST)
    image.alpha_composite(player, (132, 356))
    panel(draw, (82, 456, 278, 486), accent=ACID, fill="#071012")
    text(draw, (180, 474), "保持在信号范围内", 9, ACID, anchor="mm")
    joystick = Image.open(GAME / "assets/game/ui/controls/joystick_base.png").convert("RGBA").resize((88, 88), Image.Resampling.NEAREST)
    image.alpha_composite(joystick, (18, 528))
    arrow = load_icon("mission_beacon", 28)
    if arrow: image.alpha_composite(arrow, (314, 514))
    save_ui(image, f"beacon_{eco_id}")


def overview():
    names = [
        "home_mia", "home_kade", "home_locke", "archive_mia",
        "archive_kade", "archive_locke", "activity_checkin", "daily_tasks",
        "ship_modules", "beacon_rust", "beacon_spore", "beacon_moon",
    ]
    canvas = Image.new("RGB", (720, 1020), INK)
    draw = ImageDraw.Draw(canvas)
    text(draw, (24, 34), "《星际外勤》V2 界面视觉评审 // 12 SCREENS", 22, CYAN)
    for index, name in enumerate(names):
        col = index % 4
        row = index // 4
        x = 18 + col * 176
        y = 56 + row * 315
        preview = Image.open(UI_DIR / f"{name}.png").convert("RGB").resize((162, 288), Image.Resampling.NEAREST)
        canvas.paste(preview, (x, y))
        draw.rectangle((x - 1, y - 1, x + 162, y + 288), outline="#5c6862", width=2)
    canvas.save(UI_DIR / "ui_overview.png")


def manifest():
    ui_names = [
        "home_mia", "home_kade", "home_locke", "archive_mia", "archive_kade", "archive_locke",
        "activity_checkin", "daily_tasks", "ship_modules", "beacon_rust", "beacon_spore", "beacon_moon",
    ]
    payload = {
        "version": 2,
        "codeModified": False,
        "logicalSize": [360, 640],
        "previewSize": [720, 1280],
        "uiScreens": [f"ui/{name}.png" for name in ui_names],
        "characters": {
            role_id: {
                "front": f"characters/{role_id}_front.png",
                "board": f"characters/{role_id}_motion_board.png",
                "gif": f"motion/character_{role_id}_walk.gif",
                "frameSize": [64, 64], "anchor": [32, 56], "directions": ["front", "right", "back", "left"],
                "moveFrames": 6, "idleFramesPlanned": 4, "reviewOnly": True,
            } for role_id in ROLES
        },
        "ecologies": {
            eco_id: {
                "board": f"enemies/{eco_id}_enemy_motion_board.png",
                "enemies": [
                    {"id": enemy_id, "behavior": behavior, "gif": f"motion/{eco_id}_{enemy_id}.gif"}
                    for enemy_id, behavior in zip(eco["ids"], ["swarm", "shooter", "charger", "bloater"])
                ],
            } for eco_id, eco in ECOLOGIES.items()
        },
        "musicDirection": "music_direction.md",
    }
    (ROOT / "review_manifest.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    for directory in (UI_DIR, CHAR_DIR, ENEMY_DIR, MOTION_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    characters = load_character_assets()
    enemies = load_enemy_assets()
    for role_id, role in ROLES.items():
        character_board(role_id, role, characters[role_id])
        home_screen(role_id, role, characters[role_id])
        archive_screen(role_id, role, characters[role_id])
    for eco_id, eco in ECOLOGIES.items():
        enemy_board(eco_id, eco, enemies[eco_id])
        battle_screen(eco_id, eco, enemies[eco_id], characters["mia"])
    activity_screen()
    daily_tasks_screen()
    modules_screen()
    overview()
    manifest()
    print(json.dumps({
        "uiScreens": len(list(UI_DIR.glob("*.png"))),
        "characterPng": len(list(CHAR_DIR.glob("*.png"))),
        "enemyBoards": len(list(ENEMY_DIR.glob("*.png"))),
        "gifs": len(list(MOTION_DIR.glob("*.gif"))),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
