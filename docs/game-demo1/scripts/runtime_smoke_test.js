'use strict';

// Fast, dependency-free smoke test for the shared runtime contract. Image
// decoding is covered by verify_subpackage.js; this script focuses on the
// configuration and data that are available in both browser and WeChat builds.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fail = (message) => { throw new Error(`[runtime_smoke_test] ${message}`); };

const data = require(path.join(root, 'src', 'data.js'));
const gameConfig = readJson('game.json');
const bootstrap = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

if (!Array.isArray(gameConfig.subpackages)) fail('game.json 缺少 subpackages');
const runtimePackage = gameConfig.subpackages.find((item) => item && item.name === 'runtime_assets');
if (!runtimePackage || runtimePackage.root !== 'assets/game/') fail('runtime_assets 分包配置错误');
if (!bootstrap.includes('wx.loadSubpackage')) fail('game.js 未加载 runtime_assets 分包');
if (!bootstrap.includes('assetStore.loadAll()')) fail('分包加载后未执行 AssetStore.loadAll');
if (bootstrap.indexOf('wx.loadSubpackage') > bootstrap.indexOf('assetStore.loadAll()')) {
  fail('AssetStore.loadAll 位置早于分包加载入口');
}

if (!Array.isArray(data.classes) || data.classes.length < 3) fail('职业数据不完整');
for (const id of ['gunner', 'warrior', 'mechanic']) {
  if (!data.classById || !data.classById[id]) fail(`缺少职业 ${id}`);
}
for (const id of ['rust', 'spore', 'moon']) {
  if (!data.planetById || !data.planetById[id]) fail(`缺少星球 ${id}`);
}
if (!data.limits || data.limits.skillLevel !== 3) fail('技能等级上限配置异常');
if (!data.comboFeedback || Object.keys(data.comboFeedback).length < 9) fail('组合技反馈配置不完整');

console.log('[runtime_smoke_test] OK: package bootstrap, shared data and runtime settings');
