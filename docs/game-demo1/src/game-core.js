(function (root) {
  'use strict';

  const DATA = (typeof module !== 'undefined' && module.exports)
    ? require('./data.js')
    : root.StarDutyData;

  const W = 360;
  const H = 640;
  const TAU = Math.PI * 2;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pick = (items, random = Math.random) => items[Math.floor(random() * items.length)];
  const pad2 = (n) => String(n).padStart(2, '0');
  const formatTime = (seconds) => `${pad2(Math.floor(seconds / 60))}:${pad2(Math.floor(seconds % 60))}`;

  function mulberry32(seed) {
    return function random() {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffled(items, random) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function defaultSave() {
    return {
      version: 1,
      credits: 0,
      selectedClass: 'gunner',
      unlocked: { gunner: true },
      successes: 0,
      completedMissions: {},
      modules: { scanner: 0, fabricator: 0, cargo: 0, life_support: 0, printer: 0 },
      firstRun: true,
      bestKills: 0
    };
  }

  class StarDutyGame {
    constructor(canvas, services = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.services = services;
      this.storage = services.storage || { get: () => null, set: () => {} };
      this.audio = services.audio || { play: () => {}, intensity: () => {} };
      this.assets = services.assets || null;
      this.fontFamily = services.fontFamily || 'FusionPixel12';
      this.raf = services.raf || ((callback) => requestAnimationFrame(callback));
      this.now = 0;
      this.lastFrame = 0;
      this.paused = false;
      this.state = 'hq';
      this.hqPage = 'main';
      this.buttons = [];
      this.uiPress = null;
      this.pointer = { active: false, id: null, originX: 0, originY: 0, x: 0, y: 0 };
      this.save = this.loadSave();
      this.contract = null;
      this.world = null;
      this.player = null;
      this.result = null;
      this.levelChoices = [];
      this.pendingLevelUps = 0;
      this.notice = null;
      this.shake = 0;
      this.flash = 0;
      this.stars = Array.from({ length: 70 }, (_, index) => ({
        x: (index * 73 + 19) % W,
        y: (index * 131 + 47) % H,
        size: index % 9 === 0 ? 2 : 1,
        phase: (index * 0.71) % TAU
      }));
      this.loop = this.loop.bind(this);
      this.raf(this.loop);
    }

    loadSave() {
      const base = defaultSave();
      try {
        const saved = this.storage.get('star-duty-save');
        if (!saved) return base;
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        return {
          ...base,
          ...parsed,
          unlocked: { ...base.unlocked, ...(parsed.unlocked || {}) },
          completedMissions: { ...(parsed.completedMissions || {}) },
          modules: { ...base.modules, ...(parsed.modules || {}) }
        };
      } catch (error) {
        return base;
      }
    }

    persist() {
      this.storage.set('star-duty-save', JSON.stringify(this.save));
    }

    loop(timestamp) {
      const rawDt = this.lastFrame ? (timestamp - this.lastFrame) / 1000 : 0;
      const dt = clamp(rawDt, 0, 0.034);
      this.lastFrame = timestamp;
      this.now += dt;
      if (!this.paused && this.state === 'playing') this.update(dt);
      this.render();
      this.raf(this.loop);
    }

    setPaused(value) {
      this.paused = value;
      this.lastFrame = 0;
    }

    toLogical(clientX, clientY, viewWidth, viewHeight) {
      return { x: clientX / viewWidth * W, y: clientY / viewHeight * H };
    }

    pointerDown(x, y, id = 0) {
      this.audio.play('confirm', 0.01);
      for (let index = this.buttons.length - 1; index >= 0; index -= 1) {
        const button = this.buttons[index];
        if (!button.disabled && x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
          this.uiPress = { x: button.x, y: button.y, w: button.w, h: button.h, until: this.now + 0.12 };
          button.action();
          return;
        }
      }
      if (this.state === 'playing' && !this.paused) {
        this.pointer = { active: true, id, originX: x, originY: y, x, y };
        if (this.save.firstRun) {
          this.save.firstRun = false;
          this.persist();
        }
      }
    }

    pointerMove(x, y, id = 0) {
      if (this.pointer.active && this.pointer.id === id) {
        this.pointer.x = x;
        this.pointer.y = y;
      }
    }

    pointerUp(id = 0) {
      if (this.pointer.id === id) this.pointer.active = false;
    }

    notify(title, detail = '', color = DATA.palette.acid, duration = 2.2) {
      this.notice = { title, detail, color, time: duration, max: duration };
    }

    prepareContract() {
      if (!this.contract) {
        const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const random = mulberry32(seed);
        this.contract = {
          seed,
          planet: pick(DATA.planets, random),
          mission: pick(DATA.missions, random),
          anomaly: pick(DATA.anomalies, random),
          rewardCode: random() > 0.5 ? '遗失货柜' : '异常样本'
        };
      }
      this.state = 'briefing';
      this.audio.play('terminal');
    }

    beginRun() {
      const random = mulberry32(this.contract.seed);
      const selected = DATA.classById[this.save.selectedClass] || DATA.classes[0];
      const lifeLevel = this.save.modules.life_support || 0;
      const maxHp = Math.round(selected.base.hp * (1 + lifeLevel * 0.04));
      this.player = {
        classId: selected.id,
        x: 750,
        y: 1660,
        dirX: 0,
        dirY: -1,
        hp: maxHp,
        maxHp,
        speed: selected.base.speed,
        level: 1,
        xp: 0,
        nextXp: 18,
        cards: {},
        evolutions: {},
        overflow: { damage: 0, speed: 0, guard: 0 },
        rerolls: this.save.modules.fabricator || 0,
        attackTimer: 0.1,
        railTimer: 4,
        turretTimer: 5,
        selfDestructTimer: 11,
        reloadTimer: 0,
        ammo: 6,
        attackCount: 0,
        invuln: 0,
        boostTimer: 0,
        boostCooldown: 0,
        unyieldingUsed: false,
        fury: 0,
        furyStacks: 0,
        scrap: 0,
        scrapHeal: 0,
        kills: 0,
        loot: 0
      };

      const objectivePositions = [
        { x: 480 + random() * 540, y: 1240 + random() * 110 },
        { x: 300 + random() * 900, y: 820 + random() * 120 },
        { x: 430 + random() * 650, y: 370 + random() * 120 }
      ];
      const objective = this.createObjective(this.contract.mission.id, objectivePositions);
      const props = [];
      const rustPropGroups = {
        small: ['rock_cluster', 'scrap_plate', 'cable_coil', 'gear_debris', 'broken_pipe', 'vent_grate', 'warning_sign'],
        medium: ['pipe_junction', 'rust_barrels', 'antenna_mast', 'machine_carcass', 'wrecked_rover', 'collapsed_pump', 'power_pylon'],
        large: ['broken_mining_crane', 'crashed_shuttle_hull'],
        decal: ['scorch_mark', 'oil_stain', 'rust_patch', 'tire_track', 'warning_stripe', 'shallow_crater', 'metal_seam', 'cable_run']
      };
      for (let index = 0; index < 95; index += 1) {
        let assetId = null;
        let size = 0.6 + random() * 0.9;
        if (this.contract.planet.id === 'rust' && this.assets) {
          const roll = random();
          const group = roll < 0.46 ? 'small' : (roll < 0.69 ? 'decal' : (roll < 0.96 ? 'medium' : 'large'));
          assetId = pick(rustPropGroups[group], random);
          size = group === 'small' ? 0.78 + random() * 0.42
            : (group === 'medium' ? 0.68 + random() * 0.34
              : (group === 'large' ? 0.68 + random() * 0.2 : 0.8 + random() * 0.45));
        }
        props.push({
          x: 70 + random() * 1360,
          y: 100 + random() * 1700,
          kind: Math.floor(random() * 4),
          assetId,
          size,
          tone: random()
        });
      }
      const cacheSide = random() > 0.5 ? 1 : -1;
      this.world = {
        random,
        width: 1500,
        height: 1900,
        time: 0,
        missionComplete: false,
        objective,
        extraction: { x: 750, y: 1715, radius: 82, progress: 0, required: 50 },
        cache: { x: 750 + cacheSide * 510, y: 630, found: false, collected: false, eliteSpawned: false, eliteDefeated: false },
        props,
        enemies: [],
        projectiles: [],
        enemyProjectiles: [],
        pickups: [],
        hazards: [],
        particles: [],
        turrets: [],
        spawnTimer: 0.35,
        hazardTimer: 3.5,
        eliteId: null,
        camera: { x: this.player.x - W / 2, y: this.player.y - H / 2 },
        basePay: 0
      };
      this.contract.started = true;
      this.pendingLevelUps = 0;
      this.state = 'playing';
      this.audio.play('deploy');
      this.audio.intensity(0.08);
      this.notify('打印体已上线', `${selected.employee} // ${this.contract.planet.code}`, selected.color, 2.8);
    }

    createObjective(id, positions) {
      if (id === 'nests') {
        return {
          id,
          items: positions.map((position, index) => ({ ...position, index, hp: 760, maxHp: 760, dead: false, radius: 34 }))
        };
      }
      if (id === 'beacons') {
        return {
          id,
          current: 0,
          items: positions.map((position, index) => ({ ...position, index, charge: 0, required: 18, active: false }))
        };
      }
      return {
        id,
        item: { ...positions[1], progress: 0, required: 90, started: false, radius: 142 }
      };
    }

    getCardLevel(id) {
      if (this.player.cards[id]) return this.player.cards[id];
      const classData = DATA.classById[this.player.classId];
      const evolution = classData.evolutions.find((entry) => this.player.evolutions[entry.id] && entry.requires.includes(id));
      return evolution ? 3 : 0;
    }

    hasEvolution(id) {
      return Boolean(this.player.evolutions[id]);
    }

    currentStats() {
      const classData = DATA.classById[this.player.classId];
      let damage = classData.base.damage;
      let interval = classData.base.interval;
      let speed = classData.base.speed;
      let reduction = 0;
      let pickupRange = 42 + (this.save.modules.life_support || 0) * 7;
      let dodge = 0;

      if (classData.id === 'warrior') {
        damage *= 1 + this.getCardLevel('strength') * 0.13;
        interval *= 1 - this.getCardLevel('attack_speed') * 0.11;
        reduction += this.getCardLevel('guard') * 0.075;
        dodge += this.getCardLevel('dodge') * 0.075;
        if (this.player.hp / this.player.maxHp < 0.34) {
          damage *= 1 + this.getCardLevel('unyielding') * 0.2;
          speed *= 1 + this.getCardLevel('unyielding') * 0.07;
        }
        if (this.player.fury > 0) damage *= 1 + this.player.furyStacks * 0.12;
      }

      if (classData.id === 'mechanic') {
        interval *= 1 - this.getCardLevel('overclock') * 0.1;
        reduction += this.getCardLevel('shield') * 0.065;
        damage *= 1 + Math.min(0.35, this.player.scrap * 0.004 * this.getCardLevel('salvage'));
        pickupRange += this.getCardLevel('magnet') * 28;
      }

      if (classData.id === 'gunner' && this.player.boostTimer > 0) {
        speed *= 1.65;
        dodge += this.getCardLevel('emergency_dash') >= 3 ? 0.5 : 0;
      }

      if (this.contract && this.contract.anomaly.id === 'low_gravity') speed *= 1.08;
      if (this.world && this.contract.anomaly.id === 'energy_tide' && this.energyTideActive()) {
        speed *= 1.2;
        interval *= 0.82;
      }

      damage *= 1 + this.player.overflow.damage * 0.06;
      speed *= 1 + this.player.overflow.speed * 0.04;
      reduction += this.player.overflow.guard * 0.035;

      return { damage, interval: Math.max(0.13, interval), speed, reduction: Math.min(0.65, reduction), pickupRange, dodge };
    }

    energyTideActive() {
      return this.world && this.world.time % 14 > 10;
    }

    update(dt) {
      const world = this.world;
      const player = this.player;
      if (this.save.firstRun) return;
      world.time += dt;
      if (this.notice) {
        this.notice.time -= dt;
        if (this.notice.time <= 0) this.notice = null;
      }
      this.shake = Math.max(0, this.shake - dt * 16);
      this.flash = Math.max(0, this.flash - dt * 3);
      player.invuln = Math.max(0, player.invuln - dt);
      player.boostTimer = Math.max(0, player.boostTimer - dt);
      player.boostCooldown = Math.max(0, player.boostCooldown - dt);
      player.fury = Math.max(0, player.fury - dt);
      if (player.fury <= 0) player.furyStacks = 0;

      const stats = this.currentStats();
      this.updateMovement(dt, stats);
      this.updateMission(dt);
      this.updateSpawning(dt);
      this.updateEnemies(dt);
      this.updateCombat(dt, stats);
      this.updateProjectiles(dt);
      this.updatePickups(dt, stats.pickupRange);
      this.updateHazards(dt);
      this.updateCache();
      this.updateExtraction(dt);
      this.updateParticles(dt);
      const extractionPressure = world.missionComplete && dist(player, world.extraction) < 140;
      this.audio.intensity(extractionPressure ? 1 : clamp(world.enemies.length / 42 + world.time / 1200, 0.08, 0.82));

      world.camera.x = lerp(world.camera.x, clamp(player.x - W / 2, 0, world.width - W), 1 - Math.pow(0.001, dt));
      world.camera.y = lerp(world.camera.y, clamp(player.y - H / 2, 0, world.height - H), 1 - Math.pow(0.001, dt));

      if (player.hp <= 0) this.finishRun(false, '打印体失去生命信号');
      else if (world.time >= 720) this.finishRun(false, '总部强制结束超时任务');
    }

    updateMovement(dt, stats) {
      let vx = 0;
      let vy = 0;
      if (this.pointer.active) {
        const dx = this.pointer.x - this.pointer.originX;
        const dy = this.pointer.y - this.pointer.originY;
        const length = Math.hypot(dx, dy);
        if (length > 5) {
          vx = dx / length;
          vy = dy / length;
          this.player.dirX = vx;
          this.player.dirY = vy;
        }
      }
      this.player.x = clamp(this.player.x + vx * stats.speed * dt, 28, this.world.width - 28);
      this.player.y = clamp(this.player.y + vy * stats.speed * dt, 40, this.world.height - 28);
      if (this.player.classId === 'gunner' && this.getCardLevel('emergency_dash') > 0 && this.player.boostCooldown <= 0) {
        const nearby = this.world.enemies.filter((enemy) => !enemy.dead && dist(enemy, this.player) < 110).length;
        if (nearby >= 7) {
          this.player.boostTimer = 0.8 + this.getCardLevel('emergency_dash') * 0.2;
          this.player.boostCooldown = 8 - this.getCardLevel('emergency_dash') * 1.2;
          this.notify('紧急推进', '检测到不健康的同事密度', DATA.palette.cyan, 1.2);
          this.audio.play('dash');
        }
      }
    }

    updateMission(dt) {
      const objective = this.world.objective;
      if (this.world.missionComplete) return;
      if (objective.id === 'beacons') {
        const target = objective.items[objective.current];
        if (target && dist(target, this.player) < 72) {
          target.charge += dt;
          target.active = true;
          if (target.charge >= target.required) {
            target.charge = target.required;
            objective.current += 1;
            this.audio.play('objective');
            this.notify(`信标 ${objective.current}/3 已上线`, '资产现在承认公司的所有权', DATA.palette.acid);
          }
        } else if (target) {
          target.active = false;
          target.charge = Math.max(0, target.charge - dt * 0.22);
        }
        if (objective.current >= objective.items.length) this.completeMission();
      } else if (objective.id === 'drill') {
        const drill = objective.item;
        const nearby = dist(drill, this.player) < drill.radius;
        if (nearby) {
          drill.started = true;
          drill.progress = Math.min(drill.required, drill.progress + dt);
        } else if (drill.started) {
          drill.progress = Math.max(0, drill.progress - dt * 0.12);
        }
        if (drill.progress >= drill.required) this.completeMission();
      } else if (objective.items.every((item) => item.dead)) {
        this.completeMission();
      }
    }

    completeMission() {
      if (this.world.missionComplete) return;
      this.world.missionComplete = true;
      this.world.basePay = this.contract.mission.basePay;
      this.notify('主任务完成', '撤离许可已生成 // 加班自愿', DATA.palette.acid, 3.2);
      this.audio.play('mission_complete');
      this.flash = 0.5;
    }

    updateSpawning(dt) {
      const world = this.world;
      world.spawnTimer -= dt;
      if (world.spawnTimer > 0 || world.enemies.length >= 145) return;
      const pressure = clamp(world.time / 420, 0, 1);
      const extracting = world.missionComplete && dist(this.player, world.extraction) < 130;
      const count = extracting ? 2 : (world.random() < pressure * 0.3 ? 2 : 1);
      for (let index = 0; index < count; index += 1) this.spawnEnemy();
      const onboardingPace = world.time < 25 ? 1.22 : 0.85;
      world.spawnTimer = Math.max(0.2, onboardingPace - pressure * 0.5) * (extracting ? 0.56 : 1);
    }

    spawnEnemy(options = {}) {
      const world = this.world;
      const angle = world.random() * TAU;
      const radius = 280 + world.random() * 190;
      const x = clamp(this.player.x + Math.cos(angle) * radius, 24, world.width - 24);
      const y = clamp(this.player.y + Math.sin(angle) * radius, 40, world.height - 24);
      const age = world.time;
      let type = 'swarm';
      const roll = world.random();
      if (age > 70 && roll > 0.78) type = 'shooter';
      else if (age > 35 && roll > 0.58) type = 'charger';
      else if (age > 120 && roll < 0.12) type = 'bloater';
      const scale = 1 + age / 900;
      const templates = {
        swarm: { hp: 24, speed: 39, damage: 8, radius: 10, xp: 5 },
        shooter: { hp: 42, speed: 30, damage: 7, radius: 12, xp: 8 },
        charger: { hp: 68, speed: 31, damage: 13, radius: 15, xp: 10 },
        bloater: { hp: 112, speed: 22, damage: 16, radius: 19, xp: 14 }
      };
      const base = templates[type];
      const elite = Boolean(options.elite);
      const enemy = {
        id: `e-${Math.floor(world.random() * 1e9)}`,
        x: options.x || x,
        y: options.y || y,
        vx: 0,
        vy: 0,
        type: elite ? 'elite' : type,
        elite,
        hp: elite ? 1450 : Math.round(base.hp * scale),
        maxHp: elite ? 1450 : Math.round(base.hp * scale),
        speed: elite ? 27 : base.speed * (1 + age / 1800),
        damage: elite ? 19 : base.damage * scale,
        radius: elite ? 28 : base.radius,
        xp: elite ? 75 : base.xp,
        shootTimer: 1.3 + world.random(),
        chargeTimer: 2 + world.random() * 2,
        orbitCd: 0,
        hitFlash: 0,
        dead: false
      };
      world.enemies.push(enemy);
      if (elite) {
        world.eliteId = enemy.id;
        this.notify(this.contract.planet.elite, '可选高收益目标已进入工位', this.contract.planet.accent, 2.6);
        this.audio.play('elite');
      }
    }

    updateEnemies(dt) {
      const world = this.world;
      const stats = this.currentStats();
      for (const enemy of world.enemies) {
        if (enemy.dead) continue;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 8);
        enemy.orbitCd = Math.max(0, enemy.orbitCd - dt);
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        let speed = enemy.speed;
        if (this.contract.anomaly.id === 'energy_tide' && this.energyTideActive()) speed *= 1.2;

        if (enemy.type === 'shooter' && length < 230) speed *= -0.25;
        if (enemy.type === 'charger' || enemy.elite) {
          enemy.chargeTimer -= dt;
          if (enemy.chargeTimer < 0.55 && enemy.chargeTimer > 0) speed *= 0.12;
          if (enemy.chargeTimer <= 0) {
            speed *= enemy.elite ? 4.5 : 5.2;
            if (enemy.chargeTimer < -0.42) enemy.chargeTimer = enemy.elite ? 2.7 : 3.8;
          }
        }
        enemy.vx = lerp(enemy.vx, dx / length * speed, 1 - Math.pow(0.02, dt));
        enemy.vy = lerp(enemy.vy, dy / length * speed, 1 - Math.pow(0.02, dt));
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;

        if ((enemy.type === 'shooter' || enemy.elite) && length < 310) {
          enemy.shootTimer -= dt;
          if (enemy.shootTimer <= 0) {
            const bulletSpeed = enemy.elite ? 105 : 86;
            const shots = enemy.elite ? 3 : 1;
            for (let shot = 0; shot < shots; shot += 1) {
              const angle = Math.atan2(dy, dx) + (shot - (shots - 1) / 2) * 0.22;
              world.enemyProjectiles.push({
                x: enemy.x, y: enemy.y - 5,
                vx: Math.cos(angle) * bulletSpeed,
                vy: Math.sin(angle) * bulletSpeed,
                damage: enemy.damage * 0.72,
                life: 4,
                radius: enemy.elite ? 5 : 4,
                color: this.contract.planet.accent
              });
            }
            enemy.shootTimer = enemy.elite ? 1.4 : 2.1;
          }
        }

        if (length < enemy.radius + 13 && this.player.invuln <= 0) this.hurtPlayer(enemy.damage, enemy.x, enemy.y, stats);
      }
      world.enemies = world.enemies.filter((enemy) => !enemy.dead);

      for (const bullet of world.enemyProjectiles) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.life -= dt;
        if (bullet.life > 0 && dist(bullet, this.player) < bullet.radius + 10 && this.player.invuln <= 0) {
          bullet.life = 0;
          this.hurtPlayer(bullet.damage, bullet.x, bullet.y, stats);
        }
      }
      world.enemyProjectiles = world.enemyProjectiles.filter((bullet) => bullet.life > 0);
    }

    hurtPlayer(amount, sourceX, sourceY, stats = this.currentStats()) {
      if (Math.random() < stats.dodge) {
        this.player.invuln = 0.25;
        this.spawnText(this.player.x, this.player.y - 25, '闪避', DATA.palette.acid);
        this.audio.play('dodge');
        if (this.hasEvolution('phantom_counter')) this.radialDamage(this.player.x, this.player.y, 95, stats.damage * 1.6, DATA.palette.acid);
        return;
      }
      const dealt = Math.max(1, amount * (1 - stats.reduction));
      this.player.hp -= dealt;
      this.player.invuln = 0.62;
      this.shake = 5;
      this.flash = 0.16;
      this.spawnText(this.player.x, this.player.y - 24, `-${Math.ceil(dealt)}`, DATA.palette.danger);
      this.audio.play('hurt');

      if (this.player.classId === 'warrior' && this.getCardLevel('counter') > 0) {
        const level = this.getCardLevel('counter');
        this.radialDamage(this.player.x, this.player.y, 54 + level * 13, stats.damage * (0.65 + level * 0.25), DATA.palette.orange);
      }
      if (this.getCardLevel('unyielding') >= 3 && !this.player.unyieldingUsed && this.player.hp <= 0) {
        this.player.hp = 1;
        this.player.unyieldingUsed = true;
        this.notify('拒绝下班', '不屈协议已执行一次', DATA.palette.orange);
      }
      const dx = this.player.x - sourceX;
      const dy = this.player.y - sourceY;
      const length = Math.max(1, Math.hypot(dx, dy));
      this.player.x += dx / length * 12;
      this.player.y += dy / length * 12;
    }

    updateCombat(dt, stats) {
      const player = this.player;
      player.attackTimer -= dt;
      if (player.classId === 'gunner') this.updateGunner(dt, stats);
      else if (player.classId === 'warrior') this.updateWarrior(dt, stats);
      else this.updateMechanic(dt, stats);
    }

    nearestTarget(x, y, range = Infinity, excludeIds = []) {
      let best = null;
      let bestDistance = range;
      for (const enemy of this.world.enemies) {
        if (enemy.dead || excludeIds.includes(enemy.id)) continue;
        const distance = Math.hypot(enemy.x - x, enemy.y - y);
        if (distance < bestDistance) {
          best = { kind: 'enemy', ref: enemy };
          bestDistance = distance;
        }
      }
      if (this.world.objective.id === 'nests' && !this.world.missionComplete) {
        for (const item of this.world.objective.items) {
          if (item.dead) continue;
          const distance = Math.hypot(item.x - x, item.y - y);
          if (distance < bestDistance) {
            best = { kind: 'objective', ref: item };
            bestDistance = distance;
          }
        }
      }
      return best;
    }

    updateGunner(dt, stats) {
      const player = this.player;
      if (player.reloadTimer > 0) {
        player.reloadTimer -= dt;
        if (player.reloadTimer <= 0) {
          player.ammo = 6 + this.getCardLevel('magazine') * 2;
          this.audio.play('reload');
        }
      }
      const target = this.nearestTarget(player.x, player.y, DATA.classById.gunner.base.range);
      if (player.attackTimer <= 0 && player.reloadTimer <= 0 && target) {
        const burst = this.getCardLevel('burst');
        const scatter = this.getCardLevel('scatter');
        const count = Math.min(8, 1 + burst + scatter * 2);
        const baseAngle = Math.atan2(target.ref.y - player.y, target.ref.x - player.x);
        const spread = scatter > 0 ? 0.12 + scatter * 0.035 : 0.035;
        for (let index = 0; index < count; index += 1) {
          const angle = baseAngle + (index - (count - 1) / 2) * spread;
          this.spawnPlayerProjectile(player.x, player.y - 3, angle, stats.damage / (1 + Math.max(0, count - 1) * 0.08), 'gun');
        }
        player.dirX = Math.cos(baseAngle);
        player.dirY = Math.sin(baseAngle);
        player.ammo -= 1;
        player.attackTimer = stats.interval;
        this.audio.play('shot');
        if (player.ammo <= 0) {
          const reloadLevel = this.getCardLevel('reload');
          player.reloadTimer = 1.18 * (1 - reloadLevel * 0.13);
        }
      }
      const railLevel = this.getCardLevel('railgun');
      if (railLevel > 0) {
        player.railTimer -= dt;
        if (player.railTimer <= 0 && target) {
          const angle = Math.atan2(target.ref.y - player.y, target.ref.x - player.x);
          this.lineDamage(player.x, player.y, angle, 520, 12 + railLevel * 3, stats.damage * (2.2 + railLevel * 0.55));
          player.railTimer = 6.2 - railLevel * 0.85;
          this.world.particles.push({ type: 'rail', x: player.x, y: player.y, angle, life: 0.22, max: 0.22, color: DATA.palette.cyan });
          this.audio.play('rail');
          this.shake = 3;
        }
      }
      if (this.hasEvolution('zero_storm')) {
        player.zeroStormTimer = (player.zeroStormTimer || 0) - dt;
        const near = this.world.enemies.some((enemy) => dist(enemy, player) < 74);
        if (near && player.zeroStormTimer <= 0) {
          for (let index = 0; index < 12; index += 1) this.spawnPlayerProjectile(player.x, player.y, index / 12 * TAU, stats.damage * 0.9, 'gun');
          player.zeroStormTimer = 2.6;
          this.audio.play('blast');
        }
      }
    }

    spawnPlayerProjectile(x, y, angle, damage, source) {
      const piercing = this.getCardLevel('piercing');
      const ricochet = this.getCardLevel('ricochet');
      this.world.projectiles.push({
        x, y,
        vx: Math.cos(angle) * 270,
        vy: Math.sin(angle) * 270,
        damage,
        radius: source === 'drone' ? 3 : 3.5,
        life: 1.7,
        color: source === 'drone' ? DATA.classById.mechanic.color : DATA.classById[this.player.classId].color,
        source,
        pierce: source === 'gun' ? (piercing >= 3 ? 3 : piercing) : 0,
        bounce: source === 'gun' ? (ricochet >= 3 ? 2 : Math.min(1, ricochet)) : 0,
        chain: source === 'drone' ? this.getCardLevel('arc') : 0,
        explosion: source === 'gun' ? this.getCardLevel('explosive') : 0,
        knockback: source === 'gun' ? this.getCardLevel('knockback') : 0,
        hitIds: []
      });
    }

    updateWarrior(dt, stats) {
      const player = this.player;
      const cleave = this.getCardLevel('cleave');
      const target = this.nearestTarget(player.x, player.y, 92 + cleave * 13);
      if (player.attackTimer <= 0 && target) {
        const angle = Math.atan2(target.ref.y - player.y, target.ref.x - player.x);
        const range = 76 + cleave * 13;
        const arc = 1.15 + cleave * 0.16;
        this.arcDamage(player.x, player.y, angle, range, arc, stats.damage * (1 + cleave * 0.1));
        player.dirX = Math.cos(angle);
        player.dirY = Math.sin(angle);
        player.attackCount += 1;
        this.world.particles.push({ type: 'slash', x: player.x, y: player.y, angle, range, life: 0.18, max: 0.18, color: DATA.classById.warrior.color });
        const doubleLevel = this.getCardLevel('double_slash');
        if (doubleLevel > 0 && Math.random() < 0.2 + doubleLevel * 0.16) {
          this.arcDamage(player.x, player.y, angle + 0.18, range, arc, stats.damage * (0.55 + doubleLevel * 0.13));
        }
        const waveLevel = this.getCardLevel('sword_wave');
        const every = waveLevel >= 2 ? 3 : 4;
        if (waveLevel > 0 && player.attackCount % every === 0) {
          const waveCount = this.hasEvolution('rift_slash') ? 3 : 1;
          for (let index = 0; index < waveCount; index += 1) {
            const waveAngle = angle + (index - (waveCount - 1) / 2) * 0.22;
            this.world.projectiles.push({
              x: player.x, y: player.y,
              vx: Math.cos(waveAngle) * 185,
              vy: Math.sin(waveAngle) * 185,
              damage: stats.damage * (0.75 + waveLevel * 0.27),
              radius: 9 + waveLevel * 2,
              life: 1.55,
              color: DATA.palette.orange,
              source: 'wave', pierce: 4, bounce: 0, chain: 0, explosion: 0, knockback: 1, hitIds: []
            });
          }
        }
        player.attackTimer = stats.interval;
        this.audio.play('slash');
      }

      const orbitLevel = this.getCardLevel('orbit_blade');
      if (orbitLevel > 0) {
        const count = Math.min(7, orbitLevel + (this.hasEvolution('star_ring') ? 3 : 0));
        const radius = this.hasEvolution('star_ring') ? 70 : 54;
        for (let index = 0; index < count; index += 1) {
          const angle = this.world.time * (1.4 + this.getCardLevel('attack_speed') * 0.28) + index / count * TAU;
          const bx = player.x + Math.cos(angle) * radius;
          const by = player.y + Math.sin(angle) * radius * 0.68;
          for (const enemy of this.world.enemies) {
            if (!enemy.dead && enemy.orbitCd <= 0 && Math.hypot(enemy.x - bx, enemy.y - by) < enemy.radius + 9) {
              this.damageEnemy(enemy, stats.damage * (0.3 + orbitLevel * 0.13), { close: true });
              enemy.orbitCd = this.hasEvolution('star_ring') ? 0.18 : 0.42;
            }
          }
        }
      }
    }

    updateMechanic(dt, stats) {
      const player = this.player;
      const droneLevel = this.getCardLevel('drone');
      const mechCount = this.getCardLevel('mech_count');
      const droneCount = Math.min(7, 1 + (droneLevel >= 2 ? 1 : 0) + mechCount + (this.hasEvolution('swarm_protocol') ? 2 : 0));
      const target = this.nearestTarget(player.x, player.y, DATA.classById.mechanic.base.range + droneLevel * 16);
      if (player.attackTimer <= 0 && target) {
        for (let index = 0; index < droneCount; index += 1) {
          const orbitAngle = this.world.time * 1.2 + index / droneCount * TAU;
          const x = player.x + Math.cos(orbitAngle) * 38;
          const y = player.y + Math.sin(orbitAngle) * 25;
          const angle = Math.atan2(target.ref.y - y, target.ref.x - x);
          this.spawnPlayerProjectile(x, y, angle, stats.damage * (1 + droneLevel * 0.16), 'drone');
        }
        player.attackTimer = stats.interval;
        this.audio.play('drone');
      }

      const turretLevel = this.getCardLevel('turret');
      if (turretLevel > 0 && !this.hasEvolution('mobile_fortress')) {
        player.turretTimer -= dt;
        if (player.turretTimer <= 0) {
          this.world.turrets.push({ x: player.x, y: player.y, life: 18 + this.getCardLevel('quick_deploy') * 4, shot: 0.2, level: turretLevel });
          const maxTurrets = 1 + (turretLevel >= 2 ? 1 : 0);
          while (this.world.turrets.length > maxTurrets) this.world.turrets.shift();
          player.turretTimer = Math.max(4, 12 - this.getCardLevel('quick_deploy') * 2.2);
          if (this.getCardLevel('quick_deploy') >= 3) this.radialDamage(player.x, player.y, 65, stats.damage * 0.8, DATA.palette.cyan);
          this.audio.play('deploy_turret');
        }
      }

      if (this.hasEvolution('mobile_fortress') && target) {
        player.fortressTimer = (player.fortressTimer || 0) - dt;
        if (player.fortressTimer <= 0) {
          for (let index = 0; index < 2; index += 1) {
            const angle = Math.atan2(target.ref.y - player.y, target.ref.x - player.x) + (index ? 0.08 : -0.08);
            this.spawnPlayerProjectile(player.x, player.y, angle, stats.damage * 1.4, 'drone');
          }
          player.fortressTimer = 0.42;
        }
      }

      for (const turret of this.world.turrets) {
        turret.life -= dt;
        turret.shot -= dt;
        const turretTarget = this.nearestTarget(turret.x, turret.y, 260);
        if (turret.shot <= 0 && turretTarget) {
          const angle = Math.atan2(turretTarget.ref.y - turret.y, turretTarget.ref.x - turret.x);
          this.spawnPlayerProjectile(turret.x, turret.y, angle, stats.damage * (0.7 + turret.level * 0.18), 'drone');
          turret.shot = 0.8 - this.getCardLevel('overclock') * 0.08;
        }
      }
      this.world.turrets = this.world.turrets.filter((turret) => turret.life > 0);

      const repair = this.getCardLevel('repair_bot');
      if (repair > 0 && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + dt * repair * 0.34);

      const selfDestruct = this.getCardLevel('self_destruct');
      if (selfDestruct > 0) {
        player.selfDestructTimer -= dt;
        if (player.selfDestructTimer <= 0) {
          const angle = this.world.time * 1.7;
          const x = player.x + Math.cos(angle) * 45;
          const y = player.y + Math.sin(angle) * 28;
          this.radialDamage(x, y, 58 + selfDestruct * 10, stats.damage * (1.5 + selfDestruct * 0.45), DATA.palette.acid);
          if (this.hasEvolution('infinite_recycle')) player.hp = Math.min(player.maxHp, player.hp + 4);
          player.selfDestructTimer = this.hasEvolution('infinite_recycle') ? 4.2 : 12 - selfDestruct * 1.5;
          this.audio.play('blast');
        }
      }
    }

    updateProjectiles(dt) {
      const world = this.world;
      for (const projectile of world.projectiles) {
        projectile.x += projectile.vx * dt;
        projectile.y += projectile.vy * dt;
        projectile.life -= dt;
        if (projectile.life <= 0) continue;
        let hit = null;
        for (const enemy of world.enemies) {
          if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue;
          if (Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) < enemy.radius + projectile.radius) {
            hit = { kind: 'enemy', ref: enemy };
            break;
          }
        }
        if (!hit && world.objective.id === 'nests' && !world.missionComplete) {
          for (const objective of world.objective.items) {
            if (!objective.dead && Math.hypot(objective.x - projectile.x, objective.y - projectile.y) < objective.radius + projectile.radius) {
              hit = { kind: 'objective', ref: objective };
              break;
            }
          }
        }
        if (!hit) continue;
        const critLevel = projectile.source === 'gun' ? this.getCardLevel('crit') : 0;
        const crit = critLevel > 0 && Math.random() < critLevel * 0.095;
        let damage = projectile.damage * (crit ? 1.8 + critLevel * 0.14 : 1);
        if (projectile.source === 'gun' && this.getCardLevel('weakspot') >= 2 && hit.kind === 'enemy' && hit.ref.hp / hit.ref.maxHp < 0.35) damage *= 1.35;
        if (hit.kind === 'enemy') {
          this.damageEnemy(hit.ref, damage, { crit, projectile });
          projectile.hitIds.push(hit.ref.id);
          if (projectile.knockback > 0) {
            const length = Math.max(1, Math.hypot(projectile.vx, projectile.vy));
            const multiplier = this.contract.anomaly.id === 'low_gravity' ? 1.55 : 1;
            hit.ref.x += projectile.vx / length * projectile.knockback * 7 * multiplier;
            hit.ref.y += projectile.vy / length * projectile.knockback * 7 * multiplier;
          }
          if (projectile.explosion > 0) this.radialDamage(hit.ref.x, hit.ref.y, 20 + projectile.explosion * 6, damage * 0.25, DATA.palette.orange, hit.ref.id);
          if (projectile.chain > 0) this.chainDamage(hit.ref, damage * 0.55, projectile.chain);
        } else {
          this.damageObjective(hit.ref, damage);
        }

        if (projectile.bounce > 0 && hit.kind === 'enemy') {
          const next = this.nearestTarget(hit.ref.x, hit.ref.y, this.hasEvolution('hunt_barrage') ? 240 : 150, projectile.hitIds);
          if (next) {
            const angle = Math.atan2(next.ref.y - projectile.y, next.ref.x - projectile.x);
            const speed = Math.max(180, Math.hypot(projectile.vx, projectile.vy));
            projectile.vx = Math.cos(angle) * speed;
            projectile.vy = Math.sin(angle) * speed;
            projectile.bounce -= 1;
            continue;
          }
        }
        if (projectile.pierce > 0) {
          projectile.pierce -= 1;
          projectile.damage *= this.hasEvolution('piercing_star') ? 0.96 : 0.82;
        } else projectile.life = 0;
      }
      world.projectiles = world.projectiles.filter((projectile) => projectile.life > 0);
    }

    damageObjective(objective, damage) {
      if (objective.dead) return;
      objective.hp -= damage;
      this.spawnText(objective.x, objective.y - 38, `${Math.round(damage)}`, DATA.palette.paper);
      if (objective.hp <= 0) {
        objective.dead = true;
        const count = this.world.objective.items.filter((item) => item.dead).length;
        this.notify(`巢穴 ${count}/3 已注销`, '感谢您维护资产边界', DATA.palette.acid);
        this.audio.play('objective');
        this.radialBurst(objective.x, objective.y, DATA.palette.orange, 18);
      }
    }

    damageEnemy(enemy, amount, options = {}) {
      if (enemy.dead) return;
      enemy.hp -= amount;
      enemy.hitFlash = 1;
      this.spawnText(enemy.x, enemy.y - enemy.radius - 8, `${options.crit ? '!' : ''}${Math.round(amount)}`, options.crit ? DATA.palette.acid : DATA.palette.paper);
      if (enemy.hp > 0) return;
      enemy.dead = true;
      this.player.kills += 1;
      this.player.loot += enemy.elite ? 42 : (Math.random() < 0.06 ? 2 : 0);
      const gemCount = enemy.elite ? 8 : 1;
      for (let index = 0; index < gemCount; index += 1) {
        const angle = index / gemCount * TAU + Math.random() * 0.4;
        this.world.pickups.push({
          x: enemy.x + Math.cos(angle) * (enemy.elite ? 24 : 3),
          y: enemy.y + Math.sin(angle) * (enemy.elite ? 18 : 3),
          value: enemy.elite ? 10 : enemy.xp,
          life: 40,
          kind: 'xp'
        });
      }
      if (this.contract.anomaly.id === 'spore_bloom' && Math.random() < 0.16) {
        this.world.hazards.push({ type: 'pool', x: enemy.x, y: enemy.y, radius: 27, warmup: 0.7, life: 5.5, tick: 0 });
      }
      if (this.player.classId === 'warrior') {
        const lifesteal = this.getCardLevel('lifesteal');
        if (lifesteal > 0 && options.close) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 0.45 + lifesteal * 0.45);
        const fury = this.getCardLevel('battle_fury');
        if (fury > 0 && dist(enemy, this.player) < 110) {
          this.player.fury = 2.5 + fury;
          this.player.furyStacks = Math.min(fury >= 2 ? 2 : 1, this.player.furyStacks + 1);
        }
      }
      if (this.player.classId === 'mechanic') {
        const salvage = this.getCardLevel('salvage');
        if (salvage > 0 && Math.random() < 0.22 + salvage * 0.13) {
          this.player.scrap = Math.min(100, this.player.scrap + 1);
          this.player.scrapHeal += 1;
          const recycle = this.getCardLevel('recycle_heal');
          const needed = recycle >= 2 ? 15 : 20;
          if (recycle > 0 && this.player.scrapHeal >= needed) {
            this.player.scrapHeal = 0;
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 3 + recycle * 2);
          }
        }
      }
      if (enemy.elite) {
        this.world.cache.eliteDefeated = true;
        this.player.loot += 38;
        this.notify('精英目标已清算', '+80 未申报战利品', DATA.palette.acid, 2.8);
        this.audio.play('elite_down');
      }
      this.radialBurst(enemy.x, enemy.y, this.contract.planet.accent, enemy.elite ? 24 : 7);
    }

    arcDamage(x, y, angle, range, arc, damage) {
      for (const enemy of this.world.enemies) {
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        const length = Math.hypot(dx, dy);
        if (length > range + enemy.radius) continue;
        let delta = Math.atan2(dy, dx) - angle;
        while (delta > Math.PI) delta -= TAU;
        while (delta < -Math.PI) delta += TAU;
        if (Math.abs(delta) <= arc / 2) this.damageEnemy(enemy, damage, { close: true });
      }
      if (this.world.objective.id === 'nests' && !this.world.missionComplete) {
        for (const objective of this.world.objective.items) {
          if (!objective.dead && Math.hypot(objective.x - x, objective.y - y) < range + objective.radius) this.damageObjective(objective, damage);
        }
      }
    }

    radialDamage(x, y, radius, damage, color, excludeId = null) {
      for (const enemy of this.world.enemies) {
        if (!enemy.dead && enemy.id !== excludeId && Math.hypot(enemy.x - x, enemy.y - y) < radius + enemy.radius) this.damageEnemy(enemy, damage, { close: true });
      }
      this.world.particles.push({ type: 'ring', x, y, radius, life: 0.32, max: 0.32, color });
    }

    chainDamage(source, damage, chains) {
      let current = source;
      const hit = [source.id];
      for (let index = 0; index < chains; index += 1) {
        const next = this.nearestTarget(current.x, current.y, this.hasEvolution('swarm_protocol') ? 165 : 112, hit);
        if (!next || next.kind !== 'enemy') break;
        this.damageEnemy(next.ref, damage, {});
        this.world.particles.push({ type: 'arc', x: current.x, y: current.y, x2: next.ref.x, y2: next.ref.y, life: 0.16, max: 0.16, color: DATA.palette.acid });
        hit.push(next.ref.id);
        current = next.ref;
      }
    }

    lineDamage(x, y, angle, length, width, damage) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      for (const enemy of this.world.enemies) {
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        const along = dx * cos + dy * sin;
        const across = Math.abs(-dx * sin + dy * cos);
        if (along >= 0 && along <= length && across <= width + enemy.radius) this.damageEnemy(enemy, damage, {});
      }
    }

    updatePickups(dt, pickupRange) {
      for (const item of this.world.pickups) {
        item.life -= dt;
        const dx = this.player.x - item.x;
        const dy = this.player.y - item.y;
        const length = Math.hypot(dx, dy);
        if (length < pickupRange * 2.1) {
          const speed = length < pickupRange ? 330 : 115;
          item.x += dx / Math.max(1, length) * speed * dt;
          item.y += dy / Math.max(1, length) * speed * dt;
        }
        if (length < 16) {
          item.life = 0;
          this.addXp(item.value);
          if (this.player.classId === 'mechanic' && this.getCardLevel('magnet') >= 3 && Math.random() < 0.08) this.player.scrap += 1;
        }
      }
      this.world.pickups = this.world.pickups.filter((item) => item.life > 0);
    }

    addXp(value) {
      this.player.xp += value;
      while (this.player.xp >= this.player.nextXp) {
        this.player.xp -= this.player.nextXp;
        this.player.level += 1;
        this.player.nextXp = Math.round(18 * Math.pow(this.player.level, 1.2));
        this.pendingLevelUps += 1;
      }
      if (this.pendingLevelUps > 0 && this.state === 'playing') this.openLevelUp();
    }

    openLevelUp() {
      this.pendingLevelUps -= 1;
      this.levelChoices = this.generateChoices();
      this.state = 'levelup';
      this.pointer.active = false;
      this.audio.play('level');
    }

    generateChoices() {
      const classData = DATA.classById[this.player.classId];
      const readyEvolutions = classData.evolutions.filter((evolution) => (
        !this.player.evolutions[evolution.id]
        && evolution.requires.every((id) => this.player.cards[id] >= 3)
      ));
      const consumedCards = classData.evolutions
        .filter((evolution) => this.player.evolutions[evolution.id])
        .flatMap((evolution) => evolution.requires);
      const slots = Object.keys(this.player.cards).length + Object.keys(this.player.evolutions).length;
      const cardCandidates = classData.cards.filter((card) => {
        if (consumedCards.includes(card.id)) return false;
        const level = this.player.cards[card.id] || 0;
        return level > 0 ? level < 3 : slots < 6;
      });
      const random = this.world.random;
      const choices = [];
      if (readyEvolutions.length) choices.push({ type: 'evolution', data: pick(readyEvolutions, random) });
      if (this.player.level <= 4) {
        const core = shuffled(cardCandidates.filter((card) => card.kind === 'core'), random)[0];
        if (core) choices.push({ type: 'card', data: core });
      }
      for (const card of shuffled(cardCandidates, random)) {
        if (choices.length >= 3) break;
        if (!choices.some((choice) => choice.data.id === card.id)) choices.push({ type: 'card', data: card });
      }
      if (!choices.length) {
        choices.push(
          { type: 'overflow', data: { id: 'damage', name: `${classData.name}火力超载`, kind: 'OVERLOAD', desc: '本局伤害永久提升 6%。' } },
          { type: 'overflow', data: { id: 'speed', name: `${classData.name}机动超载`, kind: 'OVERLOAD', desc: '本局移动速度永久提升 4%。' } },
          { type: 'overflow', data: { id: 'guard', name: `${classData.name}防护超载`, kind: 'OVERLOAD', desc: '本局受到伤害降低 3.5%。' } }
        );
      }
      return choices;
    }

    chooseUpgrade(choice) {
      if (!choice) return;
      if (choice.type === 'evolution') {
        for (const required of choice.data.requires) delete this.player.cards[required];
        this.player.evolutions[choice.data.id] = true;
        this.notify(`组合进化：${choice.data.name}`, choice.data.desc, DATA.palette.acid, 3);
        this.audio.play('evolution');
      } else if (choice.type === 'overflow') {
        this.player.overflow[choice.data.id] += 1;
        this.notify(choice.data.name, choice.data.desc, DATA.classById[this.player.classId].color, 1.5);
      } else {
        this.player.cards[choice.data.id] = (this.player.cards[choice.data.id] || 0) + 1;
        this.notify(`${choice.data.name} Lv.${this.player.cards[choice.data.id]}`, choice.data.desc[this.player.cards[choice.data.id] - 1], DATA.classById[this.player.classId].color, 1.5);
      }
      this.state = 'playing';
      if (this.pendingLevelUps > 0) this.openLevelUp();
    }

    rerollChoices() {
      if (this.player.rerolls <= 0) return;
      this.player.rerolls -= 1;
      this.levelChoices = this.generateChoices();
      this.audio.play('terminal');
    }

    updateHazards(dt) {
      const world = this.world;
      if (this.contract.anomaly.id === 'meteor') {
        world.hazardTimer -= dt;
        if (world.hazardTimer <= 0) {
          world.hazards.push({
            type: 'meteor',
            x: clamp(this.player.x + this.player.dirX * 38 + (world.random() - 0.5) * 70, 40, world.width - 40),
            y: clamp(this.player.y + this.player.dirY * 38 + (world.random() - 0.5) * 70, 50, world.height - 40),
            radius: 38,
            warmup: 1.05,
            life: 1.4,
            exploded: false
          });
          world.hazardTimer = 4.4;
        }
      }
      for (const hazard of world.hazards) {
        hazard.life -= dt;
        hazard.warmup = Math.max(0, hazard.warmup - dt);
        hazard.tick = (hazard.tick || 0) - dt;
        if (hazard.type === 'meteor' && hazard.warmup <= 0 && !hazard.exploded) {
          hazard.exploded = true;
          if (dist(hazard, this.player) < hazard.radius + 9) this.hurtPlayer(17, hazard.x, hazard.y);
          this.radialDamage(hazard.x, hazard.y, hazard.radius, 42, DATA.palette.orange);
          this.audio.play('blast');
          this.shake = 6;
        }
        if (hazard.type === 'pool' && hazard.warmup <= 0 && hazard.tick <= 0 && dist(hazard, this.player) < hazard.radius + 8) {
          hazard.tick = 0.75;
          if (this.player.invuln <= 0) this.hurtPlayer(5, hazard.x, hazard.y);
        }
      }
      world.hazards = world.hazards.filter((hazard) => hazard.life > 0);
    }

    updateCache() {
      const cache = this.world.cache;
      if (!cache.eliteSpawned && dist(cache, this.player) < 245) {
        cache.eliteSpawned = true;
        cache.found = true;
        this.spawnEnemy({ elite: true, x: cache.x, y: cache.y - 64 });
      }
      if (cache.eliteDefeated && !cache.collected && dist(cache, this.player) < 42) {
        cache.collected = true;
        this.player.loot += 35;
        this.notify('遗失货柜已回收', '+35 未申报战利品', DATA.palette.acid);
        this.audio.play('loot');
      }
    }

    updateExtraction(dt) {
      if (!this.world.missionComplete) return;
      const extraction = this.world.extraction;
      if (dist(extraction, this.player) < extraction.radius) extraction.progress += dt;
      else extraction.progress = Math.max(0, extraction.progress - dt * 0.35);
      if (extraction.progress >= extraction.required) this.finishRun(true, '撤离成功');
    }

    updateParticles(dt) {
      for (const particle of this.world.particles) {
        particle.life -= dt;
        if (particle.vx) particle.x += particle.vx * dt;
        if (particle.vy) particle.y += particle.vy * dt;
      }
      this.world.particles = this.world.particles.filter((particle) => particle.life > 0);
    }

    spawnText(x, y, text, color) {
      if (this.world.particles.length > 180) return;
      this.world.particles.push({ type: 'text', x, y, text, color, life: 0.62, max: 0.62, vy: -18 });
    }

    radialBurst(x, y, color, count) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * TAU;
        const speed = 18 + Math.random() * 55;
        this.world.particles.push({ type: 'pixel', x, y, color, life: 0.3 + Math.random() * 0.45, max: 0.75, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 2 + Math.random() * 3 });
      }
    }

    finishRun(success, reason) {
      if (this.state === 'result') return;
      const missionDone = this.world.missionComplete;
      const basePay = missionDone ? this.contract.mission.basePay : Math.min(18, Math.floor(this.player.kills / 6));
      const extractionBonus = success ? 62 : 0;
      const cargoLevel = this.save.modules.cargo || 0;
      const retainedRate = success ? 1 : 0.1 + cargoLevel * 0.1;
      const retainedLoot = Math.floor(this.player.loot * retainedRate);
      const total = basePay + extractionBonus + retainedLoot;
      this.save.credits += total;
      this.save.bestKills = Math.max(this.save.bestKills || 0, this.player.kills);
      if (success) {
        this.save.successes += 1;
        this.save.completedMissions[this.contract.mission.id] = true;
      }
      this.persist();
      this.result = {
        success,
        reason,
        basePay,
        extractionBonus,
        rawLoot: this.player.loot,
        retainedLoot,
        total,
        kills: this.player.kills,
        level: this.player.level,
        time: this.world.time
      };
      this.state = 'result';
      this.pointer.active = false;
      this.audio.intensity(-1);
      this.audio.play(success ? 'success' : 'failure');
      this.contract = null;
    }

    canUnlock(classData) {
      if (this.save.unlocked[classData.id]) return { allowed: true, reason: '已打印' };
      const discount = 1 - (this.save.modules.printer || 0) * 0.08;
      const cost = Math.max(0, Math.floor(classData.unlock.cost * discount));
      if (this.save.successes < (classData.unlock.successes || 0)) return { allowed: false, cost, reason: `需成功撤离 ${classData.unlock.successes} 次` };
      if (classData.unlock.allMissions && DATA.missions.some((mission) => !this.save.completedMissions[mission.id])) return { allowed: false, cost, reason: '需完成全部任务类型' };
      if (this.save.credits < cost) return { allowed: false, cost, reason: `需要 ${cost} 金币` };
      return { allowed: true, cost, reason: `打印费用 ${cost}` };
    }

    unlockClass(classData) {
      const state = this.canUnlock(classData);
      if (!state.allowed || this.save.unlocked[classData.id]) return;
      this.save.credits -= state.cost;
      this.save.unlocked[classData.id] = true;
      this.save.selectedClass = classData.id;
      this.persist();
      this.audio.play('evolution');
    }

    upgradeModule(moduleData) {
      const level = this.save.modules[moduleData.id] || 0;
      if (level >= 3) return;
      const cost = moduleData.costs[level];
      if (this.save.credits < cost) return;
      this.save.credits -= cost;
      this.save.modules[moduleData.id] = level + 1;
      this.persist();
      this.audio.play('upgrade');
    }

    render() {
      const ctx = this.ctx;
      const scale = Math.min(this.canvas.width / W, this.canvas.height / H);
      const offsetX = (this.canvas.width - W * scale) / 2;
      const offsetY = (this.canvas.height - H * scale) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = DATA.palette.ink;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      ctx.imageSmoothingEnabled = false;
      this.buttons = [];
      if (this.state === 'hq') this.drawHQ();
      else if (this.state === 'briefing') this.drawBriefing();
      else if (this.state === 'playing') this.drawPlaying();
      else if (this.state === 'levelup') {
        this.drawPlaying();
        this.drawLevelUp();
      } else if (this.state === 'result') this.drawResult();
      this.drawScanlines();
    }

    assetImage(key) {
      if (!this.assets || !this.assets.image) return null;
      const image = this.assets.image(key);
      return image && image.width ? image : null;
    }

    drawFrame(key, frameWidth, frameHeight, frameIndex, x, y, width = frameWidth, height = frameHeight) {
      const image = this.assetImage(key);
      if (!image) return false;
      const columns = Math.max(1, Math.floor(image.width / frameWidth));
      const sx = (frameIndex % columns) * frameWidth;
      const sy = Math.floor(frameIndex / columns) * frameHeight;
      this.ctx.drawImage(image, sx, sy, frameWidth, frameHeight, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
      return true;
    }

    drawAnchoredObject(id, state, x, y, scale = 1, timeOffset = 0) {
      const manifest = this.assets && this.assets.manifest;
      const spec = manifest && manifest.objects[id];
      if (!spec) return false;
      const stateSpec = spec.states[state];
      if (!stateSpec) return false;
      const [start, count, fps] = stateSpec;
      const frame = start + (count > 1 ? Math.floor((this.now + timeOffset) * fps) % count : 0);
      const width = spec.frameWidth * scale;
      const height = spec.frameHeight * scale;
      return this.drawFrame(
        `object.${id}`,
        spec.frameWidth,
        spec.frameHeight,
        frame,
        x - spec.anchor[0] * scale,
        y - spec.anchor[1] * scale,
        width,
        height
      );
    }

    drawAtlasIcon(id, x, y, size = 32) {
      const manifest = this.assets && this.assets.manifest;
      const index = manifest && manifest.icons[id];
      if (index === undefined) return false;
      return this.drawFrame('ui.icons', 32, 32, index, x, y, size, size);
    }

    direction4(vx, vy) {
      if (Math.abs(vx) > Math.abs(vy) * 0.72) return vx >= 0 ? 1 : 3;
      return vy >= 0 ? 0 : 2;
    }

    direction8(vx, vy) {
      let angle = Math.atan2(vy, vx);
      if (angle < 0) angle += TAU;
      return Math.round(angle / (TAU / 8)) % 8;
    }

    drawNineSlice(image, x, y, w, h, inset = 12) {
      if (!image || w < inset * 2 || h < inset * 2) return false;
      const sw = image.width;
      const sh = image.height;
      const middleSourceW = sw - inset * 2;
      const middleSourceH = sh - inset * 2;
      const middleDestW = w - inset * 2;
      const middleDestH = h - inset * 2;
      const parts = [
        [0, 0, inset, inset, x, y, inset, inset],
        [inset, 0, middleSourceW, inset, x + inset, y, middleDestW, inset],
        [sw - inset, 0, inset, inset, x + w - inset, y, inset, inset],
        [0, inset, inset, middleSourceH, x, y + inset, inset, middleDestH],
        [inset, inset, middleSourceW, middleSourceH, x + inset, y + inset, middleDestW, middleDestH],
        [sw - inset, inset, inset, middleSourceH, x + w - inset, y + inset, inset, middleDestH],
        [0, sh - inset, inset, inset, x, y + h - inset, inset, inset],
        [inset, sh - inset, middleSourceW, inset, x + inset, y + h - inset, middleDestW, inset],
        [sw - inset, sh - inset, inset, inset, x + w - inset, y + h - inset, inset, inset]
      ];
      for (const part of parts) this.ctx.drawImage(image, ...part.map(Math.round));
      return true;
    }

    font(size, bold = false, mono = false) {
      const primary = this.fontFamily && this.fontFamily !== 'sans-serif' ? `"${this.fontFamily}"` : '"FusionPixel12"';
      return `${bold ? '700' : '400'} ${size}px ${primary}, ${mono ? '"Consolas", ' : ''}"Microsoft YaHei", "PingFang SC", sans-serif`;
    }

    text(value, x, y, size = 12, color = DATA.palette.paper, align = 'left', bold = false, mono = false) {
      const ctx = this.ctx;
      ctx.font = this.font(size, bold, mono);
      ctx.textAlign = align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = color;
      ctx.fillText(value, Math.round(x), Math.round(y));
    }

    wrap(value, x, y, maxWidth, lineHeight, size = 12, color = DATA.palette.paper, maxLines = 4, bold = false) {
      const ctx = this.ctx;
      ctx.font = this.font(size, bold, false);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      const characters = String(value).split('');
      let line = '';
      let lineIndex = 0;
      for (const character of characters) {
        if (ctx.measureText(line + character).width > maxWidth && line) {
          ctx.fillText(line, x, y + lineIndex * lineHeight);
          line = character;
          lineIndex += 1;
          if (lineIndex >= maxLines) return;
        } else line += character;
      }
      if (lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
    }

    panel(x, y, w, h, options = {}) {
      const ctx = this.ctx;
      const variant = options.uiVariant || 'standard';
      const panelImage = this.assetImage(`ui.panel_${variant}`) || this.assetImage('ui.panel_standard');
      if (panelImage) {
        ctx.fillStyle = 'rgba(0,0,0,0.48)';
        ctx.fillRect(x + 3, y + 4, w, h);
        this.drawNineSlice(panelImage, x, y, w, h, 12);
        if (options.accent) {
          ctx.fillStyle = options.accent;
          ctx.fillRect(x + 8, y + 3, Math.min(32, w - 18), 2);
          ctx.fillRect(x + w - 24, y + h - 4, 15, 2);
          if ((options.accentWidth || 0) >= 5) ctx.fillRect(x + 3, y + 12, 2, h - 24);
        }
        return;
      }
      const stroke = options.stroke || '#4a4a40';
      const fill = options.fill || 'rgba(15,20,23,0.96)';
      const inset = options.inset || '#252d2b';
      ctx.fillStyle = 'rgba(0,0,0,0.58)';
      ctx.fillRect(x + 3, y + 4, w, h);
      ctx.fillStyle = stroke;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = fill;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = inset;
      ctx.fillRect(x + 5, y + 5, w - 10, 1);
      ctx.fillRect(x + 5, y + h - 6, w - 10, 1);
      ctx.fillStyle = DATA.palette.ink;
      ctx.fillRect(x, y, 5, 5);
      ctx.fillRect(x + w - 5, y, 5, 5);
      ctx.fillRect(x, y + h - 5, 5, 5);
      ctx.fillRect(x + w - 5, y + h - 5, 5, 5);
      const accent = options.accent;
      if (accent) {
        ctx.fillStyle = accent;
        ctx.fillRect(x + 2, y + 5, options.accentWidth || 4, h - 10);
        ctx.fillRect(x + 8, y + 2, Math.min(30, w - 18), 3);
        ctx.fillRect(x + w - 13, y + h - 5, 7, 2);
      }
      ctx.fillStyle = options.rivet || '#747568';
      ctx.fillRect(x + 8, y + 9, 2, 2);
      ctx.fillRect(x + w - 10, y + 9, 2, 2);
    }

    button(x, y, w, h, label, action, options = {}) {
      const ctx = this.ctx;
      const disabled = Boolean(options.disabled);
      let theme = options.uiTheme;
      if (!theme) {
        if (options.fill === DATA.palette.danger) theme = 'danger';
        else if (options.fill === DATA.palette.acid) theme = 'primary';
        else theme = disabled ? 'locked' : 'secondary';
      }
      const pressed = !disabled && this.uiPress && this.now < this.uiPress.until
        && this.uiPress.x === x && this.uiPress.y === y && this.uiPress.w === w && this.uiPress.h === h;
      const buttonImage = this.assetImage(`ui.button_${theme}_${disabled ? 'disabled' : (pressed ? 'pressed' : 'normal')}`);
      if (buttonImage) {
        ctx.fillStyle = 'rgba(0,0,0,0.58)';
        ctx.fillRect(x + 4, y + 5, w, h);
        this.drawNineSlice(buttonImage, x, y, w, h, 12);
        const defaultText = theme === 'primary' ? DATA.palette.ink : DATA.palette.paper;
        this.text(label, x + w / 2, y + h / 2 + 5, options.size || 14, disabled ? DATA.palette.muted : (options.text || defaultText), 'center', true);
        this.buttons.push({ x, y, w, h, disabled, action });
        return;
      }
      const fill = disabled ? '#242728' : (options.fill || DATA.palette.acid);
      const stroke = disabled ? '#404443' : (options.stroke || '#f2ffd1');
      const ink = disabled ? '#555956' : (options.ink || DATA.palette.ink);
      ctx.fillStyle = '#020405';
      ctx.fillRect(x + 4, y + 5, w, h);
      ctx.fillStyle = stroke;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = fill;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.fillStyle = ink;
      ctx.fillRect(x + 2, y + 2, 5, h - 4);
      ctx.fillRect(x + 9, y + 6, 16, 3);
      ctx.fillRect(x + w - 18, y + h - 9, 10, 3);
      ctx.fillStyle = DATA.palette.ink;
      ctx.fillRect(x, y, 5, 5);
      ctx.fillRect(x + w - 5, y + h - 5, 5, 5);
      this.text(label, x + w / 2 + 2, y + h / 2 + 5, options.size || 14, disabled ? '#737773' : (options.text || DATA.palette.ink), 'center', true);
      this.buttons.push({ x, y, w, h, disabled, action });
    }

    hazardStripe(x, y, w, h, color = DATA.palette.orange) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = '#0a0d0d';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = color;
      for (let offset = -h; offset < w + h; offset += 12) {
        ctx.beginPath();
        ctx.moveTo(x + offset, y + h);
        ctx.lineTo(x + offset + 5, y + h);
        ctx.lineTo(x + offset + h + 5, y);
        ctx.lineTo(x + offset + h, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    drawCorpLogo(x, y, size, color = DATA.palette.acid) {
      if (this.drawAtlasIcon('company_logo', x, y, size)) return;
      const ctx = this.ctx;
      const unit = Math.max(2, Math.floor(size / 7));
      ctx.fillStyle = color;
      ctx.fillRect(x, y + unit, unit * 2, unit * 5);
      ctx.fillRect(x + unit * 2, y, unit * 3, unit);
      ctx.fillRect(x + unit * 2, y + unit * 3, unit * 3, unit);
      ctx.fillRect(x + unit * 5, y + unit, unit, unit * 2);
      ctx.fillRect(x + unit * 2, y + unit * 5, unit * 5, unit);
      ctx.fillRect(x + unit * 6, y + unit * 3, unit, unit * 2);
      ctx.fillStyle = DATA.palette.ink;
      ctx.fillRect(x + unit * 2, y + unit, unit, unit * 2);
    }

    drawPipe(points, color = '#4c514a', width = 5) {
      const ctx = this.ctx;
      ctx.strokeStyle = '#090b0b';
      ctx.lineWidth = width + 3;
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.fillStyle = '#969483';
      points.slice(1, -1).forEach((point) => ctx.fillRect(point[0] - 2, point[1] - 2, 4, 4));
    }

    drawPixelIcon(kind, x, y, size, color) {
      const ctx = this.ctx;
      const skill = this.assetImage(`skill.gunner.${kind}`);
      if (skill) {
        ctx.drawImage(skill, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
        return;
      }
      const uiIconMap = {
        scanner: 'scanner', fabricator: 'fabricator', cargo: 'cargo_hold', life_support: 'life_support', printer: 'printer',
        nests: 'mission_nest', beacons: 'mission_beacon', drill: 'mission_drill', low_gravity: 'low_gravity',
        meteor: 'meteor', spore_bloom: 'spore_bloom', energy_tide: 'energy_tide'
      };
      if (uiIconMap[kind] && this.drawAtlasIcon(uiIconMap[kind], x, y, size)) return;
      const cell = Math.max(3, Math.floor(size / 10));
      const cx = Math.round(x + size / 2);
      const cy = Math.round(y + size / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = cell;
      ctx.lineCap = 'square';
      if (/rail|pierc|sword_wave|rift/.test(kind)) {
        ctx.fillRect(-cell, -size * 0.38, cell * 2, size * 0.65);
        ctx.fillRect(-cell * 2, size * 0.18, cell * 4, cell);
        ctx.fillRect(-cell / 2, size * 0.3, cell, cell * 2);
      } else if (/scatter|burst|barrage|storm/.test(kind)) {
        [-0.32, 0, 0.32].forEach((angle) => {
          ctx.save();
          ctx.rotate(angle);
          ctx.fillRect(-cell, -size * 0.38, cell * 2, size * 0.55);
          ctx.restore();
        });
      } else if (/drone|swarm|orbit|star_ring/.test(kind)) {
        ctx.fillRect(-cell * 2, -cell * 2, cell * 4, cell * 4);
        ctx.fillRect(-size * 0.38, -cell, cell * 2, cell * 2);
        ctx.fillRect(size * 0.18, -cell, cell * 2, cell * 2);
        ctx.fillRect(-cell, -size * 0.38, cell * 2, cell * 2);
      } else if (/turret|fortress/.test(kind)) {
        ctx.fillRect(-size * 0.3, 0, size * 0.6, cell * 3);
        ctx.fillRect(-cell * 2, -cell * 3, cell * 4, cell * 3);
        ctx.fillRect(cell * 2, -cell * 2, cell * 4, cell);
      } else if (/scanner/.test(kind)) {
        ctx.strokeRect(-size * 0.32, -size * 0.32, size * 0.64, size * 0.64);
        ctx.strokeRect(-size * 0.16, -size * 0.16, size * 0.32, size * 0.32);
        ctx.fillRect(-cell, -cell, cell * 2, cell * 2);
      } else if (/fabricator|printer|cargo/.test(kind)) {
        ctx.strokeRect(-size * 0.34, -size * 0.28, size * 0.68, size * 0.58);
        ctx.fillRect(-size * 0.24, -size * 0.38, size * 0.48, cell * 2);
        ctx.fillRect(-size * 0.22, -cell, size * 0.44, cell * 2);
        ctx.fillStyle = DATA.palette.ink;
        ctx.fillRect(-cell, -cell, cell * 2, cell * 2);
      } else if (/shield|guard|unyield|life|repair/.test(kind)) {
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.4);
        ctx.lineTo(size * 0.32, -size * 0.22);
        ctx.lineTo(size * 0.24, size * 0.25);
        ctx.lineTo(0, size * 0.42);
        ctx.lineTo(-size * 0.24, size * 0.25);
        ctx.lineTo(-size * 0.32, -size * 0.22);
        ctx.closePath();
        ctx.stroke();
      } else if (/explosive|self_destruct|recycle/.test(kind)) {
        for (let angle = 0; angle < TAU; angle += TAU / 8) {
          ctx.save();
          ctx.rotate(angle);
          ctx.fillRect(-cell / 2, -size * 0.42, cell, size * 0.24);
          ctx.restore();
        }
        ctx.fillRect(-cell * 2, -cell * 2, cell * 4, cell * 4);
      } else if (/arc|ricochet|counter|dodge/.test(kind)) {
        ctx.beginPath();
        ctx.moveTo(-size * 0.35, -size * 0.22);
        ctx.lineTo(-cell, -cell);
        ctx.lineTo(-size * 0.2, cell);
        ctx.lineTo(size * 0.32, -size * 0.28);
        ctx.lineTo(cell, cell);
        ctx.lineTo(size * 0.35, size * 0.28);
        ctx.stroke();
      } else {
        ctx.fillRect(-cell, -size * 0.38, cell * 2, size * 0.76);
        ctx.fillRect(-size * 0.38, -cell, size * 0.76, cell * 2);
        ctx.fillStyle = DATA.palette.ink;
        ctx.fillRect(-cell, -cell, cell * 2, cell * 2);
      }
      ctx.restore();
    }

    drawStarfield() {
      const ctx = this.ctx;
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, '#0d1216');
      gradient.addColorStop(0.62, '#111217');
      gradient.addColorStop(1, '#1d1614');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
      for (const star of this.stars) {
        const flicker = 0.35 + Math.sin(this.now * 1.7 + star.phase) * 0.2;
        ctx.globalAlpha = flicker;
        ctx.fillStyle = star.size === 2 ? DATA.palette.acid : DATA.palette.paper;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(217,255,87,0.07)';
      ctx.beginPath();
      ctx.moveTo(0, 430);
      ctx.lineTo(360, 260);
      ctx.moveTo(0, 490);
      ctx.lineTo(360, 320);
      ctx.stroke();
    }

    drawHeader(section) {
      this.panel(8, 8, 344, 51, { fill: '#111716', stroke: '#5a5b4f', accent: DATA.palette.acid, accentWidth: 3 });
      this.drawCorpLogo(18, 17, 27, DATA.palette.acid);
      this.text('PAN-STELLAR ASSET REUSE CO.', 52, 25, 7, DATA.palette.muted, 'left', true, true);
      this.text(section, 52, 47, 15, DATA.palette.paper, 'left', true);
      this.ctx.fillStyle = '#070b0b';
      this.ctx.fillRect(273, 15, 70, 36);
      this.ctx.fillStyle = '#343b36';
      this.ctx.fillRect(276, 18, 64, 30);
      this.ctx.fillStyle = '#111716';
      this.ctx.fillRect(278, 20, 60, 26);
      this.text('CREDIT', 284, 29, 6, DATA.palette.muted, 'left', true, true);
      this.drawAtlasIcon('credits', 282, 31, 16);
      this.text(String(this.save.credits), 333, 43, 14, DATA.palette.paper, 'right', true, true);
    }

    drawIndustrialHQ(classData) {
      const ctx = this.ctx;
      ctx.fillStyle = '#161817';
      ctx.fillRect(0, 61, W, 381);
      ctx.fillStyle = '#20211d';
      for (let y = 72; y < 425; y += 58) ctx.fillRect(0, y, W, 2);
      ctx.fillStyle = '#292a24';
      for (let x = 8; x < W; x += 74) ctx.fillRect(x, 64, 2, 364);

      this.panel(145, 72, 207, 205, { fill: '#081217', stroke: '#565d58', accent: classData.color });
      const gradient = ctx.createLinearGradient(150, 78, 150, 270);
      gradient.addColorStop(0, '#07131b');
      gradient.addColorStop(1, '#16212a');
      ctx.fillStyle = gradient;
      ctx.fillRect(152, 80, 193, 190);
      ctx.fillStyle = '#d9e3d1';
      for (let index = 0; index < 17; index += 1) {
        const sx = 158 + (index * 47) % 178;
        const sy = 87 + (index * 31) % 164;
        ctx.globalAlpha = 0.22 + (index % 4) * 0.14;
        ctx.fillRect(sx, sy, index % 5 === 0 ? 2 : 1, index % 5 === 0 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#33243e';
      ctx.beginPath();
      ctx.arc(313, 106, 26, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#985f63';
      ctx.fillRect(292, 103, 42, 5);
      ctx.fillStyle = '#030708';
      ctx.beginPath();
      ctx.moveTo(172, 135);
      ctx.lineTo(232, 112);
      ctx.lineTo(291, 131);
      ctx.lineTo(265, 141);
      ctx.lineTo(205, 141);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(218, 140, 29, 10);
      ctx.fillStyle = classData.color;
      ctx.fillRect(203, 137, 37, 2);
      ctx.fillStyle = '#59635d';
      ctx.fillRect(148, 172, 201, 4);
      ctx.fillRect(246, 75, 4, 199);

      this.drawPipe([[0, 91], [31, 91], [31, 177], [78, 177], [78, 217]], '#5b5d50', 6);
      this.drawPipe([[360, 292], [327, 292], [327, 329], [302, 329]], classData.color, 4);
      ctx.fillStyle = '#34362f';
      ctx.fillRect(0, 287, 41, 93);
      ctx.fillStyle = '#6d6b5b';
      ctx.fillRect(8, 297, 25, 6);
      ctx.fillRect(8, 312, 17, 3);
      ctx.fillStyle = DATA.palette.orange;
      ctx.fillRect(27, 312, 5, 5);

      ctx.fillStyle = '#0d1111';
      ctx.fillRect(168, 145, 112, 244);
      ctx.fillStyle = '#4c554f';
      ctx.fillRect(172, 141, 104, 9);
      ctx.fillRect(172, 382, 104, 10);
      ctx.fillStyle = 'rgba(81,217,209,0.10)';
      ctx.fillRect(179, 153, 90, 225);
      ctx.fillStyle = 'rgba(81,217,209,0.26)';
      ctx.fillRect(184, 157, 3, 214);
      ctx.fillRect(261, 157, 2, 214);
      ctx.fillStyle = classData.color;
      ctx.fillRect(194, 151, 60, 3);
      this.text('PRINT POD // 03', 224, 169, 7, classData.color, 'center', true, true);

      ctx.fillStyle = '#202320';
      ctx.fillRect(0, 399, W, 43);
      ctx.fillStyle = '#38362e';
      ctx.fillRect(0, 404, W, 4);
      this.hazardStripe(0, 426, W, 12, DATA.palette.orange);
      ctx.fillStyle = '#111413';
      ctx.fillRect(0, 438, W, 4);
      ctx.strokeStyle = '#4d4d42';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(150, 414);
      ctx.bezierCurveTo(194, 399, 213, 443, 268, 422);
      ctx.stroke();

      this.panel(279, 307, 68, 89, { fill: '#191e1c', stroke: '#53584f', accent: DATA.palette.orange });
      ctx.fillStyle = '#0a0e0e';
      ctx.fillRect(289, 320, 48, 29);
      ctx.fillStyle = DATA.palette.orange;
      ctx.fillRect(294, 326, 32, 3);
      ctx.fillRect(294, 334, 23, 3);
      ctx.fillStyle = '#d7cda9';
      ctx.fillRect(292, 354, 41, 25);
      ctx.fillStyle = '#36372f';
      for (let line = 0; line < 3; line += 1) ctx.fillRect(297, 360 + line * 5, 28 - line * 3, 2);
      this.text('ORDER', 313, 391, 6, DATA.palette.muted, 'center', true, true);
    }

    drawHQ() {
      this.drawStarfield();
      if (this.hqPage === 'crew') this.drawCrewPage();
      else if (this.hqPage === 'ship') this.drawShipPage();
      else this.drawHQMain();
    }

    drawHQMain() {
      this.drawHeader('外勤调度终端');
      const classData = DATA.classById[this.save.selectedClass];
      this.drawIndustrialHQ(classData);
      this.panel(10, 82, 148, 319, { uiVariant: 'inset', fill: 'rgba(12,17,17,0.97)', stroke: '#57584d', accent: classData.color, accentWidth: 5 });
      this.text('ACTIVE COPY // 03', 26, 105, 7, classData.color, 'left', true, true);
      this.text(classData.name, 26, 137, 23, DATA.palette.paper, 'left', true);
      this.text(classData.employee, 26, 156, 9, DATA.palette.muted, 'left', true, true);
      this.ctx.fillStyle = classData.color;
      this.ctx.fillRect(26, 169, 105, 3);
      this.text('JOB PROFILE', 26, 193, 7, DATA.palette.muted, 'left', true, true);
      this.wrap(classData.role, 26, 214, 112, 15, 11, classData.color, 3, true);
      this.text('EMPLOYEE NOTE', 26, 269, 7, DATA.palette.muted, 'left', true, true);
      this.wrap(`“${classData.quote}”`, 26, 292, 111, 15, 10, DATA.palette.paper, 5, true);
      this.ctx.fillStyle = '#d5d0b8';
      for (let index = 0; index < 14; index += 1) this.ctx.fillRect(27 + index * 7, 370, index % 3 === 0 ? 4 : 2, 13);
      this.drawAstronaut(224, 342, classData, 4.2, this.now * 0.3);
      this.ctx.fillStyle = classData.color;
      this.ctx.fillRect(188, 386, 72, 3);
      this.text('READY', 224, 400, 7, classData.color, 'center', true, true);

      this.button(25, 452, 310, 57, '接受随机派遣  >>', () => this.prepareContract(), { fill: DATA.palette.acid, size: 17 });
      this.button(30, 518, 142, 46, '员工档案', () => { this.hqPage = 'crew'; }, { fill: '#20292c', ink: DATA.palette.paper, text: DATA.palette.paper, stroke: '#59666a' });
      this.button(188, 518, 142, 46, '飞船模块', () => { this.hqPage = 'ship'; }, { fill: '#20292c', ink: DATA.palette.paper, text: DATA.palette.paper, stroke: '#59666a' });
      this.text(`EXTRACT ${this.save.successes} // BEST KILL ${this.save.bestKills || 0}`, 180, 589, 8, DATA.palette.muted, 'center', true, true);
      this.hazardStripe(26, 599, 308, 4, DATA.palette.orange);
      this.text('打印体损失将计入个人季度绩效', 180, 620, 9, DATA.palette.orange, 'center', true);
    }

    drawCrewPage() {
      this.drawHeader('打印体员工档案');
      DATA.classes.forEach((classData, index) => {
        const y = 78 + index * 154;
        const unlocked = Boolean(this.save.unlocked[classData.id]);
        const selected = this.save.selectedClass === classData.id;
        this.panel(18, y, 324, 136, { fill: unlocked ? '#141b1e' : '#111416', stroke: selected ? classData.color : '#3d4442', accent: unlocked ? classData.color : '#4a4d49' });
        this.drawAstronaut(67, y + 82, classData, 1.55, -0.3);
        this.text(classData.name, 111, y + 28, 19, unlocked ? DATA.palette.paper : DATA.palette.muted, 'left', true);
        this.text(classData.employee, 111, y + 47, 9, classData.color, 'left', true, true);
        this.text(classData.role, 111, y + 68, 10, DATA.palette.muted, 'left', true);
        const unlockState = this.canUnlock(classData);
        if (unlocked) {
          this.button(111, y + 86, 206, 34, selected ? '当前出勤员工' : '设为出勤员工', () => {
            this.save.selectedClass = classData.id;
            this.persist();
          }, { disabled: selected, fill: classData.color, size: 12 });
        } else {
          this.text(unlockState.reason, 111, y + 86, 9, unlockState.allowed ? DATA.palette.acid : DATA.palette.orange, 'left', true);
          this.button(218, y + 94, 99, 28, unlockState.allowed ? '授权打印' : '未达条件', () => this.unlockClass(classData), { disabled: !unlockState.allowed, fill: classData.color, size: 11 });
        }
      });
      this.button(30, 566, 300, 45, '返回调度终端', () => { this.hqPage = 'main'; }, { fill: '#242d30', text: DATA.palette.paper, ink: DATA.palette.paper, stroke: '#59666a' });
    }

    drawShipPage() {
      this.drawHeader('飞船模块维护');
      DATA.shipModules.forEach((moduleData, index) => {
        const y = 75 + index * 94;
        const level = this.save.modules[moduleData.id] || 0;
        const maxed = level >= 3;
        const cost = maxed ? 0 : moduleData.costs[level];
        this.panel(18, y, 324, 80, { fill: '#141a1d', stroke: '#3f4744', accent: level ? DATA.palette.acid : '#55564d' });
        this.drawPixelIcon(moduleData.id, 26, y + 19, 34, level ? DATA.palette.acid : DATA.palette.muted);
        this.text(moduleData.name, 69, y + 25, 14, DATA.palette.paper, 'left', true);
        this.text(`LV.${level}/3`, 69, y + 43, 9, DATA.palette.muted, 'left', true, true);
        this.text(moduleData.desc, 69, y + 62, 9, DATA.palette.muted, 'left');
        this.button(248, y + 17, 75, 35, maxed ? '已满级' : `¤ ${cost}`, () => this.upgradeModule(moduleData), {
          disabled: maxed || this.save.credits < cost,
          fill: DATA.palette.acid,
          size: 11
        });
      });
      this.button(30, 566, 300, 45, '返回调度终端', () => { this.hqPage = 'main'; }, { fill: '#242d30', text: DATA.palette.paper, ink: DATA.palette.paper, stroke: '#59666a' });
    }

    drawBriefing() {
      this.drawStarfield();
      this.drawHeader('强制任务简报');
      const { planet, mission, anomaly } = this.contract;
      const scanner = this.save.modules.scanner || 0;
      this.hazardStripe(18, 72, 324, 7, DATA.palette.orange);
      this.text('RANDOM ASSIGNMENT // NO REFRESH', 180, 96, 8, DATA.palette.orange, 'center', true, true);
      this.panel(22, 107, 316, 196, { uiVariant: 'inset', fill: '#0b1113', stroke: '#575c55', accent: planet.accent, accentWidth: 5 });
      const ctx = this.ctx;
      ctx.fillStyle = planet.floor;
      ctx.fillRect(31, 116, 298, 178);
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = planet.grid;
      for (let x = 34; x < 328; x += 19) ctx.fillRect(x, 119, 1, 172);
      for (let y = 121; y < 292; y += 19) ctx.fillRect(33, y, 293, 1);
      ctx.globalAlpha = 1;
      this.drawPlanetMark(104, 201, planet);
      this.text(planet.code, 177, 160, 29, planet.accent, 'left', true, true);
      this.text(planet.name, 178, 187, 18, DATA.palette.paper, 'left', true);
      this.text('ECOLOGY REPORT', 178, 211, 7, DATA.palette.muted, 'left', true, true);
      this.wrap(planet.description, 178, 232, 134, 15, 10, DATA.palette.paper, 4);
      this.text('SIGNAL', 45, 284, 7, planet.accent, 'left', true, true);
      this.text('■■■□□', 88, 284, 8, planet.accent, 'left', true, true);

      this.panel(22, 318, 316, 91, { fill: '#151b1d', stroke: '#565b54', accent: DATA.palette.acid });
      this.text('PRIMARY ORDER', 41, 339, 7, DATA.palette.muted, 'left', true, true);
      const missionIcon = mission.id === 'nests' ? 'mission_nest' : (mission.id === 'beacons' ? 'mission_beacon' : 'mission_drill');
      this.drawAtlasIcon(missionIcon, 39, 346, 30);
      this.text(mission.name, 79, 369, 17, DATA.palette.paper, 'left', true);
      this.wrap(mission.brief, 79, 391, 236, 14, 10, DATA.palette.muted, 2);

      this.panel(22, 421, 316, 82, { fill: '#15181b', stroke: '#55544e', accent: scanner > 0 ? planet.accent : '#55554e' });
      this.text('ANOMALY // 异常规则', 41, 444, 8, DATA.palette.muted, 'left', true, true);
      if (scanner > 0) {
        this.drawAtlasIcon(anomaly.id, 39, 456, 28);
        this.text(anomaly.name, 76, 474, 15, planet.accent, 'left', true);
        if (scanner > 1) this.text(anomaly.effect, 151, 474, 9, DATA.palette.paper, 'left');
      } else {
        this.drawAtlasIcon('lock', 40, 456, 27);
        this.text('信号受阻 // 降落后确认', 76, 474, 12, DATA.palette.orange, 'left', true);
      }

      this.button(25, 527, 310, 56, '确认打印并降落  ▼', () => this.beginRun(), { fill: DATA.palette.acid, size: 16 });
      this.text('任务不可刷新 // 合同编号自动归档', 180, 613, 8, DATA.palette.muted, 'center', true, true);
    }

    drawPlanetMark(x, y, planet) {
      if (this.drawAtlasIcon(planet.id === 'rust' ? 'planet_rust' : 'planet_spore', x - 39, y - 39, 78)) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = planet.color;
      ctx.beginPath();
      ctx.arc(0, 0, 39, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = planet.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 64, 15, -0.2, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = planet.accent;
      for (let index = 0; index < 8; index += 1) ctx.fillRect(-25 + (index * 23) % 48, -22 + (index * 17) % 39, 4 + index % 4, 3 + index % 3);
      ctx.restore();
    }

    drawPlaying() {
      const ctx = this.ctx;
      const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      ctx.save();
      ctx.translate(sx, sy);
      this.drawWorld();
      ctx.restore();
      this.drawHUD();
      if (this.notice) this.drawNotice();
      if (this.save.firstRun) this.drawTutorial();
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.5;
        ctx.fillStyle = this.player.hp > 0 ? DATA.palette.paper : DATA.palette.danger;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }

    worldToScreen(object) {
      return { x: object.x - this.world.camera.x, y: object.y - this.world.camera.y };
    }

    drawWorld() {
      const ctx = this.ctx;
      const planet = this.contract.planet;
      ctx.fillStyle = planet.floor;
      ctx.fillRect(0, 0, W, H);
      this.drawFloorGrid(planet);
      const visibleProps = this.world.props.filter((prop) => {
        const screen = this.worldToScreen(prop);
        return !(screen.x < -140 || screen.x > W + 140 || screen.y < -110 || screen.y > H + 110);
      });
      visibleProps.sort((a, b) => {
        const props = this.assets && this.assets.manifest && this.assets.manifest.props;
        const aDecal = props && props[a.assetId] && props[a.assetId].sizeClass === 'decal';
        const bDecal = props && props[b.assetId] && props[b.assetId].sizeClass === 'decal';
        if (aDecal !== bDecal) return aDecal ? -1 : 1;
        return a.y - b.y;
      });
      for (const prop of visibleProps) {
        const screen = this.worldToScreen(prop);
        this.drawProp(screen.x, screen.y, prop, planet);
      }
      this.drawMissionObjects();
      this.drawCache();
      if (this.world.missionComplete) this.drawExtraction();
      for (const hazard of this.world.hazards) this.drawHazard(hazard);
      for (const pickup of this.world.pickups) this.drawPickup(pickup);
      for (const turret of this.world.turrets) this.drawTurret(turret);

      const actors = this.world.enemies.map((enemy) => ({ kind: 'enemy', y: enemy.y, value: enemy }));
      actors.push({ kind: 'player', y: this.player.y, value: this.player });
      actors.sort((a, b) => a.y - b.y);
      for (const actor of actors) {
        if (actor.kind === 'player') {
          const screen = this.worldToScreen(actor.value);
          this.drawAstronaut(screen.x, screen.y, DATA.classById[this.player.classId], 1, Math.atan2(this.player.dirY, this.player.dirX));
          this.drawCompanions(screen.x, screen.y);
        } else this.drawEnemy(actor.value);
      }
      for (const projectile of this.world.projectiles) this.drawProjectile(projectile);
      for (const projectile of this.world.enemyProjectiles) this.drawEnemyProjectile(projectile);
      for (const particle of this.world.particles) this.drawParticle(particle);
    }

    drawFloorGrid(planet) {
      const ctx = this.ctx;
      const ground = this.assetImage(`ground.${planet.id}`);
      if (ground) {
        const tile = 512;
        const offsetX = -(((this.world.camera.x % tile) + tile) % tile);
        const offsetY = -(((this.world.camera.y % tile) + tile) % tile);
        for (let y = offsetY - tile; y < H + tile; y += tile) {
          for (let x = offsetX - tile; x < W + tile; x += tile) {
            ctx.drawImage(ground, Math.round(x), Math.round(y), tile, tile);
          }
        }
        ctx.fillStyle = 'rgba(5,8,9,0.08)';
        ctx.fillRect(0, 0, W, H);
        return;
      }
      const tileW = 64;
      const tileH = 32;
      const startY = Math.floor(this.world.camera.y / tileH) - 2;
      const startX = Math.floor(this.world.camera.x / tileW) - 2;
      ctx.strokeStyle = planet.grid;
      ctx.lineWidth = 1;
      for (let row = startY; row < startY + 25; row += 1) {
        for (let col = startX; col < startX + 10; col += 1) {
          const x = col * tileW + (row % 2 ? tileW / 2 : 0) - this.world.camera.x;
          const y = row * tileH - this.world.camera.y;
          ctx.beginPath();
          ctx.moveTo(x, y + tileH / 2);
          ctx.lineTo(x + tileW / 2, y);
          ctx.lineTo(x + tileW, y + tileH / 2);
          ctx.lineTo(x + tileW / 2, y + tileH);
          ctx.closePath();
          ctx.stroke();
        }
      }
      const band = Math.floor(this.world.camera.y / 380);
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = planet.accent;
      ctx.fillRect(0, 170 + (band % 2) * 180, W, 2);
      ctx.globalAlpha = 1;
    }

    drawProp(x, y, prop, planet) {
      const ctx = this.ctx;
      const s = prop.size;
      const props = this.assets && this.assets.manifest && this.assets.manifest.props;
      const spec = props && props[prop.assetId];
      const image = prop.assetId && this.assetImage(`prop.${prop.assetId}`);
      if (spec && image) {
        ctx.globalAlpha = spec.sizeClass === 'decal' ? 0.7 + prop.tone * 0.18 : 0.82 + prop.tone * 0.16;
        const width = spec.width * s;
        const height = spec.height * s;
        ctx.drawImage(image, Math.round(x - spec.anchor[0] * s), Math.round(y - spec.anchor[1] * s), Math.round(width), Math.round(height));
        ctx.globalAlpha = 1;
        return;
      }
      ctx.globalAlpha = 0.38 + prop.tone * 0.28;
      ctx.fillStyle = '#050708';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 10 * s, 4 * s, 0, 0, TAU);
      ctx.fill();
      if (this.contract.planet.id === 'rust') {
        ctx.fillStyle = prop.kind % 2 ? '#46342c' : '#584336';
        ctx.fillRect(Math.round(x - 6 * s), Math.round(y - 12 * s), Math.round(12 * s), Math.round(13 * s));
        ctx.fillStyle = planet.accent;
        ctx.fillRect(Math.round(x - 2 * s), Math.round(y - 10 * s), Math.max(1, Math.round(2 * s)), Math.round(5 * s));
      } else {
        ctx.fillStyle = prop.kind % 2 ? '#47315a' : '#3b2949';
        ctx.beginPath();
        ctx.arc(x, y - 6 * s, 7 * s, 0, TAU);
        ctx.fill();
        ctx.fillStyle = planet.accent;
        ctx.fillRect(Math.round(x - 2 * s), Math.round(y - 11 * s), Math.round(4 * s), Math.round(4 * s));
      }
      ctx.globalAlpha = 1;
    }

    drawMissionObjects() {
      const objective = this.world.objective;
      if (objective.id === 'nests') {
        for (const item of objective.items) {
          const screen = this.worldToScreen(item);
          if (screen.x < -70 || screen.x > W + 70 || screen.y < -80 || screen.y > H + 80) continue;
          if (item.dead) {
            if (!(this.contract.planet.id === 'rust' && this.drawAnchoredObject('rust_nest', 'destroyed', screen.x, screen.y, 1, item.index * 0.1))) {
              this.ctx.fillStyle = '#171011';
              this.ctx.beginPath();
              this.ctx.ellipse(screen.x, screen.y, 31, 13, 0, 0, TAU);
              this.ctx.fill();
            }
          } else {
            this.drawNest(screen.x, screen.y, item);
            this.drawSmallBar(screen.x - 28, screen.y - 48, 56, item.hp / item.maxHp, DATA.palette.danger);
          }
        }
      } else if (objective.id === 'beacons') {
        objective.items.forEach((item, index) => {
          const screen = this.worldToScreen(item);
          if (screen.x < -60 || screen.x > W + 60 || screen.y < -80 || screen.y > H + 80) return;
          const active = index === objective.current;
          this.drawBeacon(screen.x, screen.y, item, active);
        });
      } else {
        const item = objective.item;
        const screen = this.worldToScreen(item);
        this.drawDrill(screen.x, screen.y, item);
      }
    }

    drawNest(x, y, item) {
      if (this.contract.planet.id === 'rust' && this.drawAnchoredObject('rust_nest', 'idle', x, y, 1, item.index * 0.17)) return;
      const ctx = this.ctx;
      const pulse = Math.sin(this.now * 4 + item.index) * 2;
      ctx.fillStyle = '#08090a';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 33, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = this.contract.planet.id === 'rust' ? '#783f31' : '#603773';
      ctx.beginPath();
      ctx.moveTo(x - 27, y + 2);
      ctx.lineTo(x - 18, y - 26 - pulse);
      ctx.lineTo(x - 5, y - 18);
      ctx.lineTo(x + 3, y - 37 - pulse);
      ctx.lineTo(x + 14, y - 18);
      ctx.lineTo(x + 28, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.contract.planet.accent;
      ctx.fillRect(x - 4, y - 22 - pulse, 8, 11);
    }

    drawBeacon(x, y, item, active) {
      const ctx = this.ctx;
      const state = item.active ? 'completed' : (active ? 'charging' : 'inactive');
      if (this.drawAnchoredObject('company_beacon', state, x, y, 1, item.index * 0.13)) {
        if (item.charge > 0 && !item.active) this.drawSmallBar(x - 30, y - 45, 60, item.charge / item.required, DATA.palette.acid);
        return;
      }
      ctx.strokeStyle = active ? DATA.palette.acid : '#4e5350';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 5, 44, 19, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#0b0f11';
      ctx.fillRect(x - 8, y - 24, 16, 28);
      ctx.fillStyle = active ? DATA.palette.acid : '#66685f';
      ctx.fillRect(x - 3, y - 20, 6, 18);
      if (item.charge > 0) this.drawSmallBar(x - 30, y - 38, 60, item.charge / item.required, DATA.palette.acid);
    }

    drawDrill(x, y, item) {
      const ctx = this.ctx;
      ctx.strokeStyle = item.started ? DATA.palette.acid : '#555b56';
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.ellipse(x, y, item.radius, item.radius * 0.46, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      const drillState = item.progress >= item.required ? 'completed' : (item.started ? 'running' : 'idle');
      if (this.drawAnchoredObject('mining_drill', drillState, x, y, 1)) {
        this.drawSmallBar(x - 42, y - 60, 84, item.progress / item.required, DATA.palette.acid);
        return;
      }
      ctx.fillStyle = '#0a0e0f';
      ctx.fillRect(x - 21, y - 36, 42, 39);
      ctx.fillStyle = '#5c6663';
      ctx.fillRect(x - 15, y - 42, 30, 10);
      ctx.fillStyle = DATA.palette.acid;
      ctx.fillRect(x - 3, y - 29, 6, 19);
      this.drawSmallBar(x - 42, y - 55, 84, item.progress / item.required, DATA.palette.acid);
    }

    drawCache() {
      const cache = this.world.cache;
      if (cache.collected) return;
      const screen = this.worldToScreen(cache);
      if (screen.x < -60 || screen.x > W + 60 || screen.y < -80 || screen.y > H + 80) return;
      const available = cache.eliteDefeated;
      if (this.drawAnchoredObject('reward_cache', available ? 'ready' : 'locked', screen.x, screen.y, 1)) return;
      const ctx = this.ctx;
      ctx.fillStyle = '#080a0b';
      ctx.beginPath();
      ctx.ellipse(screen.x, screen.y + 5, 24, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = available ? DATA.palette.acid : '#51564d';
      ctx.fillRect(screen.x - 20, screen.y - 18, 40, 22);
      ctx.fillStyle = '#1b211e';
      ctx.fillRect(screen.x - 16, screen.y - 14, 32, 14);
      ctx.fillStyle = available ? DATA.palette.orange : '#77786d';
      ctx.fillRect(screen.x - 3, screen.y - 16, 6, 17);
    }

    drawExtraction() {
      const extraction = this.world.extraction;
      const screen = this.worldToScreen(extraction);
      const ctx = this.ctx;
      const active = dist(extraction, this.player) < extraction.radius;
      ctx.globalAlpha = active ? 1 : 0.82;
      const fieldDrawn = this.drawAnchoredObject('extraction_field', 'active', screen.x, screen.y, 1);
      const terminalState = extraction.progress >= extraction.required ? 'completed' : (extraction.progress > 0 ? 'uploading' : 'offline');
      const terminalDrawn = this.drawAnchoredObject('extraction_terminal', terminalState, screen.x, screen.y + 38, 0.82);
      ctx.globalAlpha = 1;
      if (fieldDrawn || terminalDrawn) {
        if (extraction.progress > 0) this.drawSmallBar(screen.x - 50, screen.y - 48, 100, extraction.progress / extraction.required, DATA.palette.acid);
        return;
      }
      ctx.strokeStyle = active ? DATA.palette.acid : DATA.palette.cyan;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      for (let ring = 0; ring < 3; ring += 1) {
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y, extraction.radius - ring * 15 + Math.sin(this.now * 3 + ring) * 2, 27 - ring * 4, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (extraction.progress > 0) this.drawSmallBar(screen.x - 50, screen.y - 42, 100, extraction.progress / extraction.required, DATA.palette.acid);
    }

    drawHazard(hazard) {
      const screen = this.worldToScreen(hazard);
      const ctx = this.ctx;
      if (hazard.type === 'meteor') {
        ctx.strokeStyle = hazard.exploded ? DATA.palette.orange : DATA.palette.danger;
        ctx.lineWidth = 2;
        ctx.globalAlpha = hazard.exploded ? clamp(hazard.life * 2, 0, 1) : 0.5 + Math.sin(this.now * 15) * 0.2;
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y, hazard.radius, hazard.radius * 0.45, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(screen.x - 6, screen.y);
        ctx.lineTo(screen.x + 6, screen.y);
        ctx.moveTo(screen.x, screen.y - 6);
        ctx.lineTo(screen.x, screen.y + 6);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#6f3a85';
        ctx.globalAlpha = hazard.warmup > 0 ? 0.25 : 0.55;
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y, hazard.radius, hazard.radius * 0.48, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawPickup(item) {
      const screen = this.worldToScreen(item);
      const pickupRows = this.assets && this.assets.manifest && this.assets.manifest.pickupRows;
      const row = pickupRows && pickupRows[item.kind];
      if (row !== undefined) {
        const frame = Math.floor(this.now * 8 + item.x * 0.01) % 4;
        if (this.drawFrame('pickup.atlas', 24, 24, row * 4 + frame, screen.x - 12, screen.y - 12, 24, 24)) return;
      }
      const ctx = this.ctx;
      const bob = Math.sin(this.now * 7 + item.x) * 2;
      ctx.fillStyle = DATA.palette.acid;
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y - 6 + bob);
      ctx.lineTo(screen.x + 5, screen.y + bob);
      ctx.lineTo(screen.x, screen.y + 6 + bob);
      ctx.lineTo(screen.x - 5, screen.y + bob);
      ctx.closePath();
      ctx.fill();
    }

    drawTurret(turret) {
      const screen = this.worldToScreen(turret);
      const ctx = this.ctx;
      ctx.fillStyle = '#06090a';
      ctx.beginPath();
      ctx.ellipse(screen.x, screen.y + 3, 12, 5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#758476';
      ctx.fillRect(screen.x - 8, screen.y - 10, 16, 12);
      ctx.fillStyle = DATA.palette.acid;
      ctx.fillRect(screen.x - 2, screen.y - 8, 4, 4);
    }

    drawCompanions(playerX, playerY) {
      const ctx = this.ctx;
      if (this.player.classId === 'warrior') {
        const orbit = this.getCardLevel('orbit_blade');
        const count = Math.min(7, orbit + (this.hasEvolution('star_ring') ? 3 : 0));
        const radius = this.hasEvolution('star_ring') ? 70 : 54;
        for (let index = 0; index < count; index += 1) {
          const angle = this.world.time * (1.4 + this.getCardLevel('attack_speed') * 0.28) + index / count * TAU;
          const x = playerX + Math.cos(angle) * radius;
          const y = playerY + Math.sin(angle) * radius * 0.68;
          ctx.save();
          ctx.translate(Math.round(x), Math.round(y));
          ctx.rotate(angle + Math.PI / 2);
          ctx.fillStyle = DATA.palette.paper;
          ctx.fillRect(-2, -9, 4, 14);
          ctx.fillStyle = DATA.palette.orange;
          ctx.fillRect(-3, 5, 6, 3);
          ctx.restore();
        }
      } else if (this.player.classId === 'mechanic') {
        const count = Math.min(7, 1 + (this.getCardLevel('drone') >= 2 ? 1 : 0) + this.getCardLevel('mech_count') + (this.hasEvolution('swarm_protocol') ? 2 : 0));
        for (let index = 0; index < count; index += 1) {
          const angle = this.world.time * 1.2 + index / count * TAU;
          const x = playerX + Math.cos(angle) * 38;
          const y = playerY + Math.sin(angle) * 25;
          ctx.fillStyle = '#0a0e0f';
          ctx.fillRect(Math.round(x - 7), Math.round(y - 4), 14, 8);
          ctx.fillStyle = DATA.palette.acid;
          ctx.fillRect(Math.round(x - 2), Math.round(y - 3), 4, 3);
          ctx.fillStyle = '#71857c';
          ctx.fillRect(Math.round(x - 11), Math.round(y - 1), 4, 2);
          ctx.fillRect(Math.round(x + 7), Math.round(y - 1), 4, 2);
        }
      }
    }

    drawEnemy(enemy) {
      const screen = this.worldToScreen(enemy);
      if (screen.x < -50 || screen.x > W + 50 || screen.y < -60 || screen.y > H + 60) return;
      const ctx = this.ctx;
      const planet = this.contract.planet;
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      ctx.fillStyle = '#050708';
      ctx.beginPath();
      ctx.ellipse(x, y + 5, enemy.radius, enemy.radius * 0.38, 0, 0, TAU);
      ctx.fill();
      const flash = enemy.hitFlash > 0;
      if (enemy.elite) {
        ctx.fillStyle = flash ? DATA.palette.paper : planet.accent;
        ctx.beginPath();
        ctx.moveTo(x - 27, y + 2);
        ctx.lineTo(x - 20, y - 26);
        ctx.lineTo(x - 8, y - 17);
        ctx.lineTo(x, y - 37);
        ctx.lineTo(x + 10, y - 17);
        ctx.lineTo(x + 26, y - 24);
        ctx.lineTo(x + 29, y + 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0a0b0c';
        ctx.fillRect(x - 12, y - 13, 8, 6);
        ctx.fillRect(x + 6, y - 13, 8, 6);
        this.drawSmallBar(x - 30, y - 48, 60, enemy.hp / enemy.maxHp, DATA.palette.danger);
        return;
      }
      if (planet.id === 'rust' && this.assetImage(`enemy.${enemy.type}`)) {
        const frame = this.direction4(enemy.vx, enemy.vy);
        this.drawFrame(`enemy.${enemy.type}`, 64, 64, frame, x - 32, y - 56, 64, 64);
        if (flash) {
          ctx.save();
          ctx.globalAlpha = 0.62;
          ctx.globalCompositeOperation = 'lighter';
          this.drawFrame(`enemy.${enemy.type}`, 64, 64, frame, x - 32, y - 56, 64, 64);
          ctx.restore();
        }
        if (enemy.type === 'charger' && enemy.chargeTimer < 0.55 && enemy.chargeTimer > 0) {
          ctx.strokeStyle = DATA.palette.danger;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, enemy.radius + 6, 0, TAU);
          ctx.stroke();
        }
        return;
      }
      if (planet.id === 'rust') {
        ctx.strokeStyle = flash ? DATA.palette.paper : '#7a4c37';
        ctx.lineWidth = 2;
        for (let leg = -1; leg <= 1; leg += 2) {
          ctx.beginPath();
          ctx.moveTo(x + leg * 5, y - 2);
          ctx.lineTo(x + leg * (enemy.radius + 4), y + 4);
          ctx.stroke();
        }
        ctx.fillStyle = flash ? DATA.palette.paper : (enemy.type === 'charger' ? '#a45735' : '#654435');
        ctx.fillRect(x - enemy.radius + 2, y - enemy.radius, enemy.radius * 2 - 4, enemy.radius + 6);
        ctx.fillStyle = planet.accent;
        ctx.fillRect(x - 3, y - enemy.radius + 3, 6, 4);
      } else {
        ctx.fillStyle = flash ? DATA.palette.paper : (enemy.type === 'bloater' ? '#7a4196' : '#523069');
        ctx.beginPath();
        ctx.arc(x, y - enemy.radius / 2, enemy.radius, 0, TAU);
        ctx.fill();
        ctx.fillStyle = planet.accent;
        ctx.fillRect(x - 5, y - enemy.radius / 2 - 4, 3, 3);
        ctx.fillRect(x + 3, y - enemy.radius / 2 - 4, 3, 3);
        ctx.strokeStyle = '#402551';
        ctx.beginPath();
        ctx.moveTo(x - 5, y + 2);
        ctx.lineTo(x - 9, y + 9);
        ctx.moveTo(x + 5, y + 2);
        ctx.lineTo(x + 9, y + 9);
        ctx.stroke();
      }
      if (enemy.type === 'charger' && enemy.chargeTimer < 0.55 && enemy.chargeTimer > 0) {
        ctx.strokeStyle = DATA.palette.danger;
        ctx.beginPath();
        ctx.arc(x, y, enemy.radius + 6, 0, TAU);
        ctx.stroke();
      }
    }

    drawAstronaut(x, y, classData, scale, angle) {
      const ctx = this.ctx;
      if (classData.id === 'gunner' && this.assetImage('character.gunner_mia')) {
        const frame = this.direction4(Math.cos(angle), Math.sin(angle));
        ctx.save();
        ctx.globalAlpha = 0.52;
        ctx.fillStyle = '#030506';
        ctx.beginPath();
        ctx.ellipse(Math.round(x), Math.round(y + scale * 2), 11 * scale, 4 * scale, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = this.player && this.player.invuln > 0 && Math.floor(this.now * 18) % 2 ? 0.55 : 1;
        this.drawFrame('character.gunner_mia', 64, 64, frame, x - 32 * scale, y - 56 * scale, 64 * scale, 64 * scale);
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(scale, scale);
      const bob = Math.sin(this.now * 6) * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 11, 4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#777d78';
      ctx.fillRect(-7, -4 + bob, 14, 11);
      ctx.fillStyle = '#4c5351';
      ctx.fillRect(-9, -2 + bob, 3, 8);
      ctx.fillRect(6, -2 + bob, 3, 8);
      ctx.fillStyle = classData.color;
      ctx.fillRect(-7, 3 + bob, 14, 3);
      ctx.fillStyle = '#d4d0bd';
      ctx.fillRect(-8, -15 + bob, 16, 12);
      ctx.fillStyle = '#111a1d';
      ctx.fillRect(-6, -13 + bob, 12, 7);
      ctx.fillStyle = classData.accent;
      ctx.fillRect(-4, -11 + bob, 7, 2);
      ctx.fillStyle = '#3b4140';
      ctx.fillRect(-6, 7 + bob, 5, 5);
      ctx.fillRect(2, 7 + bob, 5, 5);
      if (classData.id === 'gunner') {
        const side = Math.cos(angle) >= 0 ? 1 : -1;
        ctx.fillStyle = '#a6aaa0';
        ctx.fillRect(side > 0 ? 6 : -17, -1 + bob, 11, 3);
        ctx.fillStyle = classData.color;
        ctx.fillRect(side > 0 ? 14 : -17, -1 + bob, 3, 2);
      } else if (classData.id === 'warrior') {
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = '#e7e0c5';
        ctx.fillRect(7, -1, 15, 3);
        ctx.fillStyle = classData.color;
        ctx.fillRect(5, -3, 4, 7);
        ctx.restore();
      } else {
        ctx.fillStyle = '#252c2c';
        ctx.fillRect(-11, -7 + bob, 4, 10);
        ctx.fillStyle = classData.color;
        ctx.fillRect(-10, -5 + bob, 2, 3);
      }
      ctx.restore();
    }

    drawProjectile(projectile) {
      const screen = this.worldToScreen(projectile);
      let visual = null;
      if (projectile.source === 'gun') {
        if (this.hasEvolution('piercing_star') && projectile.pierce > 0 && projectile.explosion > 0) visual = 'piercing_star_round';
        else if (this.hasEvolution('hunt_barrage') && projectile.bounce > 0) visual = 'hunter_round';
        else if (projectile.explosion > 0) visual = 'explosive_round';
        else if (projectile.bounce > 0) visual = 'ricochet_round';
        else if (projectile.pierce > 0) visual = 'piercing_round';
        else if (this.getCardLevel('scatter') > 0) visual = 'scatter_pellet';
        else visual = 'pulse_round';
      } else if (projectile.source === 'drone') visual = 'pulse_round';
      if (visual) {
        const frame = this.direction8(projectile.vx, projectile.vy);
        if (this.drawFrame(`projectile.${visual}`, 24, 24, frame, screen.x - 12, screen.y - 12, 24, 24)) return;
      }
      const ctx = this.ctx;
      ctx.fillStyle = projectile.color;
      ctx.fillRect(Math.round(screen.x - projectile.radius), Math.round(screen.y - projectile.radius), Math.ceil(projectile.radius * 2), Math.ceil(projectile.radius * 2));
    }

    drawEnemyProjectile(projectile) {
      const screen = this.worldToScreen(projectile);
      const frame = this.direction8(projectile.vx, projectile.vy);
      if (this.drawFrame('projectile.plasma_bolt', 24, 24, frame, screen.x - 12, screen.y - 12, 24, 24)) return;
      const ctx = this.ctx;
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, projectile.radius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillRect(screen.x - projectile.vx * 0.06, screen.y - projectile.vy * 0.06, 3, 3);
      ctx.globalAlpha = 1;
    }

    drawParticle(particle) {
      const screen = this.worldToScreen(particle);
      const ctx = this.ctx;
      const alpha = clamp(particle.life / particle.max, 0, 1);
      ctx.globalAlpha = alpha;
      if (particle.type === 'text') {
        this.text(particle.text, screen.x, screen.y, 9, particle.color, 'center', true, true);
      } else if (particle.type === 'pixel') {
        ctx.fillStyle = particle.color;
        ctx.fillRect(screen.x, screen.y, particle.size, particle.size);
      } else if (particle.type === 'ring') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y, particle.radius * (1.2 - alpha * 0.2), particle.radius * 0.45, 0, 0, TAU);
        ctx.stroke();
      } else if (particle.type === 'slash') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, particle.range * (1 - alpha * 0.12), particle.angle - 0.65, particle.angle + 0.65);
        ctx.stroke();
      } else if (particle.type === 'rail') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 4 + alpha * 7;
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        ctx.lineTo(screen.x + Math.cos(particle.angle) * 520, screen.y + Math.sin(particle.angle) * 520);
        ctx.stroke();
      } else if (particle.type === 'arc') {
        const end = this.worldToScreen({ x: particle.x2, y: particle.y2 });
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y);
        ctx.lineTo((screen.x + end.x) / 2 + 5, (screen.y + end.y) / 2 - 5);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawSmallBar(x, y, w, ratio, color) {
      const ctx = this.ctx;
      ctx.fillStyle = '#080a0b';
      ctx.fillRect(x, y, w, 5);
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * clamp(ratio, 0, 1)), 3);
    }

    drawProgressBar(x, y, w, ratio, type = 'mission', height = 10) {
      const frame = this.assetImage('ui.progress_frame');
      const fill = this.assetImage(`ui.progress_${type}`);
      if (!frame || !fill) return false;
      const value = clamp(ratio, 0, 1);
      this.ctx.drawImage(frame, Math.round(x), Math.round(y), Math.round(w), Math.round(height));
      if (value > 0) {
        const sourceWidth = Math.max(1, Math.floor(fill.width * value));
        const innerWidth = Math.max(1, (w - 4) * value);
        this.ctx.drawImage(fill, 0, 0, sourceWidth, fill.height, Math.round(x + 2), Math.round(y + 2), Math.round(innerWidth), Math.max(2, Math.round(height - 4)));
      }
      return true;
    }

    drawHUD() {
      const ctx = this.ctx;
      const classData = DATA.classById[this.player.classId];
      this.panel(5, 5, 143, 55, { fill: 'rgba(7,10,12,0.93)', stroke: '#575a52', accent: classData.color, accentWidth: 4 });
      this.drawAtlasIcon('health', 10, 10, 21);
      this.text(classData.name, 36, 22, 9, classData.color, 'left', true);
      this.text(`LV.${this.player.level}`, 137, 23, 8, DATA.palette.paper, 'right', true, true);
      this.drawProgressBar(36, 27, 99, this.player.hp / this.player.maxHp, 'health', 10);
      this.drawAtlasIcon('xp', 14, 40, 16);
      this.drawProgressBar(36, 43, 99, this.player.xp / this.player.nextXp, 'xp', 8);

      this.panel(153, 5, 76, 55, { fill: 'rgba(7,10,12,0.93)', stroke: '#575a52', accent: DATA.palette.paper, accentWidth: 2 });
      this.drawAtlasIcon('timer', 159, 10, 18);
      this.text('MISSION', 183, 21, 6, DATA.palette.muted, 'left', true, true);
      this.text(formatTime(this.world.time), 191, 45, 18, DATA.palette.paper, 'center', true, true);

      this.panel(234, 5, 121, 55, { fill: 'rgba(7,10,12,0.93)', stroke: '#575a52', accent: DATA.palette.orange, accentWidth: 3 });
      this.drawAtlasIcon('cargo', 241, 10, 19);
      this.text('CARGO', 265, 21, 6, DATA.palette.muted, 'left', true, true);
      this.text(String(this.player.loot), 344, 35, 16, DATA.palette.orange, 'right', true, true);
      this.drawAtlasIcon(this.contract.anomaly.id, 241, 37, 15);
      this.text(this.contract.anomaly.name, 344, 49, 7, this.contract.planet.accent, 'right', true);

      this.panel(47, 65, 266, 30, { fill: 'rgba(7,10,12,0.91)', stroke: this.world.missionComplete ? DATA.palette.acid : '#575a52', accent: this.world.missionComplete ? DATA.palette.acid : DATA.palette.orange, accentWidth: 4 });
      const missionIcon = this.world.missionComplete ? 'success' : (this.world.objective.id === 'nests' ? 'mission_nest' : (this.world.objective.id === 'beacons' ? 'mission_beacon' : 'mission_drill'));
      this.drawAtlasIcon(missionIcon, 53, 69, 22);
      this.text(this.missionStatus(), 190, 85, 9, this.world.missionComplete ? DATA.palette.acid : DATA.palette.paper, 'center', true);

      this.drawObjectiveArrow();
      this.drawCacheArrow();
      this.drawJoystick();
      if (this.contract.anomaly.id === 'energy_tide' && this.energyTideActive()) {
        this.panel(89, 103, 182, 25, { fill: 'rgba(7,10,12,0.9)', stroke: DATA.palette.acid, accent: DATA.palette.acid });
        this.drawAtlasIcon('energy_tide', 97, 106, 18);
        this.text('能源潮汐 // 双方加速', 191, 120, 8, DATA.palette.acid, 'center', true);
      }
      if (this.world.missionComplete && this.world.extraction.progress > 0) {
        const ratio = clamp(this.world.extraction.progress / this.world.extraction.required, 0, 1);
        ctx.fillStyle = 'rgba(7,10,12,0.92)';
        ctx.fillRect(56, 606, 248, 24);
        this.drawProgressBar(61, 610, 238, ratio, 'extraction', 10);
        this.text('UPLINK // 保持在撤离区', 180, 627, 7, DATA.palette.paper, 'center', true, true);
      }
    }

    missionStatus() {
      const objective = this.world.objective;
      if (this.world.missionComplete) {
        const extraction = Math.floor(this.world.extraction.progress);
        return extraction > 0 ? `撤离上传 ${extraction}/${this.world.extraction.required}s` : '主任务完成 // 前往撤离点';
      }
      if (objective.id === 'nests') return `摧毁巢穴 ${objective.items.filter((item) => item.dead).length}/3`;
      if (objective.id === 'beacons') return `激活信标 ${objective.current}/3`;
      return `守护钻机 ${Math.floor(objective.item.progress)}/${objective.item.required}s`;
    }

    currentObjectiveTarget() {
      if (this.world.missionComplete) return this.world.extraction;
      const objective = this.world.objective;
      if (objective.id === 'nests') return objective.items.find((item) => !item.dead);
      if (objective.id === 'beacons') return objective.items[objective.current];
      return objective.item;
    }

    drawObjectiveArrow() {
      const target = this.currentObjectiveTarget();
      if (!target) return;
      const screen = this.worldToScreen(target);
      if (screen.x > 24 && screen.x < W - 24 && screen.y > 85 && screen.y < H - 24) return;
      const dx = screen.x - W / 2;
      const dy = screen.y - H / 2;
      const angle = Math.atan2(dy, dx);
      const radiusX = W / 2 - 28;
      const radiusY = H / 2 - 105;
      const scale = Math.min(radiusX / Math.max(0.001, Math.abs(dx)), radiusY / Math.max(0.001, Math.abs(dy)));
      const x = W / 2 + dx * scale;
      const y = H / 2 + dy * scale;
      const ctx = this.ctx;
      const frame = this.direction8(dx, dy);
      if (this.drawFrame('ui.objective_arrow', 24, 24, frame, x - 12, y - 12, 24, 24)) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = this.world.missionComplete ? DATA.palette.acid : DATA.palette.orange;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-7, -7);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawCacheArrow() {
      const cache = this.world.cache;
      const scanner = this.save.modules.scanner || 0;
      if (cache.collected || (!cache.found && scanner < 3)) return;
      const screen = this.worldToScreen(cache);
      if (screen.x > 18 && screen.x < W - 18 && screen.y > 82 && screen.y < H - 18) {
        const marker = this.assetImage('ui.cache_marker');
        if (marker) this.ctx.drawImage(marker, Math.round(screen.x - 12), Math.round(screen.y - 39), 24, 24);
        else this.text('¤', screen.x, screen.y - 27, 13, DATA.palette.orange, 'center', true, true);
        return;
      }
      const dx = screen.x - W / 2;
      const dy = screen.y - H / 2;
      const radiusX = W / 2 - 42;
      const radiusY = H / 2 - 118;
      const scale = Math.min(radiusX / Math.max(0.001, Math.abs(dx)), radiusY / Math.max(0.001, Math.abs(dy)));
      const x = W / 2 + dx * scale;
      const y = H / 2 + dy * scale;
      const marker = this.assetImage('ui.cache_marker');
      if (marker) this.ctx.drawImage(marker, Math.round(x - 12), Math.round(y - 12), 24, 24);
      else this.text('¤', x, y + 4, 15, DATA.palette.orange, 'center', true, true);
    }

    drawJoystick() {
      const ctx = this.ctx;
      const x = this.pointer.active ? this.pointer.originX : 74;
      const y = this.pointer.active ? this.pointer.originY : 554;
      const dx = this.pointer.active ? clamp(this.pointer.x - x, -38, 38) : 0;
      const dy = this.pointer.active ? clamp(this.pointer.y - y, -38, 38) : 0;
      ctx.globalAlpha = this.pointer.active ? 0.82 : 0.3;
      const base = this.assetImage('ui.joystick_base');
      const knob = this.assetImage('ui.joystick_knob');
      if (base && knob) {
        ctx.drawImage(base, Math.round(x - 48), Math.round(y - 48), 96, 96);
        ctx.drawImage(knob, Math.round(x + dx - 20), Math.round(y + dy - 20), 40, 40);
        ctx.globalAlpha = 1;
        return;
      }
      ctx.fillStyle = '#050708';
      ctx.beginPath();
      ctx.arc(x, y, 43, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#a6a38f';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#3a3e39';
      ctx.fillRect(x - 3, y - 37, 6, 11);
      ctx.fillRect(x - 3, y + 26, 6, 11);
      ctx.fillRect(x - 37, y - 3, 11, 6);
      ctx.fillRect(x + 26, y - 3, 11, 6);
      ctx.fillStyle = this.pointer.active ? DATA.palette.acid : '#76796c';
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#111514';
      ctx.fillRect(x + dx - 5, y + dy - 5, 10, 10);
      ctx.globalAlpha = 1;
    }

    drawNotice() {
      const notice = this.notice;
      const alpha = Math.min(1, notice.time * 3, (notice.max - notice.time) * 5);
      const ctx = this.ctx;
      ctx.globalAlpha = alpha;
      this.panel(30, 102, 300, notice.detail ? 54 : 38, { fill: 'rgba(7,10,12,0.92)', stroke: notice.color, accent: notice.color });
      this.text(notice.title, 48, 125, 13, notice.color, 'left', true);
      if (notice.detail) this.text(notice.detail, 48, 144, 9, DATA.palette.paper, 'left');
      ctx.globalAlpha = 1;
    }

    drawTutorial() {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(5,8,10,0.76)';
      ctx.fillRect(0, 76, W, H - 76);
      this.panel(42, 205, 276, 170, { uiVariant: 'inset', fill: '#12191b', stroke: DATA.palette.acid, accent: DATA.palette.acid });
      this.text('外勤操作说明', 180, 240, 19, DATA.palette.paper, 'center', true);
      this.text('按住屏幕任意位置并拖动', 180, 276, 13, DATA.palette.acid, 'center', true);
      this.text('宇航员会自动攻击最近目标', 180, 304, 11, DATA.palette.paper, 'center');
      this.text('升级时任务时间自动暂停', 180, 327, 10, DATA.palette.muted, 'center');
      this.text('— 拖动以确认已阅读 —', 180, 356, 9, DATA.palette.orange, 'center', true);
    }

    drawLevelUp() {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(4,7,9,0.94)';
      ctx.fillRect(0, 0, W, H);
      for (let index = 0; index < 28; index += 1) {
        ctx.globalAlpha = 0.08 + (index % 3) * 0.04;
        ctx.fillStyle = index % 2 ? DATA.palette.acid : DATA.palette.orange;
        ctx.fillRect((index * 47) % W, 12 + (index * 73) % 552, 2 + index % 4, 2);
      }
      ctx.globalAlpha = 1;
      this.panel(10, 9, 340, 61, { fill: '#111716', stroke: '#6a6a5d', accent: DATA.palette.acid, accentWidth: 5 });
      this.text('LEVEL UP // 绩效提升', 26, 37, 21, DATA.palette.paper, 'left', true);
      this.text(`LV.${this.player.level}  选择一项职业升级`, 27, 57, 8, DATA.palette.acid, 'left', true, true);
      this.text('TIME PAUSED', 334, 54, 7, DATA.palette.orange, 'right', true, true);
      this.levelChoices.forEach((choice, index) => this.drawUpgradeCard(choice, index));
      const rerolls = this.player.rerolls;
      this.button(72, 580, 216, 42, `R  重新打印选项 × ${rerolls}`, () => this.rerollChoices(), {
        disabled: rerolls <= 0,
        fill: '#6650a4',
        text: DATA.palette.paper,
        ink: DATA.palette.paper,
        stroke: '#aa8fff',
        size: 11
      });
    }

    drawUpgradeCard(choice, index) {
      const y = 78 + index * 164;
      const evolution = choice.type === 'evolution';
      const overflow = choice.type === 'overflow';
      const classData = DATA.classById[this.player.classId];
      const card = choice.data;
      const level = evolution ? 'EVOLUTION' : (overflow ? 'OVERTIME' : `LV.${(this.player.cards[card.id] || 0) + 1}/3`);
      const color = evolution ? DATA.palette.acid : classData.color;
      const kind = evolution ? 'COMBO TECH' : (overflow ? 'OVERTIME' : `${card.kind.toUpperCase()} TECH`);
      this.panel(10, y, 340, 154, { uiVariant: 'upgrade', fill: evolution ? '#192114' : '#121817', stroke: color, accent: color, accentWidth: 6 });
      this.ctx.fillStyle = '#080c0c';
      this.ctx.fillRect(24, y + 21, 88, 105);
      this.ctx.fillStyle = color;
      this.ctx.fillRect(28, y + 25, 80, 97);
      this.ctx.fillStyle = evolution ? '#18240f' : '#18201f';
      this.ctx.fillRect(32, y + 29, 72, 89);
      this.ctx.globalAlpha = 0.16;
      for (let cell = 0; cell < 5; cell += 1) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(35 + cell * 14, y + 33, 1, 81);
        this.ctx.fillRect(35, y + 35 + cell * 16, 66, 1);
      }
      this.ctx.globalAlpha = 1;
      this.drawPixelIcon(card.id || kind, 38, y + 38, 60, color);
      this.text(`0${index + 1}`, 35, y + 145, 8, DATA.palette.muted, 'left', true, true);
      this.text(kind, 125, y + 25, 7, evolution ? DATA.palette.acid : DATA.palette.muted, 'left', true, true);
      this.text(level, 333, y + 25, 8, color, 'right', true, true);
      this.text(card.name, 125, y + 54, 18, DATA.palette.paper, 'left', true);
      const description = evolution || overflow ? card.desc : card.desc[(this.player.cards[card.id] || 0)];
      this.wrap(description, 125, y + 78, 203, 15, 10, DATA.palette.paper, 3);
      if (!evolution && !overflow) {
        const recipe = classData.evolutions.find((entry) => entry.requires.includes(card.id));
        if (recipe) {
          const other = recipe.requires.find((id) => id !== card.id);
          const otherCard = classData.cards.find((entry) => entry.id === other);
          this.text(`配方 ${card.name} + ${otherCard.name}`, 125, y + 131, 7, DATA.palette.muted, 'left', true);
          this.text(`→ ${recipe.name}`, 125, y + 144, 8, color, 'left', true);
        }
      } else if (evolution) {
        const names = card.requires.map((id) => classData.cards.find((entry) => entry.id === id).name);
        this.text(`${names[0]} + ${names[1]}`, 125, y + 139, 8, DATA.palette.acid, 'left', true);
      }
      if (!evolution && !overflow) {
        const currentLevel = (this.player.cards[card.id] || 0) + 1;
        for (let pip = 0; pip < 3; pip += 1) {
          this.ctx.fillStyle = pip < currentLevel ? color : '#3b403b';
          this.ctx.fillRect(302 + pip * 10, y + 137, 7, 7);
        }
      }
      this.buttons.push({ x: 10, y, w: 340, h: 154, disabled: false, action: () => this.chooseUpgrade(choice) });
    }

    drawResult() {
      this.drawStarfield();
      const result = this.result;
      const color = result.success ? DATA.palette.acid : DATA.palette.danger;
      this.drawHeader('外勤清算终端');
      this.hazardStripe(25, 76, 310, 8, color);
      this.text(result.success ? '任务存档完成' : '打印体已报废', 180, 119, 25, color, 'center', true);
      this.text(result.reason, 180, 143, 9, DATA.palette.muted, 'center');
      this.panel(24, 165, 312, 297, { uiVariant: 'result', fill: '#141a1d', stroke: color, accent: color, accentWidth: 6 });
      this.text('PAYROLL // FORM 8-R', 47, 188, 7, DATA.palette.muted, 'left', true, true);
      this.text(result.success ? 'APPROVED' : 'ASSET LOSS', 314, 188, 7, color, 'right', true, true);
      this.resultRow('任务工资', result.basePay, 218);
      this.resultRow('撤离奖金', result.extractionBonus, 258);
      this.resultRow(`战利品 ${result.retainedLoot}/${result.rawLoot}`, result.retainedLoot, 298);
      this.ctx.fillStyle = '#3f4540';
      this.ctx.fillRect(48, 320, 264, 1);
      this.resultRow('本次入账', result.total, 361, true, color);
      this.text(`清算怪物 ${result.kills}`, 49, 407, 10, DATA.palette.muted, 'left', true);
      this.text(`在岗时长 ${formatTime(result.time)}`, 311, 407, 10, DATA.palette.muted, 'right', true);
      this.text(`打印体等级 LV.${result.level}`, 49, 436, 10, DATA.palette.muted, 'left', true);
      this.text(result.success ? '绩效评价：勉强可继续雇佣' : '绩效评价：资产保护意识薄弱', 311, 436, 9, DATA.palette.orange, 'right', true);
      this.button(25, 490, 310, 56, '返回总部  ^', () => {
        this.state = 'hq';
        this.hqPage = 'main';
        this.result = null;
      }, { fill: DATA.palette.acid, size: 16 });
      this.hazardStripe(34, 565, 292, 5, DATA.palette.orange);
      this.text('部分战利品已按货舱保险等级处理', 180, 594, 9, DATA.palette.muted, 'center');
      this.text('COMPANY PROPERTY // DO NOT FOLD', 180, 617, 7, DATA.palette.orange, 'center', true, true);
    }

    resultRow(label, value, y, large = false, color = DATA.palette.paper) {
      this.text(label, 50, y, large ? 13 : 11, large ? color : DATA.palette.paper, 'left', large);
      this.drawAtlasIcon('credits', 272, y - (large ? 19 : 15), large ? 20 : 16);
      this.text(String(value), 310, y, large ? 20 : 14, large ? color : DATA.palette.paper, 'right', true, true);
    }

    drawScanlines() {
      const ctx = this.ctx;
      ctx.globalAlpha = 0.035;
      ctx.fillStyle = '#ffffff';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 0.08;
      const gradient = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 390);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, '#000000');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  const API = { StarDutyGame, DATA, WIDTH: W, HEIGHT: H };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.StarDuty = API;
}(typeof globalThis !== 'undefined' ? globalThis : this));
