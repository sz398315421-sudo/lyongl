from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "assets" / "game" / "skills" / "warrior" / "vfx" / "orbit_blade"
errors = []
frames = sorted(FOLDER.glob("frame_*.png"))
if len(frames) != 6:
    errors.append(f"expected 6 frames, found {len(frames)}")
for path in frames:
    image = Image.open(path)
    if image.mode != "RGBA" or image.size != (64, 64):
        errors.append(f"{path.name}: invalid {image.mode} {image.size}")
    if set(image.getchannel("A").getdata()) - {0, 255}:
        errors.append(f"{path.name}: non-hard alpha")
sheet = FOLDER / "orbit_blade.png"
if not sheet.exists() or Image.open(sheet).size != (384, 64):
    errors.append("orbit_blade.png must be 384x64")
spec_path = FOLDER / "orbit_blade.json"
if not spec_path.exists():
    errors.append("missing orbit_blade.json")
else:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    for key, value in {"frameWidth": 64, "frameHeight": 64, "frameCount": 6, "fps": 14}.items():
        if spec.get(key) != value:
            errors.append(f"json {key} mismatch")
print(json.dumps({"passed": not errors, "errors": errors, "checkedFrames": len(frames)}, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
