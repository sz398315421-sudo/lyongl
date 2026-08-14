from __future__ import annotations

"""Audit that rebuilt action frames retain the formal base sprite identity."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

from rebuild_formal_action_sequences import (
    ASSETS,
    CHARACTERS,
    DIRECTIONS,
    ENEMY_STATES,
    FRAME_H,
    FRAME_W,
    RUST_ENEMIES,
    TARGET_FRAME_COUNT,
    TARGET_SHEET_COUNT,
    base_bbox,
    load_formal_bases,
)


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "qa" / "formal_action_identity_audit.json"
BASELINE_PATH = ROOT / "qa" / "formal_action_protected_hashes.json"


def _is_target_action_file(path: Path) -> bool:
    relative = path.relative_to(ASSETS)
    parts = relative.parts
    if len(parts) < 5 or parts[0] not in {"characters", "enemies"}:
        return False
    if "actions" not in parts:
        return False
    action_index = parts.index("actions")
    if action_index + 1 >= len(parts):
        return False
    state = parts[action_index + 1]
    if parts[0] == "enemies":
        return len(parts) >= 4 and parts[1] == "rust" and parts[2] in RUST_ENEMIES and state in ENEMY_STATES
    return parts[1] in CHARACTERS and state in CHARACTERS[parts[1]]["states"]


def protected_hashes() -> dict[str, str]:
    """Hash runtime code and every game asset outside the explicitly rebuilt paths."""

    files = [path for path in ASSETS.rglob("*") if path.is_file() and not _is_target_action_file(path)]
    files.extend(path for path in (ROOT / "src").rglob("*") if path.is_file())
    hashes: dict[str, str] = {}
    for path in sorted(set(files)):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        key = str(path.relative_to(ROOT)).replace("\\", "/")
        hashes[key] = digest
    return hashes


def write_hash_baseline() -> dict[str, int | str]:
    hashes = protected_hashes()
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_PATH.write_text(json.dumps(hashes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"path": str(BASELINE_PATH), "files": len(hashes)}


def compare_hash_baseline() -> dict:
    if not BASELINE_PATH.exists():
        raise FileNotFoundError(f"hash baseline is missing: {BASELINE_PATH}")
    before = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    after = protected_hashes()
    missing = sorted(set(before) - set(after))
    added = sorted(set(after) - set(before))
    changed = sorted(key for key in set(before) & set(after) if before[key] != after[key])
    return {"passed": not (missing or added or changed), "missing": missing, "added": added, "changed": changed, "files": len(after)}


def opaque_pixels(image: Image.Image) -> list[tuple[int, int, tuple[int, int, int]]]:
    pixels = image.convert("RGBA").load()
    return [(x, y, pixels[x, y][:3]) for y in range(image.height) for x in range(image.width) if pixels[x, y][3] >= 96]


def best_overlap(base: Image.Image, frame: Image.Image) -> float:
    """Allow the intentional one-pixel motion while rejecting unrelated bodies."""

    base_pixels = base.convert("RGBA").load()
    frame_pixels = frame.convert("RGBA").load()
    best = 0.0
    frame_count = sum(1 for y in range(FRAME_H) for x in range(FRAME_W) if frame_pixels[x, y][3] >= 96)
    if frame_count == 0:
        return 0.0
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            matches = 0
            for y in range(FRAME_H):
                for x in range(FRAME_W):
                    alpha = frame_pixels[x, y][3]
                    if alpha < 96:
                        continue
                    bx = x - dx
                    by = y - dy
                    if 0 <= bx < FRAME_W and 0 <= by < FRAME_H and base_pixels[bx, by][3] >= 96:
                        matches += 1
            best = max(best, matches / frame_count)
    return best


def color_identity(base: Image.Image, frame: Image.Image) -> float:
    base_colors = {pixel[2] for pixel in opaque_pixels(base)}
    frame_pixels = opaque_pixels(frame)
    if not frame_pixels:
        return 0.0
    return sum(1 for _x, _y, color in frame_pixels if color in base_colors) / len(frame_pixels)


def audit() -> dict:
    failures: list[dict] = []
    sheet_count = 0
    frame_count = 0
    entries: list[dict] = []

    targets = []
    for asset_id, behavior in RUST_ENEMIES.items():
        targets.append(("enemy", asset_id, behavior, ASSETS / "enemies" / "rust" / asset_id, ENEMY_STATES))
    for asset_id, spec in CHARACTERS.items():
        targets.append(("character", asset_id, spec["role"], ASSETS / "characters" / asset_id, spec["states"]))

    for family, asset_id, detail, folder, states in targets:
        bases = load_formal_bases(folder)
        for state, count in states.items():
            sheet_count += 1
            action_dir = folder / "actions" / state
            sheet_path = action_dir / f"{asset_id}_{state}_4dir.png"
            if not sheet_path.exists():
                failures.append({"asset": f"{asset_id}.{state}", "reason": "sheet_missing"})
                continue
            sheet = Image.open(sheet_path).convert("RGBA")
            if sheet.size != (FRAME_W * count, FRAME_H * len(DIRECTIONS)):
                failures.append({"asset": f"{asset_id}.{state}", "reason": "sheet_size", "actual": list(sheet.size)})
            state_min_overlap = 1.0
            state_min_color = 1.0
            state_edges = 0
            for row, direction in enumerate(DIRECTIONS):
                base = bases[direction]
                for index in range(count):
                    frame_count += 1
                    frame_path = action_dir / f"{direction}_{index:02d}.png"
                    if not frame_path.exists():
                        failures.append({"asset": f"{asset_id}.{state}.{direction}.{index:02d}", "reason": "frame_missing"})
                        continue
                    frame = Image.open(frame_path).convert("RGBA")
                    if frame.size != (FRAME_W, FRAME_H):
                        failures.append({"asset": str(frame_path), "reason": "frame_size", "actual": list(frame.size)})
                        continue
                    if any(frame.getpixel(point)[3] for point in ((0, 0), (63, 0), (0, 63), (63, 63))):
                        state_edges += 1
                    overlap = best_overlap(base, frame)
                    identity = color_identity(base, frame)
                    state_min_overlap = min(state_min_overlap, overlap)
                    state_min_color = min(state_min_color, identity)
                    frame_pixels = frame.load()
                    visible_pixels = sum(1 for y in range(frame.height) for x in range(frame.width) if frame_pixels[x, y][3] >= 96)
                    # Hit is an intentional white flash: the silhouette must
                    # remain, but exact RGB equality is not meaningful. Death
                    # deliberately fades below the audit threshold in its last
                    # frame, so that terminal fade is checked only for geometry.
                    overlap_limit = 0.30 if state == "death" else 0.58
                    color_limit = 0.16 if state == "death" else 0.26
                    if not (state == "death" and visible_pixels < 4) and overlap < overlap_limit:
                        failures.append({"asset": str(frame_path), "reason": "base_overlap_low", "overlap": round(overlap, 4), "limit": overlap_limit})
                    if state not in {"hit", "death"} and identity < color_limit:
                        failures.append({"asset": str(frame_path), "reason": "palette_identity_low", "identity": round(identity, 4), "limit": color_limit})
                    hidden_rgb = any(
                        frame_pixels[x, y][3] == 0 and frame_pixels[x, y][:3] != (0, 0, 0)
                        for y in range(frame.height)
                        for x in range(frame.width)
                    )
                    if hidden_rgb:
                        failures.append({"asset": str(frame_path), "reason": "hidden_rgb"})
            entries.append({
                "asset": f"{asset_id}.{state}",
                "family": family,
                "detail": detail,
                "frameCount": count * len(DIRECTIONS),
                "minBaseOverlap": round(state_min_overlap, 4),
                "minPaletteIdentity": round(state_min_color, 4),
                "cornerEdgeViolations": state_edges,
            })

    report = {
        "passed": not failures,
        "targetSheets": sheet_count,
        "targetFrames": frame_count,
        "expectedSheets": TARGET_SHEET_COUNT,
        "expectedFrames": TARGET_FRAME_COUNT,
        "failures": failures,
        "entries": entries,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true", help="return a failing exit code when any identity check fails")
    parser.add_argument("--write-baseline", action="store_true", help="hash protected assets and src before a rebuild")
    parser.add_argument("--compare-baseline", action="store_true", help="compare protected assets and src with the saved baseline")
    args = parser.parse_args()
    if args.write_baseline:
        print(json.dumps(write_hash_baseline(), ensure_ascii=False))
        return
    if args.compare_baseline:
        result = compare_hash_baseline()
        print(json.dumps(result, ensure_ascii=False))
        if args.strict and not result["passed"]:
            raise SystemExit(1)
        return
    report = audit()
    print(json.dumps({"passed": report["passed"], "targetSheets": report["targetSheets"], "targetFrames": report["targetFrames"], "failures": len(report["failures"]), "report": str(REPORT_PATH)}, ensure_ascii=False))
    if args.strict and not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
