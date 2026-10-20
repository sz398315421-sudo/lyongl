# Downloadable vehicle models

This folder contains nine downloaded vehicle models, eight prepared delivery models, previews, provenance and SHA-256 checksums. These files are independent of the website's currently selected vehicle. BMW X6 is stored separately at the project root.

## Download and use

After cloning this repository, run this command from its root:

```sh
python3 vehicle-library/download.py --output vehicle-models
```

The script uses only the Python standard library. It copies locally available models or downloads missing files, verifies checksums, reassembles split archives automatically, and restores the original relative paths. The Taycan includes `scene.gltf`, `scene.bin` and `textures/znack1_baseColor.png`; keep them together.

To restore the eight smaller prepared models, with the original Model Y as a fallback:

```sh
python3 vehicle-library/download.py --variant prepared --output vehicle-models
```

To select individual vehicles:

```sh
python3 vehicle-library/download.py --models ix model-3 --variant prepared --output vehicle-models
```

You can also download only this script from GitHub and run it; it retrieves the manifest automatically. A complete repository download or clone already contains the binary files, and the script copies those local files instead of downloading them again.

## Contents

| ID | Vehicle | Original entry file after extraction | Prepared model |
| --- | --- | --- | --- |
| `ix` | BMW iX | `ix/source.glb` | [GLB.gz](prepared/ix/model.glb.gz) · [Preview](prepared/ix/preview.webp) |
| `xc90` | Volvo XC90 | `xc90/source.glb` | [GLB.gz](prepared/xc90/model.glb.gz) · [Preview](prepared/xc90/preview.webp) |
| `model-3` | Tesla Model 3, 2024 | `model-3/2024_tesla_model_3.glb` | [GLB.gz](prepared/model-3/model.glb.gz) · [Preview](prepared/model-3/preview.webp) |
| `model-y` | Tesla Model Y | `model-y/source.glb` | Original asset only |
| `taycan` | Porsche Taycan | `taycan/scene.gltf` | [GLB.gz](prepared/taycan/model.glb.gz) · [Preview](prepared/taycan/preview.webp) |
| `clk-gtr` | Mercedes-Benz CLK GTR AMG | `clk-gtr/source.glb` | [GLB.gz](prepared/clk-gtr/model.glb.gz) · [Preview](prepared/clk-gtr/preview.webp) |
| `artura` | McLaren Artura | `artura/source.glb` | [GLB.gz](prepared/artura/model.glb.gz) · [Preview](prepared/artura/preview.webp) |
| `911-gt3-r` | Porsche 911 GT3 R Rennsport (992) | `911-gt3-r/source.glb` | [GLB.gz](prepared/911-gt3-r/model.glb.gz) · [Preview](prepared/911-gt3-r/preview.webp) |
| `lynk-05` | Lynk & Co 05 | `lynk-05/source.glb` | [GLB.gz](prepared/lynk-05/model.glb.gz) · [Preview](prepared/lynk-05/preview.webp) |

The four additions above were downloaded through Sketchfab's signed-in download dialog on 2026-10-20. Their exact downloaded GLBs are preserved in `sources/<id>/source.glb.gz.partNNN` (4 MiB parts, joined by the downloader); the downloader restores them losslessly. These additions are local to this project and are not present at the upstream repository URL. Use the local checkout for downloading/copying them, or set `--base-url` to a server that contains this project's library. They are included in the live selector; Model Y and Taycan remain library-only. The supplied Lynk & Co 02 page did not offer downloads, so that model was skipped.

To reproduce an addition from a downloaded GLB: `node scripts/import-sketchfab-vehicle.mjs <id> <downloaded.glb>`. Run `npm run build` after updating the model and its previews.

Original archives are losslessly compressed. Large archives use numbered `.partNNN` files to keep individual Git files small; the downloader joins them in order before extraction. Do not extract a single part by itself. [manifest.json](manifest.json) records every part and every original file, including checksums.

Prepared assets contain optimized geometry and textures. Their GLBs use `EXT_meshopt_compression`; configure a Meshopt decoder when loading them with Three.js. The downloader removes the outer gzip layer and writes `prepared/<id>/model.glb`. The Taycan prepared copy simplifies its geometry to a target ratio of 0.4. Use the originals for unmodified geometry and materials.

## Three.js integration

[three/load-prepared.js](three/load-prepared.js) and its accompanying [material recipe](three/vehicle-materials.js) reproduce DriveScene's white paint, glazing, rear lighting and normalized orientation/dimensions. These styling changes are applied at runtime, separately from the compressed model files. The helper uses Three.js and its bundled GLTFLoader/MeshoptDecoder; use the same Three.js package version for all imports (the existing project uses 0.180.0).

```js
import {loadPreparedVehicle} from './vehicle-library/three/load-prepared.js';
const car = await loadPreparedVehicle('ix');
scene.add(car);
```

To load a decompressed model from your own project, pass `{url: './vehicle-models/prepared/ix/model.glb'}` as the second argument. Serve files over HTTP during browser development. Model Y is supplied as a complete original GLB and can be loaded with a standard GLTFLoader; it has no matching DriveScene material recipe.

See [CREDITS.md](CREDITS.md) for authors, source pages, licenses and processing details. Third-party vehicles retain their own attribution; the repository's MIT license does not relicense them.
