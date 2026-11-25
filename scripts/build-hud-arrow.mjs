import {createRequire} from 'node:module';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(process.env.HMI_BUILD_PACKAGE || import.meta.url);
const {build} = require('esbuild');
const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const hud = path.join(docs, process.env.HMI_HUD_DIRECTORY || 'adas-hud');
const bundlePath = path.join(hud, 'ar-arrow-scene.bundle.mjs');

await build({
  entryPoints: [path.join(hud, 'ar-arrow-scene.mjs')],
  outfile: bundlePath,
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['chrome110', 'safari17', 'firefox115'],
  nodePaths: [path.resolve(path.dirname(require.resolve('three')), '../..')]
});
const bundle = await readFile(bundlePath, 'utf8');
await writeFile(bundlePath, bundle.replace(/[\t ]+$/gm, ''));
console.log('Built HUD AR arrow renderer');
