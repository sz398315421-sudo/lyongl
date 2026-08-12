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

assert.strictEqual(assets.manifest.vfx.meteor_warning.frameCount, 6);
assert.strictEqual(assets.manifest.vfx.meteor_impact.frameCount, 10);
assert.strictEqual(assets.manifest.vfx.railgun_beam.frameCount, 4);
assert.strictEqual(assets.manifest.vfx.railgun_beam.anchor.x, 0);
assert.ok(assets.manifest.images['planet.moon.cover']);
assert.ok(assets.manifest.images['enemy.elite.moon.prism_sentry']);
assert.ok(assets.manifest.images['enemy.danger.spore.acid_eye_pod']);
assert.ok(assets.manifest.images['ui.exit.warning_panel']);

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
  recycle_burst: [128, 128, 8, 15, false]
};
Object.entries(comboVfxExpectations).forEach(([vfxId, expected]) => {
  const spec = assets.manifest.vfx[vfxId];
  assert.ok(spec, `missing V16 VFX ${vfxId}`);
  assert.deepStrictEqual([spec.frameWidth, spec.frameHeight, spec.frameCount, spec.fps, spec.loop], expected);
});
const comboMap = {
  piercing_star: 'piercing_star_burst', hunt_barrage: 'hunt_barrage_lock', zero_storm: 'zero_storm_burst',
  rift_slash: 'sword_wave', star_ring: 'star_ring', phantom_counter: 'phantom_counter',
  swarm_protocol: 'swarm_protocol', mobile_fortress: 'mobile_fortress', infinite_recycle: 'recycle_burst'
};
Object.entries(comboMap).forEach(([comboId, vfxId]) => {
  assert.ok(DATA.comboFeedback[comboId], `missing combo feedback ${comboId}`);
  assert.strictEqual(DATA.comboFeedback[comboId].vfx, vfxId);
});

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

console.log(JSON.stringify({
  passed: true,
  moonProps: moonPropsCount,
  exitFlow: 'paused-and-settled',
  eliteVariants: 'registered',
  levelCap: 'enforced'
}));
