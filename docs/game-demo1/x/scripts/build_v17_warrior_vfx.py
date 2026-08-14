from __future__ import annotations

"""Build and validate the V17 warrior combat VFX review package.

GPT-Image 2 creates controlled 4x2 storyboard masters in
tmp/imagegen/v17_warrior_vfx. This script crops the cells, preserves the
provider order, assembles the requested frame counts, and writes only the
review directory (never assets/game).
"""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v17_warrior_vfx_review"
TMP = ROOT / "tmp" / "imagegen" / "v17_warrior_vfx"

JOBS = {
    "star_ring": {
        "classId": "warrior", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 12, "loop": True, "blendMode": "lighter",
        "anchor": {"x": 48, "y": 48}, "eventUnit": "orbit_pulse",
        "palette": "orange-gold oblique ellipse with cyan-white sword glints",
        "assetType": "persistent_combo_vfx",
    },
    "slash_arc": {
        "classId": "warrior", "frameWidth": 64, "frameHeight": 64,
        "frameCount": 5, "fps": 16, "loop": False, "blendMode": "source-over",
        "anchor": {"x": 32, "y": 32}, "eventUnit": "melee_attack",
        "palette": "cyan-white stepped crescent with orange-red start spark",
        "assetType": "melee_vfx",
    },
    "sword_wave": {
        "classId": "warrior", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter",
        "anchor": {"x": 48, "y": 48}, "eventUnit": "melee_swing",
        "palette": "white-cyan layered sword waves with orange-red core",
        "assetType": "combo_vfx",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scrub_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, 255 if a >= 128 else 0) if a >= 128 else (0, 0, 0, 0)
    # Keep a transparent safety border for strict runtime compositing.
    for x in range(image.width):
        pixels[x, 0] = (0, 0, 0, 0)
        pixels[x, image.height - 1] = (0, 0, 0, 0)
    for y in range(image.height):
        pixels[0, y] = (0, 0, 0, 0)
        pixels[image.width - 1, y] = (0, 0, 0, 0)
    return image


def prepare_cells() -> None:
    for asset_id, spec in JOBS.items():
        source = TMP / f"{asset_id}_source.png"
        if not source.exists():
            raise SystemExit(f"missing storyboard source: {source}")
        image = Image.open(source).convert("RGBA")
        columns, rows = (2, 4) if image.height > image.width * 1.25 else (4, 2)
        cell_w = image.width / float(columns)
        cell_h = image.height / float(rows)
        folder = TMP / "cells" / asset_id
        folder.mkdir(parents=True, exist_ok=True)
        for frame in range(8):
            column, row = frame % columns, frame // columns
            gutter = max(14, min(round(cell_w), round(cell_h)) // 28)
            left = round(column * cell_w + gutter)
            top = round(row * cell_h + gutter)
            right = round((column + 1) * cell_w - gutter)
            bottom = round((row + 1) * cell_h - gutter)
            crop = image.crop((left, top, right, bottom))
            pad = max(12, min(crop.width, crop.height) // 24)
            matte = crop.getpixel((0, 0))[:3]
            padded = Image.new("RGBA", (crop.width + pad * 2, crop.height + pad * 2), (*matte, 255))
            padded.alpha_composite(crop, (pad, pad))
            padded.save(folder / f"source_{frame:02d}.png")


def finalize() -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    for asset_id, spec in JOBS.items():
        frame_w, frame_h = spec["frameWidth"], spec["frameHeight"]
        frames = []
        for index in range(spec["frameCount"]):
            extracted = TMP / "extracted" / asset_id / f"frame_{index:02d}.png"
            source = TMP / "cells" / asset_id / f"source_{index:02d}.png"
            path = extracted if extracted.exists() else source
            if not path.exists():
                raise SystemExit(f"missing frame source: {path}")
            frame = Image.open(path).convert("RGBA").resize((frame_w, frame_h), Image.Resampling.NEAREST)
            frames.append(scrub_alpha(frame))

        folder = REVIEW / "vfx" / asset_id
        frame_folder = folder / "frames"
        frame_folder.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(frames):
            frame.save(frame_folder / f"frame_{index:02d}.png")

        sheet = Image.new("RGBA", (frame_w * spec["frameCount"], frame_h), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (index * frame_w, 0))
        sheet.save(folder / f"{asset_id}.png")
        sheet.resize((sheet.width * 4, sheet.height * 4), Image.Resampling.NEAREST).save(folder / f"{asset_id}_4x.png")

        alpha_preview = Image.new("RGBA", (frame_w * spec["frameCount"] * 4, frame_h * 4), (17, 22, 24, 255))
        for index, frame in enumerate(frames):
            mask = frame.getchannel("A").resize((frame_w * 4, frame_h * 4), Image.Resampling.NEAREST)
            mask_rgba = Image.new("RGBA", mask.size, (242, 246, 234, 255))
            mask_rgba.putalpha(mask)
            alpha_preview.alpha_composite(mask_rgba, (index * frame_w * 4, 0))
        alpha_preview.save(folder / f"{asset_id}_alpha_check.png")

        gif_frames = []
        for frame in frames:
            bg = Image.new("RGBA", frame.size, (11, 16, 18, 255))
            bg.alpha_composite(frame)
            gif_frames.append(bg.convert("P", palette=Image.Palette.ADAPTIVE, colors=96))
        kwargs = {"save_all": True, "append_images": gif_frames[1:], "duration": max(1, round(1000 / spec["fps"])), "disposal": 2}
        if spec["loop"]:
            kwargs["loop"] = 0
        gif_frames[0].save(folder / f"{asset_id}.gif", **kwargs)

        payload = {
            "id": asset_id, "classId": spec["classId"], "assetType": spec["assetType"],
            "frameWidth": frame_w, "frameHeight": frame_h, "frameCount": spec["frameCount"],
            "fps": spec["fps"], "loop": spec["loop"], "anchor": spec["anchor"],
            "blendMode": spec["blendMode"], "eventUnit": spec["eventUnit"],
            "sheet": f"{asset_id}.png",
            "frames": [f"frames/frame_{i:02d}.png" for i in range(spec["frameCount"])],
            "previewGif": f"{asset_id}.gif", "previewImage": f"{asset_id}_4x.png",
            "imageSmoothingEnabled": False, "generationModel": "gpt-image-2",
            "generationProvider": "codex", "generationQuality": "medium",
            "alphaMethod": "chroma-key", "pixelization": "nearest-neighbor",
            "palette": spec["palette"], "sourceReviewId": f"v17_{asset_id}",
            "sourceReviewPath": f"assets/concepts/v17_warrior_vfx_review/vfx/{asset_id}",
        }
        (folder / f"{asset_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def check_png(path: Path, expected: tuple[int, int]) -> dict:
    result = {"path": str(path.relative_to(ROOT)), "size": None, "mode": None, "alphaBinary": False,
              "transparentCorners": False, "transparentBorder": False, "hasOpaquePixels": False,
              "sha256": None, "errors": []}
    if not path.exists():
        result["errors"].append("missing")
        return result
    try:
        image = Image.open(path).convert("RGBA")
        result["size"] = [image.width, image.height]
        result["mode"] = "RGBA"
        result["sha256"] = sha256(path)
        alpha = list(image.getchannel("A").getdata())
        result["alphaBinary"] = all(value in (0, 255) for value in alpha)
        result["hasOpaquePixels"] = 255 in alpha
        corners = [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]
        result["transparentCorners"] = all(image.getpixel(point)[3] == 0 for point in corners)
        border = [image.getpixel((x, 0))[3] for x in range(image.width)]
        border += [image.getpixel((x, image.height - 1))[3] for x in range(image.width)]
        border += [image.getpixel((0, y))[3] for y in range(image.height)]
        border += [image.getpixel((image.width - 1, y))[3] for y in range(image.height)]
        result["transparentBorder"] = not any(border)
        if result["size"] != list(expected): result["errors"].append(f"size != {expected}")
        if not result["alphaBinary"]: result["errors"].append("non-binary alpha")
        if not result["transparentCorners"]: result["errors"].append("opaque corner")
        if not result["transparentBorder"]: result["errors"].append("opaque border")
        if not result["hasOpaquePixels"]: result["errors"].append("empty")
    except Exception as error:
        result["errors"].append(str(error))
    return result


def make_overviews() -> None:
    overview = Image.new("RGBA", (3 * 360, 200), (12, 18, 20, 255))
    draw = ImageDraw.Draw(overview)
    for index, (asset_id, spec) in enumerate(JOBS.items()):
        folder = REVIEW / "vfx" / asset_id
        sheet = Image.open(folder / f"{asset_id}.png").convert("RGBA")
        max_w = 340
        thumb = sheet.resize((max_w, max(1, round(sheet.height * max_w / sheet.width))), Image.Resampling.NEAREST)
        x = index * 360 + 10
        y = 32
        overview.alpha_composite(thumb, (x, y))
        draw.text((x, 10), f"WARRIOR // {asset_id}", fill=(229, 242, 226, 255))
        draw.text((x, 20), f"{spec['frameCount']}F // {spec['fps']}FPS", fill=(142, 218, 215, 255))
    overview.save(REVIEW / "v17_warrior_vfx_overview.png")
    overview.resize((overview.width * 2, overview.height * 2), Image.Resampling.NEAREST).save(REVIEW / "v17_warrior_vfx_overview_2x.png")


def make_gameplay_preview() -> None:
    ground_paths = {
        "rust": ROOT / "assets" / "game" / "planets" / "rust_ground.png",
        "spore": ROOT / "assets" / "game" / "planets" / "spore_ground.png",
        "moon": ROOT / "assets" / "game" / "planets" / "moon_ground.png",
    }
    canvas = Image.new("RGBA", (1080, 540), (7, 10, 12, 255))
    draw = ImageDraw.Draw(canvas)
    ids = list(JOBS)
    for row, (planet, ground_path) in enumerate(ground_paths.items()):
        try:
            ground = Image.open(ground_path).convert("RGBA").resize((360, 180), Image.Resampling.NEAREST)
        except Exception:
            ground = Image.new("RGBA", (360, 180), (20, 24, 28, 255))
        for col, asset_id in enumerate(ids):
            cell = ground.copy()
            cell.alpha_composite(Image.new("RGBA", cell.size, (0, 0, 0, 62)))
            frame = Image.open(REVIEW / "vfx" / asset_id / "frames" / f"frame_{min(3, JOBS[asset_id]['frameCount'] - 1):02d}.png").convert("RGBA")
            ex, ey = (360 - frame.width) // 2, (180 - frame.height) // 2
            cell.alpha_composite(frame, (ex, ey))
            x, y = col * 360, row * 180
            canvas.alpha_composite(cell, (x, y))
            draw.rectangle((x, y, x + 359, y + 179), outline=(90, 123, 124, 255), width=1)
            draw.text((x + 8, y + 8), f"{planet.upper()} // {asset_id}", fill=(229, 242, 226, 255))
    canvas.save(REVIEW / "v17_warrior_vfx_gameplay_preview.png")


def make_transition_check() -> None:
    canvas = Image.new("RGBA", (640, 240), (8, 12, 14, 255))
    draw = ImageDraw.Draw(canvas)
    for index, asset_id in enumerate(JOBS):
        folder = REVIEW / "vfx" / asset_id
        frames = [Image.open(folder / "frames" / f"frame_{i:02d}.png").convert("RGBA") for i in range(JOBS[asset_id]["frameCount"])]
        frame = frames[-1]
        x = index * 210 + (210 - frame.width) // 2
        y = 80 + (96 - frame.height) // 2
        canvas.alpha_composite(frame, (x, y))
        draw.text((index * 210 + 8, 20), f"{asset_id} // LAST FRAME", fill=(229, 242, 226, 255))
        draw.line((index * 210 + 105, 52, index * 210 + 105, 198), fill=(55, 85, 89, 255), width=1)
    canvas.save(REVIEW / "v17_warrior_vfx_transition_check.png")


def write_records(checks, failed) -> None:
    jobs = []
    for asset_id, spec in JOBS.items():
        source = TMP / f"{asset_id}_source.png"
        image = Image.open(source).convert("RGBA")
        columns, rows = (2, 4) if image.height > image.width * 1.25 else (4, 2)
        jobs.append({"id": asset_id, "source": str(source.relative_to(ROOT)), "sourceSize": [image.width, image.height],
                     "storyboardLayout": f"{columns}x{rows}", "sha256": sha256(source),
                     "promptBrief": f"warrior {asset_id}; {spec['palette']}; hard-edge 8-bit storyboard on flat magenta matte"})
    generation = {"id": "v17_warrior_vfx_generation", "model": "gpt-image-2", "provider": "codex", "quality": "medium",
                  "cli": "scripts/gpt_image_2_skill.cjs", "command": "images generate", "size": "2K",
                  "format": "png", "transparentExtraction": {"command": "transparent extract", "method": "chroma",
                  "matteColor": "auto", "profile": "effect", "strict": True}, "pixelization": "nearest-neighbor", "jobs": jobs}
    (REVIEW / "v17_warrior_vfx_generation.json").write_text(json.dumps(generation, ensure_ascii=False, indent=2), encoding="utf-8")
    entries = []
    for asset_id, spec in JOBS.items():
        entries.append({"id": asset_id, "classId": "warrior", "frameCount": spec["frameCount"], "frameWidth": spec["frameWidth"],
                        "frameHeight": spec["frameHeight"], "fps": spec["fps"], "loop": spec["loop"], "anchor": spec["anchor"],
                        "blendMode": spec["blendMode"], "json": f"vfx/{asset_id}/{asset_id}.json", "sheet": f"vfx/{asset_id}/{asset_id}.png"})
    manifest = {"id": "v17_warrior_vfx_review", "generationModel": "gpt-image-2", "provider": "codex", "quality": "medium",
                "sourceDirectory": "tmp/imagegen/v17_warrior_vfx", "outputDirectory": "assets/concepts/v17_warrior_vfx_review",
                "alphaMethod": "chroma-key", "pixelization": "nearest-neighbor", "assetCount": len(JOBS), "assets": entries,
                "checks": checks, "passed": not failed}
    (REVIEW / "v17_warrior_vfx_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (REVIEW / "v17_warrior_vfx_validation.json").write_text(json.dumps({"passed": not failed, "errors": failed, "checkedPng": len(checks)}, ensure_ascii=False, indent=2), encoding="utf-8")


def validate() -> None:
    checks = []
    for asset_id, spec in JOBS.items():
        folder = REVIEW / "vfx" / asset_id
        for i in range(spec["frameCount"]):
            checks.append(check_png(folder / "frames" / f"frame_{i:02d}.png", (spec["frameWidth"], spec["frameHeight"])))
        checks.append(check_png(folder / f"{asset_id}.png", (spec["frameWidth"] * spec["frameCount"], spec["frameHeight"])))
        checks.append(check_png(folder / f"{asset_id}_4x.png", (spec["frameWidth"] * spec["frameCount"] * 4, spec["frameHeight"] * 4)))
    failed = [item for item in checks if item["errors"]]
    write_records(checks, failed)
    if not failed:
        make_overviews()
        make_gameplay_preview()
        make_transition_check()
    if failed:
        raise SystemExit(f"V17 validation failed: {len(failed)} files")
    print(json.dumps({"passed": True, "assets": len(JOBS), "checkedPng": len(checks)}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "finalize", "validate"])
    command = parser.parse_args().command
    if command == "prepare": prepare_cells()
    elif command == "finalize": finalize()
    else: validate()


if __name__ == "__main__":
    main()
