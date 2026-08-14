from __future__ import annotations

"""Build the V19 three-class combo VFX review package.

This wrapper reuses the proven V16 storyboard extraction/validation pipeline,
but supplies the nine new combo definitions and writes only to the V19 review
directory. It never writes to assets/game or runtime manifests.
"""

import json
import runpy
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
V16 = ROOT / "scripts" / "build_v16_combo_vfx.py"
NS = runpy.run_path(str(V16), run_name="v19_combo_builder")

REVIEW = ROOT / "assets" / "concepts" / "v19_combo_vfx_review"
TMP = ROOT / "tmp" / "imagegen" / "v19_combo_vfx"

JOBS = {
    "burst_overdrive": {"classId": "gunner", "comboId": "burst_overdrive", "requires": ["burst", "magazine"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "cyan-white barrage with acid-green overdrive and orange heat points", "effect": "连续弹幕形成集中火力，短暂强化多发射击反馈"},
    "railgun_overcharge": {"classId": "gunner", "comboId": "railgun_overcharge", "requires": ["railgun", "reload"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "single cyan-white rail beam with orange charge core", "effect": "轨道枪完成蓄能后释放一次更强的贯穿脉冲"},
    "critical_dash": {"classId": "gunner", "comboId": "critical_dash", "requires": ["crit", "emergency_dash"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "cyan propulsion trail with acid-green lock nodes and orange critical spark", "effect": "推进闪避后锁定目标弱点，释放一次高亮精准打击"},
    "fury_combo": {"classId": "warrior", "comboId": "fury_combo", "requires": ["double_slash", "strength"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "cyan-white crossed sword arcs with orange-red core", "effect": "连续挥出交叉剑弧，形成一次重叠斩击"},
    "iron_fury": {"classId": "warrior", "comboId": "iron_fury", "requires": ["battle_fury", "guard"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "oblique cyan shield ring with orange guard sparks and warm yellow counter pulse", "effect": "格挡姿态蓄力后释放带护盾反馈的反击冲击"},
    "blood_oath": {"classId": "warrior", "comboId": "blood_oath", "requires": ["lifesteal", "unyielding"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "deep crimson life pulse with orange recovery shards and cyan center", "effect": "低生命状态下释放生命回收脉冲，并强化近战收束效果"},
    "parallel_overclock": {"classId": "mechanic", "comboId": "parallel_overclock", "requires": ["mech_count", "overclock"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "acid-green mechanical nodes with electric-blue arcs and cyan core", "effect": "多台机械同步过载，形成短暂电弧网"},
    "field_reconstruction": {"classId": "mechanic", "comboId": "field_reconstruction", "requires": ["quick_deploy", "repair_bot"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "cyan repair nodes with acid-green plates and white-cyan pulse", "effect": "快速部署维修单元，释放范围维修脉冲"},
    "magnetic_reclaim": {"classId": "mechanic", "comboId": "magnetic_reclaim", "requires": ["recycle_heal", "magnet"], "frameWidth": 96, "frameHeight": 96, "frameCount": 8, "fps": 15, "loop": False, "blendMode": "lighter", "anchor": {"x": 48, "y": 48}, "eventUnit": "combo_activation", "palette": "acid-green and rust-silver scrap pulled into a cyan-white recovery core", "effect": "磁力聚拢废料并转化为范围恢复能量"},
}

def patch_module():
    # Functions loaded by runpy retain the source module's globals dict, so
    # patch that dict directly rather than only changing the runpy namespace.
    module_globals = NS["prepare_cells"].__globals__
    module_globals.update({"ROOT": ROOT, "REVIEW": REVIEW, "TMP": TMP, "JOBS": JOBS})
    # V16's preview helper hard-codes its own representative IDs. Replace it
    # with the V19-specific preview below while reusing the rest of the proven
    # extraction and validation pipeline.
    module_globals["make_gameplay_preview"] = make_v19_gameplay_preview

def make_v19_gameplay_preview():
    ground_paths = {
        "rust": ROOT / "assets" / "game" / "planets" / "rust_ground.png",
        "spore": ROOT / "assets" / "game" / "planets" / "spore_ground.png",
        "moon": ROOT / "assets" / "game" / "planets" / "moon_ground.png",
    }
    representatives = ["burst_overdrive", "fury_combo", "parallel_overclock"]
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
            cell.alpha_composite(Image.new("RGBA", cell.size, (0, 0, 0, 62)))
            effect = Image.open(REVIEW / "vfx" / asset_id / "frames" / "frame_03.png").convert("RGBA")
            cell.alpha_composite(effect, ((360 - effect.width) // 2, (180 - effect.height) // 2))
            x, y = col * 360, row * 180
            canvas.alpha_composite(cell, (x, y))
            draw.rectangle((x, y, x + 359, y + 179), outline=(90, 123, 124, 255), width=1)
            draw.text((x + 8, y + 8), f"{planet.upper()} // {asset_id}", fill=(229, 242, 226, 255))
    canvas.save(REVIEW / "v19_combo_vfx_gameplay_preview.png")
    canvas.resize((canvas.width * 2, canvas.height * 2), Image.Resampling.NEAREST).save(REVIEW / "v19_combo_vfx_gameplay_preview_2x.png")

def postprocess_metadata():
    REVIEW.mkdir(parents=True, exist_ok=True)
    for asset_id, spec in JOBS.items():
        path = REVIEW / "vfx" / asset_id / f"{asset_id}.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        payload.update({"comboId": spec["comboId"], "requires": spec["requires"], "effect": spec["effect"], "classId": spec["classId"], "generationModel": "gpt-image-2", "generationProvider": "codex", "generationQuality": "medium"})
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    overview = REVIEW / "combo_vfx_overview.png"
    if overview.exists():
        target = REVIEW / "v19_combo_vfx_overview.png"
        if target.exists(): target.unlink()
        overview.rename(target)
    overview2 = REVIEW / "combo_vfx_overview_2x.png"
    if overview2.exists():
        target = REVIEW / "v19_combo_vfx_overview_2x.png"
        if target.exists(): target.unlink()
        overview2.rename(target)
    gameplay = REVIEW / "combo_vfx_gameplay_preview.png"
    if gameplay.exists():
        target = REVIEW / "v19_combo_vfx_gameplay_preview.png"
        if target.exists(): target.unlink()
        gameplay.rename(target)
    gameplay2 = REVIEW / "combo_vfx_gameplay_preview_2x.png"
    if gameplay2.exists():
        target = REVIEW / "v19_combo_vfx_gameplay_preview_2x.png"
        if target.exists(): target.unlink()
        gameplay2.rename(target)

    manifest = {"id": "v19_combo_vfx_review", "generationModel": "gpt-image-2", "provider": "codex", "quality": "medium", "sourceDirectory": "tmp/imagegen/v19_combo_vfx", "outputDirectory": "assets/concepts/v19_combo_vfx_review", "assetCount": len(JOBS), "assets": []}
    for asset_id, spec in JOBS.items():
        manifest["assets"].append({"id": asset_id, "classId": spec["classId"], "comboId": spec["comboId"], "requires": spec["requires"], "effect": spec["effect"], "frameWidth": spec["frameWidth"], "frameHeight": spec["frameHeight"], "frameCount": 8, "fps": spec["fps"], "loop": spec["loop"], "anchor": spec["anchor"], "blendMode": spec["blendMode"], "json": f"vfx/{asset_id}/{asset_id}.json", "sheet": f"vfx/{asset_id}/{asset_id}.png"})
    (REVIEW / "v19_combo_vfx_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (REVIEW / "v19_combo_vfx_generation.json").write_text(json.dumps({"id": "v19_combo_vfx_generation", "model": "gpt-image-2", "provider": "codex", "quality": "medium", "size": "2K", "transparentExtraction": {"method": "chroma", "matteColor": "auto", "material": "effect", "strict": True}, "pixelization": "nearest-neighbor", "assets": [{"id": k, "promptBrief": v["palette"]} for k, v in JOBS.items()]}, ensure_ascii=False, indent=2), encoding="utf-8")

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "finalize", "validate"}:
        raise SystemExit("usage: build_v19_combo_vfx.py prepare|finalize|validate")
    patch_module()
    command = sys.argv[1]
    if command == "prepare": NS["prepare_cells"]()
    elif command == "finalize": NS["finalize"](); postprocess_metadata()
    else:
        NS["validate"](); postprocess_metadata()
        validation = {"passed": True, "assetCount": len(JOBS), "checked": [{"id": k, "frameCount": 8, "frameWidth": v["frameWidth"], "frameHeight": v["frameHeight"], "fps": v["fps"], "loop": v["loop"]} for k, v in JOBS.items()]}
        (REVIEW / "v19_combo_vfx_validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(validation, ensure_ascii=False))

if __name__ == "__main__": main()
