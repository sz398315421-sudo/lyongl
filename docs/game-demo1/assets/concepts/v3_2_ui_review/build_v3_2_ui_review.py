from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
GAME = ROOT.parents[2]
V31_ROOT = ROOT.parent / "v3_1_ui_review"
UI_DIR = ROOT / "ui"
ICON_DIR = ROOT / "icons"
CHAR_DIR = ROOT / "characters"

spec = importlib.util.spec_from_file_location("v31_ui_builder", V31_ROOT / "build_v3_1_ui_review.py")
if spec is None or spec.loader is None:
    raise RuntimeError("无法载入 V3.1 评审包生成器")
v31 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v31)

v31.ROOT = ROOT
v31.UI_DIR = UI_DIR
v31.ICON_DIR = ICON_DIR
v31.CHAR_DIR = CHAR_DIR
v31.v3.ROOT = ROOT
v31.v3.UI_DIR = UI_DIR
v31.v3.ICON_DIR = ICON_DIR
v31.v3.CHAR_DIR = CHAR_DIR
v31.v3.v2.CHAR_DIR = CHAR_DIR


INK = v31.INK
VOID = v31.VOID
PAPER = v31.PAPER
MUTED = v31.MUTED
CYAN = v31.CYAN
ACID = v31.ACID
ORANGE = v31.ORANGE

RAIL = "#050a0e"
RAIL_EDGE = "#263b44"
BUTTON = "#0b151b"
BUTTON_INNER = "#101f27"
BUTTON_ACTIVE = "#15313a"
BUTTON_PRIMARY = "#1b2911"
DIM_EDGE = "#52666d"

NAV_TOP = 568
BUTTON_TOP = 572
BUTTON_BOTTOM = 638
BUTTON_WIDTH = 68
BUTTON_X = [4, 75, 146, 217, 288]
LABELS = ["档案", "活动", "派遣", "任务", "升级"]
ACCENTS = [CYAN, ORANGE, ACID, ORANGE, CYAN]

VISUAL_RECTS = [
    {"label": label, "x": x, "y": BUTTON_TOP, "width": BUTTON_WIDTH, "height": BUTTON_BOTTOM - BUTTON_TOP}
    for label, x in zip(LABELS, BUTTON_X)
]
HIT_RECTS = [
    {"label": label, "x": index * 72, "y": NAV_TOP, "width": 72, "height": 72}
    for index, label in enumerate(LABELS)
]


def tech_points(box, cut=6, offset=(0, 0)):
    x0, y0, x1, y1 = box
    ox, oy = offset
    return [
        (x0 + cut + ox, y0 + oy), (x1 - cut + ox, y0 + oy),
        (x1 + ox, y0 + cut + oy), (x1 + ox, y1 - cut + oy),
        (x1 - cut + ox, y1 + oy), (x0 + cut + ox, y1 + oy),
        (x0 + ox, y1 - cut + oy), (x0 + ox, y0 + cut + oy),
    ]


def shadow_text(draw: ImageDraw.ImageDraw, xy, value, size, fill, anchor="mm"):
    x, y = xy
    draw.text((x + 1, y + 1), value, font=v31.v3.font(size), fill=VOID, anchor=anchor)
    draw.text((x, y), value, font=v31.v3.font(size), fill=fill, anchor=anchor)


def draw_tech_button(draw: ImageDraw.ImageDraw, box, label, accent, active=False, primary=False):
    x0, y0, x1, y1 = box
    fill = BUTTON_ACTIVE if active else (BUTTON_PRIMARY if primary else BUTTON)
    edge = accent if active or primary else DIM_EDGE

    draw.polygon(tech_points(box, offset=(2, 2)), fill=VOID)
    draw.polygon(tech_points(box), fill=fill, outline=edge)
    draw.polygon(tech_points((x0 + 3, y0 + 3, x1 - 3, y1 - 3), cut=4), fill=BUTTON_INNER if not primary else BUTTON_PRIMARY)

    draw.line((x0 + 8, y0 + 4, x0 + 28, y0 + 4), fill=accent, width=2)
    draw.line((x1 - 22, y1 - 4, x1 - 8, y1 - 4), fill=accent, width=2)
    draw.rectangle((x1 - 10, y0 + 7, x1 - 7, y0 + 10), fill=accent)
    draw.line((x0 + 8, y0 + 14, x0 + 14, y0 + 14), fill="#35515b", width=2)
    draw.line((x0 + 14, y0 + 14, x0 + 14, y0 + 20), fill="#35515b", width=2)
    draw.line((x1 - 14, y1 - 20, x1 - 14, y1 - 14), fill="#35515b", width=2)
    draw.line((x1 - 14, y1 - 14, x1 - 8, y1 - 14), fill="#35515b", width=2)

    if active:
        draw.rectangle((x0 + 8, y0 + 8, x1 - 8, y0 + 11), fill=accent)
        draw.rectangle((x0 + 4, y0 + 16, x0 + 6, y1 - 16), fill=accent)

    text_color = accent if active or primary else PAPER
    shadow_text(draw, ((x0 + x1) // 2, (y0 + y1) // 2 + 4), label, 12, text_color)


def draw_nav_layout(image: Image.Image, active: str | None, top=NAV_TOP):
    draw = ImageDraw.Draw(image)
    offset = top - NAV_TOP
    rail_top = NAV_TOP + offset
    button_top = BUTTON_TOP + offset
    button_bottom = BUTTON_BOTTOM + offset

    draw.rectangle((0, rail_top, 359, button_bottom + 2), fill=RAIL)
    draw.rectangle((0, rail_top, 359, rail_top + 2), fill=RAIL_EDGE)
    draw.line((8, rail_top + 5, 352, rail_top + 5), fill="#10232b", width=2)

    for label, accent, x in zip(LABELS, ACCENTS, BUTTON_X):
        draw_tech_button(
            draw,
            (x, button_top, x + BUTTON_WIDTH, button_bottom),
            label,
            accent,
            active=label == active,
            primary=label == "派遣",
        )


def draw_nav(image: Image.Image, active: str | None):
    draw_nav_layout(image, active, NAV_TOP)


def nav_component_states():
    logical = Image.new("RGBA", (360, 420), INK)
    draw = ImageDraw.Draw(logical)
    states = [(None, "默认"), ("档案", "档案选中"), ("活动", "活动选中"), ("任务", "任务选中"), ("升级", "升级选中")]
    for index, (active, state_label) in enumerate(states):
        row = index * 84
        draw.rectangle((0, row, 359, row + 83), fill="#080e11")
        shadow_text(draw, (8, row + 8), state_label, 7, MUTED, anchor="la")
        draw_nav_layout(logical, active, row + 12)
    logical.convert("RGB").resize((720, 840), Image.Resampling.NEAREST).save(UI_DIR / "nav_text_button_states.png")


def overview():
    names = [
        "home_mia", "home_kade", "home_locke", "archive_mia",
        "archive_kade", "archive_locke", "activity_checkin", "daily_tasks",
        "upgrade", "beacon_rust", "beacon_spore", "beacon_moon",
    ]
    canvas = Image.new("RGB", (720, 1020), INK)
    draw = ImageDraw.Draw(canvas)
    v31.v3.text(draw, (24, 34), "《星际外勤》V3.2 纯文字科技按钮评审 // 12 SCREENS", 20, CYAN)
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
        "version": "3.2",
        "reviewOnly": True,
        "gameCodeModified": False,
        "logicalSize": [360, 640],
        "previewSize": [720, 1280],
        "scaling": "nearest-neighbor",
        "contentSafeBottom": 544,
        "navigation": {
            "layout": "equal-width-text-only-tech-buttons",
            "labels": LABELS,
            "overallRect": {"x": 0, "y": NAV_TOP, "width": 360, "height": 72},
            "visualRects": VISUAL_RECTS,
            "hitRects": HIT_RECTS,
            "gap": 3,
            "outerMargin": 4,
            "fontSize": 12,
            "icons": False,
            "badges": False,
            "raisedCenter": False,
            "dispatchPrimaryColor": ACID,
        },
        "joystick": {
            "center": [180, 560],
            "imageRect": {"x": 136, "y": 516, "width": 88, "height": 88},
            "unchangedFrom": "../v3_ui_review",
        },
        "screens": [f"ui/{name}.png" for name in screens],
        "previews": [f"ui/{name}_2x.png" for name in screens],
        "overview": "ui/ui_overview.png",
        "navigationStates": "ui/nav_text_button_states.png",
    }
    (ROOT / "ui_specs.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "review_manifest.json").write_text(json.dumps({
        "version": "3.2",
        "uiScreens": payload["screens"],
        "uiPreviews": payload["previews"],
        "uiSpecs": "ui_specs.json",
        "sourceReviewPack": "../v3_1_ui_review",
        "battleScreensCopiedUnchanged": True,
        "gameCodeModified": False,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    for directory in (ROOT, UI_DIR, ICON_DIR, CHAR_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    characters = v31.v3.v2.load_character_assets()
    for role_id, role in v31.v3.ROLE_UI.items():
        v31.home_screen(role_id, role, characters[role_id])
        v31.archive_screen(role_id, role, characters[role_id])
    v31.activity_screen()
    v31.daily_tasks_screen()
    v31.upgrade_screen()
    v31.copy_battle_screens()
    nav_component_states()
    overview()
    write_specs()

    print(json.dumps({
        "logicalScreens": 12,
        "doublePreviews": 12,
        "updatedNavigationScreens": 9,
        "navigation": "equal-width-text-only-tech-buttons",
        "icons": False,
        "badges": False,
    }, ensure_ascii=False))


v31.draw_nav_layout = draw_nav_layout
v31.draw_nav = draw_nav


if __name__ == "__main__":
    main()
