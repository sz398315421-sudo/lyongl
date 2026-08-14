"""Build V5 warrior/mechanic skill icon review assets.

The source icons are the existing V4 concept icons.  This pass keeps their
silhouette semantics while applying the gunner icon contract: large centred
subjects, a shared dark outline, cyan/ivory highlights and small role accents.
All output is review-only and is intentionally written below
assets/concepts/v5_skill_icon_review.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets" / "concepts" / "v4_role_redraw" / "skills"
OUT_ROOT = ROOT / "assets" / "concepts" / "v5_skill_icon_review" / "skills"

ROLE_SPECS = {
    "warrior": {
        "source": SOURCE_ROOT / "warrior" / "icons",
        "accent": (255, 116, 71, 255),
        "accent2": (255, 215, 90, 255),
        "accent_hue": "warm",
    },
    "mechanic": {
        "source": SOURCE_ROOT / "mechanic" / "icons",
        "accent": (217, 255, 87, 255),
        "accent2": (84, 185, 255, 255),
        "accent_hue": "cool",
    },
}

INK = (7, 12, 15, 255)
INK_2 = (17, 27, 30, 255)
CYAN = (81, 217, 209, 255)
CYAN_DARK = (32, 125, 137, 255)
IVORY = (232, 231, 207, 255)
SILVER = (159, 171, 161, 255)


def load_manifest(role: str) -> dict:
    path = ROLE_SPECS[role]["source"] / f"{role}_skill_icons.json"
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def nearest_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.resize(size, Image.Resampling.NEAREST)


def hard_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = []
    for r, g, b, a in image.getdata():
        pixels.append((r, g, b, 255 if a >= 128 else 0))
    image.putdata(pixels)
    return image


def prune_stray_pixels(image: Image.Image, min_component: int = 10) -> Image.Image:
    """Remove isolated matte/spark remnants from the old concept sheets."""

    image = image.convert("RGBA")
    alpha = image.getchannel("A")
    px = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if px[x, y] == 0 or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx in range(cx - 1, cx + 2):
                    for ny in range(cy - 1, cy + 2):
                        if 0 <= nx < alpha.width and 0 <= ny < alpha.height:
                            if px[nx, ny] and (nx, ny) not in visited:
                                visited.add((nx, ny))
                                stack.append((nx, ny))
            components.append(component)
    for component in components:
        if len(component) < min_component:
            for x, y in component:
                image.putpixel((x, y), (0, 0, 0, 0))
    return image


def alpha_components(image: Image.Image) -> list[list[tuple[int, int]]]:
    alpha = image.getchannel("A")
    px = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if px[x, y] == 0 or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx in range(cx - 1, cx + 2):
                    for ny in range(cy - 1, cy + 2):
                        if 0 <= nx < alpha.width and 0 <= ny < alpha.height:
                            if px[nx, ny] and (nx, ny) not in visited:
                                visited.add((nx, ny))
                                stack.append((nx, ny))
            components.append(component)
    return components


def connect_components(image: Image.Image) -> Image.Image:
    """Join multi-part silhouettes with a one-pixel dark pixel-art bridge.

    Gunner's reference icons use one readable silhouette, while some old role
    icons contain detached sparks or blades.  Connecting those parts preserves
    the semantic pieces and also prevents the transparent verifier from treating
    them as stray pixels.
    """

    image = image.convert("RGBA")
    draw = ImageDraw.Draw(image)
    while True:
        components = alpha_components(image)
        if len(components) <= 1:
            return image
        main = max(components, key=len)
        main_set = set(main)
        for component in sorted(components, key=len, reverse=True):
            if component is main:
                continue
            p1, p2 = min(
                ((a, b) for a in main for b in component),
                key=lambda pair: (pair[0][0] - pair[1][0]) ** 2 + (pair[0][1] - pair[1][1]) ** 2,
            )
            draw.line((p1, p2), fill=INK, width=1)
            main_set.update(component)
        # Recompute after all bridges; a single pass is normally enough, but
        # keeping the loop makes diagonal one-pixel joins deterministic.


def luminance(r: int, g: int, b: int) -> int:
    return int(0.299 * r + 0.587 * g + 0.114 * b)


def classify_source(r: int, g: int, b: int) -> str:
    """Return a stable material class from the old concept palette."""

    lum = luminance(r, g, b)
    if max(r, g, b) < 65 or lum < 42:
        return "ink"
    if lum > 220:
        return "ivory"
    if b > r + 30 and g > r + 5:
        return "cyan"
    if g > r + 28 and g > b + 5:
        return "green"
    if r > b + 35 and r > g + 8:
        return "warm"
    if lum > 155:
        return "silver"
    return "cyan_dark"


def recolor(image: Image.Image, role: str) -> Image.Image:
    spec = ROLE_SPECS[role]
    accent = spec["accent"]
    accent2 = spec["accent2"]
    output = []
    width, height = image.size
    for index, (r, g, b, a) in enumerate(image.getdata()):
        if a == 0:
            output.append((0, 0, 0, 0))
            continue
        x, y = index % width, index // width
        material = classify_source(r, g, b)
        if material == "ink":
            color = INK
        elif material == "ivory":
            color = IVORY
        elif material == "silver":
            color = SILVER
        elif material == "cyan":
            color = CYAN
        elif material == "cyan_dark":
            color = CYAN_DARK
        elif material == "warm":
            # Keep the gunner contract (cyan/ivory body) and reserve the
            # warrior orange for a sparse readable accent pattern.
            if role == "warrior" and (x * 7 + y * 11) % 9 > 1:
                color = IVORY if luminance(r, g, b) > 165 else CYAN
            else:
                color = accent
        elif material == "green":
            if role == "warrior":
                color = CYAN_DARK
            else:
                color = accent
        else:
            color = accent2 if role == "mechanic" else CYAN
        output.append(color[:3] + (255,))
    image.putdata(output)
    return image


def fit_subject(source: Image.Image) -> Image.Image:
    source = connect_components(prune_stray_pixels(hard_alpha(source)))
    bbox = source.getchannel("A").getbbox()
    if not bbox:
        return Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    subject = source.crop(bbox)
    max_dim = max(subject.size)
    target_dim = min(52, max_dim)
    scale = target_dim / max_dim
    target = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = nearest_resize(subject, target)
    canvas = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    left = (64 - subject.width) // 2
    top = (64 - subject.height) // 2
    canvas.alpha_composite(subject, (left, top))
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(path, format="PNG", optimize=False)


def checkerboard(size: tuple[int, int], cell: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, (20, 27, 30, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if ((x // cell) + (y // cell)) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(27, 36, 39, 255))
    return image


def make_overview(images: list[Image.Image], path: Path, scale: int = 1) -> None:
    cell = 64
    base = checkerboard((cell * 5, cell * 3))
    for index, image in enumerate(images):
        x = (index % 5) * cell
        y = (index // 5) * cell
        base.alpha_composite(image, (x, y))
    if scale != 1:
        base = nearest_resize(base, (base.width * scale, base.height * scale))
    save_png(base, path)


def make_readability(images: list[Image.Image], path: Path) -> None:
    scales = (24, 32, 64)
    cell_sizes = (40, 48, 80)
    panel_heights = [cell * 3 for cell in cell_sizes]
    width = max(5 * cell for cell in cell_sizes)
    height = sum(panel_heights) + 16
    canvas = checkerboard((width, height), 8)
    panel_y = 4
    for icon_size, cell, panel_height in zip(scales, cell_sizes, panel_heights):
        for index, image in enumerate(images):
            scaled = nearest_resize(image, (icon_size, icon_size))
            x = index % 5 * cell + (cell - icon_size) // 2
            y = panel_y + (index // 5) * cell + (cell - icon_size) // 2
            canvas.alpha_composite(scaled, (x, y))
        panel_y += panel_height + 8
    save_png(canvas, path)


def make_comparison(role_images: dict[str, list[Image.Image]], path: Path) -> None:
    width, row_height = 320, 192
    canvas = checkerboard((width, row_height * 3), 8)
    for row, role in enumerate(("gunner", "warrior", "mechanic")):
        if role == "gunner":
            source = ROOT / "assets" / "game" / "skills" / "gunner" / "icons"
            manifest_path = source / "gunner_skill_icons.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            images = []
            for item in manifest["icons"].values():
                images.append(Image.open(source / item["image"]).convert("RGBA"))
        else:
            images = role_images[role]
        for index, image in enumerate(images):
            x = (index % 5) * 64
            y = row * row_height + (index // 5) * 64
            canvas.alpha_composite(image, (x, y))
    save_png(canvas, path)
    save_png(nearest_resize(canvas, (canvas.width * 2, canvas.height * 2)), path.with_name(path.stem + "_2x.png"))


def build_role(role: str) -> list[Image.Image]:
    spec = ROLE_SPECS[role]
    manifest = load_manifest(role)
    out_dir = OUT_ROOT / role / "icons"
    images = []
    for skill_id, item in manifest["icons"].items():
        source_path = spec["source"] / item["image"]
        image = Image.open(source_path).convert("RGBA")
        image = recolor(image, role)
        image = fit_subject(image)
        save_png(image, out_dir / f"{skill_id}.png")
        images.append(image)

    out_manifest = {
        "classId": role,
        "frameWidth": 64,
        "frameHeight": 64,
        "anchor": {"x": 32, "y": 32},
        "imageSmoothingEnabled": False,
        "styleReference": "gunner",
        "reviewOnly": True,
        "icons": {
            skill_id: {
                "image": f"{skill_id}.png",
                "type": item["type"],
                "frameWidth": 64,
                "frameHeight": 64,
                "anchor": {"x": 32, "y": 32},
            }
            for skill_id, item in manifest["icons"].items()
        },
    }
    manifest_path = OUT_ROOT / role / "icons" / f"{role}_skill_icons.json"
    manifest_path.write_text(json.dumps(out_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    make_overview(images, OUT_ROOT / role / f"{role}_skill_icons_preview.png")
    make_overview(images, OUT_ROOT / role / f"{role}_skill_icons_preview_2x.png", scale=2)
    make_readability(images, OUT_ROOT / role / f"{role}_skill_icons_readability.png")
    return images


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    role_images = {role: build_role(role) for role in ROLE_SPECS}
    make_comparison(role_images, OUT_ROOT / "three_role_skill_icons_comparison.png")
    summary = {
        "review": "V5 skill icon redraw",
        "styleReference": "assets/game/skills/gunner/icons",
        "roles": {role: len(images) for role, images in role_images.items()},
        "frame": {"width": 64, "height": 64, "anchor": {"x": 32, "y": 32}},
        "imageSmoothingEnabled": False,
    }
    (OUT_ROOT.parent / "v5_skill_icon_review_manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
