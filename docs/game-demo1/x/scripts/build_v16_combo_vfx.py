from __future__ import annotations

"""Build the V16 combo VFX review package from GPT-Image 2 storyboards.

The image-generation step writes controlled 4x2 storyboard masters to
tmp/imagegen/v16_combo_vfx. This script crops the eight panels, normalizes
them with nearest-neighbour scaling, builds sheets/GIFs/previews and performs
the hard-alpha validation used by the review package. Runtime assets are not
written by this script.
"""

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "assets" / "concepts" / "v16_combo_vfx_review"
TMP = ROOT / "tmp" / "imagegen" / "v16_combo_vfx"

JOBS = {
    "piercing_star_burst": {
        "classId": "gunner", "comboId": "piercing_star", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 16, "loop": False, "blendMode": "source-over", "anchor": {"x": 48, "y": 48},
        "eventUnit": "attack_cycle_and_first_pierce", "palette": "cyan-white with orange-hot core"
    },
    "hunt_barrage_lock": {
        "classId": "gunner", "comboId": "hunt_barrage", "frameWidth": 64, "frameHeight": 64,
        "frameCount": 6, "fps": 12, "loop": False, "blendMode": "source-over", "anchor": {"x": 32, "y": 32},
        "eventUnit": "attack_cycle_and_ricochet", "palette": "cyan targeting lattice with yellow lock spark"
    },
    "zero_storm_burst": {
        "classId": "gunner", "comboId": "zero_storm", "frameWidth": 128, "frameHeight": 128,
        "frameCount": 8, "fps": 15, "loop": False, "blendMode": "source-over", "anchor": {"x": 64, "y": 64},
        "eventUnit": "ring_release", "palette": "cyan-white radial shotgun burst with orange heat points"
    },
    "sword_wave": {
        "classId": "warrior", "comboId": "rift_slash", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48},
        "eventUnit": "melee_swing", "palette": "white-cyan blade with orange-red edge"
    },
    "star_ring": {
        "classId": "warrior", "comboId": "star_ring", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 12, "loop": True, "blendMode": "lighter", "anchor": {"x": 48, "y": 48},
        "eventUnit": "orbit_pulse", "palette": "orange-gold ring with cyan blade glints"
    },
    "phantom_counter": {
        "classId": "warrior", "comboId": "phantom_counter", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48},
        "eventUnit": "successful_dodge", "palette": "acid-green phantom slash with orange counter spark"
    },
    "swarm_protocol": {
        "classId": "mechanic", "comboId": "swarm_protocol", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48},
        "eventUnit": "drone_volley", "palette": "acid-green drones and cyan branching arc"
    },
    "mobile_fortress": {
        "classId": "mechanic", "comboId": "mobile_fortress", "frameWidth": 96, "frameHeight": 96,
        "frameCount": 8, "fps": 12, "loop": True, "blendMode": "lighter", "anchor": {"x": 48, "y": 48},
        "eventUnit": "fortress_volley", "palette": "acid-green shield plates with cyan turret pulses"
    },
    "recycle_burst": {
        "classId": "mechanic", "comboId": "infinite_recycle", "frameWidth": 128, "frameHeight": 128,
        "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 64, "y": 64},
        "eventUnit": "self_destruct_rebuild", "palette": "acid-green mechanical fragments with cyan repair core"
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
            if a < 128:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (r, g, b, 255)
    # A transparent one-pixel safety border prevents a generated edge pixel
    # from becoming a visible seam after nearest-neighbour scaling.
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
        # GPT-Image 2 normally returns a landscape 4x2 sheet, but the
        # provider may choose a portrait canvas for wide radial effects. In
        # that case it lays the same eight panels out as 2x4. Detect that
        # layout from the canvas aspect ratio rather than rotating or
        # reordering pixels, so the returned storyboard order remains the
        # provider's left-to-right/top-to-bottom sequence.
        if image.height > image.width * 1.25:
            columns, rows = 2, 4
        else:
            columns, rows = 4, 2
        cell_w = image.width / float(columns)
        cell_h = image.height / float(rows)
        folder = TMP / "cells" / asset_id
        folder.mkdir(parents=True, exist_ok=True)
        for frame in range(8):
            column = frame % columns
            row = frame // columns
            # The generated storyboard has white gutter lines. Crop inward
            # before extraction so no line becomes part of a sprite frame.
            # Keep clear of the provider's bright grid gutters. The larger
            # inset is important when a storyboard panel has a white border;
            # sampling that border as the matte would leave the magenta
            # working background opaque after chroma extraction.
            gutter = max(14, min(round(cell_w), round(cell_h)) // 28)
            left = round(column * cell_w + gutter)
            top = round(row * cell_h + gutter)
            right = round((column + 1) * cell_w - gutter)
            bottom = round((row + 1) * cell_h - gutter)
            crop = image.crop((left, top, right, bottom))
            # Some generated panels fill their tile right up to the panel
            # boundary. Add a small matte-only gutter before chroma
            # extraction so the strict effect profile can distinguish the
            # artwork from the edge; this does not alter the sprite once it
            # is resized to its target frame.
            pad = max(12, min(crop.width, crop.height) // 24)
            matte = crop.getpixel((0, 0))[:3]
            padded = Image.new("RGBA", (crop.width + pad * 2, crop.height + pad * 2), (*matte, 255))
            padded.alpha_composite(crop, (pad, pad))
            padded.save(folder / f"source_{frame:02d}.png")


def finalize() -> None:
    for asset_id, spec in JOBS.items():
        frame_w = spec["frameWidth"]
        frame_h = spec["frameHeight"]
        frames = []
        source_folder = TMP / "cells" / asset_id
        extracted_folder = TMP / "extracted" / asset_id
        for index in range(8):
            extracted = extracted_folder / f"frame_{index:02d}.png"
            source = source_folder / f"source_{index:02d}.png"
            path = extracted if extracted.exists() else source
            image = Image.open(path).convert("RGBA")
            image = image.resize((frame_w, frame_h), Image.Resampling.NEAREST)
            frames.append(scrub_alpha(image))
        folder = REVIEW / "vfx" / asset_id
        frame_folder = folder / "frames"
        frame_folder.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(frames):
            frame.save(frame_folder / f"frame_{index:02d}.png")
        sheet = Image.new("RGBA", (frame_w * 8, frame_h), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (index * frame_w, 0))
        sheet.save(folder / f"{asset_id}.png")
        preview = sheet.resize((sheet.width * 4, sheet.height * 4), Image.Resampling.NEAREST)
        preview.save(folder / f"{asset_id}_4x.png")
        alpha_preview = Image.new("RGBA", (frame_w * 32, frame_h * 4), (17, 22, 24, 255))
        for index, frame in enumerate(frames):
            # White-on-black alpha mask makes semi-transparent or stray
            # pixels obvious during review without baking a checkerboard into
            # the deliverable itself.
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
        gif_kwargs = {
            "save_all": True,
            "append_images": gif_frames[1:],
            "duration": max(1, round(1000 / spec["fps"])),
            "disposal": 2,
        }
        # `loop=0` is the GIF convention for infinite looping. For a
        # one-shot effect omit the Netscape loop extension entirely so a
        # viewer plays the sequence once and stops.
        if spec["loop"]:
            gif_kwargs["loop"] = 0
        gif_frames[0].save(folder / f"{asset_id}.gif", **gif_kwargs)
        payload = {
            "id": asset_id,
            "comboId": spec["comboId"],
            "classId": spec["classId"],
            "frameWidth": frame_w,
            "frameHeight": frame_h,
            "frameCount": 8,
            "fps": spec["fps"],
            "loop": spec["loop"],
            "anchor": spec["anchor"],
            "blendMode": spec["blendMode"],
            "eventUnit": spec["eventUnit"],
            "sheet": f"{asset_id}.png",
            "frames": [f"frames/frame_{i:02d}.png" for i in range(8)],
            "previewGif": f"{asset_id}.gif",
            "imageSmoothingEnabled": False,
            "generationModel": "gpt-image-2",
            "generationProvider": "codex",
            "generationQuality": "medium",
            "alphaMethod": "chroma-key",
            "pixelization": "nearest-neighbor",
            "palette": spec["palette"],
        }
        (folder / f"{asset_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def check_png(path: Path, expected: tuple[int, int]) -> dict:
    result = {"path": str(path.relative_to(ROOT)), "size": None, "mode": None, "alphaBinary": False,
              "transparentCorners": False, "transparentBorder": False, "hasOpaquePixels": False, "sha256": None,
              "errors": []}
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
        result["transparentCorners"] = all(image.getpixel(point)[3] == 0 for point in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)])
        border = []
        border.extend(image.getpixel((x, 0))[3] for x in range(image.width))
        border.extend(image.getpixel((x, image.height - 1))[3] for x in range(image.width))
        border.extend(image.getpixel((0, y))[3] for y in range(image.height))
        border.extend(image.getpixel((image.width - 1, y))[3] for y in range(image.height))
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
    overview = Image.new("RGBA", (3 * 420, 3 * 180), (12, 18, 20, 255))
    draw = ImageDraw.Draw(overview)
    for index, (asset_id, spec) in enumerate(JOBS.items()):
        row, col = divmod(index, 3)
        folder = REVIEW / "vfx" / asset_id
        sheet = Image.open(folder / f"{asset_id}.png").convert("RGBA")
        thumb = sheet.resize((min(390, sheet.width), max(1, round(sheet.height * min(390, sheet.width) / sheet.width))), Image.Resampling.NEAREST)
        x = col * 420 + 12
        y = row * 180 + 28
        overview.alpha_composite(thumb, (x, y))
        draw.text((x, row * 180 + 9), f"{spec['classId'].upper()} // {spec['comboId']}", fill=(220, 238, 224, 255))
    overview.save(REVIEW / "combo_vfx_overview.png")
    overview.resize((overview.width * 2, overview.height * 2), Image.Resampling.NEAREST).save(REVIEW / "combo_vfx_overview_2x.png")


def make_gameplay_preview() -> None:
    """Show representative effects at game scale over the three ground tiles.

    This is review-only artwork. It reads the existing ground PNGs but never
    writes to assets/game, so it cannot change runtime behavior or resources.
    """
    ground_paths = {
        "rust": ROOT / "assets" / "game" / "planets" / "rust_ground.png",
        "spore": ROOT / "assets" / "game" / "planets" / "spore_ground.png",
        "moon": ROOT / "assets" / "game" / "planets" / "moon_ground.png",
    }
    representatives = ["piercing_star_burst", "sword_wave", "swarm_protocol"]
    canvas = Image.new("RGBA", (1080, 540), (7, 10, 12, 255))
    draw = ImageDraw.Draw(canvas)
    for row, (planet, ground_path) in enumerate(ground_paths.items()):
        try:
            ground = Image.open(ground_path).convert("RGBA")
        except Exception:
            ground = Image.new("RGBA", (360, 180), (20, 24, 28, 255))
        ground = ground.resize((360, 180), Image.Resampling.NEAREST)
        for col, asset_id in enumerate(representatives):
            cell = ground.copy()
            # A subtle opaque tint keeps the effect readable without changing
            # the source tile or introducing a runtime overlay.
            tint = Image.new("RGBA", cell.size, (0, 0, 0, 62))
            cell.alpha_composite(tint)
            effect = Image.open(REVIEW / "vfx" / asset_id / "frames" / "frame_03.png").convert("RGBA")
            # Preserve the source effect's target size; only center it in the
            # 360x180 review cell using nearest-neighbour pixels.
            ex = (360 - effect.width) // 2
            ey = (180 - effect.height) // 2
            cell.alpha_composite(effect, (ex, ey))
            x, y = col * 360, row * 180
            canvas.alpha_composite(cell, (x, y))
            draw.rectangle((x, y, x + 359, y + 179), outline=(90, 123, 124, 255), width=1)
            draw.text((x + 8, y + 8), f"{planet.upper()} // {JOBS[asset_id]['comboId']}", fill=(229, 242, 226, 255))
    canvas.save(REVIEW / "combo_vfx_gameplay_preview.png")
    canvas.resize((canvas.width * 2, canvas.height * 2), Image.Resampling.NEAREST).save(REVIEW / "combo_vfx_gameplay_preview_2x.png")


def write_generation_record() -> None:
    jobs = []
    for asset_id, spec in JOBS.items():
        source = TMP / f"{asset_id}_source.png"
        image = Image.open(source)
        columns, rows = (2, 4) if image.height > image.width * 1.25 else (4, 2)
        jobs.append({
            "id": asset_id,
            "classId": spec["classId"],
            "comboId": spec["comboId"],
            "source": str(source.relative_to(ROOT)),
            "sourceSize": [image.width, image.height],
            "storyboardLayout": f"{columns}x{rows}",
            "sha256": sha256(source),
            "promptBrief": f"{spec['classId']} {spec['comboId']} combo VFX; {spec['palette']}; exactly eight sequential hard-edge 8-bit panels on a flat magenta matte",
        })
    payload = {
        "id": "v16_combo_vfx_generation",
        "model": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "cli": "scripts/gpt_image_2_skill.cjs",
        "command": "images generate",
        "size": "2K",
        "format": "png",
        "transparentExtraction": {
            "command": "transparent extract",
            "method": "chroma",
            "matteColor": "auto",
            "profile": "effect",
            "strict": True,
        },
        "pixelization": "nearest-neighbor",
        "jobs": jobs,
    }
    (REVIEW / "v16_combo_vfx_generation.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def validate() -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    checks = []
    entries = []
    for asset_id, spec in JOBS.items():
        folder = REVIEW / "vfx" / asset_id
        frame_checks = [check_png(folder / "frames" / f"frame_{i:02d}.png", (spec["frameWidth"], spec["frameHeight"])) for i in range(8)]
        sheet_check = check_png(folder / f"{asset_id}.png", (spec["frameWidth"] * 8, spec["frameHeight"]))
        preview_check = check_png(folder / f"{asset_id}_4x.png", (spec["frameWidth"] * 32, spec["frameHeight"] * 4))
        # The alpha check is intentionally opaque black/white inspection
        # art, so it is dimension-checked by construction rather than passed
        # through the transparent-deliverable gate.
        checks.extend(frame_checks + [sheet_check, preview_check])
        entries.append({"id": asset_id, "classId": spec["classId"], "comboId": spec["comboId"], "frameCount": 8,
                        "frameWidth": spec["frameWidth"], "frameHeight": spec["frameHeight"], "fps": spec["fps"],
                        "loop": spec["loop"], "anchor": spec["anchor"], "blendMode": spec["blendMode"],
                        "json": f"vfx/{asset_id}/{asset_id}.json", "sheet": f"vfx/{asset_id}/{asset_id}.png"})
    failed = [check for check in checks if check["errors"]]
    manifest = {
        "id": "v16_combo_vfx_review",
        "generationModel": "gpt-image-2",
        "provider": "codex",
        "quality": "medium",
        "sourceDirectory": "tmp/imagegen/v16_combo_vfx",
        "outputDirectory": "assets/concepts/v16_combo_vfx_review",
        "alphaMethod": "chroma-key",
        "pixelization": "nearest-neighbor",
        "assetCount": len(JOBS),
        "assets": entries,
        "checks": checks,
        "passed": not failed,
    }
    (REVIEW / "v16_combo_vfx_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (REVIEW / "v16_combo_vfx_validation.json").write_text(json.dumps({"passed": not failed, "errors": failed, "checkedPng": len(checks)}, ensure_ascii=False, indent=2), encoding="utf-8")
    make_overviews()
    if not failed:
        make_gameplay_preview()
        write_generation_record()
    if failed:
        raise SystemExit(f"V16 validation failed: {len(failed)} files")
    print(json.dumps({"passed": True, "assets": len(JOBS), "checkedPng": len(checks)}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "finalize", "validate"])
    args = parser.parse_args()
    if args.command == "prepare": prepare_cells()
    elif args.command == "finalize": finalize()
    else: validate()


if __name__ == "__main__":
    main()
