"""Build a review-only meteor warning -> impact playback preview.

The source V11 warning and runtime meteor-impact frames are composed on a
shared 128x128 world-space canvas.  No runtime files are touched.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
VFX = ROOT / "assets" / "concepts" / "v11_meteor_warning_review" / "vfx" / "meteor_warning_v3"
WARNING_DIR = VFX / "frames"
IMPACT_DIR = ROOT / "assets" / "game" / "skills" / "gunner" / "vfx" / "meteor_impact"
OUT_GIF = VFX / "meteor_warning_impact_combo.gif"
OUT_GIF_4X = VFX / "meteor_warning_impact_combo_4x.gif"
OUT_SHEET = VFX / "meteor_warning_impact_combo.png"
OUT_JSON = VFX / "meteor_warning_impact_combo.json"


def rgba_canvas() -> Image.Image:
    return Image.new("RGBA", (128, 128), (0, 0, 0, 0))


def compose_frames() -> list[Image.Image]:
    warning = []
    for index in range(6):
        path = WARNING_DIR / f"frame_{index:02d}.png"
        image = Image.open(path).convert("RGBA")
        if image.size != (96, 64):
            raise ValueError(f"Unexpected warning frame size: {path} {image.size}")
        canvas = rgba_canvas()
        # warning anchor (48,32) -> shared canvas anchor (64,64)
        canvas.alpha_composite(image, (16, 32))
        warning.append(canvas)

    impact = []
    for index in range(10):
        path = IMPACT_DIR / f"frame_{index:02d}.png"
        image = Image.open(path).convert("RGBA")
        if image.size != (128, 128):
            raise ValueError(f"Unexpected impact frame size: {path} {image.size}")
        impact.append(image)
    return warning + impact


def save_gif(frames: list[Image.Image], path: Path, scale: int = 1) -> None:
    if scale == 1:
        rendered = frames
    else:
        rendered = [frame.resize((128 * scale, 128 * scale), Image.Resampling.NEAREST)
                    for frame in frames]
    palette_frames = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128)
                      for frame in rendered]
    # Deliberately omit the GIF loop extension: this is a one-shot preview.
    palette_frames[0].save(
        path,
        save_all=True,
        append_images=palette_frames[1:],
        duration=[83] * 6 + [56] * 10,
        disposal=2,
        transparency=0,
    )


def validate(frames: list[Image.Image]) -> dict:
    frame_checks = []
    for index, frame in enumerate(frames):
        alpha = frame.getchannel("A")
        values = set(alpha.getdata())
        frame_checks.append({
            "frame": index,
            "size": list(frame.size),
            "mode": frame.mode,
            "alphaBinary": values <= {0, 255},
            "transparentCorners": all(frame.getpixel(point)[3] == 0 for point in [
                (0, 0), (127, 0), (0, 127), (127, 127)
            ]),
            "hasOpaquePixels": 255 in values,
        })
    return {
        "passed": len(frames) == 16 and all(
            check["size"] == [128, 128]
            and check["mode"] == "RGBA"
            and check["alphaBinary"]
            and check["transparentCorners"]
            and check["hasOpaquePixels"]
            for check in frame_checks
        ),
        "frameCount": len(frames),
        "frameChecks": frame_checks,
        "warningFrameCount": 6,
        "impactFrameCount": 10,
        "warningOffset": {"x": 16, "y": 32},
        "impactOffset": {"x": 0, "y": 0},
        "loop": False,
        "notes": "Review-only composite; source and runtime assets remain unchanged.",
    }


def main() -> None:
    frames = compose_frames()
    sheet = Image.new("RGBA", (128 * len(frames), 128), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 128, 0))
    sheet.save(OUT_SHEET)
    save_gif(frames, OUT_GIF)
    save_gif(frames, OUT_GIF_4X, scale=4)

    validation = validate(frames)
    metadata = {
        "id": "meteor_warning_impact_combo",
        "assetType": "vfx-preview",
        "frameWidth": 128,
        "frameHeight": 128,
        "frameCount": 16,
        "loop": False,
        "sequence": [
            {"asset": "meteor_warning_v3", "frames": list(range(6)), "fps": 12},
            {"asset": "meteor_impact", "frames": list(range(10)), "fps": 18},
        ],
        "durationsMs": [83] * 6 + [56] * 10,
        "anchor": {"x": 64, "y": 64},
        "placements": {
            "meteor_warning_v3": {"x": 16, "y": 32, "sourceAnchor": {"x": 48, "y": 32}},
            "meteor_impact": {"x": 0, "y": 0, "sourceAnchor": {"x": 64, "y": 64}},
        },
        "sheet": OUT_SHEET.name,
        "gif": OUT_GIF.name,
        "gif4x": OUT_GIF_4X.name,
        "imageSmoothingEnabled": False,
        "transition": {
            "warningLastFrame": "meteor_warning_v3/frame_05.png",
            "impactFirstFrame": "meteor_impact/frame_00.png",
            "sharedWorldAnchor": {"x": 64, "y": 64},
        },
        "validation": validation,
    }
    OUT_JSON.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(VFX), "passed": validation["passed"], "frameCount": 16}, ensure_ascii=False))


if __name__ == "__main__":
    main()
