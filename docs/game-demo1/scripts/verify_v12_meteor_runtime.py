"""Verify the installed V12 meteor runtime assets and transition contract."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
MANIFEST_PATH = GAME / "v12_meteor_runtime_manifest.json"
REPORT_PATH = GAME / "v12_meteor_runtime_validation.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def count_gif_frames(path: Path) -> tuple[int, int | None]:
    image = Image.open(path)
    count = 0
    try:
        while True:
            image.seek(count)
            count += 1
    except EOFError:
        pass
    return count, image.info.get("loop")


def check_png(path: Path, size: tuple[int, int], errors: list[str]) -> None:
    if not path.exists():
        errors.append(f"missing {rel(path)}")
        return
    source = Image.open(path)
    if source.mode != "RGBA":
        errors.append(f"{rel(path)} mode={source.mode}, expected RGBA")
    image = source.convert("RGBA")
    if image.size != size:
        errors.append(f"{rel(path)} size={image.size}, expected={size}")
    alpha_values = set(image.getchannel("A").getdata())
    if alpha_values - {0, 255}:
        errors.append(f"{rel(path)} contains non-binary alpha")
    if image.getchannel("A").getbbox() is None:
        errors.append(f"{rel(path)} has empty alpha")
    edge = []
    edge.extend(image.getpixel((x, 0))[3] for x in range(image.width))
    edge.extend(image.getpixel((x, image.height - 1))[3] for x in range(image.width))
    edge.extend(image.getpixel((0, y))[3] for y in range(image.height))
    edge.extend(image.getpixel((image.width - 1, y))[3] for y in range(image.height))
    if any(edge):
        errors.append(f"{rel(path)} alpha touches edge")
    magenta = sum(
        1 for r, g, b, a in image.getdata()
        if a and r > 150 and b > 130 and g < 125 and abs(r - b) < 105
    )
    if magenta:
        errors.append(f"{rel(path)} opaque magenta pixels={magenta}")


def main() -> None:
    errors: list[str] = []
    if not MANIFEST_PATH.exists():
        raise SystemExit(f"missing {rel(MANIFEST_PATH)}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    expected = {
        "meteor_warning": (96, 64, 6, 12, True, {"x": 48, "y": 32}, "meteor_warning_v4"),
        "meteor_impact": (128, 128, 10, 18, False, {"x": 64, "y": 64}, "meteor_impact_v3"),
    }

    for runtime_id, (width, height, count, fps, loop, anchor, source_id) in expected.items():
        item = manifest.get("vfx", {}).get(runtime_id)
        if not item:
            errors.append(f"missing manifest VFX {runtime_id}")
            continue
        if item.get("sourceReviewId") != source_id:
            errors.append(f"{runtime_id} sourceReviewId mismatch")
        if item.get("frameWidth") != width or item.get("frameHeight") != height:
            errors.append(f"{runtime_id} frame size metadata mismatch")
        if item.get("frameCount") != count or item.get("fps") != fps or item.get("loop") != loop:
            errors.append(f"{runtime_id} timing metadata mismatch")
        if item.get("anchor") != anchor:
            errors.append(f"{runtime_id} anchor mismatch")

        files = item.get("files", {})
        sheet = ROOT / files.get("sheet", "")
        gif = ROOT / files.get("gif", "")
        metadata_path = ROOT / files.get("json", "")
        check_png(sheet, (width * count, height), errors)
        for frame_path in files.get("frames", []):
            check_png(ROOT / frame_path, (width, height), errors)
        if not gif.exists():
            errors.append(f"missing {rel(gif)}")
        else:
            gif_count, gif_loop = count_gif_frames(gif)
            if gif_count != count:
                errors.append(f"{runtime_id} GIF frames={gif_count}, expected={count}")
            if runtime_id == "meteor_warning" and gif_loop != 0:
                errors.append("meteor_warning GIF is not looping")
            if runtime_id == "meteor_impact" and gif_loop is not None:
                errors.append("meteor_impact GIF unexpectedly loops")
        if not metadata_path.exists():
            errors.append(f"missing {rel(metadata_path)}")
        else:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if metadata.get("id") != runtime_id or metadata.get("sheet") != f"{runtime_id}.png":
                errors.append(f"{runtime_id} normalized JSON mismatch")

        hashes = item.get("sha256", {})
        for name in ("sheet", "gif", "json"):
            path = ROOT / files.get(name, "")
            expected_hash = hashes.get(name)
            if path.exists() and expected_hash and sha256(path) != expected_hash:
                errors.append(f"{runtime_id} hash mismatch: {name}")
        for index, frame_path in enumerate(files.get("frames", [])):
            expected_hash = (hashes.get("frames") or [])[index] if index < len(hashes.get("frames") or []) else None
            if expected_hash and sha256(ROOT / frame_path) != expected_hash:
                errors.append(f"{runtime_id} hash mismatch: frame_{index:02d}")

    warning_path = GAME / "skills" / "gunner" / "vfx" / "meteor_warning" / "frame_05.png"
    impact_path = GAME / "skills" / "gunner" / "vfx" / "meteor_impact" / "frame_00.png"
    handoff_equal = False
    if warning_path.exists() and impact_path.exists():
        warning = Image.open(warning_path).convert("RGBA")
        world = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        world.alpha_composite(warning, (16, 32))
        for point, color in {
            (64, 64): (255, 238, 148, 255),
            (63, 64): (255, 170, 76, 255),
            (65, 64): (255, 170, 76, 255),
        }.items():
            world.putpixel(point, color)
        handoff_equal = list(world.getdata()) == list(Image.open(impact_path).convert("RGBA").getdata())
        if not handoff_equal:
            errors.append("warning frame_05 -> impact frame_00 handoff mismatch")

    dynamic_path = GAME / "dynamic_assets_manifest.json"
    if dynamic_path.exists():
        dynamic = json.loads(dynamic_path.read_text(encoding="utf-8"))
        for runtime_id, source_id in (("meteor_warning", "meteor_warning_v4"), ("meteor_impact", "meteor_impact_v3")):
            entry = next((item for item in dynamic.get("vfx", []) if item.get("id") == runtime_id), None)
            if not entry or entry.get("sourceReviewId") != source_id:
                errors.append(f"dynamic manifest sourceReviewId mismatch: {runtime_id}")

    report = {
        "passed": not errors,
        "manifest": rel(MANIFEST_PATH),
        "sourceReviewIds": {key: value[-1] for key, value in expected.items()},
        "handoffEqual": handoff_equal,
        "errors": errors,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
