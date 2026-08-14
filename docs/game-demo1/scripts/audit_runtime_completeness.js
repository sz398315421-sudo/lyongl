'use strict';

// Runtime contract audit.  This intentionally uses the same manifest module
// as the browser and mini-game entry points, so a path that passes this audit
// is a path the AssetStore can actually request.
const fs = require('fs');
const path = require('path');
const DATA = require('../src/data.js');
const { manifest } = require('../src/assets.js');

const ROOT = path.resolve(__dirname, '..');
const rel = (value) => path.relative(ROOT, value).replace(/\\/g, '/');
const exists = (relativePath) => Boolean(relativePath && fs.existsSync(path.join(ROOT, relativePath)));
const missing = [];
const checked = { images: 0, actions: 0, enemyActions: 0, vfx: 0, props: 0, skills: 0, combos: 0 };
const check = (relativePath, owner) => {
  if (!exists(relativePath)) missing.push({ owner, path: relativePath });
};

for (const [key, value] of Object.entries(manifest.images || {})) {
  checked.images += 1;
  check(value, `image:${key}`);
}

for (const role of DATA.classes || []) {
  const iconSet = manifest.skillIconSets && manifest.skillIconSets[role.id];
  for (const skill of [...(role.skills || []), ...(role.evolutions || []).map((item) => item.id)]) {
    checked.skills += 1;
    if (!iconSet || !iconSet.includes(skill)) missing.push({ owner: `skill-map:${role.id}.${skill}`, path: null });
    else check(manifest.images[`skill.${role.id}.${skill}`], `skill:${role.id}.${skill}`);
  }
  for (const evolution of role.evolutions || []) {
    checked.combos += 1;
    const feedback = DATA.comboFeedback && DATA.comboFeedback[evolution.id];
    if (!feedback || !manifest.vfx[feedback.vfx]) missing.push({ owner: `combo:${role.id}.${evolution.id}`, path: feedback && feedback.vfx });
  }
}

for (const [characterId, actionSet] of Object.entries(manifest.characterActions || {})) {
  for (const [state, spec] of Object.entries(actionSet)) {
    if (state === 'skills') {
      for (const [skillId, skillSpec] of Object.entries(spec || {})) {
        checked.actions += 1;
        check(skillSpec.path, `character-action:${characterId}.skill.${skillId}`);
      }
    } else {
      checked.actions += 1;
      check(spec.path, `character-action:${characterId}.${state}`);
    }
  }
}

for (const [id, entry] of Object.entries(manifest.enemyActions || {})) {
  for (const [state, spec] of Object.entries(entry.states || {})) {
    checked.enemyActions += 1;
    check(spec.path, `enemy-action:${id}.${state}`);
  }
}

for (const [id, spec] of Object.entries(manifest.vfx || {})) {
  checked.vfx += 1;
  check(spec.path, `vfx:${id}`);
}
for (const [id, spec] of Object.entries(manifest.enemyVfx || {})) {
  if (!spec.key || !spec.path) continue; // species aliases intentionally have no image path
  checked.vfx += 1;
  check(spec.path, `enemy-vfx:${id}`);
}

for (const [id, spec] of Object.entries(manifest.props || {})) {
  checked.props += 1;
  check(manifest.images[`prop.${id}`], `prop:${id}`);
}
for (const [planet, set] of Object.entries(manifest.propSets || {})) {
  if (!Array.isArray(set) || set.length !== 8) missing.push({ owner: `prop-set:${planet}`, path: `expected 8, got ${set && set.length}` });
  for (const id of set || []) if (!manifest.props[id]) missing.push({ owner: `prop-set:${planet}.${id}`, path: null });
}
for (const planet of DATA.planets || []) {
  check(manifest.images[`ground.${planet.id}`], `ground:${planet.id}`);
  const assets = manifest.planetAssets && manifest.planetAssets[planet.id];
  if (!assets) missing.push({ owner: `planet-assets:${planet.id}`, path: null });
  else {
    check(manifest.images[assets.icon], `planet-icon:${planet.id}`);
    check(manifest.images[assets.cover], `planet-cover:${planet.id}`);
  }
}

const report = {
  id: 'runtime_completeness',
  passed: missing.length === 0,
  checked,
  missing,
  notes: [
    'Every path is resolved through src/assets.js manifest.',
    'Prop sets are required to contain exactly eight active IDs.',
    'Character idle, walk, attack and skill actions are audited together.'
  ]
};
const reportPath = path.join(ROOT, 'assets', 'game', 'runtime_completeness_report.json');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
