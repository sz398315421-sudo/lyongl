from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
GAME = ROOT.parents[2]
V3_ROOT = ROOT.parent / "v3_ui_review"
UI_DIR = ROOT / "ui"
ICON_DIR = ROOT / "icons"
CHAR_DIR = ROOT / "characters"

spec = importlib.util.spec_from_file_location("v3_ui_builder", V3_ROOT / "build_v3_ui_review.py")
if spec is None or spec.loader is None:
    raise RuntimeError("无法载入 V3 评审包生成器")
v3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v3)

v3.ROOT = ROOT
v3.UI_DIR = UI_DIR
v3.ICON_DIR = ICON_DIR
v3.CHAR_DIR = CHAR_DIR
v3.v2.CHAR_DIR = CHAR_DIR


INK = v3.INK
VOID = v3.VOID
PANEL = v3.PANEL
PAPER = v3.PAPER
MUTED = v3.MUTED
EDGE = v3.EDGE
CYAN = v3.CYAN
ACID = v3.ACID
ORANGE = v3.ORANGE
DANGER = v3.DANGER

METAL = "#2a211f"
METAL_LIGHT = "#3a2b27"
METAL_ACTIVE = "#51352a"
METAL_DARK = "#171211"
COPPER = "#bd6336"
BRASS = "#f1aa3c"
BADGE_RED = "#ff3f2f"
DISPATCH_FILL = "#94441f"

NAV_ITEMS = [
    ("档案", "crew", CYAN, 0, 70),
    ("活动", "timer", ORANGE, 70, 70),
    ("派遣", "dispatch", ACID, 140, 80),
    ("任务", "mission", ORANGE, 220, 70),
    ("升级", "ship", CYAN, 290, 70),
]

NAV_TOP = 548
NAV_BASE_TOP = 580
NAV_BOTTOM = 640
CONTENT_SAFE_BOTTOM = 544

HIT_RECTS = [
    {"label": "档案", "x": 0, "y": 560, "width": 70, "height": 80},
    {"label": "活动", "x": 70, "y": 560, "width": 70, "height": 80},
    {"label": "派遣", "x": 140, "y": 548, "width": 80, "height": 92},
    {"label": "任务", "x": 220, "y": 560, "width": 70, "height": 80},
    {"label": "升级", "x": 290, "y": 560, "width": 70, "height": 80},
]

ICON_RECTS = {
    "档案": {"x": 16, "y": 548, "width": 38, "height": 38},
    "活动": {"x": 86, "y": 548, "width": 38, "height": 38},
    "派遣": {"x": 153, "y": 552, "width": 54, "height": 54},
    "任务": {"x": 236, "y": 548, "width": 38, "height": 38},
    "升级": {"x": 306, "y": 548, "width": 38, "height": 38},
}

BADGE_RECTS = {
    "活动": {"x": 118, "y": 548, "width": 12, "height": 12},
    "任务": {"x": 268, "y": 548, "width": 12, "height": 12},
}


def shadow_text(draw: ImageDraw.ImageDraw, xy, value: str, size: int, fill=PAPER, anchor="mm"):
    x, y = xy
    draw.text((x + 1, y + 1), value, font=v3.font(size), fill=VOID, anchor=anchor)
    draw.text((x, y), value, font=v3.font(size), fill=fill, anchor=anchor)


def icon_with_shadow(image: Image.Image, icon, position):
    x, y = position
    shadow = Image.new("RGBA", icon.size, (0, 0, 0, 180))
    shadow.putalpha(icon.getchannel("A").point(lambda alpha: min(190, alpha)))
    image.alpha_composite(shadow, (x + 2, y + 2))
    image.alpha_composite(icon, (x, y))


def notification_badge(draw: ImageDraw.ImageDraw, rect):
    x, y, width, height = rect
    draw.polygon([
        (x + 4, y), (x + width - 3, y), (x + width, y + 3),
        (x + width, y + height - 3), (x + width - 3, y + height),
        (x + 3, y + height), (x, y + height - 3), (x, y + 4),
    ], fill=BRASS)
    draw.rectangle((x + 2, y + 2, x + width - 2, y + height - 2), fill=BADGE_RED)
    draw.rectangle((x + 4, y + 2, x + 6, y + 4), fill="#fff1b8")
    draw.rectangle((x + 3, y + height - 2, x + width - 3, y + height), fill="#7c201b")


def draw_nav_layout(image: Image.Image, active: str | None, top=NAV_TOP):
    draw = ImageDraw.Draw(image)
    base_top = top + 32
    bottom = top + 92

    draw.rectangle((0, base_top + 2, 359, bottom - 1), fill=VOID)
    draw.rectangle((0, base_top, 359, bottom - 2), fill=METAL)
    draw.rectangle((0, base_top, 359, base_top + 3), fill=COPPER)
    draw.rectangle((0, base_top + 4, 359, base_top + 6), fill=METAL_LIGHT)
    draw.rectangle((0, bottom - 5, 359, bottom - 2), fill=METAL_DARK)

    for x in (70, 140, 220, 290):
        draw.rectangle((x - 1, base_top + 7, x + 1, bottom - 6), fill=METAL_DARK)
        draw.line((x + 2, base_top + 8, x + 2, bottom - 7), fill="#5b4035", width=1)

    for label, icon_name, accent, x, width in NAV_ITEMS:
        if label == "派遣":
            continue
        if label == active:
            draw.rectangle((x + 3, base_top + 7, x + width - 3, bottom - 6), fill=METAL_ACTIVE)
            draw.rectangle((x + 8, base_top + 7, x + width - 8, base_top + 10), fill=accent)
        icon = v3.load_icon(icon_name, 38)
        if icon:
            icon_with_shadow(image, icon, (x + (width - 38) // 2, top))
        shadow_text(draw, (x + width // 2, bottom - 12), label, 10,
                    accent if label == active else PAPER)

    left, right = 140, 220
    dispatch_points = [
        (left, bottom), (left, base_top), (146, base_top), (146, top + 8),
        (154, top), (206, top), (214, top + 8), (214, base_top),
        (right, base_top), (right, bottom),
    ]
    shadow_points = [(x + 2, y + 2) for x, y in dispatch_points]
    draw.polygon(shadow_points, fill=VOID)
    draw.polygon(dispatch_points, fill=DISPATCH_FILL, outline=COPPER)
    draw.line((154, top, 206, top), fill=ACID, width=3)
    draw.line((left + 5, bottom - 4, right - 5, bottom - 4), fill="#5d2419", width=3)
    draw.rectangle((146, base_top, 214, base_top + 3), fill="#c45c2b")

    dispatch_icon = v3.load_icon("dispatch", 54)
    if dispatch_icon:
        icon_with_shadow(image, dispatch_icon, (153, top + 4))
    shadow_text(draw, (180, bottom - 12), "派遣", 12, PAPER)

    for label, rect in BADGE_RECTS.items():
        y_offset = top - NAV_TOP
        notification_badge(draw, (rect["x"], rect["y"] + y_offset, rect["width"], rect["height"]))


def draw_nav(image: Image.Image, active: str | None):
    draw_nav_layout(image, active, NAV_TOP)


def home_screen(role_id: str, role, assets):
    image = Image.open(v3.V2_ROOT / "sources/cockpit_master.png").convert("RGBA").resize((360, 640), Image.Resampling.NEAREST)
    image.alpha_composite(Image.new("RGBA", image.size, (0, 0, 0, 42)))
    portrait = assets["portrait"].resize((174, 174), Image.Resampling.NEAREST)
    image.alpha_composite(portrait, (92, 212))
    draw = ImageDraw.Draw(image)

    v3.pixel_panel(draw, (70, 348, 290, 470), accent=role["color"], fill="#0b1416", border="#5c6863")
    draw.rectangle((84, 368, 150, 424), fill="#061414", outline=CYAN, width=2)
    draw.ellipse((92, 376, 142, 418), outline=ACID, width=2)
    draw.line((116, 378, 116, 418), fill="#355d50", width=2)
    draw.line((94, 398, 140, 398), fill="#355d50", width=2)
    draw.rectangle((164, 370, 274, 410), fill="#071012", outline=EDGE, width=2)
    for index in range(5):
        draw.line((170, 402 - index * 6, 264, 394 - index * 4), fill=role["color"], width=2)
    for x in range(170, 274, 18):
        draw.rectangle((x, 422, x + 10, 434), fill=ORANGE if x % 36 else ACID)
    v3.text(draw, (180, 454), "航线已锁定 // 等待派遣", 8, ACID, anchor="mm")

    v3.draw_topbar(image, "外勤驾驶舱", f"当前员工  {role['employee']}  /  {role['class']}")
    v3.pixel_panel(draw, (16, 492, 344, 542), accent=role["color"], fill="#0b1416")
    v3.text(draw, (30, 512), role["style"], 10, role["color"], anchor="lm")
    v3.text(draw, (330, 528), "随机星球待命", 8, MUTED, anchor="rm")
    draw_nav(image, None)
    v3.save_ui(image, f"home_{role_id}")


def archive_screen(role_id: str, role, assets):
    image = v3.grid_background()
    draw = ImageDraw.Draw(image)
    v3.draw_topbar(image, "员工档案", "返回驾驶舱", show_credits=False)

    tab_boxes = [(8, 58, 120, 94), (124, 58, 236, 94), (240, 58, 352, 94)]
    for (other_id, other), box in zip(v3.ROLE_UI.items(), tab_boxes):
        v3.pixel_button(draw, box, other["class"], other["color"], active=other_id == role_id, font_size=10)

    v3.pixel_panel(draw, (8, 100, 352, 544), accent=role["color"], fill="#091214", border="#5b6864")
    v3.pixel_panel(draw, (18, 108, 148, 264), accent=role["color"], fill="#0d191b", border="#354744", shadow=False)
    portrait = assets["portrait"].resize((128, 128), Image.Resampling.NEAREST)
    image.alpha_composite(portrait, (20, 122))
    draw.line((28, 252, 138, 252), fill=role["color"], width=2)

    v3.text(draw, (160, 126), role["employee"], 17, role["color"])
    v3.text(draw, (160, 150), role["class"], 11, PAPER)
    v3.text(draw, (160, 172), role["style"], 8, role["color"])
    v3.text(draw, (160, 202), role["bio"][0], 8, PAPER)
    v3.text(draw, (160, 220), role["bio"][1], 8, PAPER)
    v3.text(draw, (160, 246), "已开放 // 可设为当前员工", 7, ACID)

    v3.text(draw, (20, 282), "代表技能", 10, PAPER)
    draw.line((82, 278, 340, 278), fill="#29403f", width=2)
    for x, (skill_id, name, desc_lines) in zip([18, 130, 242], role["skills"]):
        v3.pixel_panel(draw, (x, 290, x + 102, 362), accent=role["color"], fill="#0d191b", border="#354744", shadow=False)
        icon = v3.skill_icon(role_id, skill_id, role["color"]).resize((28, 28), Image.Resampling.NEAREST)
        image.alpha_composite(icon, (x + 6, 298))
        v3.text(draw, (x + 38, 308), name, 8, role["color"])
        v3.text(draw, (x + 38, 324), desc_lines[0], 6, PAPER)
        v3.text(draw, (x + 10, 348), desc_lines[1], 7, MUTED)

    v3.text(draw, (20, 380), "组合技", 10, PAPER)
    draw.line((70, 376, 340, 376), fill="#29403f", width=2)
    for y, (skill_id, name, desc) in zip([386, 422, 458], role["combos"]):
        v3.pixel_panel(draw, (18, y, 342, y + 30), accent=role["color"], fill="#0d191b", border="#354744", shadow=False)
        icon = v3.skill_icon(role_id, skill_id, role["color"]).resize((22, 22), Image.Resampling.NEAREST)
        image.alpha_composite(icon, (24, y + 4))
        v3.text(draw, (54, y + 11), name, 9, role["color"])
        v3.text(draw, (330, y + 20), desc, 7, PAPER, anchor="ra")

    v3.pixel_button(draw, (72, 500, 288, 538), "设为当前员工", role["color"], active=True, font_size=10)
    draw_nav(image, "档案")
    v3.save_ui(image, f"archive_{role_id}")


def activity_screen():
    image = v3.grid_background()
    draw = ImageDraw.Draw(image)
    v3.draw_topbar(image, "活动中心", "返回驾驶舱")
    v3.pixel_panel(draw, (14, 60, 346, 542), accent=ORANGE, fill="#0b1416")
    v3.text(draw, (30, 90), "外勤出勤签到", 20, PAPER)
    v3.text(draw, (330, 90), "连续 3 天", 9, ORANGE, anchor="ra")
    v3.text(draw, (30, 114), "公司承诺：签到奖励不计入加班费。", 8, MUTED)

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
        v3.pixel_panel(draw, (x, y, x + width, y + 96), accent=ACID if completed else ORANGE,
                       fill="#263612" if completed else PANEL, border=ACID if completed else EDGE, shadow=False)
        v3.text(draw, (x + width // 2, y + 20), f"第{index + 1}天", 8, INK if completed else MUTED, anchor="mm")
        icon = v3.load_icon("credits", 30)
        if icon:
            image.alpha_composite(icon, (x + (width - 30) // 2, y + 30))
        v3.text(draw, (x + width // 2, y + 72), f"金币 × {rewards[index]}", 7, PAPER, anchor="mm")
        v3.text(draw, (x + width // 2, y + 86), "已领取" if completed else "待签到", 7,
                ACID if completed else MUTED, anchor="mm")

    v3.pixel_panel(draw, (28, 370, 332, 466), accent=CYAN, fill="#0d191b", shadow=False)
    v3.text(draw, (44, 394), "累计出勤奖励", 13, CYAN)
    draw.rectangle((44, 414, 316, 426), fill="#252e2f")
    draw.rectangle((46, 416, 160, 424), fill=CYAN)
    v3.text(draw, (44, 446), "3 / 7 天", 9, PAPER)
    v3.text(draw, (316, 446), "终极奖励：任务金币 × 60", 8, ORANGE, anchor="ra")
    v3.pixel_button(draw, (72, 480, 288, 528), "今日已签到", ACID, active=True, font_size=10)
    draw_nav(image, "活动")
    v3.save_ui(image, "activity_checkin")


def daily_tasks_screen():
    image = v3.grid_background()
    draw = ImageDraw.Draw(image)
    v3.draw_topbar(image, "每日任务", "04:00 自动刷新")
    v3.pixel_panel(draw, (14, 60, 346, 542), accent=ORANGE, fill="#0b1416")
    v3.text(draw, (30, 88), "今日绩效", 19, PAPER)
    v3.text(draw, (330, 88), "活跃度 55 / 100", 9, ORANGE, anchor="ra")
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
        v3.pixel_panel(draw, (26, y, 334, y + 92), accent=accent, fill="#0d191b", shadow=False)
        icon = v3.load_icon("success" if ratio >= 1 else "mission", 30)
        if icon:
            image.alpha_composite(icon, (38, y + 16))
        v3.text(draw, (78, y + 28), label, 11, PAPER)
        v3.text(draw, (318, y + 28), progress, 9, accent if ratio >= 1 else MUTED, anchor="ra")
        draw.rectangle((78, y + 46, 236, y + 56), fill="#252e2f")
        if ratio > 0:
            draw.rectangle((80, y + 48, 80 + round(154 * ratio), y + 54), fill=accent)
        v3.text(draw, (78, y + 74), f"奖励  任务金币 × {reward}", 8, ORANGE)
        v3.pixel_button(draw, (250, y + 54, 320, y + 82), "领取" if ratio >= 1 else "进行中",
                        accent, active=ratio >= 1, font_size=8)
        y += 102
    v3.text(draw, (180, 516), "完成每日绩效可获得阶段资源箱", 8, MUTED, anchor="mm")
    draw_nav(image, "任务")
    v3.save_ui(image, "daily_tasks")


def upgrade_screen():
    image = v3.grid_background()
    draw = ImageDraw.Draw(image)
    v3.draw_topbar(image, "飞船升级", "返回驾驶舱")
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
        v3.pixel_panel(draw, (12, y, 348, y + 90), accent=accent, fill="#0b1416")
        icon = v3.load_icon(icon_name, 40)
        if icon:
            image.alpha_composite(icon, (24, y + 18))
        v3.text(draw, (78, y + 26), name, 13, PAPER)
        v3.text(draw, (78, y + 46), f"LV.{level} / 5", 8, accent)
        v3.text(draw, (78, y + 66), desc, 8, MUTED)
        v3.pixel_button(draw, (258, y + 18, 336, y + 72), f"升级 {cost}", ACID, active=True, font_size=8)
        y += 96
    draw_nav(image, "升级")
    v3.save_ui(image, "upgrade")


def copy_battle_screens():
    for name in ("beacon_rust", "beacon_spore", "beacon_moon"):
        for suffix in (".png", "_2x.png"):
            shutil.copy2(V3_ROOT / "ui" / f"{name}{suffix}", UI_DIR / f"{name}{suffix}")


def nav_component_states():
    logical = Image.new("RGBA", (360, 550), INK)
    draw = ImageDraw.Draw(logical)
    states = [(None, "默认"), ("档案", "档案选中"), ("活动", "活动选中"), ("任务", "任务选中"), ("升级", "升级选中")]
    for index, (active, label) in enumerate(states):
        row_top = index * 110
        draw.rectangle((0, row_top, 359, row_top + 109), fill="#0a0f10")
        shadow_text(draw, (8, row_top + 8), label, 7, MUTED, anchor="la")
        draw_nav_layout(logical, active, row_top + 18)
    logical.convert("RGB").resize((720, 1100), Image.Resampling.NEAREST).save(UI_DIR / "nav_component_states.png")


def overview():
    names = [
        "home_mia", "home_kade", "home_locke", "archive_mia",
        "archive_kade", "archive_locke", "activity_checkin", "daily_tasks",
        "upgrade", "beacon_rust", "beacon_spore", "beacon_moon",
    ]
    canvas = Image.new("RGB", (720, 1020), INK)
    draw = ImageDraw.Draw(canvas)
    v3.text(draw, (24, 34), "《星际外勤》V3.1 参考式导航评审 // 12 SCREENS", 20, CYAN)
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
        "version": "3.1",
        "reviewOnly": True,
        "gameCodeModified": False,
        "logicalSize": [360, 640],
        "previewSize": [720, 1280],
        "scaling": "nearest-neighbor",
        "contentSafeBottom": CONTENT_SAFE_BOTTOM,
        "navigation": {
            "layout": "continuous-base-raised-center",
            "labels": [item[0] for item in NAV_ITEMS],
            "overallRect": {"x": 0, "y": NAV_TOP, "width": 360, "height": 92},
            "baseRect": {"x": 0, "y": NAV_BASE_TOP, "width": 360, "height": 60},
            "hitRects": HIT_RECTS,
            "iconRects": ICON_RECTS,
            "sideIconSize": 38,
            "dispatchIconSize": 54,
            "sideLabelFontSize": 10,
            "dispatchLabelFontSize": 12,
            "badges": BADGE_RECTS,
            "palette": {
                "base": METAL,
                "baseHighlight": METAL_LIGHT,
                "copper": COPPER,
                "dispatch": DISPATCH_FILL,
                "dispatchAccent": ACID,
            },
        },
        "joystick": {
            "center": [180, 560],
            "imageRect": {"x": 136, "y": 516, "width": 88, "height": 88},
            "unchangedFrom": "../v3_ui_review",
        },
        "screens": [f"ui/{name}.png" for name in screens],
        "previews": [f"ui/{name}_2x.png" for name in screens],
        "overview": "ui/ui_overview.png",
        "navigationStates": "ui/nav_component_states.png",
    }
    (ROOT / "ui_specs.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "review_manifest.json").write_text(json.dumps({
        "version": "3.1",
        "uiScreens": payload["screens"],
        "uiPreviews": payload["previews"],
        "uiSpecs": "ui_specs.json",
        "sourceReviewPack": "../v3_ui_review",
        "battleScreensCopiedUnchanged": True,
        "gameCodeModified": False,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    for directory in (ROOT, UI_DIR, ICON_DIR, CHAR_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    characters = v3.v2.load_character_assets()
    for role_id, role in v3.ROLE_UI.items():
        home_screen(role_id, role, characters[role_id])
        archive_screen(role_id, role, characters[role_id])
    activity_screen()
    daily_tasks_screen()
    upgrade_screen()
    copy_battle_screens()
    nav_component_states()
    overview()
    write_specs()

    print(json.dumps({
        "logicalScreens": 12,
        "doublePreviews": 12,
        "updatedNavigationScreens": 9,
        "copiedBattleScreens": 3,
        "navigation": "continuous-base-raised-center",
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
