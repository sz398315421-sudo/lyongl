/* Lightweight runtime smoke tests that do not require a browser surface. */
'use strict';

const assert = require('assert');
const { StarDutyGame, DATA } = require('../src/game-core.js');
const assetsApi = require('../src/assets.js');

const noop = () => {};
const ctx = new Proxy({
  createRadialGradient: () => ({ addColorStop: noop }),
  measureText: (value) => ({ width: String(value).length * 6 }),
  drawImage: noop
}, {
  get(target, property) {
    if (property in target) return target[property];
    return noop;
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  }
});

function fakeImage(key) {
  if (key.includes('eliteDanger')) return { width: 384, height: 96 };
  if (key.includes('elite')) return { width: 384, height: 96 };
  if (key.includes('danger')) return { width: 256, height: 64 };
  if (key.includes('meteor_impact')) return { width: 1280, height: 128 };
  if (key.includes('meteor_warning')) return { width: 576, height: 64 };
  if (key.includes('railgun_beam')) return { width: 512, height: 32 };
  return { width: 64, height: 64 };
}

const assets = {
  manifest: assetsApi.manifest,
  image: (key) => fakeImage(key)
};

assert.ok(DATA.classes.length === 3, 'three classes configured');
assert.ok(DATA.classes.every((classData) => Array.isArray(classData.cards) && classData.cards.length >= 12), 'all classes expose full representative skill lists');

const musicProbe = {
  active: false,
  unlocked: false,
  setCalls: [],
  resumeCalls: 0,
  play: noop,
  intensity: noop,
  unlockMusic() {
    this.unlocked = true;
    return true;
  },
  setMusic(trackId, options) {
    this.active = true;
    this.setCalls.push({ trackId, planet: options && options.planet ? options.planet : '' });
    return true;
  },
  stopMusic() {
    this.active = false;
  },
  setMusicEnabled(enabled) {
    if (!enabled) this.active = false;
  },
  resumeMusic() {
    this.resumeCalls += 1;
    this.active = true;
    return true;
  },
  isMusicActive() {
    return this.active;
  },
  pulseIntensity: noop
};

const game = new StarDutyGame({ getContext: () => ctx }, {
  raf: noop,
  storage: { get: () => null, set: noop },
  assets,
  audio: musicProbe
});

// QA mode exposes all three employees without spending credits. The release
// switch is data-driven and can be disabled without changing this flow.
assert.strictEqual(DATA.runtime.testUnlockAllClasses, true);
assert.strictEqual(game.isClassUnlocked(DATA.classById.warrior), true);
assert.strictEqual(game.isClassUnlocked(DATA.classById.mechanic), true);
assert.strictEqual(game.canUnlock(DATA.classById.warrior).cost, 0);
assert.deepStrictEqual([0, 1, 2, 3].map((direction) => game.characterDirectionRow(direction)), [0, 3, 2, 1]);
assert.strictEqual(assets.manifest.skillIconSets.warrior.length, 15);
assert.ok(assets.manifest.images['skill.warrior.cleave'].endsWith('skills/warrior/icons/cleave.png'));
assert.ok(assets.manifest.images['skill.warrior.guard'].endsWith('skills/warrior/icons/guard.png'));
assert.ok(assets.manifest.images['skill.warrior.rift_slash'].endsWith('skills/warrior/icons/rift_slash.png'));
assert.deepStrictEqual(assets.manifest.characterActions.warrior_kade.walk.directionRowMap, [0, 3, 2, 1]);
assert.deepStrictEqual(assets.manifest.characterRoleSpecs.warrior_kade.weaponMuzzles, {
  front: { x: 10, y: -20 }, right: { x: 14, y: -21 }, back: { x: 10, y: -23 }, left: { x: -14, y: -21 }
});
assert.deepStrictEqual(assets.manifest.vfx.slash_arc.anchor, { x: 10, y: 32 });
assert.deepStrictEqual(assets.manifest.vfx.sword_wave.anchor, { x: 13, y: 48 });
assert.strictEqual(DATA.comboFeedback.star_ring.layer, 'under');
assert.strictEqual(DATA.comboFeedback.star_ring.scale, 1.55);
assert.strictEqual(assets.manifest.vfx.orbit_blade.frameCount, 6);
assert.strictEqual(assets.manifest.vfx.orbit_blade.frameWidth, 64);
assert.strictEqual(assets.manifest.vfx.orbit_blade.frameHeight, 64);

// Music starts on the first valid interaction, does not duplicate timers or
// tracks on repeated syncs, and can recover after an adapter loses its timer.
game.pointerDown(2, 2, 0);
assert.strictEqual(musicProbe.unlocked, true);
assert.deepStrictEqual(musicProbe.setCalls[0], { trackId: 'cockpit', planet: '' });
const musicSetCount = musicProbe.setCalls.length;
game.syncMusic();
assert.strictEqual(musicProbe.setCalls.length, musicSetCount);
musicProbe.active = false;
game.syncMusic();
assert.strictEqual(musicProbe.resumeCalls, 1);
assert.strictEqual(musicProbe.active, true);
game.state = 'playing';
game.contract = { planet: DATA.planetById.spore };
game.world = { missionComplete: false };
game.syncMusic(true);
assert.deepStrictEqual(musicProbe.setCalls[musicProbe.setCalls.length - 1], { trackId: 'explore', planet: 'spore' });
game.world.missionComplete = true;
game.syncMusic(true);
assert.deepStrictEqual(musicProbe.setCalls[musicProbe.setCalls.length - 1], { trackId: 'extract', planet: 'spore' });
game.setMusicEnabled(false);
assert.strictEqual(game.save.settings.musicEnabled, false);
assert.strictEqual(musicProbe.active, false);
game.setMusicEnabled(true);
assert.strictEqual(game.save.settings.musicEnabled, true);
assert.strictEqual(musicProbe.active, true);
// Restore the pre-run fixture before the world/prop tests below.
game.world = null;
game.contract = null;

// Cleave visual reach follows the same progression as its damage arc.
game.save.selectedClass = 'warrior';
game.contract = { seed: 31, planet: DATA.planetById.rust, mission: DATA.missionById.nests, anomaly: DATA.anomalyById.meteor, started: false };
game.beginRun();
game.world.enemies = [];
game.player.cards.double_slash = 0;
const cleaveVisualScales = [];
for (const cleaveLevel of [0, 1, 2, 3]) {
  game.player.cards.cleave = cleaveLevel;
  game.player.attackTimer = 0;
  game.player.lastActionAt = -Infinity;
  game.player.activeVfx = null;
  game.spawnEnemy({ x: game.player.x + 60, y: game.player.y });
  game.updateWarrior(0, { damage: 12, interval: 1 });
  cleaveVisualScales.push(game.player.actionVfxScale);
  game.world.enemies = [];
}
assert.ok(cleaveVisualScales[0] < cleaveVisualScales[1]);
assert.ok(cleaveVisualScales[1] < cleaveVisualScales[2]);
assert.ok(cleaveVisualScales[2] < cleaveVisualScales[3]);

// Combo recipe cards receive a 3x draft weight as soon as either ingredient
// reaches Lv.1. Completed evolutions remain excluded from the boost.
game.player.cards = {};
game.player.evolutions = {};
assert.strictEqual(game.getUpgradeCardWeight('orbit_blade'), 1);
assert.strictEqual(game.getUpgradeCardWeight('attack_speed'), 1);
assert.strictEqual(game.getUpgradeCardWeight('cleave'), 1);
game.player.cards.orbit_blade = 1;
assert.strictEqual(game.getUpgradeCardWeight('orbit_blade'), 3);
assert.strictEqual(game.getUpgradeCardWeight('attack_speed'), 3);
assert.strictEqual(game.getUpgradeCardWeight('cleave'), 1);
const warriorClass = DATA.classById.warrior;
warriorClass.evolutions.push({ id: '__smoke_multi_recipe', requires: ['orbit_blade', 'dodge'] });
assert.strictEqual(game.getUpgradeCardWeight('orbit_blade'), 5);
warriorClass.evolutions.pop();
for (const classData of DATA.classes) {
  game.player.classId = classData.id;
  game.player.cards = {};
  game.player.evolutions = {};
  const recipe = classData.evolutions[0];
  game.player.cards[recipe.requires[0]] = 1;
  assert.strictEqual(game.getUpgradeCardWeight(recipe.requires[0]), 3, `${classData.id} first recipe card should be boosted`);
  assert.strictEqual(game.getUpgradeCardWeight(recipe.requires[1]), 3, `${classData.id} partner recipe card should be boosted`);
  const unrelated = classData.cards.find((card) => !recipe.requires.includes(card.id));
  assert.strictEqual(game.getUpgradeCardWeight(unrelated.id), 1, `${classData.id} unrelated card should stay neutral`);
}
game.player.classId = 'warrior';
game.player.cards = { orbit_blade: 1 };
game.player.evolutions = {};
const weightedChoices = game.generateChoices();
assert.ok(weightedChoices.length <= 3);
assert.strictEqual(new Set(weightedChoices.filter((choice) => choice.type === 'card').map((choice) => choice.data.id)).size,
  weightedChoices.filter((choice) => choice.type === 'card').length);

assert.strictEqual(assets.manifest.vfx.meteor_warning.frameCount, 6);
assert.strictEqual(assets.manifest.vfx.meteor_impact.frameCount, 10);
assert.strictEqual(assets.manifest.vfx.railgun_beam.frameCount, 4);
assert.strictEqual(assets.manifest.vfx.railgun_beam.anchor.x, 0);
assert.ok(assets.manifest.images['planet.moon.cover']);
assert.ok(assets.manifest.images['planet.rust.icon']);
assert.ok(assets.manifest.images['planet.spore.icon']);
assert.ok(assets.manifest.images['enemy.elite.moon.prism_sentry']);
assert.ok(assets.manifest.images['enemy.danger.spore.acid_eye_pod']);
assert.ok(assets.manifest.images['ui.exit.warning_panel']);
assert.ok(assets.manifest.characterActions.gunner_mia.idle);
assert.ok(assets.manifest.characterActions.warrior_kade.idle);
assert.ok(assets.manifest.characterActions.mechanic_locke.idle);
assert.strictEqual(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'assets/game/v17_warrior_vfx_runtime_manifest.json'), 'utf8')).vfx.star_ring.sourceReviewId, 'v17_star_ring');
assert.strictEqual(JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'assets/game/v17_warrior_vfx_runtime_manifest.json'), 'utf8')).vfx.sword_wave.sourceReviewId, 'v17_sword_wave');
assert.deepStrictEqual(assets.manifest.planetAssets.rust, { icon: 'planet.rust.icon', cover: 'planet.rust.icon' });
assert.deepStrictEqual(assets.manifest.planetAssets.spore, { icon: 'planet.spore.icon', cover: 'planet.spore.icon' });

// V16 replaces all nine combo VFX sheets with the reviewed eight-frame
// contracts and keeps the combo-to-effect mapping centralized in DATA.
const comboVfxExpectations = {
  piercing_star_burst: [96, 96, 8, 16, false],
  hunt_barrage_lock: [64, 64, 8, 12, false],
  zero_storm_burst: [128, 128, 8, 15, false],
  sword_wave: [96, 96, 8, 15, false],
  star_ring: [96, 96, 8, 12, true],
  phantom_counter: [96, 96, 8, 15, false],
  swarm_protocol: [96, 96, 8, 15, false],
  mobile_fortress: [96, 96, 8, 12, true],
  recycle_burst: [128, 128, 8, 15, false],
  burst_overdrive: [96, 96, 8, 15, false],
  railgun_overcharge: [96, 96, 8, 15, false],
  critical_dash: [96, 96, 8, 15, false],
  fury_combo: [96, 96, 8, 15, false],
  iron_fury: [96, 96, 8, 15, false],
  blood_oath: [96, 96, 8, 15, false],
  parallel_overclock: [96, 96, 8, 15, false],
  field_reconstruction: [96, 96, 8, 15, false],
  magnetic_reclaim: [96, 96, 8, 15, false]
};
Object.entries(comboVfxExpectations).forEach(([vfxId, expected]) => {
  const spec = assets.manifest.vfx[vfxId];
  assert.ok(spec, `missing V16 VFX ${vfxId}`);
  assert.deepStrictEqual([spec.frameWidth, spec.frameHeight, spec.frameCount, spec.fps, spec.loop], expected);
});
const comboMap = {
  piercing_star: 'piercing_star_burst', hunt_barrage: 'hunt_barrage_lock', zero_storm: 'zero_storm_burst',
  rift_slash: 'sword_wave', star_ring: 'star_ring', phantom_counter: 'phantom_counter',
  swarm_protocol: 'swarm_protocol', mobile_fortress: 'mobile_fortress', infinite_recycle: 'recycle_burst',
  burst_overdrive: 'burst_overdrive', railgun_overcharge: 'railgun_overcharge', critical_dash: 'critical_dash',
  fury_combo: 'fury_combo', iron_fury: 'iron_fury', blood_oath: 'blood_oath',
  parallel_overclock: 'parallel_overclock', field_reconstruction: 'field_reconstruction', magnetic_reclaim: 'magnetic_reclaim'
};
Object.entries(comboMap).forEach(([comboId, vfxId]) => {
  assert.ok(DATA.comboFeedback[comboId], `missing combo feedback ${comboId}`);
  assert.strictEqual(DATA.comboFeedback[comboId].vfx, vfxId);
});
for (const classData of DATA.classes) {
  assert.strictEqual(classData.evolutions.length, 6, `${classData.id} should expose six combo recipes`);
  for (const evolution of classData.evolutions) {
    assert.strictEqual(evolution.requires.length, 2);
    assert.ok(evolution.requires.every((id) => classData.cards.some((card) => card.id === id)), `${classData.id} recipe ${evolution.id} references an unknown card`);
  }
  const coveredCardIds = new Set(classData.evolutions.flatMap((evolution) => evolution.requires));
  assert.ok(classData.cards.every((card) => coveredCardIds.has(card.id)), `${classData.id} has a representative skill without a combo recipe`);
}

const propCounts = {};
for (const planetId of ['rust', 'spore', 'moon']) {
  assert.strictEqual(assets.manifest.propSets[planetId].length, 8);
  assert.ok(assets.manifest.propSets[planetId].every((assetId) => {
    const spec = assets.manifest.props[assetId];
    return spec && spec.collision === true && spec.collisionShape === 'circle' && spec.collisionRadius > 0;
  }));
  game.contract = {
    seed: 17 + planetId.length,
    planet: DATA.planetById[planetId],
    mission: DATA.missionById.nests,
    anomaly: DATA.anomalyById.meteor,
    started: false
  };
game.beginRun();
assert.strictEqual(game.state, 'playing');
assert.strictEqual(game.world.extraction.required, 30);

// Each combo can emit a world effect once per cooldown window. Hunt barrage
// additionally permits exactly one secondary node for the same attack cycle.
game.world.effects = [];
game.world.comboFeedbackState = {};
Object.keys(comboMap).forEach((comboId, index) => {
  game.world.time = 10 + index;
  const config = DATA.comboFeedback[comboId];
  assert.strictEqual(game.emitComboFeedback(comboId, game.player.x, game.player.y), true);
  assert.strictEqual(game.emitComboFeedback(comboId, game.player.x, game.player.y), false);
  assert.strictEqual(game.world.effects[game.world.effects.length - 1].id, config.vfx);
});
game.world.effects = [];
game.world.comboFeedbackState = {};
game.world.time = 100;
assert.strictEqual(game.emitComboFeedback('hunt_barrage', game.player.x, game.player.y, { cycleId: 77 }), true);
game.world.time += DATA.comboFeedback.hunt_barrage.cooldown + 0.01;
assert.strictEqual(game.emitComboFeedback('hunt_barrage', game.player.x, game.player.y, { cycleId: 77, secondary: true }), true);
assert.strictEqual(game.emitComboFeedback('hunt_barrage', game.player.x, game.player.y, { cycleId: 77, secondary: true }), false);

// Missing combo art falls back to the existing procedural burst and does not
// block the action. Restore the image adapter immediately afterwards.
const originalAssetImage = game.assets.image;
game.assets.image = () => null;
game.world.time = 120;
const particleCountBeforeComboFallback = game.world.particles.length;
assert.strictEqual(game.emitComboFeedback('zero_storm', game.player.x, game.player.y), true);
assert.ok(game.world.particles.length > particleCountBeforeComboFallback);
game.assets.image = originalAssetImage;
  const props = game.world.props;
  propCounts[planetId] = props.length;
  assert.strictEqual(props.length, 24);
  assert.strictEqual(new Set(props.map((prop) => prop.assetId)).size, 8);
  assert.ok(props.every((prop) => prop.collisionActive && game.propCollisionRadius(prop) > 0));
  const protectedZones = [
    { x: game.player.x, y: game.player.y, radius: 110 },
    { x: game.world.cache.x, y: game.world.cache.y, radius: game.world.cache.pickupRadius + 58 },
    { x: game.world.extraction.x, y: game.world.extraction.y, radius: game.world.extraction.radius + 42 },
    ...(game.world.objective.items || (game.world.objective.item ? [game.world.objective.item] : [])).map((item) => ({ x: item.x, y: item.y, radius: (item.radius || 72) + 38 }))
  ];
  props.forEach((prop) => protectedZones.forEach((zone) => {
    assert.ok(Math.hypot(prop.x - zone.x, prop.y - zone.y) >= game.propCollisionRadius(prop) + zone.radius - 0.01);
  }));
}

// Extraction pressure uses one enemy by default and adds a second enemy only
// when the configured extra-enemy roll succeeds. The timer uses the reduced
// extraction multiplier rather than the old fixed two-enemy burst.
{
  const world = game.world;
  const originalSpawnEnemy = game.spawnEnemy;
  const originalRandom = world.random;
  const originalMissionComplete = world.missionComplete;
  const originalExtraction = world.extraction;
  const originalSpawnTimer = world.spawnTimer;
  const originalTime = world.time;
  const originalEnemies = world.enemies;
  const previousPlayerPosition = { x: game.player.x, y: game.player.y };
  let extractionSpawnCount = 0;
  world.missionComplete = true;
  world.extraction = { x: game.player.x, y: game.player.y, radius: 82 };
  world.time = 150;
  world.spawnTimer = 0;
  world.enemies = [];
  game.spawnEnemy = () => { extractionSpawnCount += 1; };
  world.random = () => 0;
  game.updateSpawning(0.016);
  assert.strictEqual(extractionSpawnCount, 2);
  assert.ok(world.spawnTimer > 0.3 && world.spawnTimer < 0.5);
  world.spawnTimer = 0;
  extractionSpawnCount = 0;
  world.random = () => 0.99;
  game.updateSpawning(0.016);
  assert.strictEqual(extractionSpawnCount, 1);
  game.spawnEnemy = originalSpawnEnemy;
  world.random = originalRandom;
  world.missionComplete = originalMissionComplete;
  world.extraction = originalExtraction;
  world.spawnTimer = originalSpawnTimer;
  world.time = originalTime;
  world.enemies = originalEnemies;
  game.player.x = previousPlayerPosition.x;
  game.player.y = previousPlayerPosition.y;
}

// Destroyed spore and moon nests are intentionally removed instead of using
// the old generic black ellipse fallback. The rust nest keeps its existing
// destroyed sprite, so only the two affected branches are asserted here.
{
  const originalEllipse = ctx.ellipse;
  let deadNestEllipseCalls = 0;
  ctx.ellipse = (...args) => {
    deadNestEllipseCalls += 1;
    return originalEllipse(...args);
  };
  for (const planetId of ['spore', 'moon']) {
    game.contract = { planet: DATA.planetById[planetId] };
    game.world = {
      camera: { x: 0, y: 0 },
      objective: { id: 'nests', items: [{ x: 180, y: 180, index: 0, dead: true }] }
    };
    game.drawMissionObjects();
  }
  ctx.ellipse = originalEllipse;
  assert.strictEqual(deadNestEllipseCalls, 0);
  game.world = null;
}

// Check that both actor classes stop at a solid prop and can still resolve
// their position without penetrating it.
game.contract = {
  seed: 17,
  planet: DATA.planetById.moon,
  mission: DATA.missionById.nests,
  anomaly: DATA.anomalyById.meteor,
  started: false
};
game.beginRun();
const collisionProp = game.world.props[0];
const collisionRadius = game.propCollisionRadius(collisionProp);
game.player.x = collisionProp.x - collisionRadius - 10 - 2;
game.player.y = collisionProp.y;
game.moveActorWithPropCollision(game.player, 12, 0, 10, {
  minX: 28, maxX: game.world.width - 28, minY: 40, maxY: game.world.height - 28
});
  assert.ok(Math.hypot(game.player.x - collisionProp.x, game.player.y - collisionProp.y) >= collisionRadius + 10 - 0.01);
const collisionEnemy = game.spawnEnemy({ x: collisionProp.x - collisionRadius - 15, y: collisionProp.y });
game.moveActorWithPropCollision(collisionEnemy, 12, 0, collisionEnemy.radius);
assert.ok(Math.hypot(collisionEnemy.x - collisionProp.x, collisionEnemy.y - collisionProp.y) >= collisionRadius + collisionEnemy.radius - 0.01);

const moonPropsCount = propCounts.moon;

// Verify the four calibrated gunner mounts and that delayed action events keep
// the muzzle effect at the original firing point after the player moves.
game.save.selectedClass = 'gunner';
game.contract = {
  seed: 21,
  planet: DATA.planetById.rust,
  mission: DATA.missionById.nests,
  anomaly: DATA.anomalyById.meteor,
  started: false
};
game.beginRun();
const directionInputs = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 }
];
const expectedMuzzles = [
  { x: 16, y: -14 },
  { x: 20, y: -13 },
  { x: 15, y: -14 },
  { x: -19, y: -13 }
];
directionInputs.forEach((direction, index) => {
  const muzzle = game.getWeaponMuzzle(game.player, direction.x, direction.y);
  assert.strictEqual(muzzle.x - game.player.x, expectedMuzzles[index].x);
  assert.strictEqual(muzzle.y - game.player.y, expectedMuzzles[index].y);
  assert.strictEqual(muzzle.facing, index);
});

// A shot must be aimed from the weapon muzzle, not from the astronaut's feet
// anchor. These close cardinal targets reproduce the old parallel-offset miss
// that was visible while the player stood still.
const stationaryTargets = [
  { x: 0, y: 24 },
  { x: 24, y: 0 },
  { x: 0, y: -24 },
  { x: -24, y: 0 }
];
const gunnerShotStats = { damage: 10, interval: 1 };
game.world.objective.items = [];
game.player.moving = false;
game.player.reloadTimer = 0;
game.player.ammo = 6;
stationaryTargets.forEach((offset) => {
  game.world.enemies = [];
  game.world.projectiles = [];
  game.player.attackTimer = 0;
  game.player.actionState = 'idle';
  game.now += 1;
  const enemy = game.spawnEnemy({ x: game.player.x + offset.x, y: game.player.y + offset.y });
  const expectedShot = game.getWeaponShot({ ref: enemy });
  game.updateGunner(0, gunnerShotStats);
  const projectile = game.world.projectiles[game.world.projectiles.length - 1];
  assert.ok(projectile, 'stationary gunner shot should spawn');
  assert.strictEqual(projectile.x, expectedShot.origin.x);
  assert.strictEqual(projectile.y, expectedShot.origin.y);
  const lineHit = game.segmentCircleHit(
    projectile.x,
    projectile.y,
    projectile.x + projectile.vx * 0.25,
    projectile.y + projectile.vy * 0.25,
    enemy.x,
    enemy.y,
    enemy.radius + projectile.radius
  );
  assert.ok(lineHit, `stationary shot should intersect target at offset ${offset.x},${offset.y}`);
  assert.ok(game.player.actionOrigin, 'attack action should retain firing origin');
  assert.strictEqual(game.player.actionOrigin.x, projectile.x);
  assert.strictEqual(game.player.actionOrigin.y, projectile.y);
});

// Railgun and its VFX must receive the same corrected origin and angle.
game.world.enemies = [];
game.world.projectiles = [];
game.player.cards.railgun = 1;
game.player.attackTimer = 999;
game.player.railTimer = 0;
game.player.reloadTimer = 0;
const railTarget = game.spawnEnemy({ x: game.player.x + 46, y: game.player.y - 8 });
const expectedRailShot = game.getWeaponShot({ ref: railTarget });
const originalLineDamage = game.lineDamage;
let railCall = null;
game.lineDamage = (...args) => {
  railCall = args;
  return originalLineDamage.apply(game, args);
};
game.now += 1;
game.updateGunner(0, gunnerShotStats);
game.lineDamage = originalLineDamage;
assert.ok(railCall, 'railgun should call lineDamage');
assert.strictEqual(railCall[0], expectedRailShot.origin.x);
assert.strictEqual(railCall[1], expectedRailShot.origin.y);
assert.ok(Math.abs(railCall[2] - expectedRailShot.angle) < 0.000001);
assert.strictEqual(game.player.actionOrigin.x, expectedRailShot.origin.x);
assert.strictEqual(game.player.actionOrigin.y, expectedRailShot.origin.y);
game.player.cards.railgun = 0;

// Warrior effects use the sword-hand mount, never the old head-centered
// offset. The V17 slash replaces the procedural arc while sword-wave art is
// owned by the travelling projectile rather than duplicated on the actor.
game.save.selectedClass = 'warrior';
game.contract = {
  seed: 23,
  planet: DATA.planetById.rust,
  mission: DATA.missionById.nests,
  anomaly: DATA.anomalyById.meteor,
  started: false
};
game.beginRun();
game.world.enemies = [];
game.world.particles = [];
game.player.cards.cleave = 1;
game.player.attackTimer = 0;
game.player.lastActionAt = -Infinity;
const warriorTarget = game.spawnEnemy({ x: game.player.x + 70, y: game.player.y });
const expectedBladeOrigin = game.getWeaponMuzzle(game.player, 1, 0);
game.updateWarrior(0, { damage: 12, interval: 1 });
assert.ok(game.player.actionOrigin, 'warrior attack should retain the sword-hand origin');
assert.strictEqual(game.player.actionOrigin.x, expectedBladeOrigin.x);
assert.strictEqual(game.player.actionOrigin.y, expectedBladeOrigin.y);
assert.strictEqual(game.world.particles.filter((particle) => particle.type === 'slash').length, 0, 'V17 slash should replace the old procedural arc');
game.updateCharacterAnimation(1 / 12);
assert.ok(game.player.activeVfx && game.player.activeVfx.id === 'slash_arc');
assert.strictEqual(game.player.activeVfx.origins[0].x, expectedBladeOrigin.x);
assert.strictEqual(game.player.activeVfx.origins[0].y, expectedBladeOrigin.y);

game.world.enemies = [warriorTarget];
game.world.projectiles = [];
game.player.cards.sword_wave = 1;
game.player.attackCount = 3;
game.player.attackTimer = 0;
game.player.lastActionAt = -Infinity;
game.updateWarrior(0, { damage: 12, interval: 1 });
const swordWaveProjectile = game.world.projectiles.find((projectile) => projectile.source === 'wave');
assert.ok(swordWaveProjectile, 'sword wave should spawn a travelling projectile');
assert.strictEqual(game.player.actionVfxDisabled, true, 'sword-wave action must not duplicate projectile art on the actor');

game.world.effects = [];
game.world.comboFeedbackState = {};
game.world.time = 200;
assert.strictEqual(game.emitComboFeedback('star_ring', game.player.x, game.player.y), true);
const starRingEffect = game.world.effects[game.world.effects.length - 1];
assert.strictEqual(starRingEffect.layer, 'under');
assert.strictEqual(starRingEffect.scale, 1.55);

// Restore the gunner fixture used by the projectile-origin regressions below.
game.player.classId = 'gunner';
game.player.actionState = 'idle';
game.player.lastActionAt = -Infinity;
game.player.activeVfx = null;

// A swept segment must still hit a target crossed between two frame samples.
game.world.enemies = [];
game.world.objective.items = [];
const sweptEnemy = game.spawnEnemy({ x: game.player.x + 30, y: game.player.y + 28 });
const sweptStartX = sweptEnemy.x - 30;
const sweptStartY = sweptEnemy.y;
const sweptProjectile = {
  x: sweptStartX,
  y: sweptStartY,
  vx: 600,
  vy: 0,
  damage: 5,
  radius: 3.5,
  life: 1,
  source: 'gun',
  pierce: 0,
  bounce: 0,
  chain: 0,
  explosion: 0,
  knockback: 0,
  hitIds: [],
  color: DATA.palette.cyan
};
game.world.projectiles = [sweptProjectile];
const sweptHp = sweptEnemy.hp;
game.updateProjectiles(0.1);
assert.ok(sweptEnemy.hp < sweptHp, 'swept projectile should hit between frame samples');

const shotMuzzle = game.getWeaponMuzzle(game.player, -1, 0);
game.spawnPlayerProjectile(shotMuzzle.x, shotMuzzle.y, Math.PI, 10, 'gun');
const shot = game.world.projectiles[game.world.projectiles.length - 1];
assert.strictEqual(shot.x, shotMuzzle.x);
assert.strictEqual(shot.y, shotMuzzle.y);
game.player.actionState = 'idle';
game.player.lastActionAt = -Infinity;
game.triggerCharacterAttack({ origin: shotMuzzle, dirX: -1, dirY: 0, force: true });
game.updateCharacterAnimation(1 / 12);
assert.ok(game.player.activeVfx && game.player.activeVfx.id === 'muzzle_flash');
assert.strictEqual(game.player.activeVfx.origins[0].x, shotMuzzle.x);
assert.strictEqual(game.player.activeVfx.origins[0].y, shotMuzzle.y);
game.player.x += 120;
game.player.y += 40;
assert.strictEqual(game.player.activeVfx.origins[0].x, shotMuzzle.x);
assert.strictEqual(game.player.activeVfx.origins[0].y, shotMuzzle.y);

const railMuzzle = game.getWeaponMuzzle(game.player, 1, 0);
game.triggerCharacterSkill('railgun', { origin: railMuzzle, dirX: 1, dirY: 0, force: true });
game.updateCharacterAnimation(2 / 12);
assert.ok(game.player.activeVfx && game.player.activeVfx.id === 'railgun_beam');
assert.strictEqual(game.player.activeVfx.origins[0].x, railMuzzle.x);
assert.strictEqual(game.player.activeVfx.origins[0].y, railMuzzle.y);

// Mechanic drone shots may have several simultaneous origins; turret muzzle
// effects are emitted directly at the turret rather than at the astronaut.
game.save.selectedClass = 'mechanic';
game.contract = {
  seed: 22,
  planet: DATA.planetById.rust,
  mission: DATA.missionById.nests,
  anomaly: DATA.anomalyById.meteor,
  started: false
};
game.beginRun();
const droneOrigins = [
  { x: game.player.x + 38, y: game.player.y, dirX: 1, dirY: 0 },
  { x: game.player.x - 38, y: game.player.y, dirX: -1, dirY: 0 }
];
game.triggerCharacterAttack({ origins: droneOrigins, dirX: 1, dirY: 0, force: true });
game.updateCharacterAnimation(1 / 12);
assert.ok(game.player.activeVfx && game.player.activeVfx.id === 'drone_muzzle');
assert.strictEqual(game.player.activeVfx.origins.length, droneOrigins.length);
assert.strictEqual(game.player.activeVfx.origins[1].x, droneOrigins[1].x);
const turretFx = game.emitWorldVfx(null, 'drone_muzzle', 312, 428, { dirX: 1, dirY: 0 });
assert.ok(turretFx);
assert.strictEqual(turretFx.x, 312);
assert.strictEqual(turretFx.y, 428);

game.save.selectedClass = 'gunner';
game.contract = {
  seed: 17,
  planet: DATA.planetById.moon,
  mission: DATA.missionById.nests,
  anomaly: DATA.anomalyById.meteor,
  started: false
};
game.beginRun();
const elite = game.spawnEnemy({ elite: true, x: game.player.x + 30, y: game.player.y });
assert.ok(elite.eliteVisual.endsWith('static_crawler'));
assert.ok(elite.eliteDangerVisual.endsWith('static_crawler'));
elite.visualType = 'shooter';
elite.dangerPulse = 0.5;
game.drawEnemy(elite);

const shooter = game.spawnEnemy({ x: game.player.x + 50, y: game.player.y });
shooter.visualType = 'shooter';
shooter.dangerPulse = 0.5;
assert.ok(shooter.dangerVisual.includes('enemy.danger.moon'));
game.drawEnemy(shooter);

game.world.cache.x = game.player.x;
game.world.cache.y = game.player.y;
const beforeLoot = game.player.loot;
game.updateCache();
assert.strictEqual(game.world.cache.collected, true);
assert.strictEqual(game.player.loot, beforeLoot + 35);

const beforeTime = game.world.time;
assert.strictEqual(game.openExitConfirm(), true);
assert.strictEqual(game.exitModal, true);
game.update(0.5);
assert.strictEqual(game.world.time, beforeTime);
assert.strictEqual(game.confirmExitToHQ(), true);
assert.strictEqual(game.state, 'result');
assert.strictEqual(game.exitModal, false);

// A completed extraction reaches the existing success settlement after the
// configured 30-second target, without changing the extraction bonus.
game.contract = {
  seed: 19,
  planet: DATA.planetById.rust,
  mission: DATA.missionById.nests,
  anomaly: DATA.anomalyById.meteor,
  started: false
};
game.beginRun();
game.world.missionComplete = true;
game.player.x = game.world.extraction.x;
game.player.y = game.world.extraction.y;
game.world.extraction.progress = game.world.extraction.required - 0.1;
game.updateExtraction(0.2);
assert.strictEqual(game.state, 'result');
assert.strictEqual(game.result.success, true);
assert.strictEqual(game.result.extractionBonus, 62);

game.contract = {
  seed: 18,
  planet: DATA.planetById.rust,
  mission: DATA.missionById.nests,
  anomaly: DATA.anomalyById.meteor,
  started: false
};
game.beginRun();
game.player.cards.burst = 3;
const choices = game.generateChoices();
assert.ok(!choices.some((choice) => choice.data && choice.data.id === 'burst'));

// A card at Lv.2 may appear only as the final Lv.3 offer, while a card that
// is already Lv.3 must never be offered again. The UI label is tested through
// the same effective-level path used by generateChoices/chooseUpgrade.
game.player.cards.scatter = 2;
const finalLevelChoices = game.generateChoices();
const scatterChoice = finalLevelChoices.find((choice) => choice.data && choice.data.id === 'scatter');
if (scatterChoice) {
  assert.strictEqual(game.getCardLevel('scatter'), 2);
  assert.strictEqual(game.getCardLevel(scatterChoice.data.id) < DATA.limits.skillLevel, true);
}
game.player.cards.scatter = 3;
assert.ok(!game.generateChoices().some((choice) => choice.data && choice.data.id === 'scatter'));

console.log(JSON.stringify({
  passed: true,
  moonProps: moonPropsCount,
  exitFlow: 'paused-and-settled',
  eliteVariants: 'registered',
  levelCap: 'enforced'
}));
