"""Install the V7 review assets into assets/game with an explicit backup.

The script is intentionally conservative: only the three existing gunner VFX
folders are replaced in place.  New moon, elite, danger and exit assets are
copied into dedicated runtime folders, and a machine-readable install manifest
records every source and destination.
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "assets" / "game"
REVIEW = ROOT / "assets" / "concepts" / "v7_texture_review"
BACKUP = ROOT / "assets" / "concepts" / "v7_runtime_backup" / datetime.now().strftime("%Y%m%d_%H%M%S")
DIRECTIONS = ["front", "right", "back", "left"]


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def backup_existing(target: Path) -> None:
    if not target.exists():
        return
    destination = BACKUP / target.relative_to(GAME)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if target.is_dir():
        shutil.copytree(target, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(target, destination)


def replace_directory(target: Path) -> None:
    backup_existing(target)
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)


def copy_tree(source: Path, target: Path, replace: bool = False) -> None:
    if replace:
        replace_directory(target)
    else:
        target.mkdir(parents=True, exist_ok=True)
    for source_file in source.rglob("*"):
        if source_file.is_dir():
            continue
        destination = target / source_file.relative_to(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, destination)


def copy_file(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def install_normalized_vfx(source_id: str, target_id: str, source_dir: Path, target_dir: Path) -> dict:
    replace_directory(target_dir)
    for frame in sorted(source_dir.glob("frame_*.png")):
        copy_file(frame, target_dir / frame.name)
    copy_file(source_dir / f"{source_id}.png", target_dir / f"{target_id}.png")
    gif = source_dir / f"{source_id}.gif"
    if gif.exists():
        copy_file(gif, target_dir / f"{target_id}.gif")
    for extra in source_dir.glob("*_check.png"):
        copy_file(extra, target_dir / extra.name.replace(source_id, target_id))
    metadata = json.loads((source_dir / f"{source_id}.json").read_text(encoding="utf-8"))
    metadata["id"] = target_id
    metadata["sheet"] = f"{target_id}.png"
    metadata["previewGif"] = f"{target_id}.gif"
    metadata["sourceReviewId"] = source_id
    (target_dir / f"{target_id}.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "id": target_id,
        "sourceReviewId": source_id,
        "path": rel(target_dir / f"{target_id}.png"),
        "frameWidth": metadata["frameWidth"],
        "frameHeight": metadata["frameHeight"],
        "frameCount": metadata["frameCount"],
        "fps": metadata["fps"],
        "loop": metadata["loop"],
        "anchor": metadata["anchor"],
        "blendMode": metadata["blendMode"],
        "frames": [f"frame_{index:02d}.png" for index in range(int(metadata["frameCount"]))],
        "previewGif": f"{target_id}.gif",
    }


def install_moon_assets(runtime: dict) -> None:
    moon_dir = GAME / "planets" / "moon"
    moon_dir.mkdir(parents=True, exist_ok=True)
    for name in ("planet_moon.png", "planet_moon.json", "moon_cover.png", "moon_cover.json"):
        copy_file(REVIEW / "planets" / "moon" / name, moon_dir / name)
    runtime["planetMoon"] = {
        "icon": rel(moon_dir / "planet_moon.png"),
        "cover": rel(moon_dir / "moon_cover.png"),
    }


def install_moon_props(runtime: dict) -> None:
    source_dir = REVIEW / "props" / "moon"
    target_dir = GAME / "props" / "moon"
    target_dir.mkdir(parents=True, exist_ok=True)
    items = []
    for metadata_path in sorted(source_dir.glob("*.json")):
        item = json.loads(metadata_path.read_text(encoding="utf-8"))
        prop_id = item["id"]
        copy_file(source_dir / f"{prop_id}.png", target_dir / f"{prop_id}.png")
        copy_file(metadata_path, target_dir / metadata_path.name)
        items.append({"id": prop_id, "image": rel(target_dir / f"{prop_id}.png"), "metadata": rel(target_dir / metadata_path.name)})
    runtime["moonProps"] = items


def install_enemy_variants(runtime: dict) -> None:
    runtime["enemyDanger"] = []
    runtime["elites"] = []
    for category, root_name in (("danger", "enemyDanger"), ("elites", "elites")):
        source_root = REVIEW / "enemies" / category
        if not source_root.exists():
            continue
        for planet_dir in sorted(source_root.iterdir()):
            if not planet_dir.is_dir():
                continue
            for enemy_dir in sorted(planet_dir.iterdir()):
                if not enemy_dir.is_dir():
                    continue
                if category == "danger":
                    target_dir = GAME / "enemies" / planet_dir.name / enemy_dir.name / "attack_danger"
                    target_dir.mkdir(parents=True, exist_ok=True)
                    for source_file in enemy_dir.iterdir():
                        if source_file.is_file():
                            copy_file(source_file, target_dir / source_file.name)
                    sheet = next(enemy_dir.glob("*_attack_danger_4dir.png"))
                    metadata = next(enemy_dir.glob("*_attack_danger_4dir.json"))
                    runtime[root_name].append({
                        "planet": planet_dir.name,
                        "enemyId": enemy_dir.name,
                        "sheet": rel(target_dir / sheet.name),
                        "metadata": rel(target_dir / metadata.name),
                    })
                else:
                    target_dir = GAME / "enemies" / planet_dir.name / enemy_dir.name / "elite"
                    target_dir.mkdir(parents=True, exist_ok=True)
                    for source_file in enemy_dir.iterdir():
                        if source_file.is_file():
                            copy_file(source_file, target_dir / source_file.name)
                    danger_source = enemy_dir / "attack_danger"
                    if danger_source.exists():
                        copy_tree(danger_source, target_dir / "attack_danger")
                    sheet = next(enemy_dir.glob("*_elite_4dir.png"))
                    metadata = next(enemy_dir.glob("*_elite_4dir.json"))
                    runtime[root_name].append({
                        "planet": planet_dir.name,
                        "enemyId": enemy_dir.name,
                        "sheet": rel(target_dir / sheet.name),
                        "metadata": rel(target_dir / metadata.name),
                        "dangerSheet": rel(target_dir / "attack_danger" / f"{enemy_dir.name}_elite_attack_danger_4dir.png") if danger_source.exists() else None,
                    })


def install_exit_ui(runtime: dict) -> None:
    source_dir = REVIEW / "ui" / "exit_run"
    target_dir = GAME / "ui" / "exit_run"
    target_dir.mkdir(parents=True, exist_ok=True)
    files = []
    for source_file in source_dir.iterdir():
        if source_file.is_file():
            copy_file(source_file, target_dir / source_file.name)
            files.append(rel(target_dir / source_file.name))
    runtime["exitUi"] = files


def update_dynamic_manifest(vfx: dict) -> None:
    path = GAME / "dynamic_assets_manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for entry in manifest.get("vfx", []):
        installed = vfx.get(entry.get("id"))
        if not installed:
            continue
        entry.update({
            "frameWidth": installed["frameWidth"],
            "frameHeight": installed["frameHeight"],
            "frameCount": installed["frameCount"],
            "fps": installed["fps"],
            "loop": installed["loop"],
            "anchor": installed["anchor"],
            "blendMode": installed["blendMode"],
            "frames": installed["frames"],
            "previewGif": installed["previewGif"],
            "sourceReviewId": installed["sourceReviewId"],
        })
        entry["path"] = installed["path"]
        entry["image"] = Path(installed["path"]).name
    manifest["v7Runtime"] = {
        "version": 7,
        "sourceReview": "assets/concepts/v7_texture_review/v7_texture_manifest.json",
        "manifest": "assets/game/v7_runtime_manifest.json",
        "enemyDangerCount": len(json.loads((GAME / "v7_runtime_manifest.json").read_text(encoding="utf-8")).get("enemyDanger", [])) if (GAME / "v7_runtime_manifest.json").exists() else 0,
    }
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    runtime: dict = {"version": 7, "sourceReview": "assets/concepts/v7_texture_review/v7_texture_manifest.json", "backup": rel(BACKUP), "vfx": {}}
    install_moon_assets(runtime)
    install_moon_props(runtime)
    install_enemy_variants(runtime)
    install_exit_ui(runtime)

    vfx_sources = {
        "meteor_warning": ("meteor_warning_v2", REVIEW / "vfx" / "meteor_warning_v2", GAME / "skills" / "gunner" / "vfx" / "meteor_warning"),
        "meteor_impact": ("meteor_impact_v2", REVIEW / "vfx" / "meteor_impact_v2", GAME / "skills" / "gunner" / "vfx" / "meteor_impact"),
        "railgun_beam": ("railgun_beam_single", REVIEW / "vfx" / "railgun_beam_single", GAME / "skills" / "gunner" / "vfx" / "railgun_beam"),
    }
    for target_id, (source_id, source_dir, target_dir) in vfx_sources.items():
        runtime["vfx"][target_id] = install_normalized_vfx(source_id, target_id, source_dir, target_dir)

    manifest_path = GAME / "v7_runtime_manifest.json"
    manifest_path.write_text(json.dumps(runtime, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_dynamic_manifest(runtime["vfx"])
    print(json.dumps({"backup": rel(BACKUP), "vfx": list(runtime["vfx"]), "danger": len(runtime["enemyDanger"]), "elites": len(runtime["elites"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
