"""Build the review-only V12 meteor warning -> impact sequence.

The two mother images are GPT-Image 2 storyboard sheets with a controlled
magenta matte.  This script removes the matte, hardens the alpha, fits the
panels to the runtime-facing slots and writes only under the V12 review
directory.  It intentionally never changes assets/game or JavaScript.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "concepts" / "v12_meteor_sequence_review"
VFX = OUT / "vfx"
WARNING_OUT = VFX / "meteor_warning_v4"
IMPACT_OUT = VFX / "meteor_impact_v3"
RAW = OUT / "raw"
WARNING_SOURCE = RAW / "warning_storyboard_alpha_v12.png"
IMPACT_SOURCE = RAW / "impact_storyboard_alpha_v12.png"


def hard_alpha(image: Image.Image) -> Image.Image:
    """Convert a chroma-extracted image to crisp binary-alpha pixel art."""

    image = image.convert("RGBA")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            # remove any residual magenta spill even when the extractor kept
            # it as an opaque pixel at a generated storyboard seam
            magenta = r > 150 and b > 130 and g < 125 and abs(r - b) < 105
            if a < 128 or magenta:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)

    # Cell seams and generated matte never belong to a sprite.  Clearing a
    # one-pixel frame boundary also guarantees a transparent safety margin.
    for x in range(image.width):
        px[x, 0] = (0, 0, 0, 0)
        px[x, image.height - 1] = (0, 0, 0, 0)
    for y in range(image.height):
        px[0, y] = (0, 0, 0, 0)
        px[image.width - 1, y] = (0, 0, 0, 0)
    return image


def crop_grid(source: Path, columns: int, rows: int,
              target: tuple[int, int]) -> list[Image.Image]:
    if not source.exists():
        raise FileNotFoundError(f"Missing extracted storyboard: {source}")
    image = hard_alpha(Image.open(source))
    w, h = image.size
    frames: list[Image.Image] = []
    for row in range(rows):
        y0 = round(row * h / rows)
        y1 = round((row + 1) * h / rows)
        for col in range(columns):
            x0 = round(col * w / columns)
            x1 = round((col + 1) * w / columns)
            # The generated impact sheet can contain a faint one-pixel grid
            # line.  Trim it from the source cell before nearest-neighbor fit.
            inset = 2 if (x1 - x0) > 16 and (y1 - y0) > 16 else 0
            panel = image.crop((x0 + inset, y0 + inset,
                                x1 - inset, y1 - inset))
            frame = panel.resize(target, Image.Resampling.NEAREST)
            frames.append(hard_alpha(frame))
    return frames


def save_sheet(frames: list[Image.Image], path: Path) -> None:
    sheet = Image.new("RGBA", (frames[0].width * len(frames), frames[0].height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * frame.width, 0))
    sheet.save(path)


def save_gif(frames: list[Image.Image], path: Path, fps: int,
             loop: bool, scale: int = 1,
             durations: list[int] | None = None) -> None:
    rendered = frames
    if scale != 1:
        rendered = [frame.resize((frame.width * scale, frame.height * scale),
                                 Image.Resampling.NEAREST) for frame in frames]
    palette = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128)
               for frame in rendered]
    kwargs = {
        "save_all": True,
        "append_images": palette[1:],
        "duration": durations or [round(1000 / fps)] * len(rendered),
        "disposal": 2,
        "transparency": 0,
        # Keep intentional duplicate hand-off frames in the file.  Without
        # this Pillow may optimize warning frame 05 + impact frame 00 into a
        # single GIF frame, hiding the 16-stage sequence from reviewers.
        "optimize": False,
    }
    if loop:
        kwargs["loop"] = 0
    # Omitting loop for one-shot previews is intentional.
    palette[0].save(path, **kwargs)


def write_4x_sheet(frames: list[Image.Image], path: Path) -> None:
    scale = 4
    sheet = Image.new("RGBA", (frames[0].width * len(frames) * scale,
                                frames[0].height * scale), (8, 10, 15, 255))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame.resize((frame.width * scale,
                                             frame.height * scale),
                                            Image.Resampling.NEAREST),
                              (index * frame.width * scale, 0))
    sheet.save(path)


def write_overview(frames: list[Image.Image], path: Path, columns: int,
                   label: str) -> None:
    scale = 2
    cols = columns
    rows = (len(frames) + cols - 1) // cols
    cell_w = frames[0].width * scale
    cell_h = frames[0].height * scale
    canvas = Image.new("RGBA", (cell_w * cols, cell_h * rows), (8, 10, 15, 255))
    draw = ImageDraw.Draw(canvas)
    for index, frame in enumerate(frames):
        x = (index % cols) * cell_w
        y = (index // cols) * cell_h
        canvas.alpha_composite(frame.resize((cell_w, cell_h), Image.Resampling.NEAREST), (x, y))
        draw.rectangle((x + 4, y + 4, x + 42, y + 20), fill=(12, 16, 22, 235))
        draw.text((x + 8, y + 5), f"{label}{index + 1:02d}", fill=(220, 238, 232, 255))
    canvas.save(path)


def write_alpha_check(frames: list[Image.Image], path: Path, columns: int) -> None:
    """Render a neutral checkerboard inspection image without changing assets."""

    scale = 4
    cell_w = frames[0].width * scale
    cell_h = frames[0].height * scale
    rows = (len(frames) + columns - 1) // columns
    canvas = Image.new("RGBA", (cell_w * columns, cell_h * rows), (0, 0, 0, 255))
    draw = ImageDraw.Draw(canvas)
    tile = 8
    for y in range(0, canvas.height, tile):
        for x in range(0, canvas.width, tile):
            if ((x // tile) + (y // tile)) % 2 == 0:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(34, 38, 46, 255))
            else:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(12, 15, 20, 255))
    for index, frame in enumerate(frames):
        x = (index % columns) * cell_w
        y = (index // columns) * cell_h
        canvas.alpha_composite(frame.resize((cell_w, cell_h), Image.Resampling.NEAREST), (x, y))
    canvas.save(path)


def compose_combo(warning: list[Image.Image], impact: list[Image.Image]) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for frame in warning:
        canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        # warning anchor (48,32) aligns with shared world anchor (64,64)
        canvas.alpha_composite(frame, (16, 32))
        frames.append(canvas)
    for frame in impact:
        frames.append(frame.copy())
    return frames


def warning_to_world_canvas(frame: Image.Image) -> Image.Image:
    """Place a warning frame on the shared 128px world-space canvas."""

    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.alpha_composite(frame, (16, 32))
    # A tiny contact-hotspot is the first impact cue.  It keeps the meteor,
    # marker and center identical while making this frame distinct in GIF
    # encoding (otherwise a duplicate frame may be optimized away).
    for point, color in {
        (64, 64): (255, 238, 148, 255),
        (63, 64): (255, 170, 76, 255),
        (65, 64): (255, 170, 76, 255),
    }.items():
        canvas.putpixel(point, color)
    return canvas


def save_combo_previews(frames: list[Image.Image]) -> None:
    sheet = Image.new("RGBA", (128 * len(frames), 128), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 128, 0))
    sheet.save(VFX / "meteor_warning_impact_v4_combo.png")
    durations = [83] * 6 + [56] * 10
    save_gif(frames, VFX / "meteor_warning_impact_v4_combo.gif", 15, False,
             durations=durations)
    save_gif(frames, VFX / "meteor_warning_impact_v4_combo_4x.gif", 15, False,
             scale=4, durations=durations)


def ground_preview(warning: list[Image.Image], impact: list[Image.Image]) -> None:
    grounds = [
        ("rust", ROOT / "assets" / "game" / "planets" / "rust_ground.png"),
        ("spore", ROOT / "assets" / "game" / "planets" / "spore_ground.png"),
        ("moon", ROOT / "assets" / "game" / "planets" / "moon_ground.png"),
    ]
    canvas = Image.new("RGBA", (256 * 3, 256), (8, 10, 15, 255))
    warning_frame = warning[-1]
    impact_frame = impact[2]
    for index, (_, path) in enumerate(grounds):
        if path.exists():
            ground = Image.open(path).convert("RGBA").resize((256, 256), Image.Resampling.NEAREST)
            canvas.alpha_composite(ground, (index * 256, 0))
        canvas.alpha_composite(warning_frame.resize((192, 128), Image.Resampling.NEAREST),
                               (index * 256 + 32, 8))
        canvas.alpha_composite(impact_frame.resize((128, 128), Image.Resampling.NEAREST),
                               (index * 256 + 64, 96))
    canvas.save(VFX / "meteor_sequence_ground_preview.png")


def transition_preview(warning: list[Image.Image], impact: list[Image.Image]) -> None:
    canvas = Image.new("RGBA", (512, 256), (8, 10, 15, 255))
    # Render both sides from the same 128x128 world-space placement so the
    # review image shows a genuine pixel-for-pixel hand-off, not two scales.
    last = warning_to_world_canvas(warning[-1]).resize((256, 256), Image.Resampling.NEAREST)
    first = impact[0].resize((256, 256), Image.Resampling.NEAREST)
    canvas.alpha_composite(last, (0, 0))
    canvas.alpha_composite(first, (256, 0))
    canvas.save(VFX / "meteor_warning_impact_v4_transition.png")


def frame_check(frames: list[Image.Image], size: tuple[int, int]) -> list[dict]:
    checks = []
    for index, frame in enumerate(frames):
        pixels = list(frame.getdata())
        alpha = {p[3] for p in pixels}
        border = []
        border.extend(frame.getpixel((x, 0))[3] for x in range(frame.width))
        border.extend(frame.getpixel((x, frame.height - 1))[3] for x in range(frame.width))
        border.extend(frame.getpixel((0, y))[3] for y in range(frame.height))
        border.extend(frame.getpixel((frame.width - 1, y))[3] for y in range(frame.height))
        magenta = sum(1 for r, g, b, a in pixels
                      if a and r > 150 and b > 130 and g < 125 and abs(r - b) < 105)
        checks.append({
            "frame": index,
            "size": list(frame.size),
            "mode": frame.mode,
            "alphaBinary": alpha <= {0, 255},
            "transparentCorners": all(frame.getpixel(p)[3] == 0 for p in [
                (0, 0), (size[0] - 1, 0), (0, size[1] - 1),
                (size[0] - 1, size[1] - 1),
            ]),
            "transparentBorder": not any(border),
            "hasOpaquePixels": 255 in alpha,
            "magentaOpaquePixels": magenta,
        })
    return checks


def write_json_and_validation(warning: list[Image.Image], impact: list[Image.Image],
                              combo: list[Image.Image]) -> dict:
    warning_meta = {
        "id": "meteor_warning",
        "reviewId": "meteor_warning_v4",
        "assetType": "vfx",
        "frameWidth": 96,
        "frameHeight": 64,
        "frameCount": 6,
        "fps": 12,
        "loop": True,
        "anchor": {"x": 48, "y": 32},
        "blendMode": "source-over",
        "sheet": "meteor_warning_v4.png",
        "frames": [f"frames/frame_{i:02d}.png" for i in range(6)],
        "previewGif": "meteor_warning_v4.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "Codex image_gen",
        "sourceStoryboard": "raw/warning_storyboard_magenta_v12.png",
        "alphaMethod": "chroma-key + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "transitionTarget": "meteor_impact_v3/frame_00.png",
    }
    impact_meta = {
        "id": "meteor_impact",
        "reviewId": "meteor_impact_v3",
        "assetType": "vfx",
        "frameWidth": 128,
        "frameHeight": 128,
        "frameCount": 10,
        "fps": 18,
        "loop": False,
        "anchor": {"x": 64, "y": 64},
        "blendMode": "source-over",
        "sheet": "meteor_impact_v3.png",
        "frames": [f"frames/frame_{i:02d}.png" for i in range(10)],
        "previewGif": "meteor_impact_v3.gif",
        "imageSmoothingEnabled": False,
        "generationModel": "gpt-image-2",
        "generationProvider": "Codex image_gen",
        "sourceStoryboard": "raw/impact_storyboard_magenta_v12.png",
        "alphaMethod": "chroma-key + hard-alpha threshold",
        "pixelization": "nearest-neighbor",
        "transitionSource": "meteor_warning_v4/frame_05.png",
        "frameZeroSharedWithWarning": True,
    }
    (WARNING_OUT / "meteor_warning_v4.json").write_text(json.dumps(warning_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (IMPACT_OUT / "meteor_impact_v3.json").write_text(json.dumps(impact_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    combo_meta = {
        "id": "meteor_warning_impact_v4_combo",
        "assetType": "vfx-preview",
        "frameWidth": 128,
        "frameHeight": 128,
        "frameCount": 16,
        "loop": False,
        "sequence": [
            {"asset": "meteor_warning_v4", "frames": list(range(6)), "fps": 12},
            {"asset": "meteor_impact_v3", "frames": list(range(10)), "fps": 18},
        ],
        "durationsMs": [83] * 6 + [56] * 10,
        "anchor": {"x": 64, "y": 64},
        "placements": {
            "meteor_warning_v4": {"x": 16, "y": 32, "sourceAnchor": {"x": 48, "y": 32}},
            "meteor_impact_v3": {"x": 0, "y": 0, "sourceAnchor": {"x": 64, "y": 64}},
        },
        "sheet": "meteor_warning_impact_v4_combo.png",
        "gif": "meteor_warning_impact_v4_combo.gif",
        "gif4x": "meteor_warning_impact_v4_combo_4x.gif",
        "imageSmoothingEnabled": False,
        "transition": {
            "warningLastFrame": "meteor_warning_v4/frame_05.png",
            "impactFirstFrame": "meteor_impact_v3/frame_00.png",
            "sharedWorldAnchor": {"x": 64, "y": 64},
            "impactFrameZeroSharedWithWarning": True,
        },
    }
    (VFX / "meteor_warning_impact_v4_combo.json").write_text(
        json.dumps(combo_meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    warning_checks = frame_check(warning, (96, 64))
    impact_checks = frame_check(impact, (128, 128))
    combo_checks = frame_check(combo, (128, 128))
    validation = {
        "id": "v12_meteor_sequence",
        "passed": all(
            check["size"] == [96, 64] and check["mode"] == "RGBA" and
            check["alphaBinary"] and check["transparentCorners"] and
            check["transparentBorder"] and check["hasOpaquePixels"] and
            check["magentaOpaquePixels"] == 0
            for check in warning_checks
        ) and all(
            check["size"] == [128, 128] and check["mode"] == "RGBA" and
            check["alphaBinary"] and check["transparentCorners"] and
            check["transparentBorder"] and check["hasOpaquePixels"] and
            check["magentaOpaquePixels"] == 0
            for check in impact_checks + combo_checks
        ),
        "warning": {"frameCount": 6, "checks": warning_checks},
        "impact": {"frameCount": 10, "checks": impact_checks},
        "combo": {"frameCount": 16, "checks": combo_checks, "loop": False},
        "transition": {
            "warningLastFrame": "meteor_warning_v4/frame_05.png",
            "impactFirstFrame": "meteor_impact_v3/frame_00.png",
            "warningPlacement": {"x": 16, "y": 32},
            "sharedAnchor": {"x": 64, "y": 64},
            "impactFrameZeroSharedWithWarning": True,
        },
        "notes": "Review-only. Runtime assets and code intentionally unchanged.",
    }
    (OUT / "v12_meteor_sequence_validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return validation


def main() -> None:
    WARNING_OUT.mkdir(parents=True, exist_ok=True)
    IMPACT_OUT.mkdir(parents=True, exist_ok=True)
    warning = crop_grid(WARNING_SOURCE, 3, 2, (96, 64))
    impact = crop_grid(IMPACT_SOURCE, 5, 2, (128, 128))
    # Lock the hand-off: impact frame 00 is the exact same world-space image
    # as warning frame 05.  The next frame then introduces the contact spark,
    # eliminating the one-frame jump that is easy to see in a GIF preview.
    impact[0] = warning_to_world_canvas(warning[-1])
    for index, frame in enumerate(warning):
        (WARNING_OUT / "frames").mkdir(exist_ok=True)
        frame.save(WARNING_OUT / "frames" / f"frame_{index:02d}.png")
    for index, frame in enumerate(impact):
        (IMPACT_OUT / "frames").mkdir(exist_ok=True)
        frame.save(IMPACT_OUT / "frames" / f"frame_{index:02d}.png")

    save_sheet(warning, WARNING_OUT / "meteor_warning_v4.png")
    save_sheet(impact, IMPACT_OUT / "meteor_impact_v3.png")
    save_gif(warning, WARNING_OUT / "meteor_warning_v4.gif", 12, True)
    save_gif(impact, IMPACT_OUT / "meteor_impact_v3.gif", 18, False)
    write_4x_sheet(warning, WARNING_OUT / "meteor_warning_v4_4x.png")
    write_4x_sheet(impact, IMPACT_OUT / "meteor_impact_v3_4x.png")
    write_overview(warning, WARNING_OUT / "meteor_warning_v4_overview.png", 3, "W")
    write_overview(impact, IMPACT_OUT / "meteor_impact_v3_overview.png", 5, "I")
    write_alpha_check(warning, WARNING_OUT / "meteor_warning_v4_alpha_check.png", 3)
    write_alpha_check(impact, IMPACT_OUT / "meteor_impact_v3_alpha_check.png", 5)

    combo = compose_combo(warning, impact)
    save_combo_previews(combo)
    ground_preview(warning, impact)
    transition_preview(warning, impact)
    validation = write_json_and_validation(warning, impact, combo)

    manifest = {
        "id": "v12_meteor_sequence_review",
        "generationModel": "gpt-image-2",
        "generationProvider": "Codex image_gen",
        "sourceReferences": [
            "assets/game/skills/gunner/vfx/meteor_impact/meteor_impact.png",
            "assets/concepts/v11_meteor_warning_review/vfx/meteor_warning_v3/meteor_warning_v3_4x.png",
            "user-provided meteor warning screenshot",
        ],
        "storyboard": {
            "warning": "raw/warning_storyboard_magenta_v12.png",
            "impact": "raw/impact_storyboard_magenta_v12.png",
            "layout": "warning 3x2 + impact 5x2, read left-to-right then top-to-bottom",
        },
        "sequence": [
            {"asset": "meteor_warning_v4", "frameCount": 6, "fps": 12, "loop": True},
            {"asset": "meteor_impact_v3", "frameCount": 10, "fps": 18, "loop": False},
        ],
        "files": {
            "warning": "vfx/meteor_warning_v4",
            "impact": "vfx/meteor_impact_v3",
            "warningAlphaCheck": "vfx/meteor_warning_v4/meteor_warning_v4_alpha_check.png",
            "impactAlphaCheck": "vfx/meteor_impact_v3/meteor_impact_v3_alpha_check.png",
            "comboGif": "vfx/meteor_warning_impact_v4_combo.gif",
            "comboGif4x": "vfx/meteor_warning_impact_v4_combo_4x.gif",
            "comboSheet": "vfx/meteor_warning_impact_v4_combo.png",
            "transitionPreview": "vfx/meteor_warning_impact_v4_transition.png",
            "groundPreview": "vfx/meteor_sequence_ground_preview.png",
        },
        "validation": validation,
        "runtimeChanged": False,
    }
    (OUT / "v12_meteor_sequence_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "passed": validation["passed"], "frameCount": 16}, ensure_ascii=False))


if __name__ == "__main__":
    main()
