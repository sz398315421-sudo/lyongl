from __future__ import annotations

"""Strict validation entry point for the V16 combo VFX review package.

The build module owns the canonical job table and checks; this small wrapper
keeps the requested ``python scripts/verify_combo_vfx.py`` interface without
duplicating asset definitions.
"""

from build_v16_combo_vfx import validate


if __name__ == "__main__":
    validate()
