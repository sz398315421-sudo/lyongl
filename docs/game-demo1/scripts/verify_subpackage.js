'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const fail = (message) => {
  throw new Error(`[verify_subpackage] ${message}`);
};

const gameConfig = readJson('game.json');
const projectConfig = readJson('project.config.json');
const packages = Array.isArray(gameConfig.subpackages) ? gameConfig.subpackages : [];
const runtimePackage = packages.find((item) => item && item.name === 'runtime_assets');
if (!runtimePackage) fail('game.json 缺少 runtime_assets 分包');
if (runtimePackage.independent) fail('runtime_assets 必须是普通分包，不能是独立分包');
if (String(runtimePackage.root).replace(/\\/g, '/') !== 'assets/game/') {
  fail(`runtime_assets root 应为 assets/game/，实际为 ${runtimePackage.root}`);
}

const runtimeRoot = path.join(root, 'assets', 'game');
if (!fs.existsSync(runtimeRoot)) fail('assets/game 不存在');
if (!fs.existsSync(path.join(runtimeRoot, 'game.js'))) fail('assets/game/game.js 分包入口不存在');

const ignored = projectConfig.packOptions && projectConfig.packOptions.ignore;
const oldIgnored = Array.isArray(ignored) && ignored.some((entry) => (
  (typeof entry === 'string' && entry === 'old') || (entry && entry.value === 'old')
));
if (!oldIgnored) fail('project.config.json 未忽略 old/');

const assetsSource = fs.readFileSync(path.join(root, 'src', 'assets.js'), 'utf8');
const marker = 'const API = { AssetStore, manifest };';
if (!assetsSource.includes(marker)) fail('无法读取 AssetStore 资源映射');
const sandbox = {
  module: { exports: {} },
  globalThis: {},
  console,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(assetsSource.replace(marker, 'const API = { AssetStore, manifest, images };'), sandbox, {
  filename: path.join(root, 'src', 'assets.js')
});
const exported = sandbox.module.exports;
if (!exported || !exported.images) fail('资源映射未导出');
const missing = [];
for (const [key, assetPath] of Object.entries(exported.images)) {
  if (typeof assetPath !== 'string') fail(`资源 ${key} 路径不是字符串`);
  const normalized = assetPath.replace(/^assets[\\/]game[\\/]/, '');
  const absolute = path.join(runtimeRoot, normalized);
  if (!fs.existsSync(absolute)) missing.push(`${key} -> ${assetPath}`);
}
if (missing.length) fail(`缺少 ${missing.length} 个运行时资源：\n${missing.slice(0, 20).join('\n')}`);
if (!exported.manifest || !exported.manifest.font) fail('字体清单缺失');
const fontPath = path.join(root, exported.manifest.font);
if (!fs.existsSync(fontPath)) fail(`字体不存在：${exported.manifest.font}`);

const forbidden = /(?:^|[\\/])(?:old|process|tmp|qa)(?:[\\/]|$)|assets[\\/]concepts|assets[\\/]work/;
const scanned = ['game.js', 'index.html', 'styles.css', 'src'].flatMap((entry) => {
  const absolute = path.join(root, entry);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true })
    .filter((child) => child.isFile() && /\.(?:js|html|css)$/.test(child.name))
    .map((child) => path.join(absolute, child.name));
});
for (const file of scanned) {
  const source = fs.readFileSync(file, 'utf8');
  if (forbidden.test(source)) fail(`运行时代码包含过程目录引用：${path.relative(root, file)}`);
}

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else files.push(absolute);
  }
};
walk(runtimeRoot);
if (files.length === 0) fail('runtime_assets 分包为空');
console.log(`[verify_subpackage] OK: ${Object.keys(exported.images).length} image mappings, ${files.length} files, font present`);
