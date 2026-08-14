from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
GAME = ROOT.parents[2]
V2_ROOT = ROOT.parent / "v2_review"
UI_DIR = ROOT / "ui"
ICON_DIR = ROOT / "icons"
CHAR_DIR = ROOT / "characters"

spec = importlib.util.spec_from_file_location("v2_review_builder", V2_ROOT / "build_review_pack.py")
if spec is None or spec.loader is None:
    raise RuntimeError("无法载入 V2 评审包生成器")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
v2.CHAR_DIR = CHAR_DIR


INK = "#070b0d"
VOID = "#030506"
PANEL = "#0d1517"
PANEL_2 = "#132023"
PAPER = "#e3dcc3"
MUTED = "#85897e"
GRID = "#132023"
EDGE = "#52615d"
CYAN = "#55dfe0"
ACID = "#d9ff57"
ORANGE = "#ff7b47"
DANGER = "#ff5550"
YELLOW = "#ffd45c"

FONT_PATH = GAME / "assets/game/fonts/fusion_pixel_12/fusion-pixel-12px-proportional-zh_hans.ttf"

NAV_ITEMS = [
    ("档案", "crew", CYAN),
    ("活动", "timer", ORANGE),
    ("派遣", "dispatch", ACID),
    ("任务", "mission", ORANGE),
    ("升级", "ship", CYAN),
]

NAV_RECTS = [
    {"x": 6 + index * 70, "y": 570, "width": 68, "height": 68}
    for index in range(5)
]

ROLE_UI = {
    "mia": {
        "employee": "米娅·07",
        "class": "枪械师",
        "color": CYAN,
        "style": "保持距离 · 弹道清线",
        "bio": ["执着于命中率和绩效数据。", "擅长保持距离，用弹道清理怪群。"],
        "skills": [
            ("burst", "三点连发", ["连续射击", "压制单体目标"]),
            ("scatter", "散射组件", ["扩展弹幕", "清理近身包围"]),
            ("railgun", "轨道枪", ["周期蓄能", "贯穿直线目标"]),
        ],
        "combos": [
            ("piercing_star", "贯星弹", "贯穿后引发连续爆破"),
            ("hunt_barrage", "猎杀弹幕", "追踪弱点并多次折射"),
            ("zero_storm", "零距风暴", "贴近时释放环形霰弹"),
        ],
    },
    "kade": {
        "employee": "凯德·31",
        "class": "战士",
        "color": ORANGE,
        "style": "主动贴近 · 范围斩击",
        "bio": ["老资格安保人员。", "认为报销流程比怪物更危险。"],
        "skills": [
            ("cleave", "扇形劈砍", ["宽幅斩击", "清理身前怪群"]),
            ("sword_wave", "剑气", ["连续攻击后", "释放远程剑气"]),
            ("orbit_blade", "浮游剑", ["召唤飞剑", "持续环绕切割"]),
        ],
        "combos": [
            ("rift_slash", "裂空斩", "巨型斩击释放多道剑气"),
            ("star_ring", "星环剑阵", "高速飞剑形成切割星环"),
            ("phantom_counter", "幻影反攻", "闪避后发动全向反击"),
        ],
    },
    "locke": {
        "employee": "洛克·88",
        "class": "机械师",
        "color": ACID,
        "style": "绕场布阵 · 机械火网",
        "bio": ["会给每台机器人起名字。", "坚持机器人也应享有员工福利。"],
        "skills": [
            ("drone", "攻击无人机", ["环绕主人", "自动射击目标"]),
            ("turret", "自动炮塔", ["沿移动路线", "建立持续火力"]),
            ("repair_bot", "维修机器人", ["持续修复", "提供生存支援"]),
        ],
        "combos": [
            ("swarm_protocol", "蜂群协议", "无人机组成连锁电弧蜂群"),
            ("mobile_fortress", "移动堡垒", "炮塔化为环绕护卫炮台"),
            ("infinite_recycle", "无限回收", "机械连续自爆重建并回收"),
        ],
    },
}


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size=max(6, int(size)))


def text(draw: ImageDraw.ImageDraw, xy, value: str, size: int, fill=PAPER, anchor="la"):
    draw.text(xy, value, font=font(size), fill=fill, anchor=anchor)


def stepped_points(box, cut=4, offset=(0, 0)):
    x0, y0, x1, y1 = map(int, box)
    ox, oy = offset
    return [
        (x0 + cut + ox, y0 + oy),
        (x1 - cut + ox, y0 + oy),
        (x1 + ox, y0 + cut + oy),
        (x1 + ox, y1 - cut + oy),
        (x1 - cut + ox, y1 + oy),
        (x0 + cut + ox, y1 + oy),
        (x0 + ox, y1 - cut + oy),
        (x0 + ox, y0 + cut + oy),
    ]


def pixel_panel(draw: ImageDraw.ImageDraw, box, accent=CYAN, fill=PANEL, border=EDGE, shadow=True):
    x0, y0, x1, y1 = map(int, box)
    if shadow:
        draw.polygon(stepped_points(box, offset=(2, 2)), fill=VOID)
    draw.polygon(stepped_points(box), fill=fill, outline=border)
    draw.line((x0 + 4, y0, x1 - 4, y0), fill=border, width=2)
    draw.line((x0, y0 + 4, x0, y1 - 4), fill=border, width=2)
    draw.line((x0 + 8, y0 + 4, min(x1 - 8, x0 + 42), y0 + 4), fill=accent, width=2)
    draw.line((max(x0 + 8, x1 - 30), y1 - 4, x1 - 8, y1 - 4), fill=accent, width=2)


def pixel_button(draw: ImageDraw.ImageDraw, box, label, accent=CYAN, active=False, font_size=9):
    fill = "#263612" if active and accent == ACID else ("#10282a" if active else PANEL)
    pixel_panel(draw, box, accent=accent, fill=fill, border=accent if active else EDGE)
    x0, y0, x1, y1 = box
    if active:
        draw.rectangle((x0 + 8, y0 + 4, x1 - 8, y0 + 7), fill=accent)
    text(draw, ((x0 + x1) // 2, (y0 + y1) // 2 + 3), label, font_size,
         INK if active and accent == ACID else PAPER, anchor="mm")


def load_icon(name: str, size: int):
    source = GAME / "assets/game/ui/icons" / f"{name}.png"
    if not source.exists():
        return None
    return Image.open(source).convert("RGBA").resize((size, size), Image.Resampling.NEAREST)


def draw_nav_button(image: Image.Image, label: str, icon_name: str, accent: str, box, active=False):
    draw = ImageDraw.Draw(image)
    x0, y0, x1, y1 = box
    is_dispatch = label == "派遣"
    fill = "#283811" if is_dispatch else ("#10292b" if active else "#0b1214")
    pixel_panel(draw, box, accent=accent, fill=fill, border=accent if active or is_dispatch else EDGE)
    if active:
        draw.rectangle((x0 + 8, y0 + 4, x1 - 8, y0 + 7), fill=accent)
    icon_size = 32 if is_dispatch else 30
    icon = load_icon(icon_name, icon_size)
    if icon:
        image.alpha_composite(icon, ((x0 + x1 - icon_size) // 2, y0 + 10))
    text(draw, ((x0 + x1) // 2, y1 - 11), label, 10,
         INK if is_dispatch else (accent if active else PAPER), anchor="mm")


def draw_nav(image: Image.Image, active: str | None):
    for item, rect in zip(NAV_ITEMS, NAV_RECTS):
        label, icon_name, accent = item
        box = (rect["x"], rect["y"], rect["x"] + rect["width"], rect["y"] + rect["height"])
        draw_nav_button(image, label, icon_name, accent, box, active=label == active)


def draw_topbar(image: Image.Image, title: str, subtitle: str = "", show_credits=True):
    draw = ImageDraw.Draw(image)
    pixel_panel(draw, (6, 6, 354, 52), accent=CYAN, fill="#091214", border="#5f6d68")
    logo = load_icon("company_logo", 28)
    if logo:
        image.alpha_composite(logo, (14, 14))
    text(draw, (50, 24), title, 15, PAPER, anchor="lm")
    if subtitle:
        text(draw, (50, 42), subtitle, 7, MUTED, anchor="lm")
    if show_credits:
        credits = load_icon("credits", 16)
        if credits:
            image.alpha_composite(credits, (306, 18))
        text(draw, (346, 30), "128", 10, ORANGE, anchor="rm")


def grid_background():
    image = Image.new("RGBA", (360, 640), INK)
    draw = ImageDraw.Draw(image)
    for x in range(0, 361, 16):
        draw.line((x, 0, x, 640), fill=GRID)
    for y in range(0, 641, 16):
        draw.line((0, y, 360, y), fill=GRID)
    for x in range(0, 361, 32):
        draw.line((x, 0, x, 640), fill="#182629")
    for y in range(0, 641, 32):
        draw.line((0, y, 360, y), fill="#182629")
    return image


def save_ui(image: Image.Image, name: str):
    logical = image.convert("RGB")
    logical.save(UI_DIR / f"{name}.png")
    logical.resize((720, 1280), Image.Resampling.NEAREST).save(UI_DIR / f"{name}_2x.png")


def create_review_symbol(role_id: str, skill_id: str, accent: str):
    image = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    light = PAPER
    dark = "#4b5551"

    if role_id == "kade":
        if skill_id in {"cleave", "sword_wave", "rift_slash"}:
            draw.line((8, 25, 24, 7), fill=light, width=4)
            draw.rectangle((5, 23, 11, 27), fill=accent)
            if skill_id == "cleave":
                draw.arc((3, 3, 29, 29), 200, 330, fill=accent, width=3)
            elif skill_id == "sword_wave":
                draw.line((18, 20, 29, 16), fill=accent, width=2)
                draw.line((20, 24, 30, 22), fill=accent, width=2)
            else:
                draw.line((4, 7, 13, 16), fill=accent, width=3)
                draw.line((18, 15, 28, 25), fill=accent, width=3)
        elif skill_id in {"orbit_blade", "star_ring"}:
            draw.ellipse((5, 5, 27, 27), outline=accent, width=2)
            for x, y in ((16, 3), (29, 16), (16, 29), (3, 16)):
                draw.rectangle((x - 2, y - 3, x + 2, y + 3), fill=light)
            if skill_id == "star_ring":
                draw.ellipse((11, 11, 21, 21), fill=accent)
        else:
            draw.polygon([(16, 4), (26, 9), (24, 22), (16, 28), (8, 22), (6, 9)], outline=accent, fill="#172024")
            draw.line((9, 22, 25, 8), fill=light, width=3)
            draw.line((8, 8, 24, 24), fill=dark, width=2)
    else:
        if skill_id in {"drone", "swarm_protocol"}:
            centers = [(16, 16)] if skill_id == "drone" else [(9, 10), (23, 10), (16, 23)]
            for cx, cy in centers:
                draw.rectangle((cx - 4, cy - 3, cx + 4, cy + 3), fill=light, outline=accent)
                draw.line((cx - 7, cy, cx - 4, cy), fill=accent, width=2)
                draw.line((cx + 4, cy, cx + 7, cy), fill=accent, width=2)
            if skill_id == "swarm_protocol":
                draw.line((9, 13, 16, 20, 23, 13), fill=accent, width=2)
        elif skill_id in {"turret", "mobile_fortress"}:
            draw.rectangle((9, 17, 23, 26), fill=dark, outline=accent, width=2)
            draw.rectangle((13, 12, 20, 19), fill=light)
            draw.line((18, 13, 29, 8), fill=accent, width=3)
            if skill_id == "mobile_fortress":
                draw.arc((3, 3, 29, 29), 180, 360, fill=light, width=2)
        elif skill_id == "repair_bot":
            draw.rectangle((8, 12, 24, 25), fill=dark, outline=accent, width=2)
            draw.rectangle((14, 8, 18, 20), fill=light)
            draw.rectangle((10, 12, 22, 16), fill=light)
            draw.rectangle((11, 25, 14, 28), fill=accent)
            draw.rectangle((19, 25, 22, 28), fill=accent)
        else:
            draw.arc((5, 5, 27, 27), 20, 150, fill=accent, width=3)
            draw.arc((5, 5, 27, 27), 200, 330, fill=light, width=3)
            draw.polygon([(24, 5), (29, 8), (24, 12)], fill=accent)
            draw.polygon([(8, 27), (3, 24), (8, 20)], fill=light)
            draw.rectangle((13, 13, 19, 19), fill=ORANGE)

    path = ICON_DIR / f"{role_id}_{skill_id}.png"
    image.save(path)
    return image


def skill_icon(role_id: str, skill_id: str, accent: str):
    destination = ICON_DIR / f"{role_id}_{skill_id}.png"
    if destination.exists():
        return Image.open(destination).convert("RGBA")
    if role_id == "mia":
        source = GAME / "assets/game/skills/gunner/icons" / f"{skill_id}.png"
        if source.exists():
            icon = Image.open(source).convert("RGBA").resize((32, 32), Image.Resampling.NEAREST)
            icon.save(destination)
            return icon
    return create_review_symbol(role_id, skill_id, accent)


def home_screen(role_id: str, role, assets):
    image = Image.open(V2_ROOT / "sources/cockpit_master.png").convert("RGBA").resize((360, 640), Image.Resampling.NEAREST)
    image.alpha_composite(Image.new("RGBA", image.size, (0, 0, 0, 42)))
    portrait = assets["portrait"].resize((174, 174), Image.Resampling.NEAREST)
    image.alpha_composite(portrait, (92, 212))
    draw = ImageDraw.Draw(image)

    pixel_panel(draw, (70, 348, 290, 470), accent=role["color"], fill="#0b1416", border="#5c6863")
    draw.rectangle((84, 368, 150, 424), fill="#061414", outline=CYAN, width=2)
    draw.ellipse((92, 376, 142, 418), outline=ACID, width=2)
    draw.line((116, 378, 116, 418), fill="#355d50", width=2)
    draw.line((94, 398, 140, 398), fill="#355d50", width=2)
    draw.rectangle((164, 370, 274, 410), fill="#071012", outline=EDGE, width=2)
    for index in range(5):
        draw.line((170, 402 - index * 6, 264, 394 - index * 4), fill=role["color"], width=2)
    for x in range(170, 274, 18):
        draw.rectangle((x, 422, x + 10, 434), fill=ORANGE if x % 36 else ACID)
    text(draw, (180, 454), "航线已锁定 // 等待派遣", 8, ACID, anchor="mm")

    draw_topbar(image, "外勤驾驶舱", f"当前员工  {role['employee']}  /  {role['class']}")
    pixel_panel(draw, (16, 510, 344, 560), accent=role["color"], fill="#0b1416")
    text(draw, (30, 530), role["style"], 10, role["color"], anchor="lm")
    text(draw, (330, 546), "随机星球待命", 8, MUTED, anchor="rm")
    draw_nav(image, None)
    save_ui(image, f"home_{role_id}")


def archive_screen(role_id: str, role, assets):
    image = grid_background()
    draw = ImageDraw.Draw(image)
    draw_topbar(image, "员工档案", "返回驾驶舱", show_credits=False)

    tab_boxes = [(8, 58, 120, 94), (124, 58, 236, 94), (240, 58, 352, 94)]
    for (other_id, other), box in zip(ROLE_UI.items(), tab_boxes):
        pixel_button(draw, box, other["class"], other["color"], active=other_id == role_id, font_size=10)

    pixel_panel(draw, (8, 100, 352, 566), accent=role["color"], fill="#091214", border="#5b6864")
    pixel_panel(draw, (18, 108, 148, 264), accent=role["color"], fill="#0d191b", border="#354744", shadow=False)
    portrait = assets["portrait"].resize((128, 128), Image.Resampling.NEAREST)
    image.alpha_composite(portrait, (20, 122))
    draw.line((28, 252, 138, 252), fill=role["color"], width=2)

    text(draw, (160, 126), role["employee"], 17, role["color"])
    text(draw, (160, 150), role["class"], 11, PAPER)
    text(draw, (160, 172), role["style"], 8, role["color"])
    text(draw, (160, 202), role["bio"][0], 8, PAPER)
    text(draw, (160, 220), role["bio"][1], 8, PAPER)
    text(draw, (160, 246), "已开放 // 可设为当前员工", 7, ACID)

    text(draw, (20, 282), "代表技能", 10, PAPER)
    draw.line((82, 278, 340, 278), fill="#29403f", width=2)
    card_xs = [18, 130, 242]
    for x, (skill_id, name, desc_lines) in zip(card_xs, role["skills"]):
        pixel_panel(draw, (x, 290, x + 102, 364), accent=role["color"], fill="#0d191b", border="#354744", shadow=False)
        icon = skill_icon(role_id, skill_id, role["color"]).resize((28, 28), Image.Resampling.NEAREST)
        image.alpha_composite(icon, (x + 6, 300))
        text(draw, (x + 38, 310), name, 8, role["color"])
        text(draw, (x + 38, 326), desc_lines[0], 6, PAPER)
        text(draw, (x + 10, 350), desc_lines[1], 7, MUTED)

    text(draw, (20, 386), "组合技", 10, PAPER)
    draw.line((70, 382, 340, 382), fill="#29403f", width=2)
    combo_y = [394, 434, 474]
    for y, (skill_id, name, desc) in zip(combo_y, role["combos"]):
        pixel_panel(draw, (18, y, 342, y + 34), accent=role["color"], fill="#0d191b", border="#354744", shadow=False)
        icon = skill_icon(role_id, skill_id, role["color"]).resize((24, 24), Image.Resampling.NEAREST)
        image.alpha_composite(icon, (24, y + 6))
        text(draw, (56, y + 12), name, 9, role["color"])
        text(draw, (330, y + 22), desc, 7, PAPER, anchor="ra")

    pixel_button(draw, (72, 520, 288, 558), "设为当前员工", role["color"], active=True, font_size=10)
    draw_nav(image, "档案")
    save_ui(image, f"archive_{role_id}")


def activity_screen():
    image = grid_background()
    draw = ImageDraw.Draw(image)
    draw_topbar(image, "活动中心", "返回驾驶舱")
    pixel_panel(draw, (14, 60, 346, 560), accent=ORANGE, fill="#0b1416")
    text(draw, (30, 90), "外勤出勤签到", 20, PAPER)
    text(draw, (330, 90), "连续 3 天", 9, ORANGE, anchor="ra")
    text(draw, (30, 114), "公司承诺：签到奖励不计入加班费。", 8, MUTED)

    rewards = [8, 10, 12, 15, 18, 22, 40]
    for index in range(7):
        col = index % 4
        row = index // 4
        x = 28 + col * 78
        y = 136 + row * 112
        width = 66 if index < 6 else 144
        if index == 6:
            x = 182
        completed = index < 3
        pixel_panel(draw, (x, y, x + width, y + 96), accent=ACID if completed else ORANGE,
                    fill="#263612" if completed else PANEL, border=ACID if completed else EDGE, shadow=False)
        text(draw, (x + width // 2, y + 20), f"第{index + 1}天", 8, INK if completed else MUTED, anchor="mm")
        icon = load_icon("credits", 30)
        if icon:
            image.alpha_composite(icon, (x + (width - 30) // 2, y + 30))
        text(draw, (x + width // 2, y + 72), f"金币 × {rewards[index]}", 7, PAPER, anchor="mm")
        text(draw, (x + width // 2, y + 86), "已领取" if completed else "待签到", 7,
             ACID if completed else MUTED, anchor="mm")

    pixel_panel(draw, (28, 374, 332, 474), accent=CYAN, fill="#0d191b", shadow=False)
    text(draw, (44, 398), "累计出勤奖励", 13, CYAN)
    draw.rectangle((44, 420, 316, 432), fill="#252e2f")
    draw.rectangle((46, 422, 160, 430), fill=CYAN)
    text(draw, (44, 452), "3 / 7 天", 9, PAPER)
    text(draw, (316, 452), "终极奖励：任务金币 × 60", 8, ORANGE, anchor="ra")
    pixel_button(draw, (72, 494, 288, 540), "今日已签到", ACID, active=True, font_size=10)
    draw_nav(image, "活动")
    save_ui(image, "activity_checkin")


def daily_tasks_screen():
    image = grid_background()
    draw = ImageDraw.Draw(image)
    draw_topbar(image, "每日任务", "04:00 自动刷新")
    pixel_panel(draw, (14, 60, 346, 560), accent=ORANGE, fill="#0b1416")
    text(draw, (30, 88), "今日绩效", 19, PAPER)
    text(draw, (330, 88), "活跃度 55 / 100", 9, ORANGE, anchor="ra")
    draw.rectangle((30, 106, 330, 118), fill="#26302f")
    draw.rectangle((32, 108, 194, 116), fill=ORANGE)
    for x in (106, 180, 254, 328):
        draw.line((x, 104, x, 120), fill=PAPER, width=2)

    tasks = [
        ("消灭 120 只怪物", "86 / 120", .72, 16),
        ("完成 1 次组合进化", "0 / 1", 0, 24),
        ("成功撤离 1 次", "1 / 1", 1, 35),
    ]
    y = 142
    for label, progress, ratio, reward in tasks:
        accent = ACID if ratio >= 1 else CYAN
        pixel_panel(draw, (26, y, 334, y + 92), accent=accent, fill="#0d191b", shadow=False)
        icon = load_icon("success" if ratio >= 1 else "mission", 30)
        if icon:
            image.alpha_composite(icon, (38, y + 16))
        text(draw, (78, y + 28), label, 11, PAPER)
        text(draw, (318, y + 28), progress, 9, accent if ratio >= 1 else MUTED, anchor="ra")
        draw.rectangle((78, y + 46, 236, y + 56), fill="#252e2f")
        if ratio > 0:
            draw.rectangle((80, y + 48, 80 + round(154 * ratio), y + 54), fill=accent)
        text(draw, (78, y + 74), f"奖励  任务金币 × {reward}", 8, ORANGE)
        pixel_button(draw, (250, y + 54, 320, y + 82), "领取" if ratio >= 1 else "进行中",
                     accent, active=ratio >= 1, font_size=8)
        y += 102
    text(draw, (180, 526), "完成每日绩效可获得阶段资源箱", 8, MUTED, anchor="mm")
    draw_nav(image, "任务")
    save_ui(image, "daily_tasks")


def upgrade_screen():
    image = grid_background()
    draw = ImageDraw.Draw(image)
    draw_topbar(image, "飞船升级", "返回驾驶舱")
    modules = [
        ("侦测阵列", "scanner", "提前揭示异常与奖励点", 2, 90),
        ("现场制造舱", "fabricator", "增加升级重抽次数", 1, 75),
        ("强化货舱", "cargo_hold", "失败时保护额外战利品", 2, 105),
        ("生命维持舱", "life_support", "提升生命与拾取范围", 1, 80),
        ("打印舱", "printer", "解锁新的具名宇航员", 3, 140),
    ]
    y = 60
    for name, icon_name, desc, level, cost in modules:
        accent = ACID if name == "打印舱" else CYAN
        pixel_panel(draw, (12, y, 348, y + 94), accent=accent, fill="#0b1416")
        icon = load_icon(icon_name, 42)
        if icon:
            image.alpha_composite(icon, (24, y + 20))
        text(draw, (78, y + 28), name, 13, PAPER)
        text(draw, (78, y + 48), f"LV.{level} / 5", 8, accent)
        text(draw, (78, y + 70), desc, 8, MUTED)
        pixel_button(draw, (258, y + 20, 336, y + 74), f"升级 {cost}", ACID, active=True, font_size=8)
        y += 98
    draw_nav(image, "升级")
    save_ui(image, "upgrade")


def battle_screen(eco_id: str, eco, enemy_rows, mia_assets):
    image = v2.tile_ground(eco["ground"], (360, 640)).convert("RGBA")
    image.alpha_composite(Image.new("RGBA", image.size, (0, 0, 0, 30)))
    draw = ImageDraw.Draw(image)

    pixel_panel(draw, (6, 6, 120, 58), accent=CYAN, fill="#071012e8", shadow=False)
    health = load_icon("health", 18)
    xp = load_icon("xp", 14)
    if health:
        image.alpha_composite(health, (12, 12))
    if xp:
        image.alpha_composite(xp, (14, 38))
    text(draw, (34, 22), "枪械师  LV.4", 8, CYAN)
    draw.rectangle((34, 30, 108, 36), fill="#342226")
    draw.rectangle((36, 32, 94, 34), fill=DANGER)
    draw.rectangle((34, 44, 108, 52), fill="#25302e")
    draw.rectangle((36, 46, 82, 50), fill=ACID)

    pixel_panel(draw, (126, 6, 230, 58), accent=PAPER, fill="#071012e8", shadow=False)
    text(draw, (178, 20), "MISSION", 7, MUTED, anchor="mm")
    text(draw, (178, 44), "03:42", 17, PAPER, anchor="mm")
    pixel_panel(draw, (236, 6, 354, 58), accent=eco["accent"], fill="#071012e8", shadow=False)
    text(draw, (248, 22), eco["name"], 9, eco["accent"])
    text(draw, (342, 44), eco["code"], 11, PAPER, anchor="ra")
    pixel_panel(draw, (44, 66, 316, 96), accent=ACID, fill="#071012e8", shadow=False)
    text(draw, (180, 84), "激活信标  2 / 3    //    占领中 62%", 9, PAPER, anchor="mm")

    cx, cy = 180, 286
    zone = Image.new("RGBA", image.size, (0, 0, 0, 0))
    zone_draw = ImageDraw.Draw(zone)
    zone_draw.ellipse((cx - 48, cy - 24, cx + 48, cy + 24), fill=(80, 230, 205, 42), outline=(85, 223, 224, 230), width=2)
    zone_draw.ellipse((cx - 42, cy - 20, cx + 42, cy + 20), outline=(217, 255, 87, 240), width=2)
    for angle in range(0, 360, 45):
        a = math.radians(angle)
        zone_draw.line((cx + math.cos(a) * 42, cy + math.sin(a) * 20,
                        cx + math.cos(a) * 50, cy + math.sin(a) * 24), fill=(217, 255, 87, 240), width=2)
    image.alpha_composite(zone)
    draw = ImageDraw.Draw(image)

    beacon = v2.beacon_sprite().resize((64, 64), Image.Resampling.NEAREST)
    image.alpha_composite(beacon, (cx - 32, cy - 56))
    pixel_panel(draw, (124, 204, 236, 228), accent=ACID, fill="#071012", shadow=False)
    draw.rectangle((132, 214, 228, 220), fill="#27302d")
    draw.rectangle((134, 216, 192, 218), fill=ACID)
    text(draw, (180, 210), "信标上传  62%", 7, PAPER, anchor="mm")

    positions = [(56, 180), (298, 194), (62, 350), (302, 370)]
    for row_index, (x, y) in enumerate(positions):
        sprite = enemy_rows[row_index]["directions"][1].resize((80, 80), Image.Resampling.NEAREST)
        image.alpha_composite(sprite, (x - 40, y - 64))
    player = mia_assets["directions"][0].resize((96, 96), Image.Resampling.NEAREST)
    image.alpha_composite(player, (132, 356))
    pixel_panel(draw, (82, 456, 278, 486), accent=ACID, fill="#071012", shadow=False)
    text(draw, (180, 474), "保持在信号范围内", 9, ACID, anchor="mm")

    joystick = Image.open(GAME / "assets/game/ui/controls/joystick_base.png").convert("RGBA").resize((88, 88), Image.Resampling.NEAREST)
    knob = Image.open(GAME / "assets/game/ui/controls/joystick_knob.png").convert("RGBA").resize((36, 36), Image.Resampling.NEAREST)
    image.alpha_composite(joystick, (136, 516))
    image.alpha_composite(knob, (162, 542))
    arrow = load_icon("mission_beacon", 28)
    if arrow:
        image.alpha_composite(arrow, (314, 520))
    save_ui(image, f"beacon_{eco_id}")


def nav_states():
    logical = Image.new("RGBA", (360, 100), INK)
    draw = ImageDraw.Draw(logical)
    text(draw, (180, 10), "五栏等宽导航 // ACTIVE STATES", 8, MUTED, anchor="ma")
    for index, (label, icon_name, accent) in enumerate(NAV_ITEMS):
        x = 6 + index * 70
        draw_nav_button(logical, label, icon_name, accent, (x, 24, x + 68, 92), active=True)
    logical.convert("RGB").resize((720, 200), Image.Resampling.NEAREST).save(UI_DIR / "nav_states.png")


def overview():
    names = [
        "home_mia", "home_kade", "home_locke", "archive_mia",
        "archive_kade", "archive_locke", "activity_checkin", "daily_tasks",
        "upgrade", "beacon_rust", "beacon_spore", "beacon_moon",
    ]
    canvas = Image.new("RGB", (720, 1020), INK)
    draw = ImageDraw.Draw(canvas)
    text(draw, (24, 34), "《星际外勤》V3 8-BIT UI 评审 // 12 SCREENS", 20, CYAN)
    for index, name in enumerate(names):
        col = index % 4
        row = index // 4
        x = 18 + col * 176
        y = 56 + row * 315
        preview = Image.open(UI_DIR / f"{name}.png").convert("RGB").resize((162, 288), Image.Resampling.NEAREST)
        canvas.paste(preview, (x, y))
        draw.rectangle((x - 2, y - 2, x + 164, y + 290), outline="#5c6862", width=2)
    canvas.save(UI_DIR / "ui_overview.png")


def write_specs():
    screens = [
        "home_mia", "home_kade", "home_locke", "archive_mia", "archive_kade", "archive_locke",
        "activity_checkin", "daily_tasks", "upgrade", "beacon_rust", "beacon_spore", "beacon_moon",
    ]
    payload = {
        "version": 3,
        "reviewOnly": True,
        "codeModified": False,
        "logicalSize": [360, 640],
        "previewSize": [720, 1280],
        "pixelGrid": 2,
        "scaling": "nearest-neighbor",
        "navigation": {
            "labels": [item[0] for item in NAV_ITEMS],
            "rects": NAV_RECTS,
            "gap": 2,
            "outerMargin": 6,
            "iconSize": 30,
            "dispatchIconSize": 32,
            "labelFontSize": 10,
        },
        "joystick": {
            "imageRect": {"x": 136, "y": 516, "width": 88, "height": 88},
            "center": [180, 560],
            "touchReferenceRect": {"x": 124, "y": 504, "width": 112, "height": 112},
            "knobRect": {"x": 162, "y": 542, "width": 36, "height": 36},
        },
        "archive": {
            role_id: {
                "representativeSkills": [skill[0] for skill in role["skills"]],
                "combos": [combo[0] for combo in role["combos"]],
                "numericStatsShown": False,
            }
            for role_id, role in ROLE_UI.items()
        },
        "screens": [f"ui/{name}.png" for name in screens],
        "previews": [f"ui/{name}_2x.png" for name in screens],
        "overview": "ui/ui_overview.png",
        "navigationStates": "ui/nav_states.png",
    }
    (ROOT / "ui_specs.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "review_manifest.json").write_text(json.dumps({
        "version": 3,
        "uiScreens": payload["screens"],
        "uiPreviews": payload["previews"],
        "uiSpecs": "ui_specs.json",
        "sourceReviewPack": "../v2_review",
        "gameCodeModified": False,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    for directory in (ROOT, UI_DIR, ICON_DIR, CHAR_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    characters = v2.load_character_assets()
    enemies = v2.load_enemy_assets()

    for role_id, role in ROLE_UI.items():
        home_screen(role_id, role, characters[role_id])
        archive_screen(role_id, role, characters[role_id])
    activity_screen()
    daily_tasks_screen()
    upgrade_screen()
    for eco_id, eco in v2.ECOLOGIES.items():
        battle_screen(eco_id, eco, enemies[eco_id], characters["mia"])
    nav_states()
    overview()
    write_specs()

    print(json.dumps({
        "logicalScreens": len([path for path in UI_DIR.glob("*.png") if not path.stem.endswith("_2x") and path.stem not in {"ui_overview", "nav_states"}]),
        "doublePreviews": len(list(UI_DIR.glob("*_2x.png"))),
        "reviewSkillIcons": len(list(ICON_DIR.glob("*.png"))),
        "joystickCenter": [180, 560],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
