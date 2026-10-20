# Vehicle attribution

The downloaded original glTF/GLB files embed declarations of **Creative Commons Attribution 4.0 International (CC BY 4.0)**. Their original metadata is preserved inside the archives. License: https://creativecommons.org/licenses/by/4.0/ . Retain the author, source and license attribution and indicate modifications when sharing models or rendered derivatives. Manufacturer names identify the depicted vehicles.

## BMW iX

Model: **2024 BMW iX**. Author: **DisneyCars**, https://sketchfab.com/supercarmodels . Source: https://sketchfab.com/3d-models/2024-bmw-ix-b277d6b6109845ffb3cc5de325e71948 . Downloaded through the official Sketchfab download API. Original: `ix/source.glb`.

## Volvo XC90

Author: **Nieve5677**, https://sketchfab.com/niev . Source: https://sketchfab.com/3d-models/volvo-xc90-8135a6c9c9344079bfaefc9d747e2ceb . Downloaded through the official Sketchfab download API. Original: `xc90/source.glb`.

## Tesla Model 3 (2024)

Embedded author: **RBLXSupercars**, https://sketchfab.com/RBLXSupercars . Embedded source: https://sketchfab.com/3d-models/2024-tesla-model-3-fd22be415215453693d67e33aa7812d0 . The selected download page is uploaded by **brandonleong28**: https://sketchfab.com/3d-models/tesla-model-3-2024-36c52f3f89f6439c90310f14e8ff33f2 . Both are credited. The public source copy was obtained from `erictfree/Carbon-Footprint-AI-Visualizer`, commit `af4bef33ca371b24c1f043486f09a13571f4919b`. Original: `model-3/2024_tesla_model_3.glb`; its accompanying `CREDITS.md` is included unchanged.

## Tesla Model Y

Author: **Nieve5677**, https://sketchfab.com/niev . Source: https://sketchfab.com/3d-models/tesla-model-y-bc8ac22c744b4d11b92f2f31ab0297d0 . Original: `model-y/source.glb`. No DriveScene-prepared variant is included.

## Porsche Taycan

Embedded model title: **Porshe Taycan**. Author: **Mikhail Hamanovich**, https://sketchfab.com/mihailhamanovich . Source: https://sketchfab.com/3d-models/porshe-taycan-c6004141452e4d3ab048bf0fee52666d . The public source copy was obtained from `ridhijain709/AIPORSCHE`, commit `9f335f687745f105254860386a7645b491b21a20`. Original: `taycan/scene.gltf`, its `scene.bin`, and its `textures/znack1_baseColor.png`.

## Models added on 2026-10-20

Downloaded through Sketchfab's signed-in download dialog. Each page and embedded GLB metadata declared CC BY 4.0. Exact downloaded GLBs are preserved without modification in `sources/<id>/source.glb.gz.partNNN` (4 MiB parts, joined by the downloader); SHA-256 checksums are recorded in `manifest.json`.

| ID | Model | Author | Source |
| --- | --- | --- | --- |
| `clk-gtr` | Mercedes-Benz CLK GTR AMG Road Version | [Nieve5677](https://sketchfab.com/niev) | [Sketchfab](https://sketchfab.com/3d-models/mercedes-benz-clk-gtr-amg-road-version-b8e6e35c456b485a853fa987b1434b14) |
| `artura` | McLaren Artura | [Nieve5677](https://sketchfab.com/niev) | [Sketchfab](https://sketchfab.com/3d-models/mclaren-artura-177df2daa98544aea719023e8b21645e) |
| `911-gt3-r` | 2023 Porsche 911 GT3 R Rennsport (992) | [DisneyCars](https://sketchfab.com/supercarmodels) | [Sketchfab](https://sketchfab.com/3d-models/2023-porsche-911-gt3-r-rennsport-992-371d129f13264723aa870255f0b3f663) |
| `lynk-05` | Lynk & Co 05 | [MattDoesBlender](https://sketchfab.com/MattDoesBlender) | [Sketchfab](https://sketchfab.com/3d-models/lynk-and-co-05-8343dcb4b43e49ec90a73bdaa083221e) |

License: https://creativecommons.org/licenses/by/4.0/ . The Mercedes embedded author profile points to `iori308408`, while the live page credits Nieve5677 (`niev`); the original embedded metadata is retained in the manifest. Source download formats: converted GLB for all four (the Lynk original download was an additional RAR inside ZIP).

Prepared copies use deduplication, WebP textures capped at 1024 pixels (quality 88), 16-bit position/texture-coordinate and 12-bit normal/color quantization, Meshopt and gzip compression. No triangles were intentionally simplified or interior components removed. Runtime styling applies white paint, dark glazing, tire/rim/trim materials and lamp adjustments; the Porsche keeps its source Rennsport livery. Lynk 05's merged source materials are reassigned by retained mesh and assembly names. Models are centered, grounded and normalized to display lengths; Mercedes also receives a Z-up to Y-up correction. Light/dark thumbnails are rendered from these exact runtime models.

The supplied [Lynk & Co 02 page](https://sketchfab.com/3d-models/low-poly-car-lynk-co-02-2025-c4ce70bfdda448e791e7cb83e11cdafa) was not downloadable and was skipped.

## Existing prepared variants

Original model files are archived without modifying their bytes; `manifest.json` records their SHA-256 checksums. Prepared variants for iX, XC90, Model 3 and Taycan are the existing DriveScene Studio delivery copies with WebP texture resizing, Meshopt and gzip compression. The Taycan delivery copy uses geometry simplification with target ratio 0.4 and error 0.0001. The included Three.js helper and material recipe apply pearl-white paint, separate glazing/rubber/trim materials, emissive rear lamps and normalized dimensions/orientation at runtime. That recipe recreates XC90 material assignments from the source mesh parts and smooths painted-panel normals. Previews are rendered derivatives of these models with the runtime styling applied.

The vehicle licenses are separate from the application MIT license and the original-environment license. No additional rights to manufacturers' trademarks are granted. This record reflects the embedded metadata and the local download/processing records; it does not claim a fresh review of the source pages.
