"""Validate the V8 moon planet icon/cover replacement and runtime wiring."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
REVIEW = ROOT / "assets" / "concepts" / "v8_moon_style_review" / "planets" / "moon"
RUNTIME = GAME / "planets" / "moon"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_image(path: Path, size: tuple[int, int], errors: list[str]) -> Image.Image | None:
    if not path.exists():
        errors.append(f"missing:{path.relative_to(ROOT)}")
        return None
    image = Image.open(path)
    if image.mode != "RGBA":
        errors.append(f"mode:{path.relative_to(ROOT)}:{image.mode}")
    if image.size != size:
        errors.append(f"size:{path.relative_to(ROOT)}:{image.size}")
    alpha = image.getchannel("A")
    values = set(alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata())
    if not values.issubset({0, 255}):
        errors.append(f"soft-alpha:{path.relative_to(ROOT)}")
    if alpha.getpixel((0, 0)) != 0 or alpha.getpixel((image.width - 1, 0)) != 0 \
            or alpha.getpixel((0, image.height - 1)) != 0 \
            or alpha.getpixel((image.width - 1, image.height - 1)) != 0:
        errors.append(f"opaque-corner:{path.relative_to(ROOT)}")
    return image


def main() -> None:
    errors: list[str] = []
    review_icon = check_image(REVIEW / "planet_moon.png", (32, 32), errors)
    review_cover = check_image(REVIEW / "moon_cover.png", (128, 128), errors)
    runtime_icon = check_image(RUNTIME / "planet_moon.png", (32, 32), errors)
    runtime_cover = check_image(RUNTIME / "moon_cover.png", (128, 128), errors)

    if review_icon is not None and review_cover is not None:
        expected = review_icon.resize((128, 128), Image.Resampling.NEAREST)
        if ImageChops.difference(expected, review_cover).getbbox() is not None:
            errors.append("cover-not-nearest-neighbor-derived")
    if review_icon is not None and runtime_icon is not None:
        if ImageChops.difference(review_icon, runtime_icon).getbbox() is not None:
            errors.append("runtime-icon-differs-from-review")
    if review_cover is not None and runtime_cover is not None:
        if ImageChops.difference(review_cover, runtime_cover).getbbox() is not None:
            errors.append("runtime-cover-differs-from-review")

    rust = GAME / "ui" / "icons" / "planet_rust.png"
    if rust.exists() and review_icon is not None:
        rust_bbox = Image.open(rust).convert("RGBA").getchannel("A").getbbox()
        moon_bbox = review_icon.getchannel("A").getbbox()
        if rust_bbox and moon_bbox:
            rust_area = (rust_bbox[2] - rust_bbox[0]) * (rust_bbox[3] - rust_bbox[1])
            moon_area = (moon_bbox[2] - moon_bbox[0]) * (moon_bbox[3] - moon_bbox[1])
            if abs(moon_area - rust_area) > 32:
                errors.append(f"silhouette-area-mismatch:{rust_area}:{moon_area}")

    manifest_path = GAME / "v8_moon_style_manifest.json"
    if not manifest_path.exists():
        errors.append("missing:v8_moon_style_manifest.json")
        manifest = {}
    else:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for key, expected in (("icon", "assets/game/planets/moon/planet_moon.png"), ("cover", "assets/game/planets/moon/moon_cover.png")):
            if manifest.get(key, {}).get("path") != expected:
                errors.append(f"manifest-path:{key}")
        if runtime_icon is not None and manifest.get("icon", {}).get("sha256") != sha256(RUNTIME / "planet_moon.png"):
            errors.append("manifest-hash:icon")
        if runtime_cover is not None and manifest.get("cover", {}).get("sha256") != sha256(RUNTIME / "moon_cover.png"):
            errors.append("manifest-hash:cover")

    source = (ROOT / "src" / "game-core.js").read_text(encoding="utf-8")
    if "planet.moon.cover" not in source or "planet.moon.icon" not in source:
        errors.append("game-core-moon-asset-wiring-missing")
    if "ctx.fillRect(10, 4, 58, 70)" in source:
        errors.append("legacy-rectangular-moon-fallback-present")

    result = {
        "passed": not errors,
        "reviewIcon": str((REVIEW / "planet_moon.png").relative_to(ROOT)).replace("\\", "/"),
        "reviewCover": str((REVIEW / "moon_cover.png").relative_to(ROOT)).replace("\\", "/"),
        "runtimeIcon": str((RUNTIME / "planet_moon.png").relative_to(ROOT)).replace("\\", "/"),
        "runtimeCover": str((RUNTIME / "moon_cover.png").relative_to(ROOT)).replace("\\", "/"),
        "errors": errors,
    }
    (GAME / "v8_moon_style_validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0 if not errors else 1)


if __name__ == "__main__":
    main()
