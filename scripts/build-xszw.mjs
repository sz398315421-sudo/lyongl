import {cpSync, existsSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
const source = new URL('xszw/', root);
const vite = fileURLToPath(new URL('node_modules/vite/bin/vite.js', source));
const tsc = fileURLToPath(new URL('node_modules/typescript/bin/tsc', source));
if (!existsSync(vite) || !existsSync(tsc)) throw new Error('Install dependencies first: npm --prefix xszw ci');
for (const args of [[tsc, '--noEmit'], [vite, 'build']]) {
  const result = spawnSync(process.execPath, args, {cwd:fileURLToPath(source), stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status || 1);
}
const destination = new URL('docs/xszw/', root);
mkdirSync(destination, {recursive:true});
cpSync(new URL('dist/', source), destination, {recursive:true});
cpSync(new URL('LICENSE', source), new URL('LICENSE', destination));
console.log('Built and copied Pixel Creation to docs/xszw/');
