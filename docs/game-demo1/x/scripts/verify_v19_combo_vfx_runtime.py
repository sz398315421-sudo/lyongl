"""Validate the nine additive V19 combo VFX runtime sheets."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
EXPECT = {
    "gunner": ["burst_overdrive", "railgun_overcharge", "critical_dash"],
    "warrior": ["fury_combo", "iron_fury", "blood_oath"],
    "mechanic": ["parallel_overclock", "field_reconstruction", "magnetic_reclaim"],
}


def check_png(path: Path, size: tuple[int, int]) -> None:
    with Image.open(path) as image:
        assert image.mode == "RGBA", f"{path}: expected RGBA"
        assert image.size == size, f"{path}: expected {size}, got {image.size}"
        alpha = image.getchannel("A")
        assert set(alpha.getdata()).issubset({0, 255}), f"{path}: non-binary alpha"
        assert alpha.getpixel((0, 0)) == 0, f"{path}: corner must be transparent"


def main() -> None:
    runtime_manifest = json.loads((ROOT / "assets/game/v19_combo_runtime_manifest.json").read_text(encoding="utf-8"))
    for role, ids in EXPECT.items():
        for vfx_id in ids:
            folder = ROOT / "assets/game/skills" / role / "vfx" / vfx_id
            data = json.loads((folder / f"{vfx_id}.json").read_text(encoding="utf-8"))
            assert data["frameCount"] == 8 and data["frameWidth"] == 96 and data["frameHeight"] == 96
            assert data["fps"] == 15 and data["loop"] is False
            check_png(folder / f"{vfx_id}.png", (768, 96))
            for index in range(8):
                check_png(folder / "frames" / f"frame_{index:02d}.png", (96, 96))
            gif_path = folder / f"{vfx_id}.gif"
            with Image.open(gif_path) as gif:
                assert int(getattr(gif, "n_frames", 1)) == 8, f"{gif_path}: expected 8 frames"
            assert vfx_id in runtime_manifest["assets"]
    print(f"V19 runtime validation passed: {sum(map(len, EXPECT.values()))} effects")


if __name__ == "__main__":
    main()
