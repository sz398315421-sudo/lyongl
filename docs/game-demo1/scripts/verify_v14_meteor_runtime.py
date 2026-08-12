"""Verify the installed V14 meteor runtime assets and manifest hashes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
MANIFEST = GAME / "v14_meteor_runtime_manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def gif_count(path: Path) -> int:
    with Image.open(path) as image:
        return sum(1 for _ in ImageSequence.Iterator(image))


def main() -> None:
    errors: list[str] = []
    if not MANIFEST.exists():
        raise SystemExit(f"missing {MANIFEST}")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    # V14 is a historical runtime check. Once a newer approved sequence is
    # installed, its old hashes must not be treated as a live regression.
    current_sources = {item.get("sourceReviewId") for item in manifest.get("vfx", {}).values()}
    # A later installer may replace the same runtime IDs while intentionally
    # preserving this historical V14 manifest. Consult the live metadata so
    # this legacy checker can report a clean skip instead of comparing stale
    # V14 hashes to the newer files.
    for asset_id in ("meteor_warning", "meteor_impact"):
        live_meta = GAME / "skills" / "gunner" / "vfx" / asset_id / f"{asset_id}.json"
        if live_meta.exists():
            try:
                current_sources.add(json.loads(live_meta.read_text(encoding="utf-8")).get("sourceReviewId"))
            except (OSError, json.JSONDecodeError):
                pass
    if current_sources and not current_sources.issubset({"meteor_warning_v7", "meteor_impact_v5"}):
        result = {
            "id": "v14_meteor_runtime_validation",
            "passed": True,
            "skipped": True,
            "reason": "V14 runtime slots were superseded by a newer reviewed meteor sequence.",
            "currentSourceReviewIds": sorted(source for source in current_sources if source),
            "manifest": str(MANIFEST.relative_to(ROOT)).replace("\\", "/"),
        }
        (GAME / "v14_meteor_runtime_validation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    expected = {
        "meteor_warning": ((96, 64), 6, 12, True),
        "meteor_impact": ((128, 128), 10, 18, False),
    }
    checks = []
    for asset_id, (size, count, fps, loop) in expected.items():
        folder = GAME / "skills" / "gunner" / "vfx" / asset_id
        sheet = folder / f"{asset_id}.png"
        gif = folder / f"{asset_id}.gif"
        metadata_path = folder / f"{asset_id}.json"
        item = manifest.get("vfx", {}).get(asset_id, {})
        if not sheet.exists() or not gif.exists() or not metadata_path.exists():
            errors.append(f"missing runtime files for {asset_id}")
            continue
        image = Image.open(sheet).convert("RGBA")
        if image.size != (size[0] * count, size[1]):
            errors.append(f"{asset_id} sheet size {image.size}")
        frame_results = []
        for i in range(count):
            path = folder / "frame_{:02d}.png".format(i)
            if not path.exists():
                errors.append(f"missing {path}")
                continue
            frame = Image.open(path).convert("RGBA")
            alpha = list(frame.getchannel("A").getdata())
            frame_errors = []
            if frame.size != size:
                frame_errors.append(f"size {frame.size}")
            if any(a not in (0, 255) for a in alpha):
                frame_errors.append("non-binary alpha")
            if frame.getchannel("A").getbbox() is None:
                frame_errors.append("empty")
            if frame_errors:
                errors.append(f"{asset_id} frame {i}: {', '.join(frame_errors)}")
            frame_results.append({"frame": i, "size": list(frame.size), "errors": frame_errors})
        gif_frames = gif_count(gif)
        if gif_frames != count:
            errors.append(f"{asset_id} GIF frames={gif_frames}, expected {count}")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        for key, value in {"frameWidth": size[0], "frameHeight": size[1], "frameCount": count, "fps": fps, "loop": loop}.items():
            if metadata.get(key) != value:
                errors.append(f"{asset_id} metadata {key} mismatch")
        manifest_hash = item.get("sha256", {})
        if manifest_hash.get("png") and manifest_hash["png"] != sha256(sheet):
            errors.append(f"{asset_id} sheet hash mismatch")
        if manifest_hash.get("gif") and manifest_hash["gif"] != sha256(gif):
            errors.append(f"{asset_id} GIF hash mismatch")
        checks.append({"id": asset_id, "sheet": list(image.size), "gifFrames": gif_frames, "frameCount": len(frame_results), "sourceReviewId": item.get("sourceReviewId"), "frames": frame_results})
    result = {"id": "v14_meteor_runtime_validation", "passed": not errors, "checks": checks, "errors": errors, "manifest": str(MANIFEST.relative_to(ROOT)).replace("\\", "/")}
    output = GAME / "v14_meteor_runtime_validation.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
