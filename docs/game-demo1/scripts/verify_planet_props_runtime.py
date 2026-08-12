from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "game" / "props"
MANIFEST_PATH = ASSET_ROOT / "planet_props_manifest.json"
REPORT_PATH = ASSET_ROOT / "planet_props_validation.json"


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def check_png(path: Path, expected_size: tuple[int, int]) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return [f"missing {relative(path)}"]
    try:
        image = Image.open(path)
        if image.mode != "RGBA":
            errors.append(f"{relative(path)}: mode {image.mode}")
        if image.size != expected_size:
            errors.append(f"{relative(path)}: size {image.size}, expected {expected_size}")
        alpha = image.getchannel("A")
        if alpha.getbbox() is None:
            errors.append(f"{relative(path)}: empty alpha")
        values = set(alpha.getdata())
        if not values.issubset({0, 255}):
            errors.append(f"{relative(path)}: non-hard alpha values")
        if any(alpha.crop((0, 0, image.width, 1)).getdata()) or any(alpha.crop((0, image.height - 1, image.width, image.height)).getdata()):
            errors.append(f"{relative(path)}: alpha touches horizontal edge")
        if any(alpha.crop((0, 0, 1, image.height)).getdata()) or any(alpha.crop((image.width - 1, 0, image.width, image.height)).getdata()):
            errors.append(f"{relative(path)}: alpha touches vertical edge")
        for r, g, b, a in image.getdata():
            if a and r > 145 and b > 115 and g < max(125, min(r, b) * 0.72):
                errors.append(f"{relative(path)}: magenta residue")
                break
    except Exception as exc:
        errors.append(f"{relative(path)}: unreadable ({exc})")
    return errors


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    errors: list[str] = []
    checks: list[dict] = []
    expected_active = set()

    for planet, planet_spec in manifest["planets"].items():
        ids = planet_spec["ids"]
        if len(ids) != 8 or len(set(ids)) != 8:
            errors.append(f"{planet}: expected exactly 8 unique active IDs")
        for asset_id in ids:
            expected_active.add(asset_id)
            spec = planet_spec["props"].get(asset_id)
            if not spec:
                errors.append(f"{planet}.{asset_id}: missing manifest spec")
                continue
            if (
                manifest["allActivePropsSolid"] is not True
                or spec.get("collision") is not True
                or spec.get("collisionShape") != "circle"
                or not spec.get("collisionRadius")
            ):
                errors.append(f"{planet}.{asset_id}: collision metadata invalid")
            png = ASSET_ROOT / spec["path"]
            errors.extend(check_png(png, tuple(spec["size"])))
            json_path = png.with_suffix(".json")
            if not json_path.exists():
                errors.append(f"missing {relative(json_path)}")
            else:
                metadata = json.loads(json_path.read_text(encoding="utf-8"))
                if metadata.get("width") != spec["size"][0] or metadata.get("height") != spec["size"][1]:
                    errors.append(f"{relative(json_path)}: size metadata mismatch")
                if metadata.get("anchor") != {"x": spec["anchor"][0], "y": spec["anchor"][1]}:
                    errors.append(f"{relative(json_path)}: anchor metadata mismatch")
            checks.append({"planet": planet, "id": asset_id, "path": relative(png), "collisionRadius": spec["collisionRadius"]})

    for planet in ("rust", "spore", "moon"):
        directory = ASSET_ROOT / planet
        active_ids = set(manifest["planets"][planet]["ids"])
        png_names = {path.stem for path in directory.rglob("*.png") if path.is_file()}
        stale = sorted(png_names - active_ids)
        if stale:
            errors.append(f"{planet}: stale active PNGs {stale}")

    backup_dirs = sorted((ROOT / "assets" / "concepts" / "v10_props_runtime_backup").glob("20*"))
    if not backup_dirs:
        errors.append("missing runtime backup directory")

    report = {
        "passed": not errors,
        "planetCount": 3,
        "activePropsPerPlanet": {planet: len(spec["ids"]) for planet, spec in manifest["planets"].items()},
        "instancesPerRun": manifest["instanceCount"],
        "collision": {"shape": manifest["collisionShape"], "allActivePropsSolid": manifest["allActivePropsSolid"]},
        "checks": checks,
        "errors": errors,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
