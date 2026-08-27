(function (root) {
  'use strict';

  const DATA = (typeof module !== 'undefined' && module.exports)
    ? require('./data.js')
    : root.StarDutyData;

  const W = 360;
  const H = 640;
  const COCKPIT_LAYOUT = Object.freeze({
    shell: { x: 0, y: 0, w: 360, h: 640 },
    header: { x: 11, y: 16, w: 338, h: 74 },
    archiveRoleTabs: { x: 16, y: 91, w: 104, h: 30, gap: 6 },
    employee: { x: 12, y: 94, w: 143, h: 300 },
    navigation: { x: 167, y: 94, w: 181, h: 300 },
    dispatch: { x: 12, y: 446, w: 336, h: 69 },
    utility: { x: 12, y: 521, w: 336, h: 36 },
    nav: { x: 11, y: 565, w: 338, h: 70 }
  });
  const COCKPIT_MAIN_INFO_EXPANDED_LAYOUT = Object.freeze({
    employee: { x: 12, y: 94, w: 143, h: 344 },
    navigation: { x: 167, y: 94, w: 181, h: 344 },
    status: { x: 31, labelY: 397, pipsY: 407 },
    characterAnchor: { x: 255, y: 375 },
    characterClip: { x: 176, y: 119, w: 164, h: 294 }
  });
  const COCKPIT_MUSIC_TEXT_Y = 543;
  const COCKPIT_ARCHIVE_LAYOUT = Object.freeze({
    skillContent: { x: 28, y: 353, w: 304, h: 148 },
    skillColumns: [30, 180],
    skillStartY: 367,
    skillRowHeight: 25,
    comboColumns: [30, 181],
    comboStartY: 365,
    comboRowHeight: 46
  });
  const TAU = Math.PI * 2;
  const TURRET_DRAW_SCALE = 0.82;
  const TURRET_BASE_START_Y = 32;
  const TURRET_HEAD_PIVOT_Y = 30;
  const TURRET_HEAD_END_Y = 35;
  const TURRET_MUZZLE_Y = 4;
  const TURRET_SIDE_DEPTH = 0.72;
  const LIMITS = DATA.limits || { skillLevel: 3, moduleLevel: 3, skillSlots: 6 };
  const ENEMY_ASSET_IDS = {
    rust: { swarm: 'scrap_mite', shooter: 'plasma_watcher', charger: 'rivethorn_ram', bloater: 'pressure_bloater' },
    spore: { swarm: 'mycelium_skitter', shooter: 'acid_eye_pod', charger: 'fungal_ram', bloater: 'spore_bloater' },
    moon: { swarm: 'static_crawler', shooter: 'prism_sentry', charger: 'crater_ram', bloater: 'void_bloater' }
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pick = (items, random = Math.random) => items[Math.floor(random() * items.length)];
  const pad2 = (n) => String(n).padStart(2, '0');
  const formatTime = (seconds) => `${pad2(Math.floor(seconds / 60))}:${pad2(Math.floor(seconds % 60))}`;
  const activityDayKey = (date = new Date()) => {
    // The local day rolls over at 04:00 in Asia/Shanghai, regardless of the
    // device/browser timezone. Convert the instant to UTC+8, then apply the
    // four-hour business-day offset and read UTC fields to avoid local TZ drift.
    const shifted = new Date(date.getTime() + (8 - 4) * 60 * 60 * 1000);
    return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
  };
  const previousDayKey = (key) => {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  };

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
      version: 2,
      credits: 0,
      selectedClass: 'gunner',
      unlocked: { gunner: true },
      successes: 0,
      completedMissions: {},
      modules: { scanner: 0, fabricator: 0, cargo: 0, life_support: 0, printer: 0 },
      firstRun: true,
      bestKills: 0,
      activity: {
        cycleKey: activityDayKey(),
        streak: 0,
        lastClaimKey: null,
        claimedDays: []
      },
      daily: {
        cycleKey: activityDayKey(),
        progress: { kills: 0, missions: 0, extractions: 0 },
        claimedTasks: [],
        claimedMilestones: []
      },
      settings: { musicEnabled: true, sfxEnabled: true }
    };
  }

  class StarDutyGame {
    constructor(canvas, services = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.services = services;
      this.storage = services.storage || { get: () => null, set: () => {} };
      this.audio = services.audio || {
        play: () => {}, intensity: () => {}, setMusic: () => {}, stopMusic: () => {}, setMusicEnabled: () => {},
        unlockMusic: () => false, resumeMusic: () => false, isMusicActive: () => false, pulseIntensity: () => {}
      };
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
      if (this.save._needsPersist) {
        delete this.save._needsPersist;
        this.persist();
      }
      if (this.audio && typeof this.audio.setMusicEnabled === 'function') {
        this.audio.setMusicEnabled(this.save.settings.musicEnabled !== false);
      }
      if (this.audio && typeof this.audio.play === 'function') {
        const rawPlay = this.audio.play.bind(this.audio);
        this.audio.play = (name, gap) => {
          if (!this.save.settings || this.save.settings.sfxEnabled !== false) rawPlay(name, gap);
        };
      }
      this.archiveClassId = this.save.selectedClass;
      // Non-persistent archive UI state. Entering the archive from another
      // headquarters page resets to the representative skills tab; switching
      // employee tabs keeps the current archive tab visible.
      this.archiveSkillTab = 'skills';
      this._musicTrack = null;
      this._musicPlanet = null;
      this.contract = null;
      this.world = null;
      this.player = null;
      this.result = null;
      this.levelChoices = [];
      this.pendingLevelUps = 0;
      this.notice = null;
      this.shake = 0;
      this.flash = 0;
      this.exitModal = false;
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
        const merged = {
          ...base,
          ...parsed,
          unlocked: { ...base.unlocked, ...(parsed.unlocked || {}) },
          completedMissions: { ...(parsed.completedMissions || {}) },
          modules: { ...base.modules, ...(parsed.modules || {}) },
          activity: {
            ...base.activity,
            ...(parsed.activity || {}),
            claimedDays: Array.isArray(parsed.activity && parsed.activity.claimedDays) ? parsed.activity.claimedDays : []
          },
          daily: {
            ...base.daily,
            ...(parsed.daily || {}),
            progress: { ...base.daily.progress, ...((parsed.daily && parsed.daily.progress) || {}) },
            claimedTasks: Array.isArray(parsed.daily && parsed.daily.claimedTasks) ? parsed.daily.claimedTasks : [],
            claimedMilestones: Array.isArray(parsed.daily && parsed.daily.claimedMilestones) ? parsed.daily.claimedMilestones : []
          },
          settings: { ...base.settings, ...(parsed.settings || {}) },
          version: 2
        };
        let normalizedModules = false;
        Object.keys(base.modules).forEach((moduleId) => {
          const rawLevel = Number(merged.modules[moduleId]);
          const normalizedLevel = Number.isFinite(rawLevel)
            ? clamp(Math.floor(rawLevel), 0, LIMITS.moduleLevel)
            : 0;
          if (merged.modules[moduleId] !== normalizedLevel) normalizedModules = true;
          merged.modules[moduleId] = normalizedLevel;
        });
        // Test unlocks are intentionally ephemeral: do not write them into
        // the save, otherwise flipping the QA switch off for release would
        // leave test-only employees permanently unlocked.
        if (!(DATA.runtime && DATA.runtime.testUnlockAllClasses)
          && !merged.unlocked[merged.selectedClass]) {
          merged.selectedClass = 'gunner';
          merged._needsPersist = true;
        }
        if (normalizedModules) merged._needsPersist = true;
        if (typeof this.resetDailyState === 'function') this.resetDailyState(merged);
        if (merged.activity.cycleKey !== activityDayKey()) {
          merged.activity.cycleKey = activityDayKey();
          merged.activity.claimedDays = [];
        }
        return merged;
      } catch (error) {
        return base;
      }
    }

    persist() {
      this.storage.set('star-duty-save', JSON.stringify(this.save));
    }

    resetDailyState(save = this.save) {
      const key = activityDayKey();
      if (!save.daily || save.daily.cycleKey !== key) {
        save.daily = {
          cycleKey: key,
          progress: { kills: 0, missions: 0, extractions: 0 },
          claimedTasks: [],
          claimedMilestones: []
        };
      }
      if (!save.activity || save.activity.cycleKey !== key) {
        save.activity = {
          cycleKey: key,
          streak: save.activity && save.activity.lastClaimKey === previousDayKey(key) ? save.activity.streak : 0,
          lastClaimKey: save.activity ? save.activity.lastClaimKey : null,
          claimedDays: []
        };
      }
      return key;
    }

    ensureDailyState() {
      const beforeDaily = this.save.daily && this.save.daily.cycleKey;
      const beforeActivity = this.save.activity && this.save.activity.cycleKey;
      this.resetDailyState(this.save);
      if (beforeDaily !== this.save.daily.cycleKey || beforeActivity !== this.save.activity.cycleKey) this.persist();
      return this.save.daily;
    }

    addDailyProgress(metric, amount = 1) {
      const daily = this.ensureDailyState();
      if (!Object.prototype.hasOwnProperty.call(daily.progress, metric)) return;
      daily.progress[metric] += amount;
      this.persist();
    }

    dailyActivePoints() {
      const daily = this.ensureDailyState();
      return DATA.dailyTasks.reduce((sum, task) => sum + (daily.claimedTasks.includes(task.id) ? task.points : 0), 0);
    }

    claimCheckIn() {
      const key = this.ensureDailyState().cycleKey;
      const activity = this.save.activity;
      if (activity.lastClaimKey === key) {
        this.notify('今日已签到', '下一次刷新时间 04:00', DATA.palette.muted, 2);
        return false;
      }
      const wasYesterday = activity.lastClaimKey === previousDayKey(key);
      activity.streak = wasYesterday ? activity.streak + 1 : 1;
      const dayIndex = (activity.streak - 1) % DATA.activityRewards.length;
      const reward = DATA.activityRewards[dayIndex];
      activity.lastClaimKey = key;
      activity.claimedDays = [...(activity.claimedDays || []), key];
      this.save.credits += reward;
      this.persist();
      this.audio.play('loot');
      this.notify('签到成功', `连续第 ${dayIndex + 1} 天 // +${reward} 金币`, DATA.palette.acid, 2.4);
      return true;
    }

    claimDailyTask(taskId) {
      const daily = this.ensureDailyState();
      const task = DATA.dailyTasks.find((item) => item.id === taskId);
      if (!task || daily.claimedTasks.includes(taskId) || (daily.progress[task.metric] || 0) < task.target) return false;
      daily.claimedTasks.push(taskId);
      this.save.credits += task.reward;
      this.persist();
      this.audio.play('loot');
      this.notify('任务奖励已入账', `+${task.reward} 金币`, DATA.palette.acid, 2.2);
      return true;
    }

    claimActivityMilestone(milestoneId) {
      const daily = this.ensureDailyState();
      const milestone = DATA.activityMilestones.find((item) => item.id === milestoneId);
      if (!milestone || daily.claimedMilestones.includes(milestoneId) || this.dailyActivePoints() < milestone.points) return false;
      daily.claimedMilestones.push(milestoneId);
      this.save.credits += milestone.reward;
      this.persist();
      this.audio.play('loot');
      this.notify('活跃奖励已领取', `+${milestone.reward} 金币`, DATA.palette.acid, 2.2);
      return true;
    }

    setMusicEnabled(value) {
      this.save.settings.musicEnabled = Boolean(value);
      this.persist();
      if (this.audio.setMusicEnabled) this.audio.setMusicEnabled(this.save.settings.musicEnabled);
      if (this.save.settings.musicEnabled) {
        this.syncMusic(true);
      } else if (this.audio.stopMusic) {
        this.audio.stopMusic();
        this._musicTrack = null;
        this._musicPlanet = null;
      }
    }

    syncMusic(force = false) {
      if (!this.save.settings.musicEnabled || !this.audio.setMusic) return;
      let track = 'cockpit';
      let options = { intensity: 0.18 };
      if (this.state === 'playing' && this.contract) {
        track = this.world && this.world.missionComplete ? 'extract' : 'explore';
        options = { planet: this.contract.planet.id, intensity: this.world && this.world.missionComplete ? 0.9 : 0.42 };
      }
      const trackChanged = this._musicTrack !== track || this._musicPlanet !== (options.planet || '');
      if (force || trackChanged) {
        this._musicTrack = track;
        this._musicPlanet = options.planet || '';
        this.audio.setMusic(track, options);
      } else if (typeof this.audio.isMusicActive === 'function' && !this.audio.isMusicActive()) {
        if (typeof this.audio.resumeMusic === 'function') this.audio.resumeMusic();
        else this.audio.setMusic(track, options);
      } else if (this.audio.pulseIntensity) {
        this.audio.pulseIntensity(options.intensity);
      }
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
      if (this.audio && typeof this.audio.unlockMusic === 'function') this.audio.unlockMusic();
      if (!this.save.settings || this.save.settings.sfxEnabled !== false) this.audio.play('confirm', 0.01);
      this.syncMusic(true);
      for (let index = this.buttons.length - 1; index >= 0; index -= 1) {
        const button = this.buttons[index];
        if (!button.disabled && x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
          this.uiPress = { x: button.x, y: button.y, w: button.w, h: button.h, until: this.now + 0.12 };
          button.action();
          return;
        }
      }
      if (this.exitModal) return;
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

    anomalyDetails(anomaly) {
      const source = anomaly || {};
      const fallback = {
        name: '未知异常',
        effect: '规则影响待确认。',
        tip: '观察场地预警并保持移动。'
      };
      return {
        id: source.id || 'lock',
        name: source.name || fallback.name,
        effect: source.effect || fallback.effect,
        tip: source.tip || fallback.tip
      };
    }

    anomalyRulesEnabled() {
      // Keep anomaly definitions available for a future build, while making
      // the current version switch authoritative for generation and effects.
      return Boolean(DATA.runtime && DATA.runtime.anomalyRulesEnabled === true);
    }

    anomalyIs(id) {
      return this.anomalyRulesEnabled()
        && Boolean(this.contract && this.contract.anomaly && this.contract.anomaly.id === id);
    }

    disabledAnomaly() {
      return { id: 'none', name: '', effect: '', tip: '' };
    }

    prepareContract() {
      if (!this.contract) {
        const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
        const random = mulberry32(seed);
        this.contract = {
          seed,
          planet: pick(DATA.planets, random),
          mission: pick(DATA.missions, random),
          anomaly: this.anomalyRulesEnabled() ? pick(DATA.anomalies, random) : this.disabledAnomaly(),
          rewardCode: random() > 0.5 ? '遗失货柜' : (this.anomalyRulesEnabled() ? '异常样本' : '任务补给')
        };
      }
      if (!this.anomalyRulesEnabled()) this.contract.anomaly = this.disabledAnomaly();
      this.state = 'briefing';
      this.audio.play('terminal');
      this.syncMusic(true);
    }

    returnToHQ() {
      this.state = 'hq';
      this.hqPage = 'main';
      this.pointer.active = false;
      this.exitModal = false;
      // Keep the pending contract so the cockpit can resume the same brief.
      this.syncMusic(true);
    }

    openExitConfirm() {
      if (this.state !== 'playing' || !this.world || this.exitModal) return false;
      this.pointer.active = false;
      this.exitModal = true;
      this.uiPress = null;
      return true;
    }

    cancelExitConfirm() {
      this.exitModal = false;
      this.pointer.active = false;
      this.audio.play('cancel');
    }

    confirmExitToHQ() {
      if (!this.exitModal) return false;
      this.exitModal = false;
      this.pointer.active = false;
      this.finishRun(false, '主动退出外勤');
      return true;
    }

    propSpec(assetId) {
      const manifest = this.assets && this.assets.manifest;
      return manifest && manifest.props ? manifest.props[assetId] : null;
    }

    propCollisionRadius(prop) {
      if (!prop || prop.collisionActive === false) return 0;
      const spec = this.propSpec(prop.assetId);
      if (!spec || spec.collision !== true) return 0;
      const baseRadius = Number(spec.collisionRadius);
      return Number.isFinite(baseRadius) && baseRadius > 0
        ? baseRadius * (Number(prop.size) || 1)
        : 0;
    }

    propPlacementBlocked(props, x, y, radius, forbidden = [], spacing = 12) {
      for (const zone of forbidden) {
        if (Math.hypot(x - zone.x, y - zone.y) < radius + zone.radius) return true;
      }
      for (const prop of props) {
        const otherRadius = this.propCollisionRadius(prop);
        if (otherRadius && Math.hypot(x - prop.x, y - prop.y) < radius + otherRadius + spacing) return true;
      }
      return false;
    }

    isPropBlocked(x, y, radius, ignore = null) {
      if (!this.world || !Array.isArray(this.world.props)) return false;
      for (const prop of this.world.props) {
        if (prop === ignore) continue;
        const otherRadius = this.propCollisionRadius(prop);
        if (otherRadius && Math.hypot(x - prop.x, y - prop.y) < radius + otherRadius) return true;
      }
      return false;
    }

    moveActorWithPropCollision(actor, dx, dy, radius, bounds = {}) {
      if (!actor || !this.world) return;
      const minX = bounds.minX === undefined ? 24 : bounds.minX;
      const maxX = bounds.maxX === undefined ? this.world.width - 24 : bounds.maxX;
      const minY = bounds.minY === undefined ? 24 : bounds.minY;
      const maxY = bounds.maxY === undefined ? this.world.height - 24 : bounds.maxY;
      const nextX = clamp(actor.x + dx, minX, maxX);
      if (!this.isPropBlocked(nextX, actor.y, radius, actor)) actor.x = nextX;
      const nextY = clamp(actor.y + dy, minY, maxY);
      if (!this.isPropBlocked(actor.x, nextY, radius, actor)) actor.y = nextY;

      // Push actors out if a spawn point or knockback placed them inside a
      // prop. Four short passes keep the response deterministic.
      for (let pass = 0; pass < 4; pass += 1) {
        let moved = false;
        for (const prop of this.world.props) {
          if (prop === actor) continue;
          const otherRadius = this.propCollisionRadius(prop);
          if (!otherRadius) continue;
          let offsetX = actor.x - prop.x;
          let offsetY = actor.y - prop.y;
          let distance = Math.hypot(offsetX, offsetY);
          const minimum = radius + otherRadius;
          if (distance >= minimum) continue;
          if (distance < 0.001) {
            offsetX = 1;
            offsetY = 0;
            distance = 1;
          }
          const push = minimum - distance + 0.5;
          actor.x = clamp(actor.x + offsetX / distance * push, minX, maxX);
          actor.y = clamp(actor.y + offsetY / distance * push, minY, maxY);
          moved = true;
        }
        if (!moved) break;
      }
    }

    createPropInstances(planetId, random, objective, cache, extraction) {
      const manifest = this.assets && this.assets.manifest;
      const ids = manifest && manifest.propSets && manifest.propSets[planetId];
      if (!Array.isArray(ids) || ids.length !== 8) return [];
      const worldWidth = this.world ? this.world.width : 1500;
      const worldHeight = this.world ? this.world.height : 1900;
      const orderedIds = shuffled(ids, random).flatMap((assetId) => [assetId, assetId, assetId]);
      const props = [];
      const forbidden = [
        { x: this.player.x, y: this.player.y, radius: 110 },
        { x: cache.x, y: cache.y, radius: cache.pickupRadius + 58 },
        { x: extraction.x, y: extraction.y, radius: extraction.radius + 42 }
      ];
      (objective.items || (objective.item ? [objective.item] : [])).forEach((item) => {
        forbidden.push({ x: item.x, y: item.y, radius: (item.radius || 72) + 38 });
      });

      for (const assetId of orderedIds) {
        const spec = this.propSpec(assetId);
        if (!spec) continue;
        const size = spec.sizeClass === 'small'
          ? 0.9 + random() * 0.16
          : (spec.sizeClass === 'medium' ? 0.84 + random() * 0.18
            : (spec.sizeClass === 'large' ? 0.8 + random() * 0.16 : 0.9 + random() * 0.18));
        const radius = (Number(spec.collisionRadius) || 8) * size;
        let candidate = null;
        for (let attempt = 0; attempt < 80 && !candidate; attempt += 1) {
          const x = 82 + random() * (worldWidth - 164);
          const y = 106 + random() * (worldHeight - 212);
          if (!this.propPlacementBlocked(props, x, y, radius, forbidden)) candidate = { x, y };
        }
        if (!candidate) {
          for (let attempt = 0; attempt < 80 && !candidate; attempt += 1) {
            const x = 82 + random() * (worldWidth - 164);
            const y = 106 + random() * (worldHeight - 212);
            if (!this.propPlacementBlocked(props, x, y, radius, forbidden, 2)) candidate = { x, y };
          }
        }
        if (!candidate) continue;
        props.push({
          x: candidate.x,
          y: candidate.y,
          kind: Math.floor(random() * 4),
          assetId,
          planet: planetId,
          size,
          tone: random(),
          collisionActive: Boolean(this.assetImage(`prop.${assetId}`))
        });
      }
      return props;
    }

    beginRun() {
      if (!this.anomalyRulesEnabled() && this.contract) this.contract.anomaly = this.disabledAnomaly();
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
        overflowUsed: false,
        rerolls: this.save.modules.fabricator || 0,
        attackTimer: 0.1,
        railTimer: 4,
        turretTimer: 5,
        selfDestructTimer: 11,
        reloadTimer: 0,
        ammo: 6,
        attackCount: 0,
        attackCycleId: 0,
        invuln: 0,
        boostTimer: 0,
        boostCooldown: 0,
        unyieldingUsed: false,
        fury: 0,
        furyStacks: 0,
        scrap: 0,
        scrapHeal: 0,
        kills: 0,
        loot: 0,
        animTime: 0,
        movePhase: 0,
        moving: false,
        actionState: 'idle',
        actionSkill: null,
        actionElapsed: 0,
        actionEventFired: false,
        actionOrigin: null,
        actionDirection: null,
        actionVfxOrigins: null,
        actionVfxScale: 1,
        actionVfxDisabled: false,
        lastActionAt: -Infinity,
        activeVfx: null
      };

      const objectivePositions = [
        { x: 480 + random() * 540, y: 1240 + random() * 110 },
        { x: 300 + random() * 900, y: 820 + random() * 120 },
        { x: 430 + random() * 650, y: 370 + random() * 120 }
      ];
      const objective = this.createObjective(this.contract.mission.id, objectivePositions);
      const cacheSide = random() > 0.5 ? 1 : -1;
      const difficultyConfig = DATA.difficulty || {};
      const extractionConfig = DATA.extraction || {};
      const extraction = {
        x: 750,
        y: 1715,
        radius: 82,
        progress: 0,
        required: Number.isFinite(extractionConfig.requiredSeconds) ? extractionConfig.requiredSeconds : 30
      };
      const cache = { x: 750 + cacheSide * 510, y: 630, found: false, collected: false, pickupRadius: 42, eliteSpawned: false, eliteDefeated: false };
      const props = this.createPropInstances(this.contract.planet.id, random, objective, cache, extraction);
      this.world = {
        random,
        width: 1500,
        height: 1900,
        time: 0,
        animTime: 0,
        missionComplete: false,
        objective,
        extraction,
        cache,
        props,
        enemies: [],
        projectiles: [],
        enemyProjectiles: [],
        pickups: [],
        hazards: [],
        effects: [],
        comboFeedbackState: {},
        particles: [],
        turrets: [],
        spawnTimer: Number.isFinite(difficultyConfig.initialSpawnDelay) ? difficultyConfig.initialSpawnDelay : 0.35,
        hazardTimer: 3.5,
        eliteId: null,
        camera: { x: this.player.x - W / 2, y: this.player.y - H / 2 },
        basePay: 0
      };
      this.exitModal = false;
      this.contract.started = true;
      this.pendingLevelUps = 0;
      this.state = 'playing';
      this.audio.play('deploy');
      this.audio.intensity(0.08);
      this.syncMusic(true);
      if (!this.anomalyRulesEnabled()) {
        this.notice = null;
        return;
      }
      const anomaly = this.anomalyDetails(this.contract.anomaly);
      this.notify(`异常规则 // ${anomaly.name}`, anomaly.effect, this.contract.planet.accent, 3.2);
    }

    createObjective(id, positions) {
      if (id === 'nests') {
        return {
          id,
          items: positions.map((position, index) => ({
            ...position,
            index,
            // Keep each nest on a stable, deterministic animation phase so
            // the idle frames do not hop in lockstep. The phase is stored on
            // the instance, not derived from wall-clock randomness, so a
            // seeded run remains visually reproducible.
            animationPhase: this.nestAnimationPhase(position, index),
            hp: 760,
            maxHp: 760,
            dead: false,
            radius: 34
          }))
        };
      }
      if (id === 'beacons') {
        return {
          id,
          current: 0,
          items: positions.map((position, index) => ({ ...position, index, charge: 0, required: 18, active: false, radius: 72 }))
        };
      }
      return {
        id,
        item: { ...positions[1], progress: 0, required: 90, started: false, radius: 142 }
      };
    }

    nestAnimationPhase(item, index = 0) {
      if (item && Number.isFinite(item.animationPhase)) return item.animationPhase;
      // The active nest sheets are 4 frames at 7 FPS (one cycle is about
      // 0.57s). Spread the three objective instances across that cycle and
      // add a small position-derived offset for stable variation between
      // contracts. No Math.random() is used here.
      const cycle = 4 / 7;
      const x = item && Number.isFinite(item.x) ? Math.round(item.x) : 0;
      const y = item && Number.isFinite(item.y) ? Math.round(item.y) : 0;
      const positionStep = Math.abs((x * 31 + y * 17) % 11) * 0.012;
      return (index * (cycle / 3) + positionStep) % cycle;
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

    getUpgradeCardWeight(cardId) {
      const config = DATA.comboDraft || { relatedWeight: 3, activationLevel: 1 };
      const relatedWeight = Number.isFinite(config.relatedWeight) ? Math.max(1, config.relatedWeight) : 3;
      const activationLevel = Number.isFinite(config.activationLevel) ? Math.max(1, config.activationLevel) : 1;
      const classData = DATA.classById[this.player.classId];
      if (!classData || !Array.isArray(classData.evolutions)) return 1;
      let weight = 1;
      for (const evolution of classData.evolutions) {
        if (!evolution || this.player.evolutions[evolution.id]) continue;
        const requires = Array.isArray(evolution.requires) ? evolution.requires : [];
        if (!requires.includes(cardId)) continue;
        if (requires.some((requiredId) => this.getCardLevel(requiredId) >= activationLevel)) {
          weight += relatedWeight - 1;
        }
      }
      return weight;
    }

    getComboDraftTarget(cards) {
      if (!Array.isArray(cards) || !cards.length) return null;
      const classData = DATA.classById[this.player.classId];
      const config = DATA.comboDraft || {};
      const activationLevel = Number.isFinite(config.activationLevel) ? Math.max(1, config.activationLevel) : 1;
      const candidates = new Map(cards.map((card) => [card.id, card]));
      const targets = new Map();
      for (const evolution of (classData && classData.evolutions) || []) {
        if (!evolution || this.player.evolutions[evolution.id]) continue;
        const requires = Array.isArray(evolution.requires) ? evolution.requires : [];
        const levels = requires.map((id) => this.getCardLevel(id));
        const hasActiveComponent = levels.some((level) => level >= activationLevel);
        if (!hasActiveComponent) continue;
        for (let index = 0; index < requires.length; index += 1) {
          if (levels[index] >= LIMITS.skillLevel || !candidates.has(requires[index])) continue;
          const activeCount = levels.filter((level) => level >= activationLevel).length;
          const current = targets.get(requires[index]);
          const score = 1 + activeCount * 1.5 + (LIMITS.skillLevel - levels[index]) * 0.25;
          if (!current || score > current.score) targets.set(requires[index], { card: candidates.get(requires[index]), score });
        }
      }
      if (!targets.size) return null;
      const weighted = this.drawWeighted([...targets.values()], this.world.random, (target) => target.score);
      return weighted ? weighted.card : null;
    }

    drawWeighted(items, random, weightFn) {
      if (!Array.isArray(items) || !items.length) return null;
      const weights = items.map((item) => Math.max(0, Number(weightFn(item)) || 0));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      if (total <= 0) return items[items.length - 1];
      let roll = Math.max(0, Math.min(0.999999999, random())) * total;
      for (let index = 0; index < items.length; index += 1) {
        roll -= weights[index];
        if (roll < 0) return items[index];
      }
      return items[items.length - 1];
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

      if (this.anomalyIs('low_gravity')) speed *= 1.08;
      if (this.anomalyIs('energy_tide') && this.energyTideActive()) {
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

    characterIdForClass(classId) {
      return classId === 'gunner' ? 'gunner_mia' : (classId === 'warrior' ? 'warrior_kade' : 'mechanic_locke');
    }

    characterActionSpec(classId, state = 'walk', skillId = null) {
      const manifest = this.assets && this.assets.manifest;
      const characterId = this.characterIdForClass(classId);
      const roleActions = manifest && manifest.characterActions && manifest.characterActions[characterId];
      if (!roleActions) return null;
      return state === 'skill' ? (roleActions.skills && roleActions.skills[skillId]) : roleActions[state];
    }

    getWeaponMuzzle(actor = this.player, dirX = null, dirY = null, facingOverride = null) {
      const target = actor || this.player;
      if (!target) return { x: 0, y: 0, dirX: 1, dirY: 0, facing: 1 };
      const fallbackX = Number.isFinite(target.dirX) && Math.abs(target.dirX) > 0.001 ? target.dirX : 1;
      const fallbackY = Number.isFinite(target.dirY) ? target.dirY : 0;
      const rawX = Number.isFinite(dirX) && Math.abs(dirX) + Math.abs(dirY || 0) > 0.001 ? dirX : fallbackX;
      const rawY = Number.isFinite(dirX) && Math.abs(dirX) + Math.abs(dirY || 0) > 0.001 ? (dirY || 0) : fallbackY;
      const length = Math.hypot(rawX, rawY) || 1;
      const facing = Number.isInteger(facingOverride) && facingOverride >= 0 && facingOverride <= 3
        ? facingOverride
        : this.direction4(rawX, rawY);
      const order = ['front', 'right', 'back', 'left'];
      const manifest = this.assets && this.assets.manifest;
      const characterId = this.characterIdForClass(target.classId);
      const roleSpec = manifest && manifest.characterRoleSpecs && manifest.characterRoleSpecs[characterId];
      const mount = roleSpec && roleSpec.weaponMuzzles && roleSpec.weaponMuzzles[order[facing]];
      return {
        x: target.x + (mount ? mount.x : 0),
        y: target.y + (mount ? mount.y : 0),
        dirX: rawX / length,
        dirY: rawY / length,
        facing
      };
    }

    getWeaponShot(target, actor = this.player) {
      const shooter = actor || this.player;
      const reference = target && target.ref ? target.ref : target;
      if (!shooter || !reference || !Number.isFinite(reference.x) || !Number.isFinite(reference.y)) return null;

      const targetDx = reference.x - shooter.x;
      const targetDy = reference.y - shooter.y;
      const targetLength = Math.hypot(targetDx, targetDy);
      const fallbackX = Number.isFinite(shooter.dirX) && Math.abs(shooter.dirX) > 0.001 ? shooter.dirX : 1;
      const fallbackY = Number.isFinite(shooter.dirY) ? shooter.dirY : 0;
      const desiredX = targetLength > 0.001 ? targetDx / targetLength : fallbackX;
      const desiredY = targetLength > 0.001 ? targetDy / targetLength : fallbackY;
      // Keep the mount selected from the actor-to-target direction while the
      // final projectile angle is calculated from the actual muzzle point.
      const facing = this.direction4(desiredX, desiredY);
      const muzzle = this.getWeaponMuzzle(shooter, desiredX, desiredY, facing);
      const muzzleDx = reference.x - muzzle.x;
      const muzzleDy = reference.y - muzzle.y;
      const muzzleLength = Math.hypot(muzzleDx, muzzleDy);
      const dirX = muzzleLength > 0.001 ? muzzleDx / muzzleLength : desiredX;
      const dirY = muzzleLength > 0.001 ? muzzleDy / muzzleLength : desiredY;
      return {
        origin: { x: muzzle.x, y: muzzle.y, facing, dirX, dirY },
        dirX,
        dirY,
        angle: Math.atan2(dirY, dirX),
        facing,
        target: reference
      };
    }

    setActionOrigin(options = {}) {
      const player = this.player;
      if (!player) return;
      const hasOrigin = options.origin && Number.isFinite(options.origin.x) && Number.isFinite(options.origin.y);
      const origins = Array.isArray(options.origins)
        ? options.origins.filter((origin) => origin && Number.isFinite(origin.x) && Number.isFinite(origin.y))
        : (hasOrigin ? [options.origin] : null);
      player.actionOrigin = hasOrigin ? { x: options.origin.x, y: options.origin.y } : null;
      player.actionDirection = Number.isFinite(options.dirX) || Number.isFinite(options.dirY)
        ? { x: Number.isFinite(options.dirX) ? options.dirX : player.dirX, y: Number.isFinite(options.dirY) ? options.dirY : player.dirY }
        : null;
      player.actionVfxOrigins = origins && origins.length
        ? origins.map((origin) => ({
          x: origin.x,
          y: origin.y,
          dirX: Number.isFinite(origin.dirX) ? origin.dirX : (player.actionDirection ? player.actionDirection.x : player.dirX),
          dirY: Number.isFinite(origin.dirY) ? origin.dirY : (player.actionDirection ? player.actionDirection.y : player.dirY)
        }))
        : null;
    }

    clearActionOrigin() {
      if (!this.player) return;
      this.player.actionOrigin = null;
      this.player.actionDirection = null;
      this.player.actionVfxOrigins = null;
      this.player.actionVfxScale = 1;
      this.player.actionVfxDisabled = false;
    }

    triggerCharacterSkill(skillId, options = {}) {
      const player = this.player;
      if (!player || !skillId) return false;
      const spec = this.characterActionSpec(player.classId, 'skill', skillId);
      if (!spec || !this.assetImage(spec.key)) return false;
      const force = Boolean(options.force);
      const minGap = options.minGap === undefined ? 0.08 : options.minGap;
      if (!force && this.now - (player.lastActionAt || -Infinity) < minGap) return false;
      if (!force && player.actionState === 'skill' && player.actionElapsed < 0.14) return false;
      player.actionState = 'skill';
      player.actionSkill = skillId;
      player.actionElapsed = 0;
      player.actionEventFired = false;
      player.actionVfxDisabled = Boolean(options.suppressVfx);
      player.actionVfxScale = Number.isFinite(options.vfxScale) ? clamp(options.vfxScale, 0.5, 3) : 1;
      player.lastActionAt = this.now;
      this.setActionOrigin(options);
      return true;
    }

    triggerCharacterAttack(options = {}) {
      const player = this.player;
      if (!player) return false;
      const spec = this.characterActionSpec(player.classId, 'attack');
      if (!spec || !this.assetImage(spec.key)) return false;
      const force = Boolean(options.force);
      const minGap = options.minGap === undefined ? 0.04 : options.minGap;
      if (!force && this.now - (player.lastActionAt || -Infinity) < minGap) return false;
      // A special skill keeps its own pose until it finishes. Ordinary attacks
      // should not replace a visible skill action halfway through.
      if (!force && player.actionState === 'skill') return false;
      player.actionState = 'attack';
      player.actionSkill = null;
      player.actionElapsed = 0;
      player.actionEventFired = false;
      player.actionVfxDisabled = false;
      player.actionVfxScale = Number.isFinite(options.vfxScale) ? clamp(options.vfxScale, 0.5, 3) : 1;
      player.lastActionAt = this.now;
      this.setActionOrigin(options);
      return true;
    }

    emitCharacterVfx(vfxId, options = {}) {
      if (!vfxId || !this.player) return false;
      const spec = this.assets && this.assets.manifest && this.assets.manifest.vfx && this.assets.manifest.vfx[vfxId];
      if (!spec) return false;
      const dirX = Number.isFinite(options.dirX) ? options.dirX : (this.player.actionDirection ? this.player.actionDirection.x : (this.player.dirX || 1));
      const dirY = Number.isFinite(options.dirY) ? options.dirY : (this.player.actionDirection ? this.player.actionDirection.y : (this.player.dirY || 0));
      let origins = Array.isArray(options.origins)
        ? options.origins.filter((origin) => origin && Number.isFinite(origin.x) && Number.isFinite(origin.y))
        : [];
      if (!origins.length && options.origin && Number.isFinite(options.origin.x) && Number.isFinite(options.origin.y)) origins = [options.origin];
      if (!origins.length && (vfxId === 'muzzle_flash' || vfxId === 'railgun_beam')) {
        origins = [this.getWeaponMuzzle(this.player, dirX, dirY)];
      }
      if (!origins.length) origins = [{ x: this.player.x, y: this.player.y, dirX, dirY }];
      origins = origins.map((origin) => ({
        x: origin.x,
        y: origin.y,
        dirX: Number.isFinite(origin.dirX) ? origin.dirX : dirX,
        dirY: Number.isFinite(origin.dirY) ? origin.dirY : dirY
      }));
      this.player.activeVfx = {
        id: vfxId,
        elapsed: 0,
        duration: spec.loop ? Math.max(0.32, spec.frameCount / spec.fps) : spec.frameCount / spec.fps,
         dirX,
         dirY,
         origins,
         scale: Number.isFinite(options.scale) ? clamp(options.scale, 0.5, 3) : 1
      };
      return true;
    }

    updateCharacterAnimation(dt) {
      const player = this.player;
      if (!player) return;
      if (player.activeVfx) {
        player.activeVfx.elapsed += dt;
        const vfxSpec = this.assets && this.assets.manifest && this.assets.manifest.vfx && this.assets.manifest.vfx[player.activeVfx.id];
        if (!vfxSpec || player.activeVfx.elapsed >= player.activeVfx.duration) player.activeVfx = null;
      }
      if (player.actionState === 'skill' || player.actionState === 'attack') {
        const actionState = player.actionState;
        const spec = actionState === 'skill'
          ? this.characterActionSpec(player.classId, 'skill', player.actionSkill)
          : this.characterActionSpec(player.classId, 'attack');
        const frameCount = spec ? spec.frameCount : 5;
        const fps = spec ? spec.fps : 12;
        const eventFrame = spec && spec.eventFrame !== null && spec.eventFrame !== undefined ? spec.eventFrame : Math.floor(frameCount * 0.45);
        player.actionElapsed += dt;
        if (!player.actionEventFired && player.actionElapsed >= eventFrame / fps) {
          player.actionEventFired = true;
          if (spec && !player.actionVfxDisabled) {
            const fallbackVfx = player.classId === 'gunner' ? 'muzzle_flash' : (player.classId === 'warrior' ? 'slash_arc' : 'drone_muzzle');
            this.emitCharacterVfx(spec.vfx || fallbackVfx, {
              origin: player.actionOrigin,
              origins: player.actionVfxOrigins,
              scale: player.actionVfxScale,
              dirX: player.actionDirection && player.actionDirection.x,
              dirY: player.actionDirection && player.actionDirection.y
            });
          }
        }
        const fullDuration = frameCount / fps;
        const duration = actionState === 'attack' && player.moving ? Math.min(fullDuration, 0.16) : fullDuration;
        if (player.actionElapsed >= duration) {
          player.actionState = player.moving ? 'walk' : 'idle';
          player.actionSkill = null;
          player.actionElapsed = 0;
          player.actionEventFired = false;
          this.clearActionOrigin();
        }
      } else if (player.moving) {
        player.actionState = 'walk';
        player.actionSkill = null;
        player.actionElapsed += dt;
        this.clearActionOrigin();
      } else {
        player.actionState = 'idle';
        player.actionSkill = null;
        player.actionElapsed = 0;
        this.clearActionOrigin();
      }
    }

    update(dt) {
      const world = this.world;
      const player = this.player;
      if (!world || !player || this.exitModal || this.save.firstRun) return;
      world.time += dt;
      world.animTime += dt;
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
      player.animTime += dt;
      player.movePhase += dt * (player.moving ? 8 : 2);
      this.updateCharacterAnimation(dt);
      this.updateMission(dt);
      this.updateSpawning(dt);
      this.updateEnemies(dt);
      this.updateCombat(dt, stats);
      this.updateProjectiles(dt);
      this.updatePickups(dt, stats.pickupRange);
      this.updateHazards(dt);
      this.updateWorldVfx(dt);
      this.updateCache();
      this.updateExtraction(dt);
      this.updateParticles(dt);
      const extractionPressure = world.missionComplete && dist(player, world.extraction) < 140;
      this.audio.intensity(extractionPressure ? 1 : clamp(world.enemies.length / 42 + world.time / 1200, 0.08, 0.82));
      this.syncMusic();

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
      this.player.moving = Math.hypot(vx, vy) > 0.05;
      this.moveActorWithPropCollision(
        this.player,
        vx * stats.speed * dt,
        vy * stats.speed * dt,
        10,
        { minX: 28, maxX: this.world.width - 28, minY: 40, maxY: this.world.height - 28 }
      );
      if (this.player.classId === 'gunner' && this.getCardLevel('emergency_dash') > 0 && this.player.boostCooldown <= 0) {
        const nearby = this.world.enemies.filter((enemy) => !enemy.dead && dist(enemy, this.player) < 110).length;
        if (nearby >= 7) {
          this.player.boostTimer = 0.8 + this.getCardLevel('emergency_dash') * 0.2;
          this.player.boostCooldown = 8 - this.getCardLevel('emergency_dash') * 1.2;
          this.triggerCharacterSkill('emergency_dash');
          if (this.hasEvolution('critical_dash')) {
            this.emitComboFeedback('critical_dash', this.player.x, this.player.y, {
              dirX: this.player.dirX, dirY: this.player.dirY
            });
          }
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
        if (target && dist(target, this.player) < (target.radius || 72)) {
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
      this.addDailyProgress('missions');
      this.notify('主任务完成', '撤离许可已生成 // 加班自愿', DATA.palette.acid, 3.2);
      this.audio.play('mission_complete');
      this.flash = 0.5;
    }

    updateSpawning(dt) {
      const world = this.world;
      const difficultyConfig = DATA.difficulty || {};
      world.spawnTimer -= dt;
      const maxEnemies = Number.isFinite(difficultyConfig.maxEnemies) ? difficultyConfig.maxEnemies : 145;
      if (world.spawnTimer > 0 || world.enemies.length >= maxEnemies) return;
      const pressureRampSeconds = Number.isFinite(difficultyConfig.pressureRampSeconds)
        ? Math.max(1, difficultyConfig.pressureRampSeconds)
        : 420;
      const pressure = clamp(world.time / pressureRampSeconds, 0, 1);
      const extracting = world.missionComplete && dist(this.player, world.extraction) < 130;
      const extractionConfig = DATA.extraction || {};
      const doubleSpawnChance = Number.isFinite(difficultyConfig.doubleSpawnChance)
        ? clamp(difficultyConfig.doubleSpawnChance, 0, 1)
        : 0.30;
      const count = extracting
        ? (world.random() < (Number.isFinite(extractionConfig.extraEnemyChance) ? extractionConfig.extraEnemyChance : 0.5) ? 2 : 1)
        : (world.random() < pressure * doubleSpawnChance ? 2 : 1);
      for (let index = 0; index < count; index += 1) this.spawnEnemy();
      const earlySpawnPace = Number.isFinite(difficultyConfig.earlySpawnPace) ? difficultyConfig.earlySpawnPace : 1.22;
      const standardSpawnPace = Number.isFinite(difficultyConfig.standardSpawnPace) ? difficultyConfig.standardSpawnPace : 0.85;
      const pressureDrop = Number.isFinite(difficultyConfig.pressureDrop) ? difficultyConfig.pressureDrop : 0.5;
      const onboardingPace = world.time < 25 ? earlySpawnPace : standardSpawnPace;
      const extractionMultiplier = Number.isFinite(extractionConfig.spawnTimerMultiplier)
        ? extractionConfig.spawnTimerMultiplier
        : 0.60;
      world.spawnTimer = Math.max(0.28, onboardingPace - pressure * pressureDrop) * (extracting ? extractionMultiplier : 1);
    }

    spawnEnemy(options = {}) {
      const world = this.world;
      const angle = world.random() * TAU;
      const radius = 280 + world.random() * 190;
      const x = clamp(this.player.x + Math.cos(angle) * radius, 24, world.width - 24);
      const y = clamp(this.player.y + Math.sin(angle) * radius, 40, world.height - 24);
      const age = world.time;
      const difficultyConfig = DATA.difficulty || {};
      const hpMultiplier = Number.isFinite(difficultyConfig.enemyHpMultiplier) ? difficultyConfig.enemyHpMultiplier : 1;
      const damageMultiplier = Number.isFinite(difficultyConfig.enemyDamageMultiplier) ? difficultyConfig.enemyDamageMultiplier : 1;
      const speedMultiplier = Number.isFinite(difficultyConfig.enemySpeedMultiplier) ? difficultyConfig.enemySpeedMultiplier : 1;
      const growthSeconds = Number.isFinite(difficultyConfig.enemyGrowthSeconds)
        ? Math.max(1, difficultyConfig.enemyGrowthSeconds)
        : 900;
      const xpMultiplier = Number.isFinite(difficultyConfig.xpMultiplier) ? difficultyConfig.xpMultiplier : 1;
      let type = 'swarm';
      const roll = world.random();
      const shooterStartSeconds = Number.isFinite(difficultyConfig.shooterStartSeconds) ? difficultyConfig.shooterStartSeconds : 70;
      const chargerStartSeconds = Number.isFinite(difficultyConfig.chargerStartSeconds) ? difficultyConfig.chargerStartSeconds : 35;
      const bloaterStartSeconds = Number.isFinite(difficultyConfig.bloaterStartSeconds) ? difficultyConfig.bloaterStartSeconds : 120;
      if (age > shooterStartSeconds && roll > 0.78) type = 'shooter';
      else if (age > chargerStartSeconds && roll > 0.58) type = 'charger';
      else if (age > bloaterStartSeconds && roll < 0.12) type = 'bloater';
      const scale = 1 + age / growthSeconds;
      const templates = {
        swarm: { hp: 24, speed: 39, damage: 8, radius: 10, xp: 5 },
        shooter: { hp: 42, speed: 30, damage: 7, radius: 12, xp: 8 },
        charger: { hp: 68, speed: 31, damage: 13, radius: 15, xp: 10 },
        bloater: { hp: 112, speed: 22, damage: 16, radius: 19, xp: 14 }
      };
      const base = templates[type];
      const elite = Boolean(options.elite);
      const enemySet = DATA.enemySets[this.contract.planet.id] || DATA.enemySets.rust;
      const visual = enemySet.find((entry) => entry.id === type);
      const planetId = this.contract.planet.id;
      const speciesId = (ENEMY_ASSET_IDS[planetId] && ENEMY_ASSET_IDS[planetId][type]) || null;
      const enemy = {
        id: `e-${Math.floor(world.random() * 1e9)}`,
        x: options.x || x,
        y: options.y || y,
        vx: 0,
        vy: 0,
        type: elite ? 'elite' : type,
        // 精英沿用当前生态对应行为的基础贴图放大显示；皇冠仅作为
        // “高收益目标”标记，避免运行时只剩一个占位图形。
        visual: visual ? visual.asset : null,
        visual: visual ? visual.asset : null,
        visualId: speciesId || (visual ? visual.id : null),
        dangerVisual: speciesId ? `enemy.danger.${planetId}.${speciesId}` : null,
        eliteVisual: speciesId ? `enemy.elite.${planetId}.${speciesId}` : null,
        eliteDangerVisual: speciesId ? `enemy.eliteDanger.${planetId}.${speciesId}` : null,
        visualType: type,
        elite,
        hp: elite
          ? (Number.isFinite(difficultyConfig.eliteHp) ? difficultyConfig.eliteHp : 1450)
          : Math.round(base.hp * scale * hpMultiplier),
        maxHp: elite
          ? (Number.isFinite(difficultyConfig.eliteHp) ? difficultyConfig.eliteHp : 1450)
          : Math.round(base.hp * scale * hpMultiplier),
        speed: elite
          ? 27 * speedMultiplier
          : base.speed * speedMultiplier * (1 + age / (growthSeconds * 1.8)),
        damage: elite
          ? (Number.isFinite(difficultyConfig.eliteDamage) ? difficultyConfig.eliteDamage : 19)
          : base.damage * scale * damageMultiplier,
        radius: elite ? 28 : base.radius,
        xp: Math.max(1, Math.round((elite ? 75 : base.xp) * xpMultiplier)),
        shootTimer: 1.3 + world.random(),
        chargeTimer: 2 + world.random() * 2,
        orbitCd: 0,
        hitFlash: 0,
        dangerPulse: 0,
        contactVfxCooldown: 0,
        attackVfxCooldown: 0,
        actionState: 'idle',
        actionElapsed: 0,
        actionEventFired: false,
        chargeTelegraph: false,
        shootTelegraph: false,
        bloaterTelegraph: false,
        bloaterTimer: 2.8 + world.random() * 1.2,
        animTime: world.random() * TAU,
        dead: false
      };
      // Explicit elite/cache positions can still land beside a prop; resolve
      // the spawn once before the enemy enters the simulation.
      this.moveActorWithPropCollision(enemy, 0, 0, enemy.radius);
      world.enemies.push(enemy);
      if (elite) {
        world.eliteId = enemy.id;
        this.notify(this.contract.planet.elite, '可选高收益目标已进入工位', this.contract.planet.accent, 2.6);
        this.audio.play('elite');
      }
      return enemy;
    }

    updateEnemies(dt) {
      const world = this.world;
      const stats = this.currentStats();
      const difficultyConfig = DATA.difficulty || {};
      for (const enemy of world.enemies) {
        if (enemy.dead) {
          // Keep defeated enemies around for the short death sheet so the
          // newly-authored death silhouettes are actually visible.  They are
          // already excluded from targeting/collision by `dead`.
          enemy.actionState = 'death';
          enemy.actionElapsed = (enemy.actionElapsed || 0) + dt;
          const deathSpec = this.enemyActionSpec(enemy, 'death');
          const deathDuration = deathSpec ? deathSpec.frameCount / deathSpec.fps : 0.35;
          if (enemy.actionElapsed >= deathDuration) enemy.removeAt = true;
          continue;
        }
        const behavior = enemy.visualType || enemy.type;
        const planet = this.contract.planet.id;
        enemy.animTime += dt * (behavior === 'swarm' ? 10 : (behavior === 'bloater' ? 3 : 6));
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 8);
        enemy.dangerPulse = Math.max(0, (enemy.dangerPulse || 0) - dt);
        enemy.contactVfxCooldown = Math.max(0, (enemy.contactVfxCooldown || 0) - dt);
        enemy.attackVfxCooldown = Math.max(0, (enemy.attackVfxCooldown || 0) - dt);
        enemy.actionElapsed += dt;
        const actionSpec = this.enemyActionSpec(enemy, enemy.actionState || 'idle');
        const actionDuration = actionSpec ? actionSpec.frameCount / actionSpec.fps : 0.25;
        if (enemy.actionState === 'attack' || enemy.actionState === 'hit' || enemy.actionState === 'death') {
          if (enemy.actionElapsed >= actionDuration) {
            enemy.actionState = 'walk';
            enemy.actionElapsed = 0;
          }
        } else if (enemy.actionState !== 'idle') {
          enemy.actionState = 'walk';
        }
        enemy.orbitCd = Math.max(0, enemy.orbitCd - dt);
        const dx = this.player.x - enemy.x;
        const dy = this.player.y - enemy.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        let speed = enemy.speed;
        if (this.anomalyIs('energy_tide') && this.energyTideActive()) speed *= 1.2;

        if (behavior === 'shooter' && length < 230) speed *= -0.25;
        if (behavior === 'charger' || enemy.elite) {
          enemy.chargeTimer -= dt;
          if (enemy.chargeTimer < 0.55 && enemy.chargeTimer > 0) {
            speed *= 0.12;
            if (!enemy.chargeTelegraph) {
              enemy.chargeTelegraph = true;
              this.triggerEnemyAction(enemy, 'attack', 'charger_charge', { layer: 'under', dangerDuration: 0.7, duration: 0.55 });
            }
          }
          if (enemy.chargeTimer <= 0) {
            const burstMultiplier = enemy.elite
              ? (Number.isFinite(difficultyConfig.eliteBurstMultiplier) ? difficultyConfig.eliteBurstMultiplier : 4.5)
              : (Number.isFinite(difficultyConfig.chargerBurstMultiplier) ? difficultyConfig.chargerBurstMultiplier : 5.2);
            speed *= burstMultiplier;
            if (enemy.chargeTimer < -0.42) {
              enemy.chargeTimer = enemy.elite ? 2.7 : 3.8;
              enemy.chargeTelegraph = false;
            }
          }
        }
        if (behavior === 'bloater') {
          enemy.bloaterTimer -= dt;
          if (enemy.bloaterTimer <= 0 && length < 175 && !enemy.bloaterTelegraph) {
            enemy.bloaterTelegraph = true;
            this.triggerEnemyAction(enemy, 'attack', 'bloater_inflate', { layer: 'under', dangerDuration: 0.7, duration: 1.1 });
            enemy.bloaterTimer = 4.6;
          }
          if (enemy.bloaterTelegraph && enemy.bloaterTimer < 3.3) enemy.bloaterTelegraph = false;
        }
        enemy.vx = lerp(enemy.vx, dx / length * speed, 1 - Math.pow(0.02, dt));
        enemy.vy = lerp(enemy.vy, dy / length * speed, 1 - Math.pow(0.02, dt));
        this.moveActorWithPropCollision(enemy, enemy.vx * dt, enemy.vy * dt, enemy.radius);
        if (enemy.actionState === 'idle' && Math.hypot(enemy.vx, enemy.vy) > 4) enemy.actionState = 'walk';
        if (enemy.actionState === 'walk' && Math.hypot(enemy.vx, enemy.vy) <= 4) enemy.actionState = 'idle';

        if ((behavior === 'shooter' || enemy.elite) && length < 310) {
          enemy.shootTimer -= dt;
          if (enemy.shootTimer < 0.48 && enemy.shootTimer > 0 && !enemy.shootTelegraph) {
            enemy.shootTelegraph = true;
            this.triggerEnemyAction(enemy, 'attack', 'shooter_charge', { layer: 'under', dangerDuration: 0.5, duration: 0.48 });
          }
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
            this.triggerEnemyAction(enemy, 'attack', 'shooter_fire', { layer: 'over', dangerDuration: 0.24, duration: 0.22 });
            enemy.shootTelegraph = false;
            enemy.shootTimer = enemy.elite ? 1.4 : 2.1;
          }
        }

        if (length < enemy.radius + 13) {
          if (enemy.contactVfxCooldown <= 0) {
            const contactEffect = behavior === 'charger' || enemy.elite ? 'charger_impact'
              : (behavior === 'bloater' ? 'bloater_burst' : 'swarm_attack');
            this.triggerEnemyAction(enemy, 'attack', contactEffect, { layer: 'over', dangerDuration: 0.3, duration: 0.35 });
            enemy.contactVfxCooldown = 0.7;
          }
          if (this.player.invuln <= 0) this.hurtPlayer(enemy.damage, enemy.x, enemy.y, stats);
        }
      }
      world.enemies = world.enemies.filter((enemy) => !enemy.removeAt);

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
        if (this.hasEvolution('phantom_counter')) {
          this.triggerCharacterSkill('phantom_counter', { suppressVfx: true, minGap: 0.12 });
          this.emitComboFeedback('phantom_counter', this.player.x, this.player.y);
          this.radialDamage(this.player.x, this.player.y, 95, stats.damage * 1.6, DATA.palette.acid);
        }
        return;
      }
      const dealt = Math.max(1, amount * (1 - stats.reduction));
      this.player.hp -= dealt;
      this.player.invuln = 0.62;
      this.shake = 5;
      this.flash = 0.16;
      this.spawnText(this.player.x, this.player.y - 24, `-${Math.ceil(dealt)}`, DATA.palette.danger);
      this.audio.play('hurt');

      if (this.player.classId === 'warrior' && this.hasEvolution('iron_fury')) {
        this.emitComboFeedback('iron_fury', this.player.x, this.player.y, {
          dirX: sourceX - this.player.x, dirY: sourceY - this.player.y
        });
      }

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
      this.moveActorWithPropCollision(this.player, dx / length * 12, dy / length * 12, 10, {
        minX: 28, maxX: this.world.width - 28, minY: 40, maxY: this.world.height - 28
      });
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
          this.triggerCharacterSkill('reload');
        }
      }
      const target = this.nearestTarget(player.x, player.y, DATA.classById.gunner.base.range);
      if (player.attackTimer <= 0 && player.reloadTimer <= 0 && target) {
        const burst = this.getCardLevel('burst');
        const scatter = this.getCardLevel('scatter');
        const count = Math.min(8, 1 + burst + scatter * 2);
        const shot = this.getWeaponShot(target);
        const baseAngle = shot ? shot.angle : Math.atan2(target.ref.y - player.y, target.ref.x - player.x);
        const muzzle = shot ? shot.origin : this.getWeaponMuzzle(player, player.dirX, player.dirY);
        const comboIds = [];
        if (this.hasEvolution('piercing_star')) comboIds.push('piercing_star');
        if (this.hasEvolution('hunt_barrage')) comboIds.push('hunt_barrage');
        const comboCycleId = ++player.attackCycleId;
        player.dirX = shot ? shot.dirX : Math.cos(baseAngle);
        player.dirY = shot ? shot.dirY : Math.sin(baseAngle);
        const spread = scatter > 0 ? 0.12 + scatter * 0.035 : 0.035;
        for (let index = 0; index < count; index += 1) {
          const angle = baseAngle + (index - (count - 1) / 2) * spread;
          this.spawnPlayerProjectile(
            muzzle.x,
            muzzle.y,
            angle,
            stats.damage / (1 + Math.max(0, count - 1) * 0.08),
            'gun',
            { comboIds, comboCycleId }
          );
        }
        player.ammo -= 1;
        player.attackTimer = stats.interval;
        this.audio.play('shot');
        this.triggerCharacterAttack({ origin: muzzle, dirX: player.dirX, dirY: player.dirY });
        if (this.hasEvolution('burst_overdrive')) {
          this.emitComboFeedback('burst_overdrive', target.ref.x, target.ref.y, {
            cycleId: comboCycleId,
            dirX: player.dirX,
            dirY: player.dirY
          });
        }
        if (this.hasEvolution('hunt_barrage')) {
          this.emitComboFeedback('hunt_barrage', target.ref.x, target.ref.y, {
            cycleId: comboCycleId,
            dirX: player.dirX,
            dirY: player.dirY
          });
        }
        if (player.ammo <= 0) {
          const reloadLevel = this.getCardLevel('reload');
          player.reloadTimer = 1.18 * (1 - reloadLevel * 0.13);
          this.triggerCharacterSkill('reload');
        }
      }
      const railLevel = this.getCardLevel('railgun');
      if (railLevel > 0) {
        player.railTimer -= dt;
        if (player.railTimer <= 0 && target) {
          const shot = this.getWeaponShot(target);
          const angle = shot ? shot.angle : Math.atan2(target.ref.y - player.y, target.ref.x - player.x);
          const muzzle = shot ? shot.origin : this.getWeaponMuzzle(player, player.dirX, player.dirY);
          player.dirX = shot ? shot.dirX : Math.cos(angle);
          player.dirY = shot ? shot.dirY : Math.sin(angle);
          this.lineDamage(muzzle.x, muzzle.y, angle, 520, 12 + railLevel * 3, stats.damage * (2.2 + railLevel * 0.55));
          player.railTimer = 6.2 - railLevel * 0.85;
          player.railCycleId = (player.railCycleId || 0) + 1;
          this.triggerCharacterSkill('railgun', { origin: muzzle, dirX: player.dirX, dirY: player.dirY });
          if (this.hasEvolution('railgun_overcharge')) {
            this.emitComboFeedback('railgun_overcharge', muzzle.x, muzzle.y, {
              dirX: player.dirX, dirY: player.dirY, cycleId: player.railCycleId
            });
          }
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
          this.triggerCharacterSkill('zero_storm', { suppressVfx: true });
          this.emitComboFeedback('zero_storm', player.x, player.y, { dirX: player.dirX, dirY: player.dirY });
          this.audio.play('blast');
        }
      }
    }

    spawnPlayerProjectile(x, y, angle, damage, source, options = {}) {
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
        comboIds: Array.isArray(options.comboIds) ? options.comboIds.slice() : [],
        comboCycleId: options.comboCycleId === undefined ? null : options.comboCycleId,
        hitIds: []
      });
    }

    turretHeadProjection(angle) {
      const rotation = angle + Math.PI / 2;
      const sideView = Math.abs(Math.sin(rotation));
      return {
        rotation,
        depth: 1 - sideView * (1 - TURRET_SIDE_DEPTH)
      };
    }

    turretMuzzlePosition(turret, angle) {
      const projection = this.turretHeadProjection(angle);
      const muzzleDistance = (TURRET_HEAD_PIVOT_Y - TURRET_MUZZLE_Y)
        * TURRET_DRAW_SCALE * projection.depth;
      return {
        x: turret.x + Math.cos(angle) * muzzleDistance,
        y: turret.y + Math.sin(angle) * muzzleDistance
      };
    }

    updateWarrior(dt, stats) {
      const player = this.player;
      const cleave = this.getCardLevel('cleave');
      const target = this.nearestTarget(player.x, player.y, 92 + cleave * 13);
      if (player.attackTimer <= 0 && target) {
        const angle = Math.atan2(target.ref.y - player.y, target.ref.x - player.x);
        const attackDirX = Math.cos(angle);
        const attackDirY = Math.sin(angle);
        const bladeOrigin = this.getWeaponMuzzle(player, attackDirX, attackDirY);
        const range = 76 + cleave * 13;
        const arc = 1.15 + cleave * 0.16;
        const slashVisualScale = clamp(range / 70, 1.08, 1.78);
        this.arcDamage(player.x, player.y, angle, range, arc, stats.damage * (1 + cleave * 0.1));
        player.dirX = attackDirX;
        player.dirY = attackDirY;
        player.attackCount += 1;
        const slashSpec = this.assets && this.assets.manifest && this.assets.manifest.vfx && this.assets.manifest.vfx.slash_arc;
        // Preserve the procedural arc only as a missing-asset fallback. Drawing
        // it together with V17 produced the old orange circle over the new art.
        if (!slashSpec || !this.assetImage(slashSpec.key)) {
          this.world.particles.push({ type: 'slash', x: player.x, y: player.y, angle, range, life: 0.18, max: 0.18, color: DATA.classById.warrior.color });
        }
        if (this.hasEvolution('rift_slash')) {
          this.triggerCharacterSkill('rift_slash', { suppressVfx: true, origin: bladeOrigin, dirX: attackDirX, dirY: attackDirY });
          this.emitComboFeedback('rift_slash', bladeOrigin.x, bladeOrigin.y, { dirX: attackDirX, dirY: attackDirY });
        } else this.triggerCharacterAttack({ origin: bladeOrigin, dirX: attackDirX, dirY: attackDirY, vfxScale: slashVisualScale });
        if (this.hasEvolution('fury_combo')) {
          this.emitComboFeedback('fury_combo', bladeOrigin.x, bladeOrigin.y, {
            cycleId: player.attackCount, dirX: attackDirX, dirY: attackDirY
          });
        }
        if (this.hasEvolution('blood_oath') && player.hp / player.maxHp < 0.34) {
          this.emitComboFeedback('blood_oath', player.x, player.y, {
            cycleId: player.attackCount, dirX: attackDirX, dirY: attackDirY
          });
        }
        const doubleLevel = this.getCardLevel('double_slash');
        if (doubleLevel > 0 && Math.random() < 0.2 + doubleLevel * 0.16) {
          this.arcDamage(player.x, player.y, angle + 0.18, range, arc, stats.damage * (0.55 + doubleLevel * 0.13));
          this.triggerCharacterSkill('double_slash', { origin: bladeOrigin, dirX: attackDirX, dirY: attackDirY, vfxScale: slashVisualScale, force: true });
        }
        const waveLevel = this.getCardLevel('sword_wave');
        const every = waveLevel >= 2 ? 3 : 4;
        if (waveLevel > 0 && player.attackCount % every === 0) {
          // The travelling projectile owns the sword-wave art. Suppress the
          // character-layer copy so one attack never shows two overlapping
          // waves at the sword hand.
          if (!this.hasEvolution('rift_slash')) this.triggerCharacterSkill('sword_wave', { origin: bladeOrigin, dirX: attackDirX, dirY: attackDirY, suppressVfx: true, force: true });
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
              source: 'wave', pierce: 4, bounce: 0, chain: 0, explosion: 0, knockback: 1, hitIds: [], age: 0
            });
          }
        }
        player.attackTimer = stats.interval;
        this.audio.play('slash');
      }

      const orbitLevel = this.getCardLevel('orbit_blade');
      if (orbitLevel > 0) {
        if (Math.floor(this.world.time * 2) % 8 === 0) {
          const orbitSkill = this.hasEvolution('star_ring') ? 'star_ring' : 'orbit_blade';
          // The persistent orbiting swords are rendered at their actual orbit
          // positions below. Do not also flash one sword at the astronaut's
          // center on every pulse.
          this.triggerCharacterSkill(orbitSkill, { minGap: 0.4, suppressVfx: true });
          if (this.hasEvolution('star_ring')) this.emitComboFeedback('star_ring', player.x, player.y);
        }
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
        const shotOrigins = [];
        for (let index = 0; index < droneCount; index += 1) {
          const orbitAngle = this.world.time * 1.2 + index / droneCount * TAU;
          const x = player.x + Math.cos(orbitAngle) * 38;
          const y = player.y + Math.sin(orbitAngle) * 25;
          const angle = Math.atan2(target.ref.y - y, target.ref.x - x);
          this.spawnPlayerProjectile(x, y, angle, stats.damage * (1 + droneLevel * 0.16), 'drone');
          shotOrigins.push({ x, y, dirX: Math.cos(angle), dirY: Math.sin(angle) });
        }
        player.attackTimer = stats.interval;
        this.audio.play('drone');
        const swarmProtocolActive = this.hasEvolution('swarm_protocol');
        const parallelOverclockActive = this.hasEvolution('parallel_overclock');
        if (swarmProtocolActive) {
          this.triggerCharacterSkill('swarm_protocol', { suppressVfx: true });
          this.emitComboFeedback('swarm_protocol', player.x, player.y);
        }
        if (parallelOverclockActive) {
          this.triggerCharacterSkill('parallel_overclock', { suppressVfx: true });
          this.emitComboFeedback('parallel_overclock', player.x, player.y);
        }
        if (!swarmProtocolActive && !parallelOverclockActive) {
          this.triggerCharacterAttack({ origins: shotOrigins, dirX: shotOrigins[0].dirX, dirY: shotOrigins[0].dirY });
        }
      }

      const turretLevel = this.getCardLevel('turret');
      if (turretLevel > 0 && !this.hasEvolution('mobile_fortress')) {
        player.turretTimer -= dt;
        if (player.turretTimer <= 0) {
          this.world.turrets.push({
            x: player.x,
            y: player.y,
            life: 18 + this.getCardLevel('quick_deploy') * 4,
            shot: 0.2,
            level: turretLevel,
            aimAngle: -Math.PI / 2
          });
          const maxTurrets = 1 + (turretLevel >= 2 ? 1 : 0);
          while (this.world.turrets.length > maxTurrets) this.world.turrets.shift();
          player.turretTimer = Math.max(4, 12 - this.getCardLevel('quick_deploy') * 2.2);
          if (this.getCardLevel('quick_deploy') >= 3) this.radialDamage(player.x, player.y, 65, stats.damage * 0.8, DATA.palette.cyan);
          this.audio.play('deploy_turret');
          this.triggerCharacterSkill(this.hasEvolution('mobile_fortress') ? 'mobile_fortress' : 'turret');
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
          this.triggerCharacterSkill('mobile_fortress', { minGap: 0.35, suppressVfx: true });
          this.emitComboFeedback('mobile_fortress', player.x, player.y);
        }
      }

      for (const turret of this.world.turrets) {
        turret.life -= dt;
        turret.shot -= dt;
        const turretTarget = this.nearestTarget(turret.x, turret.y, 260);
        if (turretTarget) {
          const targetAngle = Math.atan2(turretTarget.ref.y - turret.y, turretTarget.ref.x - turret.x);
          const currentAngle = Number.isFinite(turret.aimAngle) ? turret.aimAngle : -Math.PI / 2;
          let delta = targetAngle - currentAngle;
          while (delta > Math.PI) delta -= TAU;
          while (delta < -Math.PI) delta += TAU;
          turret.aimAngle = currentAngle + delta * Math.min(1, dt * 12);
        }
        if (turret.shot <= 0 && turretTarget) {
          const angle = Number.isFinite(turret.aimAngle)
            ? turret.aimAngle
            : Math.atan2(turretTarget.ref.y - turret.y, turretTarget.ref.x - turret.x);
          const muzzle = this.turretMuzzlePosition(turret, angle);
          this.spawnPlayerProjectile(muzzle.x, muzzle.y, angle, stats.damage * (0.7 + turret.level * 0.18), 'drone');
          this.emitWorldVfx(null, 'drone_muzzle', muzzle.x, muzzle.y, {
            layer: 'over',
            duration: 0.22,
            scale: 0.9,
            dirX: Math.cos(angle),
            dirY: Math.sin(angle)
          });
          turret.shot = 0.8 - this.getCardLevel('overclock') * 0.08;
        }
      }
      this.world.turrets = this.world.turrets.filter((turret) => turret.life > 0);

      const repair = this.getCardLevel('repair_bot');
      if (repair > 0) {
        if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + dt * repair * 0.34);
        const repairPulseTick = Math.floor(this.world.time * 2);
        if (repairPulseTick !== player.lastRepairPulseTick && repairPulseTick % 12 === 0) {
          player.lastRepairPulseTick = repairPulseTick;
          this.triggerCharacterSkill('repair_bot', { minGap: 0.5 });
          if (this.hasEvolution('field_reconstruction')) this.emitComboFeedback('field_reconstruction', player.x, player.y);
        }
      }

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
          if (this.hasEvolution('infinite_recycle')) {
            this.triggerCharacterSkill('infinite_recycle', { suppressVfx: true });
            this.emitComboFeedback('infinite_recycle', x, y);
          } else this.triggerCharacterSkill('self_destruct');
          this.audio.play('blast');
        }
      }
    }

    segmentCircleHit(startX, startY, endX, endY, centerX, centerY, radius) {
      const dx = endX - startX;
      const dy = endY - startY;
      const lengthSquared = dx * dx + dy * dy;
      const projection = lengthSquared > 0.000001
        ? clamp(((centerX - startX) * dx + (centerY - startY) * dy) / lengthSquared, 0, 1)
        : 0;
      const closestX = startX + dx * projection;
      const closestY = startY + dy * projection;
      const offsetX = centerX - closestX;
      const offsetY = centerY - closestY;
      const hitRadius = Math.max(0, radius);
      if (offsetX * offsetX + offsetY * offsetY > hitRadius * hitRadius) return null;
      return { t: projection, x: closestX, y: closestY };
    }

    updateProjectiles(dt) {
      const world = this.world;
      for (const projectile of world.projectiles) {
        const startX = projectile.x;
        const startY = projectile.y;
        const endX = startX + projectile.vx * dt;
        const endY = startY + projectile.vy * dt;
        projectile.x = endX;
        projectile.y = endY;
        projectile.age = (projectile.age || 0) + dt;
        projectile.life -= dt;
        if (projectile.life <= 0) continue;
        let hit = null;
        let hitT = Infinity;
        const considerHit = (kind, ref, radius) => {
          const result = this.segmentCircleHit(startX, startY, endX, endY, ref.x, ref.y, radius);
          if (result && result.t < hitT) {
            hit = { kind, ref };
            hitT = result.t;
          }
        };
        for (const enemy of world.enemies) {
          if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue;
          considerHit('enemy', enemy, enemy.radius + projectile.radius);
        }
        if (!hit && world.objective.id === 'nests' && !world.missionComplete) {
          for (const objective of world.objective.items) {
            if (!objective.dead) considerHit('objective', objective, objective.radius + projectile.radius);
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
          if (Array.isArray(projectile.comboIds) && projectile.comboIds.includes('piercing_star') && !projectile.piercingStarFeedback) {
            projectile.piercingStarFeedback = this.emitComboFeedback('piercing_star', hit.ref.x, hit.ref.y, {
              cycleId: projectile.comboCycleId,
              dirX: projectile.vx,
              dirY: projectile.vy
            });
          }
          if (projectile.knockback > 0) {
            const length = Math.max(1, Math.hypot(projectile.vx, projectile.vy));
            const multiplier = this.anomalyIs('low_gravity') ? 1.55 : 1;
            this.moveActorWithPropCollision(
              hit.ref,
              projectile.vx / length * projectile.knockback * 7 * multiplier,
              projectile.vy / length * projectile.knockback * 7 * multiplier,
              hit.ref.radius
            );
          }
          if (projectile.explosion > 0) {
            this.emitWorldVfx(null, 'explosive_impact', hit.ref.x, hit.ref.y, { layer: 'over', scale: 0.82 });
            this.radialDamage(hit.ref.x, hit.ref.y, 20 + projectile.explosion * 6, damage * 0.25, DATA.palette.orange, hit.ref.id);
          }
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
            if (Array.isArray(projectile.comboIds) && projectile.comboIds.includes('hunt_barrage')) {
              this.emitComboFeedback('hunt_barrage', next.ref.x, next.ref.y, {
                cycleId: projectile.comboCycleId,
                secondary: true,
                dirX: projectile.vx,
                dirY: projectile.vy
              });
            }
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
      enemy.actionState = 'hit';
      enemy.actionElapsed = 0;
      this.spawnText(enemy.x, enemy.y - enemy.radius - 8, `${options.crit ? '!' : ''}${Math.round(amount)}`, options.crit ? DATA.palette.acid : DATA.palette.paper);
      if (enemy.hp > 0) return;
      enemy.dead = true;
      enemy.removeAt = false;
      enemy.actionState = 'death';
      enemy.actionElapsed = 0;
      this.player.kills += 1;
      this.addDailyProgress('kills');
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
      if (this.anomalyIs('spore_bloom') && Math.random() < 0.16) {
        const pool = { type: 'pool', x: enemy.x, y: enemy.y, radius: 27, warmup: 0.7, life: 5.5, tick: 0 };
        const poolFx = this.emitWorldVfx('spore', 'spore_pool', pool.x, pool.y, { layer: 'under', duration: pool.life, scale: 0.9 });
        pool.vfxToken = poolFx && poolFx.token;
        pool.visualOnly = Boolean(poolFx);
        this.world.hazards.push(pool);
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
            const previousHp = this.player.hp;
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 3 + recycle * 2);
            if (this.player.hp > previousHp) {
              const played = this.triggerCharacterSkill('recycle_heal', { minGap: 0.22, vfxScale: 1.05 });
              if (!played) this.emitCharacterVfx('recycle_heal', { scale: 1.05 });
              if (this.hasEvolution('magnetic_reclaim')) this.emitComboFeedback('magnetic_reclaim', this.player.x, this.player.y);
            }
          }
        }
      }
      if (enemy.elite) {
        this.world.cache.eliteDefeated = true;
        this.player.loot += 38;
        this.notify('精英目标已清算', '+80 未申报战利品', DATA.palette.acid, 2.8);
        this.audio.play('elite_down');
      }
      const behavior = enemy.visualType || enemy.type;
      const deathEffect = behavior === 'bloater' ? 'bloater_burst' : (behavior === 'charger' ? 'charger_impact' : 'swarm_hit');
      this.emitWorldVfx(this.contract.planet.id, deathEffect, enemy.x, enemy.y, { layer: 'over', scale: enemy.elite ? 1.2 : 1 });
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
          if (this.player.classId === 'mechanic' && this.hasEvolution('magnetic_reclaim')) {
            this.emitComboFeedback('magnetic_reclaim', this.player.x, this.player.y);
          }
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
      while (this.pendingLevelUps > 0) {
        this.pendingLevelUps -= 1;
        this.levelChoices = this.generateChoices();
        if (this.levelChoices.length) {
          this.state = 'levelup';
          this.pointer.active = false;
          this.audio.play('level');
          return true;
        }
      }
      this.levelChoices = [];
      this.state = 'playing';
      this.pointer.active = false;
      this.notify('技能池已满', '后续经验不再提供升级选项', DATA.palette.muted, 1.6);
      return false;
    }

    generateChoices() {
      const classData = DATA.classById[this.player.classId];
      const readyEvolutions = classData.evolutions.filter((evolution) => (
        !this.player.evolutions[evolution.id]
        && evolution.requires.every((id) => this.player.cards[id] >= LIMITS.skillLevel)
      ));
      const consumedCards = classData.evolutions
        .filter((evolution) => this.player.evolutions[evolution.id])
        .flatMap((evolution) => evolution.requires);
      const slots = Object.keys(this.player.cards).length + Object.keys(this.player.evolutions).length;
      const cardCandidates = classData.cards.filter((card) => {
        if (consumedCards.includes(card.id)) return false;
        // Use the effective level here instead of the raw card dictionary.
        // An evolution consumes its recipe cards, but getCardLevel() still
        // reports their effective Lv.3 state. This also makes stale choices
        // impossible after a level-up or an evolution is completed.
        const level = this.getCardLevel(card.id);
        return level > 0 ? level < LIMITS.skillLevel : slots < LIMITS.skillSlots;
      });
      const random = this.world.random;
      const comboConfig = DATA.comboDraft || {};
      const partnerChance = Number.isFinite(comboConfig.partnerChance)
        ? clamp(comboConfig.partnerChance, 0, 1)
        : 0.78;
      const choices = [];
      if (readyEvolutions.length) choices.push({ type: 'evolution', data: pick(readyEvolutions, random) });
      const remainingCards = cardCandidates.slice();
      const drawCard = (pool = remainingCards) => {
        if (!pool.length) return null;
        const card = this.drawWeighted(pool, random, (candidate) => this.getUpgradeCardWeight(candidate.id));
        const index = pool.indexOf(card);
        if (index >= 0) pool.splice(index, 1);
        return card;
      };
      if (this.player.level <= 4) {
        const corePool = remainingCards.filter((card) => card.kind === 'core');
        const core = drawCard(corePool);
        if (core) {
          const remainingIndex = remainingCards.indexOf(core);
          if (remainingIndex >= 0) remainingCards.splice(remainingIndex, 1);
        }
        if (core) choices.push({ type: 'card', data: core });
      }
      if (!readyEvolutions.length && choices.length < 3 && random() < partnerChance) {
        const comboTarget = this.getComboDraftTarget(remainingCards);
        const comboIndex = comboTarget ? remainingCards.indexOf(comboTarget) : -1;
        if (comboIndex >= 0) {
          remainingCards.splice(comboIndex, 1);
          choices.push({ type: 'card', data: comboTarget });
        }
      }
      while (choices.length < 3 && remainingCards.length) {
        const card = drawCard();
        if (card) choices.push({ type: 'card', data: card });
      }
      if (!choices.length && !this.player.overflowUsed) {
        choices.push(
          { type: 'overflow', data: { id: 'damage', name: `${classData.name}火力超载`, kind: 'OVERLOAD', desc: '本局伤害永久提升 6%。' } },
          { type: 'overflow', data: { id: 'speed', name: `${classData.name}机动超载`, kind: 'OVERLOAD', desc: '本局移动速度永久提升 4%。' } },
          { type: 'overflow', data: { id: 'guard', name: `${classData.name}防护超载`, kind: 'OVERLOAD', desc: '本局受到伤害降低 3.5%。' } }
        );
      }
      return choices;
    }

    chooseUpgrade(choice) {
      if (!choice) return false;
      if (choice.type === 'evolution') {
        if (this.player.evolutions[choice.data.id]) return false;
        for (const required of choice.data.requires) delete this.player.cards[required];
        this.player.evolutions[choice.data.id] = true;
        this.triggerCharacterSkill(choice.data.id, { force: true });
        if (DATA.comboFeedback && DATA.comboFeedback[choice.data.id]) {
          this.emitComboFeedback(choice.data.id, this.player.x, this.player.y, { force: true });
        }
        this.notify(`组合进化：${choice.data.name}`, choice.data.desc, DATA.palette.acid, 3);
        this.audio.play('evolution');
      } else if (choice.type === 'overflow') {
        if (this.player.overflowUsed) return false;
        this.player.overflowUsed = true;
        this.player.overflow[choice.data.id] += 1;
        this.notify(choice.data.name, choice.data.desc, DATA.classById[this.player.classId].color, 1.5);
      } else {
        const currentLevel = this.getCardLevel(choice.data.id);
        if (currentLevel >= LIMITS.skillLevel) {
          this.levelChoices = this.generateChoices();
          if (!this.levelChoices.length) {
            this.state = 'playing';
            this.pointer.active = false;
            this.notify('技能池已满', `没有可用的 Lv.${LIMITS.skillLevel} 以上升级`, DATA.palette.muted, 1.5);
          } else {
            this.notify('技能已满级', `${choice.data.name} 已达到 Lv.${LIMITS.skillLevel}`, DATA.palette.muted, 1.5);
          }
          return false;
        }
        const nextLevel = Math.min(LIMITS.skillLevel, currentLevel + 1);
        this.player.cards[choice.data.id] = nextLevel;
        this.triggerCharacterSkill(choice.data.id, { force: true });
        this.notify(`${choice.data.name} Lv.${nextLevel}`, choice.data.desc[nextLevel - 1], DATA.classById[this.player.classId].color, 1.5);
      }
      this.state = 'playing';
      if (this.pendingLevelUps > 0) this.openLevelUp();
      return true;
    }

    rerollChoices() {
      if (this.player.rerolls <= 0) return;
      this.player.rerolls -= 1;
      this.levelChoices = this.generateChoices();
      this.audio.play('terminal');
    }

    updateHazards(dt) {
      const world = this.world;
      if (this.anomalyIs('meteor')) {
        world.hazardTimer -= dt;
        if (world.hazardTimer <= 0) {
          const hazard = {
            type: 'meteor',
            x: clamp(this.player.x + this.player.dirX * 38 + (world.random() - 0.5) * 70, 40, world.width - 40),
            y: clamp(this.player.y + this.player.dirY * 38 + (world.random() - 0.5) * 70, 50, world.height - 40),
            radius: 38,
            warmup: 1.05,
            life: 1.4,
            exploded: false
          };
          const warning = this.emitWorldVfx(null, 'meteor_warning', hazard.x, hazard.y, { layer: 'under', duration: hazard.warmup });
          hazard.vfxToken = warning && warning.token;
          hazard.visualOnly = Boolean(warning);
          world.hazards.push(hazard);
          world.hazardTimer = 4.4;
        }
      }
      for (const hazard of world.hazards) {
        hazard.life -= dt;
        hazard.warmup = Math.max(0, hazard.warmup - dt);
        hazard.tick = (hazard.tick || 0) - dt;
        if (hazard.type === 'meteor' && hazard.warmup <= 0 && !hazard.exploded) {
          hazard.exploded = true;
          const impact = this.emitWorldVfx(null, 'meteor_impact', hazard.x, hazard.y, { layer: 'over', scale: 1.05 });
          hazard.vfxToken = impact && impact.token;
          hazard.visualOnly = Boolean(impact) || hazard.visualOnly;
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
      if (!cache.collected && dist(cache, this.player) < (cache.pickupRadius || 42)) {
        cache.found = true;
        cache.collected = true;
        this.player.loot += 35;
        this.notify('奖励资源箱已领取', '+35 额外战利品', DATA.palette.acid);
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
        this.addDailyProgress('extractions');
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
      this.exitModal = false;
      this.audio.intensity(-1);
      if (this.audio.stopMusic) this.audio.stopMusic();
      this.audio.play(success ? 'success' : 'failure');
      this.contract = null;
    }

    canUnlock(classData) {
      if (this.save.unlocked[classData.id]) return { allowed: true, reason: '已打印' };
      if (DATA.runtime && DATA.runtime.testUnlockAllClasses) return { allowed: true, cost: 0, reason: 'QA TEST // ALL EMPLOYEES' };
      const discount = 1 - (this.save.modules.printer || 0) * 0.08;
      const cost = Math.max(0, Math.floor(classData.unlock.cost * discount));
      if (this.save.successes < (classData.unlock.successes || 0)) return { allowed: false, cost, reason: `需成功撤离 ${classData.unlock.successes} 次` };
      if (classData.unlock.allMissions && DATA.missions.some((mission) => !this.save.completedMissions[mission.id])) return { allowed: false, cost, reason: '需完成全部任务类型' };
      if (this.save.credits < cost) return { allowed: false, cost, reason: `需要 ${cost} 金币` };
      return { allowed: true, cost, reason: `打印费用 ${cost}` };
    }

    isClassUnlocked(classData) {
      return Boolean(this.save.unlocked[classData.id])
        || Boolean(DATA.runtime && DATA.runtime.testUnlockAllClasses);
    }

    unlockClass(classData) {
      const state = this.canUnlock(classData);
      if (!state.allowed || this.save.unlocked[classData.id]) return;
      if (DATA.runtime && DATA.runtime.testUnlockAllClasses) {
        // QA unlocks stay out of the save; disabling the switch restores the
        // release gates on the next load.
        this.save.selectedClass = classData.id;
        this.archiveClassId = classData.id;
        this.audio.play('evolution');
        return;
      }
      this.save.credits -= state.cost;
      this.save.unlocked[classData.id] = true;
      this.save.selectedClass = classData.id;
      this.persist();
      this.audio.play('evolution');
    }

    upgradeModule(moduleData) {
      const level = clamp(Math.floor(Number(this.save.modules[moduleData.id]) || 0), 0, LIMITS.moduleLevel);
      this.save.modules[moduleData.id] = level;
      if (level >= LIMITS.moduleLevel) {
        this.notify('模块已满级', `${moduleData.name} 已达到 Lv.${LIMITS.moduleLevel}`, DATA.palette.muted, 1.4);
        return false;
      }
      const cost = moduleData.costs[level];
      if (!Number.isFinite(cost) || this.save.credits < cost) {
        this.notify('金币不足', `升级 ${moduleData.name} 需要 ${cost || 0} 金币`, DATA.palette.orange, 1.4);
        return false;
      }
      this.save.credits -= cost;
      this.save.modules[moduleData.id] = Math.min(LIMITS.moduleLevel, level + 1);
      this.persist();
      this.audio.play('upgrade');
      return true;
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
      if (this.exitModal && (this.state === 'playing' || this.state === 'levelup')) this.drawExitModal();
      this.drawScanlines();
    }

    assetImage(key) {
      if (!this.assets || !this.assets.image) return null;
      const image = this.assets.image(key);
      return image && image.width ? image : null;
    }

    drawImageAsset(key, x, y, width, height) {
      const image = this.assetImage(key);
      if (!image) return false;
      this.ctx.save();
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(image, Math.round(x), Math.round(y), Math.round(width), Math.round(height));
      this.ctx.restore();
      return true;
    }

    drawImageRegionAsset(key, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height) {
      const image = this.assetImage(key);
      if (!image) return false;
      this.ctx.save();
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(
        image,
        Math.round(sourceX), Math.round(sourceY), Math.round(sourceWidth), Math.round(sourceHeight),
        Math.round(x), Math.round(y), Math.round(width), Math.round(height)
      );
      this.ctx.restore();
      return true;
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

    enemyActionSpec(enemy, state = 'walk') {
      const manifest = this.assets && this.assets.manifest;
      if (!manifest || !manifest.enemyActions || !enemy) return null;
      const planet = this.contract && this.contract.planet && this.contract.planet.id;
      const assetId = enemy.visualId;
      let entry = planet && assetId ? manifest.enemyActions[`${planet}.${assetId}`] : null;
      if (!entry && planet) {
        const behavior = enemy.visualType || enemy.type;
        entry = Object.values(manifest.enemyActions).find((candidate) => candidate.planet === planet && candidate.enemyType === behavior);
      }
      return entry && entry.states ? entry.states[state] : null;
    }

    triggerEnemyAction(enemy, state, effectId = null, options = {}) {
      if (!enemy) return null;
      enemy.actionState = state;
      enemy.actionElapsed = 0;
      enemy.actionEventFired = false;
      enemy.dangerPulse = Math.max(enemy.dangerPulse || 0, options.dangerDuration || (state === 'attack' ? 0.28 : 0));
      if (!effectId) return null;
      const planet = this.contract && this.contract.planet && this.contract.planet.id;
      return this.emitWorldVfx(planet, effectId, enemy.x, enemy.y, {
        layer: options.layer || 'over',
        duration: options.duration,
        dirX: enemy.vx || 1,
        dirY: enemy.vy || 0,
        scale: options.scale || 1
      });
    }

    enemyVfxSpec(planet, effectId) {
      const manifest = this.assets && this.assets.manifest;
      if (!manifest) return null;
      if (manifest.enemyVfx && manifest.enemyVfx[`${planet}.${effectId}`] && manifest.enemyVfx[`${planet}.${effectId}`].key) {
        return manifest.enemyVfx[`${planet}.${effectId}`];
      }
      return manifest.vfx && manifest.vfx[effectId] ? manifest.vfx[effectId] : null;
    }

    emitWorldVfx(planet, effectId, x, y, options = {}) {
      if (!this.world || !effectId) return null;
      const spec = this.enemyVfxSpec(planet, effectId);
      if (!spec || !this.assetImage(spec.key)) return null;
      const effect = {
        token: `fx-${Math.floor(Math.random() * 1e9)}-${this.world.effects.length}`,
        key: spec.key,
        id: effectId,
        planet: planet || null,
        x, y,
        elapsed: 0,
        duration: options.duration === undefined
          ? (spec.loop ? Math.max(0.5, spec.frameCount / spec.fps) : spec.frameCount / spec.fps)
          : options.duration,
        loop: Boolean(spec.loop),
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
        frameCount: spec.frameCount,
        fps: spec.fps,
        anchor: spec.anchor,
        blendMode: spec.blendMode || 'source-over',
        layer: options.layer || 'over',
        scale: options.scale || 1,
        centered: Boolean(options.centered),
        rotateWithDirection: Boolean(options.rotateWithDirection),
        dirX: options.dirX === undefined ? 1 : options.dirX,
        dirY: options.dirY === undefined ? 0 : options.dirY,
        paletteVariant: options.paletteVariant || planet || 'gunner'
      };
      if (options.replaceId) this.world.effects = this.world.effects.filter((item) => item.replaceId !== options.replaceId);
      effect.replaceId = options.replaceId || null;
      this.world.effects.push(effect);
      return effect;
    }

    emitComboFeedback(comboId, x, y, options = {}) {
      if (!this.world || !comboId || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      const config = DATA.comboFeedback && DATA.comboFeedback[comboId];
      if (!config) return false;
      const state = this.world.comboFeedbackState || (this.world.comboFeedbackState = {});
      const now = Number.isFinite(this.world.time) ? this.world.time : 0;
      const previous = state[comboId] || {};
      const cycleId = options.cycleId === undefined ? null : options.cycleId;
      const secondary = Boolean(options.secondary);
      const previousTime = previous.time === undefined ? -Infinity : previous.time;
      if (!options.force && now - previousTime < (config.cooldown || 0)) return false;
      if (cycleId !== null && previous.cycleId === cycleId && !secondary) return false;
      if (secondary && cycleId !== null && previous.secondaryCycleId === cycleId) return false;

      const dirX = Number.isFinite(options.dirX) ? options.dirX : (this.player && this.player.dirX) || 1;
      const dirY = Number.isFinite(options.dirY) ? options.dirY : (this.player && this.player.dirY) || 0;
      const effect = this.emitWorldVfx(null, config.vfx, x, y, {
        layer: config.layer || 'over',
        scale: (config.scale || 1) * (options.scale || 1),
        centered: true,
        rotateWithDirection: comboId === 'rift_slash' || Boolean(options.rotateWithDirection),
        dirX,
        dirY,
        duration: options.duration
      });
      if (!effect) {
        // The procedural burst is deliberately small: it is only a fallback
        // for a missing image and must never block the attack itself.
        const color = this.player && this.player.classId === 'warrior'
          ? DATA.palette.orange
          : (this.player && this.player.classId === 'mechanic' ? DATA.palette.acid : DATA.palette.cyan);
        this.radialBurst(x, y, color, comboId === 'zero_storm' || comboId === 'infinite_recycle' ? 18 : 9);
      }
      state[comboId] = {
        time: now,
        cycleId: cycleId === null ? previous.cycleId : cycleId,
        secondaryCycleId: secondary && cycleId !== null ? cycleId : previous.secondaryCycleId
      };
      return true;
    }

    updateWorldVfx(dt) {
      if (!this.world || !Array.isArray(this.world.effects)) return;
      for (const effect of this.world.effects) effect.elapsed += dt;
      this.world.effects = this.world.effects.filter((effect) => effect.elapsed < effect.duration);
    }

    drawWorldVfx(layer = null) {
      if (!this.world || !Array.isArray(this.world.effects)) return;
      const ctx = this.ctx;
      for (const effect of this.world.effects) {
        if (layer && effect.layer !== layer) continue;
        const image = this.assetImage(effect.key);
        if (!image) continue;
        const screen = this.worldToScreen(effect);
        const frame = effect.loop
          ? Math.floor(effect.elapsed * effect.fps) % effect.frameCount
          : Math.min(effect.frameCount - 1, Math.floor(effect.elapsed * effect.fps));
        const scale = effect.scale || 1;
        ctx.save();
        ctx.globalCompositeOperation = effect.blendMode || 'source-over';
        ctx.globalAlpha = effect.loop ? 0.88 : clamp(1 - effect.elapsed / Math.max(0.01, effect.duration), 0, 1);
        const directionalOriginEffect = effect.id === 'muzzle_flash' || effect.id === 'drone_muzzle' || effect.id === 'railgun_beam';
        if (directionalOriginEffect) {
          const angle = Math.atan2(effect.dirY || 0, effect.dirX || 1);
          ctx.translate(Math.round(screen.x), Math.round(screen.y));
          if (Math.abs(angle) > 0.01) ctx.rotate(angle);
          this.drawFrame(effect.key, effect.frameWidth, effect.frameHeight, frame,
            -effect.anchor.x * scale, -effect.anchor.y * scale,
            effect.frameWidth * scale, effect.frameHeight * scale);
        } else if (effect.centered) {
          if (effect.rotateWithDirection) {
            const angle = Math.atan2(effect.dirY || 0, effect.dirX || 1);
            ctx.translate(Math.round(screen.x), Math.round(screen.y));
            if (Math.abs(angle) > 0.01) ctx.rotate(angle);
            this.drawFrame(effect.key, effect.frameWidth, effect.frameHeight, frame,
              -effect.anchor.x * scale, -effect.anchor.y * scale,
              effect.frameWidth * scale, effect.frameHeight * scale);
          } else {
            this.drawFrame(effect.key, effect.frameWidth, effect.frameHeight, frame,
              screen.x - effect.anchor.x * scale, screen.y - effect.anchor.y * scale,
              effect.frameWidth * scale, effect.frameHeight * scale);
          }
        } else if (effect.planet || effect.id === 'meteor_warning' || effect.id === 'meteor_impact' || effect.id === 'explosive_impact' || effect.id === 'spore_pool') {
          this.drawFrame(effect.key, effect.frameWidth, effect.frameHeight, frame,
            screen.x - effect.anchor.x * scale, screen.y - effect.anchor.y * scale,
            effect.frameWidth * scale, effect.frameHeight * scale);
        } else {
          const angle = Math.atan2(effect.dirY || 0, effect.dirX || 1);
          ctx.translate(Math.round(screen.x), Math.round(screen.y - 20));
          if (Math.abs(angle) > 0.01) ctx.rotate(angle);
          this.drawFrame(effect.key, effect.frameWidth, effect.frameHeight, frame,
            -effect.anchor.x * scale, -effect.anchor.y * scale,
            effect.frameWidth * scale, effect.frameHeight * scale);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    hasWorldEffect(token) {
      return Boolean(token && this.world && this.world.effects && this.world.effects.some((effect) => effect.token === token));
    }

    characterActionFrame(classData, actionState, skillId, direction, elapsed, x, y, scale) {
      const spec = this.characterActionSpec(classData.id, actionState, skillId);
      if (!spec) return false;
      const frame = actionState === 'skill' || actionState === 'attack'
        ? Math.min(spec.frameCount - 1, Math.floor(elapsed * spec.fps))
        : Math.floor(elapsed * spec.fps) % spec.frameCount;
      const rowMap = Array.isArray(spec.directionRowMap) ? spec.directionRowMap : [0, 3, 2, 1];
      const row = clamp(Number(rowMap[clamp(Math.floor(Number(direction) || 0), 0, 3)]) || 0, 0, 3);
      const frameIndex = row * spec.frameCount + frame;
      return this.drawFrame(
        spec.key,
        spec.frameWidth,
        spec.frameHeight,
        frameIndex,
        x - spec.anchor.x * scale,
        y - spec.anchor.y * scale,
        spec.frameWidth * scale,
        spec.frameHeight * scale
      );
    }

    drawTurretDeployReticle(x, y, elapsed, duration) {
      const ctx = this.ctx;
      const progress = clamp(elapsed / Math.max(0.01, duration), 0, 1);
      const fade = clamp(Math.min(progress * 8, (1 - progress) * 7), 0, 1);
      const pulse = Math.sin(this.now * 18) * 0.5 + 0.5;
      const radiusX = 24 + progress * 18;
      const radiusY = 15 + progress * 12;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (0.68 + pulse * 0.22);
      ctx.strokeStyle = DATA.palette.cyan;
      ctx.lineWidth = 2;
      for (let segment = 0; segment < 8; segment += 1) {
        if ((segment + Math.floor(this.now * 12)) % 3 === 0) continue;
        const start = segment / 8 * TAU + 0.08;
        ctx.beginPath();
        ctx.ellipse(Math.round(x), Math.round(y + 2), radiusX, radiusY, 0, start, start + 0.24);
        ctx.stroke();
      }
      ctx.fillStyle = DATA.palette.acid;
      const pip = 3 + Math.round(pulse);
      ctx.fillRect(Math.round(x - radiusX - 2), Math.round(y - 1), pip, 3);
      ctx.fillRect(Math.round(x + radiusX - 1), Math.round(y - 1), pip, 3);
      ctx.fillRect(Math.round(x - 1), Math.round(y - radiusY - 2), 3, pip);
      ctx.fillRect(Math.round(x - 1), Math.round(y + radiusY - 1), 3, pip);
      ctx.globalAlpha = fade * 0.72;
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
      ctx.restore();
    }

    drawShieldPulseFx(x, y, elapsed, duration) {
      const ctx = this.ctx;
      const progress = clamp(elapsed / Math.max(0.01, duration), 0, 1);
      const fade = clamp(Math.min(progress * 6, (1 - progress) * 5), 0, 1);
      const radius = 24 + progress * 26;
      const points = [
        [0, -radius], [radius * 0.72, -radius * 0.58], [radius * 0.86, radius * 0.14],
        [radius * 0.42, radius * 0.72], [0, radius], [-radius * 0.42, radius * 0.72],
        [-radius * 0.86, radius * 0.14], [-radius * 0.72, -radius * 0.58]
      ];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * 0.86;
      ctx.strokeStyle = DATA.palette.cyan;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(Math.round(x + point[0]), Math.round(y - 26 + point[1]));
        else ctx.lineTo(Math.round(x + point[0]), Math.round(y - 26 + point[1]));
      });
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = fade * 0.95;
      ctx.fillStyle = DATA.palette.acid;
      for (let index = 0; index < points.length; index += 2) {
        const point = points[index];
        ctx.fillRect(Math.round(x + point[0] - 2), Math.round(y - 26 + point[1] - 2), 4, 4);
      }
      ctx.restore();
    }

    drawPlayerShieldOverlay() {
      if (!this.player || this.player.classId !== 'mechanic' || this.getCardLevel('shield') <= 0) return;
      const screen = this.worldToScreen(this.player);
      const ctx = this.ctx;
      const level = this.getCardLevel('shield');
      const radiusX = 21 + level * 4;
      const radiusY = 28 + level * 4;
      const pulse = Math.sin(this.now * 3.2) * 0.5 + 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.24 + pulse * 0.14;
      ctx.strokeStyle = DATA.palette.cyan;
      ctx.lineWidth = 1;
      for (let segment = 0; segment < 8; segment += 1) {
        if ((segment + Math.floor(this.now * 4)) % 4 === 0) continue;
        const start = segment / 8 * TAU + 0.06;
        ctx.beginPath();
        ctx.ellipse(Math.round(screen.x), Math.round(screen.y - 25), radiusX, radiusY, 0, start, start + 0.28);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.52 + pulse * 0.22;
      ctx.fillStyle = DATA.palette.acid;
      ctx.fillRect(Math.round(screen.x - 2), Math.round(screen.y - 25 - radiusY - 2), 4, 4);
      ctx.fillRect(Math.round(screen.x - 2), Math.round(screen.y - 25 + radiusY - 2), 4, 4);
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(Math.round(screen.x - radiusX - 2), Math.round(screen.y - 27), 4, 4);
      ctx.fillRect(Math.round(screen.x + radiusX - 2), Math.round(screen.y - 27), 4, 4);
      ctx.restore();
    }

    drawCharacterVfx() {
      if (!this.player || !this.player.activeVfx || !this.world) return false;
      const active = this.player.activeVfx;
      const spec = this.assets && this.assets.manifest && this.assets.manifest.vfx && this.assets.manifest.vfx[active.id];
      if (!spec) return false;
      if (active.id === 'turret_deploy') {
        const screen = this.worldToScreen(this.player);
        this.drawTurretDeployReticle(screen.x, screen.y, active.elapsed, active.duration);
        return true;
      }
      if (active.id === 'shield_pulse') {
        const screen = this.worldToScreen(this.player);
        if (!this.assetImage(spec.key)) {
          this.drawShieldPulseFx(screen.x, screen.y, active.elapsed, active.duration);
          return true;
        }
      }
      const image = this.assetImage(spec.key);
      if (!image) return false;
      const frame = spec.loop
        ? Math.floor(active.elapsed * spec.fps) % spec.frameCount
        : Math.min(spec.frameCount - 1, Math.floor(active.elapsed * spec.fps));
      const dirX = active.dirX === undefined ? (this.player.dirX || 1) : active.dirX;
      const dirY = active.dirY === undefined ? (this.player.dirY || 0) : active.dirY;
      const origins = Array.isArray(active.origins) && active.origins.length
        ? active.origins
        : [{ x: this.player.x, y: this.player.y, dirX, dirY }];
      const ctx = this.ctx;
      const directionalOriginEffect = active.id === 'muzzle_flash' || active.id === 'drone_muzzle' || active.id === 'railgun_beam' || active.id === 'slash_arc' || active.id === 'sword_wave';
      const drawOrigins = directionalOriginEffect ? origins : [origins[0]];
      for (const origin of drawOrigins) {
        const screen = this.worldToScreen(origin);
        const originDirX = Number.isFinite(origin.dirX) ? origin.dirX : dirX;
        const originDirY = Number.isFinite(origin.dirY) ? origin.dirY : dirY;
        const angle = Math.atan2(originDirY, originDirX);
        ctx.save();
        ctx.globalCompositeOperation = spec.blendMode || 'source-over';
        ctx.globalAlpha = 0.92;
        if (directionalOriginEffect) {
          const scale = (active.id === 'drone_muzzle' ? 0.9 : 1) * (active.scale || 1);
          ctx.translate(Math.round(screen.x), Math.round(screen.y));
          if (Math.abs(angle) > 0.01) ctx.rotate(angle);
          this.drawFrame(spec.key, spec.frameWidth, spec.frameHeight, frame,
            -spec.anchor.x * scale, -spec.anchor.y * scale,
            spec.frameWidth * scale, spec.frameHeight * scale);
        } else {
          const scale = active.id === 'zero_storm_burst' || active.id === 'self_destruct_burst' ? 1.15 : 1;
          this.drawFrame(spec.key, spec.frameWidth, spec.frameHeight, frame,
            screen.x - spec.anchor.x * scale, screen.y - 29 - spec.anchor.y * scale,
            spec.frameWidth * scale, spec.frameHeight * scale);
        }
        ctx.restore();
      }
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
      const frameOffsets = spec.frameOffsets && spec.frameOffsets[state];
      const frameOffset = frameOffsets && frameOffsets[frame]
        ? frameOffsets[frame]
        : [0, 0];
      return this.drawFrame(
        `object.${id}`,
        spec.frameWidth,
        spec.frameHeight,
        frame,
        x - spec.anchor[0] * scale + frameOffset[0] * scale,
        y - spec.anchor[1] * scale + frameOffset[1] * scale,
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

    // Character action sheets are authored from the astronaut's point of
    // view: their "right" row faces screen-left and their "left" row faces
    // screen-right. Keep gameplay direction semantics stable and translate
    // only at the character sheet lookup boundary.
    characterDirectionRow(direction) {
      const rowMap = [0, 3, 2, 1];
      const safeDirection = clamp(Math.floor(Number(direction) || 0), 0, 3);
      return rowMap[safeDirection];
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

    techPath(x, y, w, h, cut = 5) {
      const ctx = this.ctx;
      const safeCut = Math.max(2, Math.min(cut, Math.floor(Math.min(w, h) / 3)));
      ctx.beginPath();
      ctx.moveTo(Math.round(x + safeCut), Math.round(y));
      ctx.lineTo(Math.round(x + w - safeCut), Math.round(y));
      ctx.lineTo(Math.round(x + w), Math.round(y + safeCut));
      ctx.lineTo(Math.round(x + w), Math.round(y + h - safeCut));
      ctx.lineTo(Math.round(x + w - safeCut), Math.round(y + h));
      ctx.lineTo(Math.round(x + safeCut), Math.round(y + h));
      ctx.lineTo(Math.round(x), Math.round(y + h - safeCut));
      ctx.lineTo(Math.round(x), Math.round(y + safeCut));
      ctx.closePath();
    }

    panel(x, y, w, h, options = {}) {
      const ctx = this.ctx;
      const stroke = options.stroke || '#31515b';
      const fill = options.fill || 'rgba(7,14,18,0.95)';
      const accent = options.accent || DATA.palette.cyan;
      const cut = options.cut || 5;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      this.techPath(x + 3, y + 4, w, h, cut);
      ctx.fill();
      ctx.fillStyle = stroke;
      this.techPath(x, y, w, h, cut);
      ctx.fill();
      ctx.fillStyle = fill;
      this.techPath(x + 2, y + 2, w - 4, h - 4, Math.max(2, cut - 2));
      ctx.fill();
      // The v24 cockpit language uses a shallow CRT-like hatch inside every
      // hardware panel. Keep it clipped to the inset so it reads as a
      // material surface instead of a page-wide overlay.
      ctx.save();
      this.techPath(x + 4, y + 4, w - 8, h - 8, Math.max(1, cut - 3));
      ctx.clip();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = DATA.palette.cyan;
      ctx.lineWidth = 1;
      for (let scanY = y + 9; scanY < y + h - 8; scanY += 7) {
        ctx.beginPath();
        ctx.moveTo(x + 5, scanY + 0.5);
        ctx.lineTo(x + w - 5, scanY + 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.fillStyle = 'rgba(65,231,244,0.08)';
      ctx.fillRect(Math.round(x + 7), Math.round(y + 7), Math.max(1, Math.round(w - 14)), 1);
      ctx.fillStyle = 'rgba(223,248,241,0.08)';
      ctx.fillRect(Math.round(x + 7), Math.round(y + h - 7), Math.max(1, Math.round(w - 14)), 1);
      ctx.fillStyle = accent;
      ctx.fillRect(Math.round(x + 8), Math.round(y + 2), Math.min(40, Math.max(12, Math.round(w - 18))), 2);
      ctx.fillRect(Math.round(x + w - 20), Math.round(y + h - 4), 12, 2);
      if ((options.accentWidth || 0) >= 5) ctx.fillRect(Math.round(x + 2), Math.round(y + 9), 2, Math.max(1, Math.round(h - 18)));
      ctx.fillStyle = options.rivet || '#6d949b';
      ctx.fillRect(Math.round(x + 8), Math.round(y + 10), 2, 2);
      ctx.fillRect(Math.round(x + w - 10), Math.round(y + 10), 2, 2);
      ctx.fillStyle = 'rgba(223,248,241,0.32)';
      ctx.fillRect(Math.round(x + 8), Math.round(y + h - 11), 2, 2);
      ctx.fillRect(Math.round(x + w - 10), Math.round(y + h - 11), 2, 2);
      ctx.fillStyle = 'rgba(173,118,255,0.55)';
      ctx.fillRect(Math.round(x + w - 8), Math.round(y + h - 9), 2, 2);
      ctx.restore();
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
      const solid = Boolean(options.solid);
      const accent = disabled ? '#35505a' : (options.stroke || (theme === 'danger' ? DATA.palette.danger : theme === 'primary' ? DATA.palette.acid : DATA.palette.cyan));
      const fill = disabled
        ? '#111c21'
        : solid
          ? (options.solidFill || '#b8e33f')
          : (options.fill && options.fill !== DATA.palette.acid && options.fill !== DATA.palette.danger ? options.fill : (theme === 'primary' ? '#20351a' : theme === 'danger' ? '#351821' : '#10242b'));
      const color = disabled
        ? (options.disabledText || '#6d8084')
        : solid
          ? (options.text || DATA.palette.ink)
          : (options.text || (theme === 'primary' ? DATA.palette.acid : theme === 'danger' ? '#ffd5d0' : DATA.palette.paper));
      // Active tabs use the dark ink directly on their bright face. A second
      // offset ink pass reads as a blurry duplicate at this pixel scale, so
      // selected-state labels stay single-pass while ordinary labels retain
      // the cockpit's subtle projected lettering.
      const crispText = options.crispText !== undefined
        ? Boolean(options.crispText)
        : options.text === DATA.palette.ink;
      const drawX = pressed ? x + 1 : x;
      const drawY = pressed ? y + 1 : y;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      this.techPath(drawX + 3, drawY + 4, w, h, 5);
      ctx.fill();
      ctx.fillStyle = accent;
      this.techPath(drawX, drawY, w, h, 5);
      ctx.fill();
      ctx.fillStyle = fill;
      this.techPath(drawX + 2, drawY + 2, w - 4, h - 4, 3);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.globalAlpha = disabled ? 0.4 : 0.9;
      ctx.fillRect(Math.round(drawX + 8), Math.round(drawY + 3), Math.min(30, Math.max(12, w - 20)), 2);
      ctx.fillRect(Math.round(drawX + w - 18), Math.round(drawY + h - 5), 10, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(drawX + 2), Math.round(drawY + 7), 3, Math.max(1, Math.round(h - 14)));
      if (crispText) {
        this.text(label, drawX + w / 2, drawY + h / 2 + 4, options.size || 14, color, 'center', true);
      } else {
        this.text(label, drawX + w / 2 + 1, drawY + h / 2 + 5, options.size || 14, DATA.palette.ink, 'center', true);
        this.text(label, drawX + w / 2, drawY + h / 2 + 4, options.size || 14, color, 'center', true);
      }
      ctx.restore();
      this.buttons.push({ x, y, w, h, disabled, action });
    }

    cockpitAssetButton(x, y, w, h, label, action, options = {}) {
      const disabled = Boolean(options.disabled);
      const pressed = !disabled && this.uiPress && this.now < this.uiPress.until
        && this.uiPress.x === x && this.uiPress.y === y && this.uiPress.w === w && this.uiPress.h === h;
      const normalKey = options.normalKey || 'ui.cockpit.dispatch_normal';
      const pressedKey = options.pressedKey || 'ui.cockpit.dispatch_pressed';
      const image = this.assetImage(pressed ? pressedKey : normalKey) || this.assetImage(normalKey);
      if (!image || disabled) {
        this.button(x, y, w, h, label, action, options);
        return;
      }
      const drawX = pressed ? x + 1 : x;
      const drawY = pressed ? y + 1 : y;
      this.drawImageAsset(pressed ? pressedKey : normalKey, drawX, drawY, w, h);
      const size = options.size || 16;
      const color = options.text || DATA.palette.ink;
      this.text(label, drawX + w / 2 + 1, drawY + h / 2 + 5, size, DATA.palette.paper, 'center', true);
      this.text(label, drawX + w / 2, drawY + h / 2 + 4, size, color, 'center', true);
      this.buttons.push({ x, y, w, h, disabled, action });
    }

    cockpitFrameButton(x, y, w, h, label, action, options = {}) {
      if (!this.assetImage('ui.cockpit.shell')) {
        this.button(x, y, w, h, label, action, options);
        return;
      }
      const disabled = Boolean(options.disabled);
      const pressed = !disabled && this.uiPress && this.now < this.uiPress.until
        && this.uiPress.x === x && this.uiPress.y === y && this.uiPress.w === w && this.uiPress.h === h;
      if (pressed) {
        this.ctx.fillStyle = options.pressFill || 'rgba(81,217,209,0.18)';
        this.ctx.fillRect(x + 4, y + 4, Math.max(1, w - 8), Math.max(1, h - 8));
      }
      const textX = options.textX === undefined ? x + w / 2 : options.textX;
      this.text(label, textX, y + (options.baseline || 27), options.size || 9, options.text || DATA.palette.paper, 'center', true, true);
      this.buttons.push({ x, y, w, h, disabled, action });
    }

    drawCockpitUtilityIndicators(x, y) {
      const ctx = this.ctx;
      const blockSize = 5;
      const blockStep = 13;
      const blockCount = 10;
      const rowWidth = blockSize + (blockCount - 1) * blockStep;
      const startX = x + Math.round((143 - rowWidth) / 2);
      for (let index = 0; index < blockCount; index += 1) {
        ctx.fillStyle = index < 5 ? DATA.palette.cyan : DATA.palette.acid;
        ctx.fillRect(startX + index * blockStep, y + 13, blockSize, blockSize);
      }
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

    drawPixelIcon(kind, x, y, size, color, roleId = null) {
      const ctx = this.ctx;
      const skillKey = roleId ? `skill.${roleId}.${kind}` : `skill.gunner.${kind}`;
      const skill = this.assetImage(skillKey);
      if (skill) {
        ctx.drawImage(skill, Math.round(x), Math.round(y), Math.round(size), Math.round(size));
        return true;
      }
      const uiIconMap = {
        scanner: 'scanner', fabricator: 'fabricator', cargo: 'cargo_hold', life_support: 'life_support', printer: 'printer',
        nests: 'mission_nest', beacons: 'mission_beacon', drill: 'mission_drill', low_gravity: 'low_gravity',
        meteor: 'meteor', spore_bloom: 'spore_bloom', energy_tide: 'energy_tide'
      };
      if (uiIconMap[kind] && this.drawAtlasIcon(uiIconMap[kind], x, y, size)) return;
      const iconKind = {
        burst_overdrive: 'burst', railgun_overcharge: 'railgun', critical_dash: 'emergency_dash',
        fury_combo: 'double_slash', iron_fury: 'guard', blood_oath: 'lifesteal',
        parallel_overclock: 'arc', field_reconstruction: 'repair_bot', magnetic_reclaim: 'magnet'
      }[kind] || kind;
      const cell = Math.max(3, Math.floor(size / 10));
      const cx = Math.round(x + size / 2);
      const cy = Math.round(y + size / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = cell;
      ctx.lineCap = 'square';
      if (/rail|pierc|sword_wave|rift/.test(iconKind)) {
        ctx.fillRect(-cell, -size * 0.38, cell * 2, size * 0.65);
        ctx.fillRect(-cell * 2, size * 0.18, cell * 4, cell);
        ctx.fillRect(-cell / 2, size * 0.3, cell, cell * 2);
      } else if (/scatter|burst|barrage|storm/.test(iconKind)) {
        [-0.32, 0, 0.32].forEach((angle) => {
          ctx.save();
          ctx.rotate(angle);
          ctx.fillRect(-cell, -size * 0.38, cell * 2, size * 0.55);
          ctx.restore();
        });
      } else if (/drone|swarm|orbit|star_ring|arc|overclock/.test(iconKind)) {
        ctx.fillRect(-cell * 2, -cell * 2, cell * 4, cell * 4);
        ctx.fillRect(-size * 0.38, -cell, cell * 2, cell * 2);
        ctx.fillRect(size * 0.18, -cell, cell * 2, cell * 2);
        ctx.fillRect(-cell, -size * 0.38, cell * 2, cell * 2);
      } else if (/turret|fortress/.test(iconKind)) {
        ctx.fillRect(-size * 0.3, 0, size * 0.6, cell * 3);
        ctx.fillRect(-cell * 2, -cell * 3, cell * 4, cell * 3);
        ctx.fillRect(cell * 2, -cell * 2, cell * 4, cell);
      } else if (/scanner/.test(iconKind)) {
        ctx.strokeRect(-size * 0.32, -size * 0.32, size * 0.64, size * 0.64);
        ctx.strokeRect(-size * 0.16, -size * 0.16, size * 0.32, size * 0.32);
        ctx.fillRect(-cell, -cell, cell * 2, cell * 2);
      } else if (/fabricator|printer|cargo/.test(iconKind)) {
        ctx.strokeRect(-size * 0.34, -size * 0.28, size * 0.68, size * 0.58);
        ctx.fillRect(-size * 0.24, -size * 0.38, size * 0.48, cell * 2);
        ctx.fillRect(-size * 0.22, -cell, size * 0.44, cell * 2);
        ctx.fillStyle = DATA.palette.ink;
        ctx.fillRect(-cell, -cell, cell * 2, cell * 2);
      } else if (/shield|guard|unyield|life|repair|magnet/.test(iconKind)) {
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.4);
        ctx.lineTo(size * 0.32, -size * 0.22);
        ctx.lineTo(size * 0.24, size * 0.25);
        ctx.lineTo(0, size * 0.42);
        ctx.lineTo(-size * 0.24, size * 0.25);
        ctx.lineTo(-size * 0.32, -size * 0.22);
        ctx.closePath();
        ctx.stroke();
      } else if (/explosive|self_destruct|recycle/.test(iconKind)) {
        for (let angle = 0; angle < TAU; angle += TAU / 8) {
          ctx.save();
          ctx.rotate(angle);
          ctx.fillRect(-cell / 2, -size * 0.42, cell, size * 0.24);
          ctx.restore();
        }
        ctx.fillRect(-cell * 2, -cell * 2, cell * 4, cell * 4);
      } else if (/arc|ricochet|counter|dodge/.test(iconKind)) {
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
      // Quiet chassis geometry keeps the secondary HQ pages inside the same
      // cockpit world as the main dispatch screen.
      ctx.strokeStyle = 'rgba(65,231,244,0.11)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(13, 0); ctx.lineTo(13, H);
      ctx.moveTo(W - 14, 0); ctx.lineTo(W - 14, H);
      ctx.moveTo(18, 63); ctx.lineTo(W - 18, 63);
      ctx.moveTo(18, H - 84); ctx.lineTo(W - 18, H - 84);
      ctx.stroke();
      ctx.fillStyle = 'rgba(65,231,244,0.2)';
      ctx.fillRect(9, 101, 3, 28);
      ctx.fillRect(W - 12, 182, 3, 17);
      ctx.fillStyle = 'rgba(214,255,69,0.24)';
      ctx.fillRect(9, H - 128, 3, 18);
      ctx.fillRect(W - 12, H - 176, 3, 26);
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

    drawCockpitHeader(section) {
      if (this.assetImage('ui.cockpit.shell')) {
        // Match the reference header: section title and credit value share
        // one optical baseline inside the common top frame.
        this.text(section, 70, 61, 16, DATA.palette.paper, 'left', true);
        this.text(String(this.save.credits), 331, 61, 16, DATA.palette.paper, 'right', true, true);
        return;
      }
      const ctx = this.ctx;
      this.panel(15, 35, 330, 59, { uiVariant: 'standard', fill: '#0d1518', stroke: '#465454', accent: DATA.palette.cyan, accentWidth: 3 });

      // The cyan company mark is larger here than on secondary pages. It is
      // the visual anchor that makes the dispatch tab feel like a console.
      this.drawCorpLogo(25, 47, 31, DATA.palette.cyan);
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(61, 49, 28, 2);
      ctx.fillRect(61, 86, 42, 2);
      this.text(section, 69, 76, 14, DATA.palette.paper, 'left', true);

      // Credit counter: a separate hardware module, with a bright cyan
      // meter and enough contrast to survive 9:16 phone scaling.
      this.panel(267, 43, 77, 42, { uiVariant: 'standard', fill: '#0b1214', stroke: '#3c4b4d', accent: DATA.palette.cyan, accentWidth: 2 });
      this.drawAtlasIcon('credits', 276, 53, 18);
      this.text(String(this.save.credits), 332, 70, 14, DATA.palette.paper, 'right', true, true);
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(278, 78, 50, 3);

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
      if (this.hqPage === 'dispatch') this.hqPage = 'main';
      this.drawStarfield();
      if (this.hqPage === 'archive') this.drawArchivePage();
      else if (this.hqPage === 'activity') this.drawActivityPage();
      else if (this.hqPage === 'tasks') this.drawTasksPage();
      else if (this.hqPage === 'upgrade') this.drawUpgradePage();
      else this.drawHQMain();
      this.drawHQNav();
    }

    drawHQMain() {
      const classData = DATA.classById[this.save.selectedClass] || DATA.classes[0];
      if (this.drawHQMainCockpitRefined(classData)) return;
      this.drawCockpitBackground(classData);
      this.drawCockpitHeader('飞船驾驶舱 // 外勤调度');

      // Left status module: a large employee identifier over a quiet,
      // almost black information well, matching the concept's hierarchy.
      this.text('当前员工', 38, 123, 8, DATA.palette.muted, 'left', true, true);
      this.text(classData.employee, 37, 159, 19, classData.color, 'left', true);
      this.text(classData.name, 38, 186, 13, DATA.palette.paper, 'left', true);
      this.wrap(classData.role, 38, 218, 112, 17, 10, DATA.palette.paper, 2);
      this.text('状态 // 值勤中', COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.x, COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.labelY, 9, DATA.palette.acid, 'left', true, true);
      this.text('链路已接入 · 绩效稳定', COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.x, 416, 7, DATA.palette.muted, 'left');

      const pendingContract = Boolean(this.contract && !this.contract.started);
      this.button(26, 446, 308, 67, pendingContract ? '继续查看派遣简报  >>' : '接受随机派遣  >>', () => this.prepareContract(), { fill: DATA.palette.acid, solid: true, size: 16 });
      this.button(27, 521, 154, 36, this.save.settings.musicEnabled ? '背景音乐 // 开' : '背景音乐 // 关', () => this.setMusicEnabled(!this.save.settings.musicEnabled), { fill: '#10262a', ink: DATA.palette.paper, text: DATA.palette.paper, stroke: DATA.palette.cyan, size: 9 });

      const ctx = this.ctx;
      ctx.fillStyle = DATA.palette.cyan;
      for (let index = 0; index < 6; index += 1) {
        ctx.fillRect(32 + index * 9, COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.pipsY, 6, 3);
      }
      this.panel(190, 521, 143, 36, { uiVariant: 'standard', fill: '#11191b', stroke: '#3c4b4d', accent: DATA.palette.orange, accentWidth: 2 });
      this.text('撤离回收', 205, 538, 7, DATA.palette.muted, 'left', true, true);
      this.text(String(this.save.successes || 0).padStart(2, '0'), 320, 544, 13, DATA.palette.paper, 'right', true, true);
      this.drawCockpitUtilityIndicators(190, 521);

      const musicActive = this.audio && typeof this.audio.isMusicActive === 'function' && this.audio.isMusicActive();
      const musicStatus = !this.save.settings.musicEnabled
        ? '背景音乐 // 已关闭'
        : (musicActive ? '背景音乐 // 播放中' : '点击屏幕启动背景音乐');
      this.text(musicStatus, 104, COCKPIT_MUSIC_TEXT_Y, musicActive ? 6 : 5.5, musicActive ? DATA.palette.acid : DATA.palette.orange, 'center', true, true);
    }

    drawHQMainCockpitRefined(classData) {
      const shell = this.assetImage('ui.cockpit.main_info_expanded_shell');
      if (!shell) return false;
      this.drawCockpitBackground(classData);
      this.drawCockpitHeader('飞船驾驶舱 // 外勤调度');

      // The refined master has a taller employee well. Keep the live save
      // values aligned to its original typographic hierarchy.
      this.text('当前员工', 31, 135, 10, DATA.palette.muted, 'left', true, true);
      this.text(classData.employee, 31, 181, 20, classData.color, 'left', true);
      this.text(classData.name, 31, 216, 14, DATA.palette.paper, 'left', true);
      this.wrap(classData.role, 31, 246, 118, 16, 9.5, DATA.palette.paper, 2);
      this.text('状态 // 值勤中', COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.x, COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.labelY, 11, DATA.palette.acid, 'left', true, true);

      const ctx = this.ctx;
      ctx.fillStyle = DATA.palette.cyan;
      for (let index = 0; index < 6; index += 1) ctx.fillRect(32 + index * 9, COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.pipsY, 6, 3);

      const pendingContract = Boolean(this.contract && !this.contract.started);
      this.cockpitAssetButton(
        COCKPIT_LAYOUT.dispatch.x,
        COCKPIT_LAYOUT.dispatch.y,
        COCKPIT_LAYOUT.dispatch.w,
        COCKPIT_LAYOUT.dispatch.h,
        pendingContract ? '继续查看派遣简报  >>' : '接受随机派遣  >>',
        () => this.prepareContract(),
        { size: 20, text: DATA.palette.ink }
      );

      const musicEnabled = Boolean(this.save.settings.musicEnabled);
      this.cockpitFrameButton(12, 521, 164, 36, musicEnabled ? '背景音乐 // 开' : '背景音乐 // 关', () => {
        this.setMusicEnabled(!this.save.settings.musicEnabled);
      }, { size: 11, baseline: COCKPIT_MUSIC_TEXT_Y - 521, textX: 94 });

      this.drawCockpitUtilityIndicators(190, 521);

      // Foreground portrait layer: draw after every shell and live control so
      // the selected class always sits visibly above the bay background.
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.x,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.y,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.w,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.h
      );
      ctx.clip();
      this.drawAstronaut(
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterAnchor.x,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterAnchor.y,
        classData,
        4.3,
        Math.PI / 2,
        true
      );
      ctx.restore();
      return true;
    }

    drawHQMainCockpit(classData) {
      if (!this.assetImage('ui.cockpit.shell')) return false;
      this.drawCockpitBackground(classData);
      this.drawCockpitHeader('飞船驾驶舱 // 外勤调度');

      // Live employee data is intentionally kept inside the cleared left
      // well, leaving the shell itself fully image-driven.
      this.text('当前员工', 53, 123, 8, DATA.palette.muted, 'left', true, true);
      this.text(classData.employee, 53, 159, 19, classData.color, 'left', true);
      this.text(classData.name, 53, 186, 13, DATA.palette.paper, 'left', true);
      this.wrap(classData.role, 53, 218, 102, 17, 10, DATA.palette.paper, 2);
      this.text('状态 // 值勤中', COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.x, COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.labelY, 9, DATA.palette.acid, 'left', true, true);
      this.text('链路已接入 · 绩效稳定', COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.x, 416, 7, DATA.palette.muted, 'left');

      // The character bay receives only the selected class sprite. Its
      // background is continuous and intentionally carries no title strip.
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.x,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.y,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.w,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterClip.h
      );
      this.ctx.clip();
      this.drawAstronaut(
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterAnchor.x,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterAnchor.y,
        classData,
        3.1,
        Math.PI / 2,
        true
      );
      this.ctx.restore();
      const ctx = this.ctx;
      ctx.fillStyle = DATA.palette.cyan;
      for (let index = 0; index < 6; index += 1) {
        ctx.fillRect(32 + index * 9, COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.status.pipsY, 6, 3);
      }

      const pendingContract = Boolean(this.contract && !this.contract.started);
      this.cockpitAssetButton(
        COCKPIT_LAYOUT.dispatch.x,
        COCKPIT_LAYOUT.dispatch.y,
        COCKPIT_LAYOUT.dispatch.w,
        COCKPIT_LAYOUT.dispatch.h,
        pendingContract ? '继续查看派遣简报  >>' : '接受随机派遣  >>',
        () => this.prepareContract(),
        { size: 16, text: DATA.palette.ink }
      );

      const musicEnabled = Boolean(this.save.settings.musicEnabled);
      this.cockpitFrameButton(27, 521, 154, 36, musicEnabled ? '背景音乐 // 开' : '背景音乐 // 关', () => {
        this.setMusicEnabled(!this.save.settings.musicEnabled);
      }, { size: 8, baseline: COCKPIT_MUSIC_TEXT_Y - 521 });

      this.text('撤离回收', 204, 538, 7, DATA.palette.muted, 'left', true, true);
      this.text(String(this.save.successes || 0).padStart(2, '0'), 320, 544, 13, DATA.palette.paper, 'right', true, true);
      this.drawCockpitUtilityIndicators(190, 521);

      const musicActive = this.audio && typeof this.audio.isMusicActive === 'function' && this.audio.isMusicActive();
      const musicStatus = !musicEnabled
        ? '背景音乐 // 已关闭'
        : (musicActive ? '背景音乐 // 播放中' : '点击屏幕启动背景音乐');
      this.text(musicStatus, 104, COCKPIT_MUSIC_TEXT_Y, musicActive ? 6 : 5.5, musicActive ? DATA.palette.acid : DATA.palette.orange, 'center', true, true);
      return true;
    }

    drawCrewPage() {
      this.drawHeader('打印体员工档案');
      DATA.classes.forEach((classData, index) => {
        const y = 78 + index * 154;
        const unlocked = this.isClassUnlocked(classData);
        const selected = this.save.selectedClass === classData.id;
        this.panel(18, y, 324, 136, { fill: unlocked ? '#141b1e' : '#111416', stroke: selected ? classData.color : '#3d4442', accent: unlocked ? classData.color : '#4a4d49' });
        this.drawAstronaut(67, y + 82, classData, 1.55, -0.3, true);
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
        const level = clamp(Math.floor(Number(this.save.modules[moduleData.id]) || 0), 0, LIMITS.moduleLevel);
        const maxed = level >= LIMITS.moduleLevel;
        const cost = maxed ? 0 : moduleData.costs[level];
        this.panel(18, y, 324, 80, { fill: '#141a1d', stroke: '#3f4744', accent: level ? DATA.palette.acid : '#55564d' });
        this.drawPixelIcon(moduleData.id, 26, y + 19, 34, level ? DATA.palette.acid : DATA.palette.muted);
        this.text(moduleData.name, 69, y + 25, 14, DATA.palette.paper, 'left', true);
        this.text(`LV.${level}/${LIMITS.moduleLevel}`, 69, y + 43, 9, maxed ? DATA.palette.acid : DATA.palette.muted, 'left', true, true);
        this.text(moduleData.desc, 69, y + 62, 9, DATA.palette.muted, 'left');
        this.button(248, y + 17, 75, 35, maxed ? '已满级' : (this.save.credits < cost ? '金币不足' : `¤ ${cost}`), () => this.upgradeModule(moduleData), {
          disabled: maxed || this.save.credits < cost,
          fill: DATA.palette.acid,
          disabledText: maxed ? DATA.palette.acid : DATA.palette.paper,
          size: 11
        });
      });
      this.button(30, 566, 300, 45, '返回调度终端', () => { this.hqPage = 'main'; }, { fill: '#242d30', text: DATA.palette.paper, ink: DATA.palette.paper, stroke: '#59666a' });
    }

    drawCockpitBackground(classData) {
      const shellKey = this.hqPage === 'main'
        ? 'ui.cockpit.main_info_expanded_shell'
        : 'ui.cockpit.shell';
      const shell = this.assetImage(shellKey);
      if (shell) {
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(shell, COCKPIT_LAYOUT.shell.x, COCKPIT_LAYOUT.shell.y, COCKPIT_LAYOUT.shell.w, COCKPIT_LAYOUT.shell.h);
        this.ctx.restore();
        return true;
      }
      this.drawCockpitBackgroundFallback(classData);
      return false;
    }

    drawCockpitBackgroundFallback(classData) {
      const ctx = this.ctx;

      // Keep a quiet scanline field behind the live fallback panels. The
      // separate outer armor rim is intentionally omitted to match the
      // resource-backed cockpit after the review pass.
      ctx.fillStyle = '#070b0d';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0a1215';
      ctx.fillRect(0, 0, W, 36);
      ctx.fillStyle = 'rgba(15,30,33,0.9)';
      for (let y = 8; y < 36; y += 8) ctx.fillRect(0, y, W, 1);
      ctx.fillStyle = '#0b1113';
      ctx.fillRect(19, 31, W - 38, 526);
      ctx.fillStyle = 'rgba(81,217,209,0.045)';
      for (let y = 102; y < 558; y += 8) ctx.fillRect(20, y, W - 40, 1);

      // Main status and navigation wells. The dispatch page uses the freed
      // instrument height to extend both portrait cards while the lower
      // controls remain at their original coordinates.
      this.panel(22, 99, 139, 339, { uiVariant: 'inset', fill: '#071013', stroke: '#59615a', accent: classData.color, accentWidth: 4 });
      this.panel(166, 99, 172, 339, { uiVariant: 'inset', fill: '#07151b', stroke: '#506365', accent: DATA.palette.cyan, accentWidth: 3 });
      ctx.fillStyle = 'rgba(18,75,84,0.34)';
      ctx.fillRect(176, 135, 152, 288);
      ctx.strokeStyle = 'rgba(81,217,209,0.22)';
      ctx.lineWidth = 1;
      for (let y = 143; y < 421; y += 13) {
        ctx.beginPath(); ctx.moveTo(178, y); ctx.lineTo(326, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(81,217,209,0.38)';
      ctx.beginPath();
      ctx.moveTo(182, 164); ctx.lineTo(191, 151); ctx.lineTo(191, 142);
      ctx.moveTo(325, 164); ctx.lineTo(316, 151); ctx.lineTo(316, 142);
      ctx.moveTo(182, 395); ctx.lineTo(191, 408); ctx.lineTo(191, 417);
      ctx.moveTo(325, 395); ctx.lineTo(316, 408); ctx.lineTo(316, 417);
      ctx.stroke();
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(179, 114, 9, 3); ctx.fillRect(318, 114, 9, 3);
      ctx.fillRect(179, 421, 9, 3); ctx.fillRect(318, 421, 9, 3);
      ctx.fillStyle = DATA.palette.acid;
      ctx.fillRect(29, 106, 49, 4);
      ctx.fillRect(139, 423, 16, 3);

      // A chunky route trace gives the right well a little motion without
      // competing with the astronaut silhouette.
      ctx.strokeStyle = 'rgba(81,217,209,0.42)';
      ctx.beginPath();
      ctx.moveTo(183, 284); ctx.lineTo(217, 252); ctx.lineTo(254, 268); ctx.lineTo(313, 211);
      ctx.stroke();
      ctx.fillStyle = DATA.palette.acid;
      ctx.fillRect(214, 249, 4, 4); ctx.fillRect(251, 265, 4, 4); ctx.fillRect(310, 208, 4, 4);
      this.drawAstronaut(
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterAnchor.x,
        COCKPIT_MAIN_INFO_EXPANDED_LAYOUT.characterAnchor.y,
        classData,
        4.25,
        Math.PI / 2,
        true
      );
    }

    drawCockpitNavAssets() {
      const idle = this.assetImage('ui.cockpit.nav_idle');
      const active = this.assetImage('ui.cockpit.nav_active');
      if (!idle || !active) return false;
      this.drawImageRegionAsset('ui.cockpit.shell', 0, 557, W, 83, 0, 557, W, 83);
      const labels = ['档案', '活动', '派遣', '任务', '升级'];
      const pages = ['archive', 'activity', 'main', 'tasks', 'upgrade'];
      for (let index = 0; index < labels.length; index += 1) {
        const selected = pages[index] === this.hqPage;
        const x = 11 + index * 68;
        const y = selected ? 563 : 565;
        const width = selected ? 66 : 64;
        const height = selected ? 73 : 70;
        this.drawImageAsset(selected ? 'ui.cockpit.nav_active' : 'ui.cockpit.nav_idle', x, y, width, height);
        // The tile's usable text well is above the indicator pips. Keep one
        // shared baseline for all five states so the label is optically
        // centered instead of sitting against the lower rail.
        this.text(labels[index], x + width / 2, 599, 15, selected ? DATA.palette.acid : '#d0cbb6', 'center', true);
        this.buttons.push({
          x: index * 68 + 7, y: 563, w: 68, h: 77, disabled: false,
          action: () => {
            if (pages[index] === 'archive' && this.hqPage !== 'archive') {
              this.archiveSkillTab = 'skills';
            }
            this.hqPage = pages[index];
          }
        });
      }
      return true;
    }

    drawHQNav() {
      if (this.assetImage('ui.cockpit.shell') && this.drawCockpitNavAssets()) return;
      if (this.hqPage !== 'main' && this.assetImage(`ui.cockpit.${this.hqPage}_shell`) && this.drawCockpitNavHotspots()) return;
      const labels = ['档案', '活动', '派遣', '任务', '升级'];
      const pages = ['archive', 'activity', 'main', 'tasks', 'upgrade'];
      const ctx = this.ctx;
      ctx.fillStyle = '#080b0c';
      ctx.fillRect(0, 557, W, 83);
      ctx.fillStyle = '#273033';
      ctx.fillRect(13, 557, 334, 3);
      ctx.fillStyle = '#111819';
      ctx.fillRect(13, 562, 334, 72);
      for (let index = 0; index < labels.length; index += 1) {
        const x = 17 + index * 66;
        const y = 566;
        const w = 58;
        const h = 65;
        const selected = pages[index] === this.hqPage;
        const dispatch = index === 2;
        this.panel(x, y, w, h, { uiVariant: 'standard', fill: selected && dispatch ? '#b8e33f' : '#101719', stroke: selected ? (dispatch ? DATA.palette.acid : DATA.palette.cyan) : '#535b57', accent: selected ? (dispatch ? DATA.palette.acid : DATA.palette.cyan) : '#4b5652', accentWidth: selected ? 3 : 1 });
        if (selected && dispatch) {
          ctx.fillStyle = '#d7f75a';
          ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
          ctx.fillStyle = '#89b72d';
          ctx.fillRect(x + 9, y + h - 13, w - 18, 3);
          ctx.fillRect(x + 9, y + 9, 13, 2);
          ctx.fillRect(x + w - 22, y + 9, 13, 2);
        }
        const textColor = selected ? (dispatch ? DATA.palette.ink : DATA.palette.paper) : '#d0cbb6';
        this.text(labels[index], x + w / 2, y + 31, 13, textColor, 'center', true);
        ctx.fillStyle = selected && dispatch ? DATA.palette.ink : DATA.palette.cyan;
        for (let pip = 0; pip < (selected ? 3 : 2); pip += 1) ctx.fillRect(x + 17 + pip * 9, y + 55, 6, 3);
        this.buttons.push({
          x: index * 66 + 10, y: 557, w: 66, h: 83, disabled: false,
          action: () => {
            if (pages[index] === 'archive' && this.hqPage !== 'archive') {
              this.archiveSkillTab = 'skills';
            }
            this.hqPage = pages[index];
          }
        });
      }
    }

    evolutionRecipeText(classData, evolution) {
      const requires = Array.isArray(evolution && evolution.requires) ? evolution.requires : [];
      if (requires.length < 2) return '配方：条件待补充';
      const names = requires.slice(0, 2).map((skillId) => {
        const skill = (classData.cards || []).find((card) => card.id === skillId);
        return skill ? skill.name : skillId;
      });
      return `配方：${names[0]} Lv.3 + ${names[1]} Lv.3`;
    }

    drawArchiveSkillTab(classData) {
      const skillCards = Array.isArray(classData.cards) ? classData.cards : [];
      const layout = COCKPIT_ARCHIVE_LAYOUT;
      const clip = layout.skillContent;
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      // Reintroduce the reference panel's quiet row cadence after the live
      // content well has been cleaned from the bitmap shell.
      ctx.fillStyle = 'rgba(64, 92, 91, 0.22)';
      for (let row = 0; row < 5; row += 1) {
        ctx.fillRect(31, layout.skillStartY + 11 + row * layout.skillRowHeight, 298, 1);
      }
      skillCards.forEach((card, index) => {
        const x = layout.skillColumns[index % layout.skillColumns.length];
        const y = layout.skillStartY + Math.floor(index / layout.skillColumns.length) * layout.skillRowHeight;
        const iconColor = card.kind === 'survival' ? DATA.palette.cyan : classData.color;
        this.drawPixelIcon(card.id, x, y - 9, 16, iconColor, classData.id);
        this.text(card.name, x + 22, y + 3, 9.5, DATA.palette.paper, 'left', true);
      });
      ctx.restore();
    }

    drawArchiveComboTab(classData) {
      const evolutions = Array.isArray(classData.evolutions) ? classData.evolutions : [];
      const layout = COCKPIT_ARCHIVE_LAYOUT;
      const clip = layout.skillContent;
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      ctx.fillStyle = 'rgba(64, 92, 91, 0.22)';
      ctx.fillRect(178, clip.y + 3, 1, clip.h - 6);
      for (let row = 0; row < 2; row += 1) {
        ctx.fillRect(31, layout.comboStartY + 33 + row * layout.comboRowHeight, 298, 1);
      }
      evolutions.forEach((evolution, index) => {
        const x = layout.comboColumns[index % layout.comboColumns.length];
        const y = layout.comboStartY + Math.floor(index / layout.comboColumns.length) * layout.comboRowHeight;
        this.drawPixelIcon(evolution.id, x, y - 10, 16, DATA.palette.acid, classData.id);
        this.text(evolution.name, x + 21, y, 8, DATA.palette.acid, 'left', true);
        this.wrap(this.evolutionRecipeText(classData, evolution), x + 21, y + 10, 124, 7, 6.2, DATA.palette.paper, 1);
        this.wrap(String(evolution.desc || '效果待补充'), x + 21, y + 20, 124, 8, 6.4, DATA.palette.muted, 2);
      });
      ctx.restore();
    }

    drawCockpitSubpageShell(page) {
      const shellKey = `ui.cockpit.${page}_shell`;
      if (!this.assetImage(shellKey)) return false;
      this.drawImageAsset(shellKey, 0, 0, W, H);
      // Keep the same physical header as dispatch. Only the section title
      // changes between the five HQ modules; the logo, credit bay, and frame
      // remain pixel-aligned across every page.
      this.drawImageRegionAsset('ui.cockpit.shell', 0, 0, W, 94, 0, 0, W, 94);
      const titles = {
        archive: '员工档案 // 角色资料',
        activity: '活动 // 外勤出勤签到',
        tasks: '任务 // 每日绩效',
        upgrade: '升级 // 飞船模块'
      };
      this.drawCockpitHeader(titles[page] || '飞船驾驶舱 // 外勤调度');
      return true;
    }

    drawCockpitNavHotspots() {
      const pages = ['archive', 'activity', 'main', 'tasks', 'upgrade'];
      for (let index = 0; index < pages.length; index += 1) {
        this.buttons.push({
          x: index * 68 + 7,
          y: 563,
          w: 68,
          h: 77,
          disabled: false,
          action: () => {
            if (pages[index] === 'archive' && this.hqPage !== 'archive') this.archiveSkillTab = 'skills';
            this.hqPage = pages[index];
          }
        });
      }
      return true;
    }

    drawArchivePageCockpit() {
      if (!this.drawCockpitSubpageShell('archive')) return false;
      const activeId = this.archiveClassId || this.save.selectedClass;
      const classData = DATA.classById[activeId] || DATA.classes[0];
      const unlocked = this.isClassUnlocked(classData);
      const skillCards = Array.isArray(classData.cards) ? classData.cards : [];
      const evolutions = Array.isArray(classData.evolutions) ? classData.evolutions : [];

      DATA.classes.forEach((item, index) => {
        const x = COCKPIT_LAYOUT.archiveRoleTabs.x + index * (COCKPIT_LAYOUT.archiveRoleTabs.w + COCKPIT_LAYOUT.archiveRoleTabs.gap);
        const active = item.id === classData.id;
        this.button(x, COCKPIT_LAYOUT.archiveRoleTabs.y, COCKPIT_LAYOUT.archiveRoleTabs.w, COCKPIT_LAYOUT.archiveRoleTabs.h, item.name, () => { this.archiveClassId = item.id; }, {
          fill: active ? item.color : '#20292c',
          text: active ? DATA.palette.ink : DATA.palette.paper,
          ink: active ? DATA.palette.ink : DATA.palette.paper,
          stroke: active ? item.color : '#59666a',
          size: 10
        });
      });

      // Match the taller reference profile: the standing portrait owns the
      // left half while the employee copy follows a relaxed right-column
      // rhythm inside the same chassis.
      // Keep the sprite's visible right edge clear of the text column. The
      // reference profile gives the portrait its own left bay, with a quiet
      // breathing gap before the employee copy begins at x=130.
      this.drawAstronaut(74, 284, classData, 2.5, Math.PI / 2, true);
      this.text(classData.employee, 130, 158, 20, unlocked ? classData.color : DATA.palette.muted, 'left', true);
      this.text(classData.name, 130, 179, 13, DATA.palette.paper, 'left', true);
      this.text('人物介绍', 130, 201, 8, DATA.palette.muted, 'left', true, true);
      this.wrap(classData.quote || '', 130, 220, 198, 15, 10, DATA.palette.paper, 3);
      this.text('战斗风格', 130, 269, 8, DATA.palette.muted, 'left', true, true);
      this.wrap(classData.role, 130, 288, 198, 15, 10, classData.color, 2);

      const skillsActive = this.archiveSkillTab !== 'combos';
      this.button(24, 313, 145, 35, '代表技能', () => {
        this.archiveSkillTab = 'skills';
      }, {
        fill: skillsActive ? classData.color : '#20292c',
        text: skillsActive ? DATA.palette.ink : DATA.palette.paper,
        ink: skillsActive ? DATA.palette.ink : DATA.palette.paper,
        stroke: skillsActive ? classData.color : '#59666a',
        size: 8
      });
      this.button(191, 313, 145, 35, '组合技', () => {
        this.archiveSkillTab = 'combos';
      }, {
        fill: !skillsActive ? classData.color : '#20292c',
        text: !skillsActive ? DATA.palette.ink : DATA.palette.paper,
        ink: !skillsActive ? DATA.palette.ink : DATA.palette.paper,
        stroke: !skillsActive ? classData.color : '#59666a',
        size: 8
      });
      if (skillsActive) this.drawArchiveSkillTab(classData);
      else this.drawArchiveComboTab(classData);

      this.cockpitFrameButton(24, 512, 312, 38,
        unlocked
          ? (this.save.selectedClass === classData.id ? '当前出勤员工' : '设为当前员工')
          : '档案待解锁',
        () => {
          if (unlocked) {
            this.save.selectedClass = classData.id;
            this.persist();
          } else {
            this.unlockClass(classData);
          }
        },
        { size: 11, baseline: 24, text: unlocked ? classData.color : DATA.palette.muted, disabled: !unlocked || this.save.selectedClass === classData.id }
      );
      return true;
    }

    drawArchivePage() {
      if (this.drawArchivePageCockpit()) return;
      this.drawHeader('员工档案 // 角色资料');
      const activeId = this.archiveClassId || this.save.selectedClass;
      const classData = DATA.classById[activeId] || DATA.classes[0];
      const archiveQuote = {
        gunner: '她把每一发子弹都当成一份需要签字的报告。',
        warrior: '他相信贴近问题，问题就会先失去行动能力。',
        mechanic: '他坚持每台机器人都应拥有带薪维护日。'
      }[classData.id] || classData.quote;
      const archiveSkillNotes = {
        gunner: ['连续弹道压制', '近距离扇面清线', '贯穿整条航线'],
        warrior: ['扇面范围斩击', '快速追加近战攻击', '释放远距离剑气'],
        mechanic: ['部署跟随无人机', '建立自动火力节点', '持续修复作业身体']
      }[classData.id] || [];
      DATA.classes.forEach((item, index) => {
        const x = 16 + index * 110;
        const active = item.id === classData.id;
        this.button(x, 72, 104, 30, item.name, () => { this.archiveClassId = item.id; }, {
          fill: active ? item.color : '#20292c', text: active ? DATA.palette.ink : DATA.palette.paper, ink: active ? DATA.palette.ink : DATA.palette.paper, stroke: active ? item.color : '#59666a', size: 10
        });
      });
      const unlocked = this.isClassUnlocked(classData);
      this.panel(16, 112, 328, 157, { uiVariant: 'inset', fill: '#11191b', stroke: unlocked ? classData.color : '#4a4d49', accent: unlocked ? classData.color : '#4a4d49', accentWidth: 4 });
      this.drawAstronaut(73, 246, classData, 2.2, Math.PI / 2, true);
      this.text(classData.employee, 125, 140, 20, unlocked ? classData.color : DATA.palette.muted, 'left', true);
      this.text(classData.name, 125, 160, 12, DATA.palette.paper, 'left', true);
      this.text('人物介绍', 125, 186, 8, DATA.palette.muted, 'left', true, true);
      this.wrap(archiveQuote, 125, 204, 196, 15, 10, DATA.palette.paper, 3);
      this.text('战斗风格', 125, 248, 8, DATA.palette.muted, 'left', true, true);
      this.wrap(classData.role, 125, 263, 196, 15, 10, classData.color, 2);

      const skillCards = Array.isArray(classData.cards) ? classData.cards : [];
      const evolutions = Array.isArray(classData.evolutions) ? classData.evolutions : [];
      this.panel(16, 280, 328, 242, { fill: '#101719', stroke: '#4d5752', accent: classData.color });
      const skillsActive = this.archiveSkillTab !== 'combos';
      this.button(24, 289, 145, 24, '代表技能', () => {
        this.archiveSkillTab = 'skills';
      }, {
        fill: skillsActive ? classData.color : '#20292c',
        text: skillsActive ? DATA.palette.ink : DATA.palette.paper,
        ink: skillsActive ? DATA.palette.ink : DATA.palette.paper,
        imageText: skillsActive ? classData.color : DATA.palette.paper,
        stroke: skillsActive ? classData.color : '#59666a',
        size: 8
      });
      this.button(191, 289, 145, 24, '组合技', () => {
        this.archiveSkillTab = 'combos';
      }, {
        fill: !skillsActive ? classData.color : '#20292c',
        text: !skillsActive ? DATA.palette.ink : DATA.palette.paper,
        ink: !skillsActive ? DATA.palette.ink : DATA.palette.paper,
        imageText: !skillsActive ? classData.color : DATA.palette.paper,
        stroke: !skillsActive ? classData.color : '#59666a',
        size: 8
      });
      // Button image skins are shared across the HQ, so add a role-colored
      // pixel accent after drawing the tab to keep the active state obvious.
      this.ctx.fillStyle = classData.color;
      if (skillsActive) this.ctx.fillRect(28, 289, 137, 3);
      else this.ctx.fillRect(195, 289, 137, 3);
      if (skillsActive) this.drawArchiveSkillTab(classData);
      else this.drawArchiveComboTab(classData);
      if (unlocked) {
        this.button(24, 527, 312, 35, this.save.selectedClass === classData.id ? '当前出勤员工' : '设为当前员工', () => {
          this.save.selectedClass = classData.id;
          this.persist();
        }, { disabled: this.save.selectedClass === classData.id, fill: classData.color, size: 11 });
      } else {
        this.button(24, 527, 312, 35, '档案待解锁', () => this.unlockClass(classData), { disabled: !this.canUnlock(classData).allowed, fill: '#28302f', text: DATA.palette.muted, ink: DATA.palette.muted, stroke: '#555a55', size: 11 });
      }
    }

    drawActivityPageCockpit() {
      if (!this.drawCockpitSubpageShell('activity')) return false;
      const key = this.ensureDailyState().cycleKey;
      const activity = this.save.activity;
      // Match the reference card's internal hierarchy: the section kicker,
      // streak value, and refresh line sit inside the tall upper well instead
      // of straddling its top frame.
      this.text('7-DAY FIELD ATTENDANCE', 30, 120, 8, DATA.palette.muted, 'left', true, true);
      this.text(`连续签到 ${activity.streak || 0} 天`, 30, 161, 18, DATA.palette.paper, 'left', true);
      this.text(`刷新周期 ${key} // 04:00`, 30, 190, 9, DATA.palette.muted, 'left');
      for (let index = 0; index < 7; index += 1) {
        const x = 18 + index * 46;
        const claimed = (activity.claimedDays || []).includes(key) && index < ((activity.streak - 1) % 7) + 1;
        const current = index === ((activity.streak || 1) - 1) % 7 && activity.lastClaimKey !== key;
        this.panel(x, 214, 40, 75, {
          fill: claimed ? '#314329' : '#182123',
          stroke: current ? DATA.palette.acid : '#47514c',
          accent: current ? DATA.palette.acid : '#47514c',
          accentWidth: current ? 3 : 1
        });
        this.text(`D${index + 1}`, x + 20, 243, 8, current ? DATA.palette.acid : DATA.palette.muted, 'center', true, true);
        this.text(`+${DATA.activityRewards[index]}`, x + 20, 274, 11, claimed ? DATA.palette.acid : DATA.palette.paper, 'center', true);
      }
      this.cockpitFrameButton(24, 303, 312, 54,
        activity.lastClaimKey === key ? '今日已签到' : '领取今日签到奖励',
        () => this.claimCheckIn(),
        // The source button's text well is vertically centered around the
        // inner green face, not the outer chassis height.
        { disabled: activity.lastClaimKey === key, size: 16, baseline: 34, text: DATA.palette.ink }
      );
      // Align the live announcement copy to the source panel's inner wells.
      // The previous baselines belonged to the compact fallback page and
      // placed the copy above the pixel-backed announcement frame.
      this.text('外勤公告', 30, 397, 9, DATA.palette.muted, 'left', true, true);
      this.text('本周任务回收率持续上升', 30, 430, 13, DATA.palette.paper, 'left', true);
      this.wrap('连续签到会提高下一次任务工资。中断签到不会影响已获得金币，但会重新计算本周奖励序列。', 30, 457, 292, 16, 10, DATA.palette.muted, 4);
      this.text('活动奖励仅存在本机档案', 30, 508, 8, DATA.palette.orange, 'left', true, true);
      return true;
    }

    drawActivityPage() {
      if (this.drawActivityPageCockpit()) return;
      this.drawHeader('活动 // 外勤出勤签到');
      const key = this.ensureDailyState().cycleKey;
      const activity = this.save.activity;
      this.panel(16, 72, 328, 106, { fill: '#11191b', stroke: DATA.palette.acid, accent: DATA.palette.acid });
      this.text('7-DAY FIELD ATTENDANCE', 30, 95, 8, DATA.palette.muted, 'left', true, true);
      this.text(`连续签到 ${activity.streak || 0} 天`, 30, 124, 18, DATA.palette.paper, 'left', true);
      this.text(`刷新周期 ${key} // 04:00`, 30, 149, 9, DATA.palette.muted, 'left');
      for (let index = 0; index < 7; index += 1) {
        const x = 18 + index * 46;
        const claimed = (activity.claimedDays || []).includes(key) && index < ((activity.streak - 1) % 7) + 1;
        const current = index === ((activity.streak || 1) - 1) % 7 && activity.lastClaimKey !== key;
        this.panel(x, 193, 40, 57, { fill: claimed ? '#314329' : '#182123', stroke: current ? DATA.palette.acid : '#47514c', accent: current ? DATA.palette.acid : '#47514c', accentWidth: current ? 3 : 1 });
        this.text(`D${index + 1}`, x + 20, 210, 8, current ? DATA.palette.acid : DATA.palette.muted, 'center', true, true);
        this.text(`+${DATA.activityRewards[index]}`, x + 20, 235, 11, claimed ? DATA.palette.acid : DATA.palette.paper, 'center', true);
      }
      this.button(24, 267, 312, 42, activity.lastClaimKey === key ? '今日已签到' : '领取今日签到奖励', () => this.claimCheckIn(), { disabled: activity.lastClaimKey === key, fill: DATA.palette.acid, size: 13 });
      this.panel(16, 329, 328, 177, { fill: '#101719', stroke: '#4d5752', accent: DATA.palette.cyan });
      this.text('外勤公告', 30, 355, 9, DATA.palette.muted, 'left', true, true);
      this.text('本周任务回收率持续上升', 30, 383, 13, DATA.palette.paper, 'left', true);
      this.wrap('连续签到会提高下一次任务工资。中断签到不会影响已获得金币，但会重新计算本周奖励序列。', 30, 410, 292, 16, 10, DATA.palette.muted, 4);
      this.text('活动奖励仅保存在本机档案', 30, 487, 8, DATA.palette.orange, 'left', true, true);
    }

    drawTasksPageCockpit() {
      if (!this.drawCockpitSubpageShell('tasks')) return false;
      const daily = this.ensureDailyState();
      this.text(`今日活跃点 ${this.dailyActivePoints()}/3`, 22, 105, 11, DATA.palette.acid, 'left', true);
      DATA.dailyTasks.forEach((task, index) => {
        const y = 116 + index * 100;
        const progress = Math.min(task.target, daily.progress[task.metric] || 0);
        const complete = daily.claimedTasks.includes(task.id);
        const color = complete ? DATA.palette.acid : DATA.palette.orange;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(31, y + 4, complete ? 52 : 38, 2);
        // The reference card uses a larger title well and a taller right
        // action chassis than the compact fallback layout.
        this.text(task.label, 30, y + 32, 12, DATA.palette.paper, 'left', true);
        this.text(`${progress}/${task.target}`, 320, y + 32, 10, complete ? DATA.palette.acid : DATA.palette.muted, 'right', true, true);
        this.drawSmallBar(30, y + 45, 184, progress / task.target, color);
        this.button(220, y + 34, 110, 40, complete ? '已领取' : `领取 +${task.reward}`, () => this.claimDailyTask(task.id), {
          disabled: complete || progress < task.target,
          fill: complete ? '#27342a' : DATA.palette.acid,
          text: complete ? DATA.palette.acid : DATA.palette.ink,
          ink: complete ? DATA.palette.acid : DATA.palette.ink,
          stroke: complete ? DATA.palette.acid : DATA.palette.acid,
          size: 11
        });
      });
      this.text('活跃度阶段奖励', 30, 443, 9, DATA.palette.cyan, 'left', true, true);
      DATA.activityMilestones.forEach((milestone, index) => {
        const x = 30 + index * 145;
        const complete = daily.claimedMilestones.includes(milestone.id);
        this.text(`${milestone.points} 项`, x, 470, 10, complete ? DATA.palette.acid : DATA.palette.paper, 'left', true);
        this.button(x, 480, 120, 30, complete ? '已领取' : `领取 +${milestone.reward}`, () => this.claimActivityMilestone(milestone.id), {
          disabled: complete || this.dailyActivePoints() < milestone.points,
          fill: complete ? '#27342a' : '#202b2d',
          text: complete ? DATA.palette.acid : DATA.palette.paper,
          ink: complete ? DATA.palette.acid : DATA.palette.paper,
          stroke: DATA.palette.cyan,
          size: 9
        });
      });
      this.text('每日任务将在 04:00 自动刷新', 30, 529, 8, DATA.palette.muted, 'left', true, true);
      return true;
    }

    drawTasksPage() {
      if (this.drawTasksPageCockpit()) return;
      this.drawHeader('任务 // 每日绩效');
      const daily = this.ensureDailyState();
      this.text(`今日活跃点 ${this.dailyActivePoints()}/3`, 22, 78, 11, DATA.palette.acid, 'left', true);
      DATA.dailyTasks.forEach((task, index) => {
        const y = 94 + index * 92;
        const progress = Math.min(task.target, daily.progress[task.metric] || 0);
        const complete = daily.claimedTasks.includes(task.id);
        this.panel(16, y, 328, 78, { fill: '#11191b', stroke: complete ? DATA.palette.acid : '#4d5752', accent: complete ? DATA.palette.acid : DATA.palette.orange });
        this.text(task.label, 30, y + 23, 11, DATA.palette.paper, 'left', true);
        this.text(`${progress}/${task.target}`, 320, y + 23, 9, complete ? DATA.palette.acid : DATA.palette.muted, 'right', true, true);
        this.drawSmallBar(30, y + 35, 184, progress / task.target, complete ? DATA.palette.acid : DATA.palette.orange);
        this.button(232, y + 33, 98, 30, complete ? '已领取' : `领取 +${task.reward}`, () => this.claimDailyTask(task.id), { disabled: complete || progress < task.target, fill: complete ? '#27342a' : DATA.palette.acid, text: complete ? DATA.palette.acid : DATA.palette.ink, ink: complete ? DATA.palette.acid : DATA.palette.ink, stroke: complete ? DATA.palette.acid : DATA.palette.acid, size: 9 });
      });
      this.panel(16, 386, 328, 115, { fill: '#11191b', stroke: DATA.palette.cyan, accent: DATA.palette.cyan });
      this.text('活跃度阶段奖励', 30, 411, 9, DATA.palette.muted, 'left', true, true);
      DATA.activityMilestones.forEach((milestone, index) => {
        const x = 30 + index * 145;
        const complete = daily.claimedMilestones.includes(milestone.id);
        this.text(`${milestone.points} 项`, x, 440, 10, complete ? DATA.palette.acid : DATA.palette.paper, 'left', true);
        this.button(x, 454, 120, 30, complete ? '已领取' : `领取 +${milestone.reward}`, () => this.claimActivityMilestone(milestone.id), { disabled: complete || this.dailyActivePoints() < milestone.points, fill: complete ? '#27342a' : '#202b2d', text: complete ? DATA.palette.acid : DATA.palette.paper, ink: complete ? DATA.palette.acid : DATA.palette.paper, stroke: DATA.palette.cyan, size: 9 });
      });
      this.text('每日任务将在 04:00 自动刷新', 30, 487, 8, DATA.palette.muted, 'left', true, true);
    }

    drawUpgradePageCockpit() {
      if (!this.drawCockpitSubpageShell('upgrade')) return false;
      DATA.shipModules.forEach((moduleData, index) => {
        // The normalized upgrade master keeps the large module icon in the
        // left rail and starts the live copy at x=90. Keep the five rows on
        // the same 84px cadence as the source cards.
        const y = 100 + index * 84;
        const textX = 90;
        const level = clamp(Math.floor(Number(this.save.modules[moduleData.id]) || 0), 0, LIMITS.moduleLevel);
        const maxed = level >= LIMITS.moduleLevel;
        const cost = maxed ? 0 : moduleData.costs[level];
        this.text(moduleData.name, textX, y + 23, 13, DATA.palette.paper, 'left', true);
        this.text(moduleData.desc, textX, y + 43, 9, DATA.palette.muted, 'left');
        this.text(`LV ${level}/${LIMITS.moduleLevel}`, textX, y + 60, 9, maxed || level ? DATA.palette.acid : DATA.palette.muted, 'left', true, true);
        this.button(244, y + 11, 88, 44, maxed ? '已满级' : (this.save.credits < cost ? '金币不足' : `升级 ${cost}`), () => this.upgradeModule(moduleData), {
          disabled: maxed || this.save.credits < cost,
          fill: DATA.palette.acid,
          solid: true,
          solidFill: '#b8e33f',
          text: DATA.palette.ink,
          disabledText: DATA.palette.paper,
          size: 11
        });
      });
      this.text('功能升级只影响未来任务，不改变随机派遣结果', 180, 551, 8, DATA.palette.muted, 'center', true);
      return true;
    }

    drawUpgradePage() {
      if (this.drawUpgradePageCockpit()) return;
      this.drawHeader('升级 // 飞船模块');
      DATA.shipModules.forEach((moduleData, index) => {
        const y = 72 + index * 84;
        const level = clamp(Math.floor(Number(this.save.modules[moduleData.id]) || 0), 0, LIMITS.moduleLevel);
        const maxed = level >= LIMITS.moduleLevel;
        const cost = maxed ? 0 : moduleData.costs[level];
        this.panel(16, y, 328, 71, { fill: '#11191b', stroke: level ? DATA.palette.acid : '#4d5752', accent: level ? DATA.palette.acid : '#59625d' });
        this.drawPixelIcon(moduleData.id, 28, y + 19, 28, level ? DATA.palette.acid : DATA.palette.muted);
        this.text(moduleData.name, 67, y + 23, 12, DATA.palette.paper, 'left', true);
        this.text(moduleData.desc, 67, y + 43, 8, DATA.palette.muted, 'left');
        this.text(`LV ${level}/${LIMITS.moduleLevel}`, 67, y + 59, 8, maxed ? DATA.palette.acid : (level ? DATA.palette.acid : DATA.palette.muted), 'left', true, true);
        this.button(250, y + 18, 80, 32, maxed ? '已满级' : (this.save.credits < cost ? '金币不足' : `升级 ${cost}`), () => this.upgradeModule(moduleData), {
          disabled: maxed || this.save.credits < cost,
          fill: DATA.palette.acid,
          disabledText: maxed ? DATA.palette.acid : DATA.palette.paper,
          size: 9
        });
      });
      this.text('功能升级只影响未来任务，不改变随机派遣结果', 180, 501, 8, DATA.palette.muted, 'center', true);
    }

    drawBriefing() {
      this.drawStarfield();
      this.drawHeader('强制任务简报');
      const { planet, mission, anomaly } = this.contract;
      const anomalyInfo = this.anomalyDetails(anomaly);
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

      if (this.anomalyRulesEnabled()) {
        this.panel(22, 421, 316, 96, { fill: '#15181b', stroke: '#55544e', accent: scanner > 0 ? planet.accent : '#55554e' });
      this.text('ANOMALY // 异常规则', 41, 444, 8, DATA.palette.muted, 'left', true, true);
      if (scanner >= 0) {
        this.drawAtlasIcon(anomalyInfo.id, 39, 456, 28);
        this.text(anomalyInfo.name, 76, 470, 14, planet.accent, 'left', true);
        this.wrap(`影响：${anomalyInfo.effect}`, 76, 486, 236, 10, 8, DATA.palette.paper, 1);
        if (scanner > 1) this.wrap(`建议：${anomalyInfo.tip}`, 76, 500, 236, 9, 7, DATA.palette.muted, 1);
      } else {
        this.drawAtlasIcon('lock', 40, 456, 27);
        this.text('信号受阻 // 降落后确认', 76, 469, 11, DATA.palette.orange, 'left', true);
        this.text('着陆后观察预警并保持移动', 76, 490, 8, DATA.palette.muted, 'left');
      }

      }
      this.button(25, 527, 145, 56, '返回驾驶舱', () => {
        this.returnToHQ();
      }, { fill: '#242d30', text: DATA.palette.paper, ink: DATA.palette.paper, stroke: '#59666a', size: 11 });
      this.button(180, 527, 155, 56, '确认降落  ▼', () => this.beginRun(), { fill: DATA.palette.acid, size: 12 });
      this.text('任务不可刷新 // 合同编号自动归档', 180, 613, 8, DATA.palette.muted, 'center', true, true);
    }

    drawPlanetMark(x, y, planet) {
      const planetAssets = this.assets && this.assets.manifest && this.assets.manifest.planetAssets;
      const planetSpec = planetAssets && planet ? planetAssets[planet.id] : null;
      if (planetSpec) {
        const cover = this.assetImage(planetSpec.cover) || this.assetImage(planetSpec.icon);
        if (cover) {
          this.ctx.drawImage(cover, Math.round(x - 39), Math.round(y - 39), 78, 78);
          return true;
        }
      }
      const iconId = planet && planet.id === 'rust' ? 'planet_rust' : (planet && planet.id === 'spore' ? 'planet_spore' : 'planet_moon');
      if (this.drawAtlasIcon(iconId, x - 39, y - 39, 78)) return true;
      // Last-resort fallback keeps the same stepped pixel-sphere silhouette
      // for all ecosystems. It deliberately has no orbit ring or geometric
      // marker, so a failed image load cannot reintroduce an old placeholder.
      const ctx = this.ctx;
      const scale = 78 / 32;
      const palette = planet && planet.id === 'rust'
        ? { edge: '#3a211b', body: '#9b4b24', shade: '#5a2c20', hi: '#ff9b3f', accent: '#ffb34f' }
        : (planet && planet.id === 'spore'
          ? { edge: '#20152b', body: '#5b3b6f', shade: '#322545', hi: '#a9e95a', accent: '#cf7bff' }
          : { edge: '#0d1215', body: '#4e5b5f', shade: '#243034', hi: '#aafff3', accent: '#53dbd3' });
      const rect = (left, top, width, height, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(left * scale), Math.round(top * scale), Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      };
      ctx.save();
      ctx.translate(Math.round(x - 39), Math.round(y - 39));
      ctx.fillStyle = palette.edge;
      ctx.beginPath();
      ctx.moveTo(8 * scale, 1 * scale);
      ctx.lineTo(24 * scale, 1 * scale);
      ctx.lineTo(28 * scale, 5 * scale);
      ctx.lineTo(30 * scale, 11 * scale);
      ctx.lineTo(31 * scale, 21 * scale);
      ctx.lineTo(25 * scale, 28 * scale);
      ctx.lineTo(19 * scale, 30 * scale);
      ctx.lineTo(9 * scale, 30 * scale);
      ctx.lineTo(3 * scale, 27 * scale);
      ctx.lineTo(1 * scale, 23 * scale);
      ctx.lineTo(1 * scale, 12 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.moveTo(9 * scale, 3 * scale);
      ctx.lineTo(23 * scale, 3 * scale);
      ctx.lineTo(27 * scale, 7 * scale);
      ctx.lineTo(29 * scale, 20 * scale);
      ctx.lineTo(23 * scale, 27 * scale);
      ctx.lineTo(10 * scale, 29 * scale);
      ctx.lineTo(4 * scale, 24 * scale);
      ctx.lineTo(3 * scale, 13 * scale);
      ctx.lineTo(7 * scale, 5 * scale);
      ctx.closePath();
      ctx.fill();
      rect(7, 7, 6, 5, palette.shade);
      rect(19, 6, 6, 4, palette.hi);
      rect(12, 13, 7, 5, palette.shade);
      rect(23, 16, 5, 6, palette.shade);
      rect(6, 21, 5, 4, palette.hi);
      rect(16, 23, 6, 5, palette.shade);
      rect(7, 18, 3, 2, palette.accent);
      rect(10, 18, 3, 2, palette.accent);
      rect(13, 17, 3, 2, palette.accent);
      rect(16, 17, 3, 2, palette.accent);
      rect(19, 16, 3, 2, palette.accent);
      rect(22, 8, 3, 3, palette.hi);
      ctx.restore();
      return true;
    }

    drawPlaying() {
      const ctx = this.ctx;
      const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      ctx.save();
      ctx.translate(sx, sy);
      this.drawWorld();
      ctx.restore();
      this.drawFutureHUD();
      if (this.notice) this.drawNotice();
      if (this.save.firstRun) this.drawTutorial();
      if (this.state === 'playing' && !this.save.firstRun) this.drawExitButton();
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
      this.drawWorldVfx('under');
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
      // Character VFX are rendered after actors and before projectiles so
      // the transparent action frame stays clean and the effect can overlap
      // the astronaut without being baked into the sprite sheet.
      this.drawCharacterVfx();
      this.drawPlayerShieldOverlay();
      this.drawWorldVfx('over');
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
      } else if (this.contract.planet.id === 'spore') {
        ctx.fillStyle = prop.kind % 2 ? '#47315a' : '#3b2949';
        ctx.beginPath();
        ctx.arc(x, y - 6 * s, 7 * s, 0, TAU);
        ctx.fill();
        ctx.fillStyle = planet.accent;
        ctx.fillRect(Math.round(x - 2 * s), Math.round(y - 11 * s), Math.round(4 * s), Math.round(4 * s));
        ctx.fillStyle = '#7e4d9e';
        ctx.fillRect(Math.round(x - 9 * s), Math.round(y - 4 * s), Math.round(3 * s), Math.round(8 * s));
      } else {
        // Moon props should never fall back to the old triangle placeholder.
        // Keep a small, neutral pixel debris mark if the dedicated image is
        // unavailable so a failed optional asset cannot resemble a UI icon.
        ctx.fillStyle = prop.kind % 2 ? '#42565c' : '#34464c';
        ctx.fillRect(Math.round(x - 9 * s), Math.round(y - 4 * s), Math.round(18 * s), Math.max(2, Math.round(7 * s)));
        ctx.fillStyle = planet.accent;
        ctx.fillRect(Math.round(x - 5 * s), Math.round(y - 6 * s), Math.max(2, Math.round(4 * s)), Math.max(1, Math.round(2 * s)));
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
            if (this.contract.planet.id === 'rust') {
              this.drawAnchoredObject('rust_nest', 'destroyed', screen.x, screen.y, 1, item.index * 0.1);
            }
            continue;
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
      const animationPhase = this.nestAnimationPhase(item, item.index);
      if (this.contract.planet.id === 'rust' && this.drawAnchoredObject('rust_nest', 'idle', x, y, 1, animationPhase)) return;
      if (this.contract.planet.id === 'spore' && this.drawAnchoredObject('spore_nest', 'idle', x, y, 1, animationPhase)) return;
      if (this.contract.planet.id === 'moon' && this.drawAnchoredObject('moon_nest', 'idle', x, y, 1, animationPhase)) return;
      const ctx = this.ctx;
      // Keep the fallback silhouette grounded as well. The authored idle
      // sheets carry their own motion; a second fallback bob would make a
      // missing asset look like the nest is changing world position.
      const pulse = 0;
      ctx.fillStyle = '#08090a';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 33, 13, 0, 0, TAU);
      ctx.fill();
      if (this.contract.planet.id === 'spore') {
        // Stepped fungal growth: keep a broad, readable silhouette without
        // the old triangular placeholder used by non-rust planets.
        ctx.fillStyle = '#3b2949';
        ctx.fillRect(x - 27, y - 3, 54, 8);
        ctx.fillRect(x - 21, y - 15 - pulse, 42, 13);
        ctx.fillRect(x - 13, y - 25 - pulse, 26, 11);
        ctx.fillStyle = '#7e4d9e';
        ctx.fillRect(x - 17, y - 18 - pulse, 7, 5);
        ctx.fillRect(x + 8, y - 21 - pulse, 6, 6);
        ctx.fillStyle = this.contract.planet.accent;
        ctx.fillRect(x - 4, y - 27 - pulse, 8, 5);
      } else {
        // Low-gravity moon nest: blocky regolith tiers and a cold energy
        // core, matching the moon palette while never falling back to a
        // triangle or UI marker.
        ctx.fillStyle = '#2f4248';
        ctx.fillRect(x - 28, y - 3, 56, 8);
        ctx.fillRect(x - 21, y - 16 - pulse, 42, 14);
        ctx.fillRect(x - 12, y - 26 - pulse, 24, 11);
        ctx.fillStyle = '#52666b';
        ctx.fillRect(x - 16, y - 19 - pulse, 8, 5);
        ctx.fillRect(x + 9, y - 13 - pulse, 7, 5);
        ctx.fillStyle = this.contract.planet.accent;
        ctx.fillRect(x - 4, y - 28 - pulse, 8, 6);
      }
    }

    drawBeacon(x, y, item, active) {
      const ctx = this.ctx;
      const inside = dist(item, this.player) < (item.radius || 72);
      const rangeColor = inside ? DATA.palette.acid : DATA.palette.cyan;
      ctx.save();
      ctx.globalAlpha = inside ? 0.25 : 0.13;
      ctx.fillStyle = rangeColor;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 48, 23, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = inside ? 0.9 : 0.52;
      ctx.strokeStyle = rangeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 48, 23, 0, 0, TAU);
      ctx.stroke();
      for (let tick = 0; tick < 8; tick += 1) {
        const angle = this.now * 0.65 + tick * TAU / 8;
        const tx = x + Math.cos(angle) * 48;
        const ty = y + 4 + Math.sin(angle) * 23;
        ctx.fillRect(Math.round(tx - 1), Math.round(ty - 1), 3, 3);
      }
      ctx.restore();
      const state = item.active ? 'completed' : (active ? 'charging' : 'inactive');
      if (this.drawAnchoredObject('company_beacon', state, x, y, 1, item.index * 0.13)) {
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
    }

    drawBeaconOverlay() {
      const objective = this.world && this.world.objective;
      if (!objective || objective.id !== 'beacons') return;
      const item = objective.items[objective.current] || objective.items[objective.items.length - 1];
      if (!item) return;
      const screen = this.worldToScreen(item);
      if (screen.x < -90 || screen.x > W + 90 || screen.y < -90 || screen.y > H + 90) return;
      const inside = dist(item, this.player) < (item.radius || 72);
      const color = inside ? DATA.palette.acid : DATA.palette.cyan;
      const ratio = clamp(item.charge / item.required, 0, 1);
      this.ctx.fillStyle = 'rgba(7,10,12,0.94)';
      this.ctx.fillRect(Math.round(screen.x - 56), Math.round(screen.y - 72), 112, 23);
      this.drawProgressBar(screen.x - 52, screen.y - 68, 104, ratio, 'mission', 10);
      this.text(`${Math.floor(ratio * 100)}%`, screen.x, screen.y - 52, 8, color, 'center', true, true);
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
      if (this.drawAnchoredObject('reward_cache', 'ready', screen.x, screen.y, 1)) {
        if (dist(cache, this.player) < 118) this.drawCacheHint(screen.x, screen.y);
        return;
      }
      const ctx = this.ctx;
      ctx.fillStyle = '#080a0b';
      ctx.beginPath();
      ctx.ellipse(screen.x, screen.y + 5, 24, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = DATA.palette.acid;
      ctx.fillRect(screen.x - 20, screen.y - 18, 40, 22);
      ctx.fillStyle = '#1b211e';
      ctx.fillRect(screen.x - 16, screen.y - 14, 32, 14);
      ctx.fillStyle = DATA.palette.orange;
      ctx.fillRect(screen.x - 3, screen.y - 16, 6, 17);
      if (dist(cache, this.player) < 118) this.drawCacheHint(screen.x, screen.y);
    }

    drawCacheHint(x, y) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(7,10,12,0.9)';
      ctx.fillRect(Math.round(x - 63), Math.round(y - 48), 126, 13);
      this.text('奖励资源箱 // 靠近领取', x, y - 38, 7, DATA.palette.acid, 'center', true);
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
      if (hazard.visualOnly) return;
      if (hazard.type === 'meteor') {
        // The authored warning/impact sheets are preferred.  This fallback
        // deliberately uses detached angular shards so a missing image can
        // never resurrect the old red ellipse-and-cross placeholder.
        const warning = !hazard.exploded;
        const fallbackColor = warning ? DATA.palette.cyan : DATA.palette.orange;
        const fallbackAlpha = warning ? 0.72 : clamp(hazard.life * 2, 0, 1);
        this.drawOpenShardFallback(
          screen.x,
          screen.y,
          hazard.radius * (warning ? 0.82 : 1.18),
          fallbackColor,
          fallbackAlpha,
          warning ? 'warning' : 'impact'
        );
        ctx.strokeStyle = DATA.palette.orange;
        ctx.globalAlpha = fallbackAlpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen.x + 25, screen.y - 24);
        ctx.lineTo(screen.x + 34, screen.y - 30);
        ctx.lineTo(screen.x + 41, screen.y - 35);
        ctx.stroke();
      } else {
        // The spore-pool sheet normally supplies this organic footprint.  If
        // it is unavailable, keep the gameplay hazard readable with a loose
        // field of purple pixel clumps rather than a filled ellipse.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = hazard.warmup > 0 ? 0.25 : 0.55;
        ctx.imageSmoothingEnabled = false;
        for (let index = 0; index < 18; index += 1) {
          const phase = this.now * 0.7 + index * 2.17;
          const spread = hazard.radius * (0.24 + (index % 5) * 0.13);
          const px = Math.round(screen.x + Math.cos(phase) * spread);
          const py = Math.round(screen.y + Math.sin(phase * 1.31) * spread * 0.62);
          const size = 2 + (index % 3);
          ctx.fillStyle = index % 4 === 0 ? '#b86bdb' : '#6f3a85';
          ctx.fillRect(px, py, size, size);
          if (index % 3 === 0) ctx.fillRect(px - 2, py + size, Math.max(2, size - 1), 2);
        }
        ctx.restore();
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
      const objectSpec = this.assets && this.assets.manifest && this.assets.manifest.objects
        ? this.assets.manifest.objects.auto_turret
        : null;
      const image = objectSpec ? this.assetImage('object.auto_turret') : null;
      if (objectSpec && image) {
        const scale = TURRET_DRAW_SCALE;
        const angle = Number.isFinite(turret.aimAngle) ? turret.aimAngle : -Math.PI / 2;
        const projection = this.turretHeadProjection(angle);
        const frameWidth = objectSpec.frameWidth;
        const frameHeight = objectSpec.frameHeight;
        const anchorX = objectSpec.anchor[0];
        const anchorY = objectSpec.anchor[1];
        // The source is one combined sprite. Keep the lower chassis fixed and
        // rotate only the upper head around its mechanical joint.
        const frameX = Math.round(screen.x - anchorX * scale);
        const frameY = Math.round(screen.y - anchorY * scale);

        ctx.save();
        ctx.beginPath();
        ctx.rect(frameX, frameY + TURRET_BASE_START_Y * scale, frameWidth * scale, (frameHeight - TURRET_BASE_START_Y) * scale);
        ctx.clip();
        ctx.drawImage(image, frameX, frameY, frameWidth * scale, frameHeight * scale);
        ctx.restore();

        ctx.save();
        ctx.translate(Math.round(screen.x), Math.round(screen.y + (TURRET_HEAD_PIVOT_Y - anchorY) * scale));
        // The authored cannon points upward; rotate only the head around the
        // joint, leaving the grounded chassis at the deployment position.
        ctx.rotate(projection.rotation);
        // The source is a perspective view, not a flat top-down disc. When
        // the head turns broadside, shorten its local depth so it reads as a
        // mounted 3D head turning on a vertical joint instead of a sticker
        // spinning on the canvas plane.
        ctx.scale(1, projection.depth);
        ctx.beginPath();
        ctx.rect(-anchorX * scale, -TURRET_HEAD_PIVOT_Y * scale, frameWidth * scale, TURRET_HEAD_END_Y * scale);
        ctx.clip();
        ctx.drawImage(image,
          -anchorX * scale,
          -TURRET_HEAD_PIVOT_Y * scale,
          frameWidth * scale,
          frameHeight * scale
        );
        ctx.restore();
        return;
      }
      const angle = Number.isFinite(turret.aimAngle) ? turret.aimAngle : -Math.PI / 2;
      const projection = this.turretHeadProjection(angle);
      ctx.fillStyle = '#06090a';
      ctx.beginPath();
      ctx.ellipse(screen.x, screen.y + 3, 12, 5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#758476';
      ctx.fillRect(screen.x - 8, screen.y - 10, 16, 12);
      ctx.fillStyle = DATA.palette.acid;
      ctx.fillRect(screen.x - 2, screen.y - 8, 4, 4);
      ctx.save();
      ctx.translate(screen.x, screen.y - 5);
      ctx.rotate(projection.rotation);
      ctx.scale(1, projection.depth);
      ctx.fillStyle = '#758476';
      ctx.fillRect(-4, -13, 8, 14);
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(-2, -16, 4, 5);
      ctx.restore();
    }

    drawCompanions(playerX, playerY) {
      const ctx = this.ctx;
      if (this.player.classId === 'warrior') {
        const orbit = this.getCardLevel('orbit_blade');
        const count = Math.min(7, orbit + (this.hasEvolution('star_ring') ? 3 : 0));
        const radius = this.hasEvolution('star_ring') ? 70 : 54;
        const orbitSpec = this.assets && this.assets.manifest && this.assets.manifest.vfx && this.assets.manifest.vfx.orbit_blade;
        const orbitKey = orbitSpec && this.assetImage(orbitSpec.key) ? orbitSpec.key : null;
        for (let index = 0; index < count; index += 1) {
          const angle = this.world.time * (1.4 + this.getCardLevel('attack_speed') * 0.28) + index / count * TAU;
          const x = playerX + Math.cos(angle) * radius;
          const y = playerY + Math.sin(angle) * radius * 0.68;
          if (orbitKey) {
            const frame = Math.floor(this.world.time * orbitSpec.fps + index * 0.7) % orbitSpec.frameCount;
            ctx.save();
            ctx.globalCompositeOperation = orbitSpec.blendMode || 'lighter';
            ctx.globalAlpha = 0.96;
            ctx.translate(Math.round(x), Math.round(y));
            // The authored sword points up-right (-45°). Rotate that blade
            // vector to face radially outward from the astronaut.
            ctx.rotate(angle + Math.PI / 4);
            const scale = this.hasEvolution('star_ring') ? 1.08 : 0.92;
            this.drawFrame(orbitSpec.key, orbitSpec.frameWidth, orbitSpec.frameHeight, frame,
              -orbitSpec.anchor.x * scale, -orbitSpec.anchor.y * scale,
              orbitSpec.frameWidth * scale, orbitSpec.frameHeight * scale);
            ctx.restore();
          } else {
            ctx.save();
            ctx.translate(Math.round(x), Math.round(y));
            ctx.rotate(angle + Math.PI / 2);
            ctx.fillStyle = DATA.palette.paper;
            ctx.fillRect(-2, -9, 4, 14);
            ctx.fillStyle = DATA.palette.orange;
            ctx.fillRect(-3, 5, 6, 3);
            ctx.restore();
          }
        }
      } else if (this.player.classId === 'mechanic') {
        const count = Math.min(7, 1 + (this.getCardLevel('drone') >= 2 ? 1 : 0) + this.getCardLevel('mech_count') + (this.hasEvolution('swarm_protocol') ? 2 : 0));
        const petSpec = this.assets && this.assets.manifest && this.assets.manifest.pets
          ? this.assets.manifest.pets.mechanic_drone
          : null;
        const petKey = petSpec && this.assetImage(petSpec.key) ? petSpec.key : null;
        for (let index = 0; index < count; index += 1) {
          const angle = this.world.time * 1.2 + index / count * TAU;
          const x = playerX + Math.cos(angle) * 38;
          const bob = Math.sin(this.world.time * 7 + index * 1.7) * 1.2;
          const y = playerY + Math.sin(angle) * 25 + bob;
          if (petKey) {
            const size = petSpec.suggestedDisplaySize || 24;
            // The pet faces its instantaneous orbit tangent, using the same
            // front/right/back/left direction semantics as actors.
            const petDirection = petSpec.frameCount > 1
              ? this.direction4(-Math.sin(angle), Math.cos(angle))
              : 0;
            ctx.save();
            ctx.globalAlpha = 0.98;
            ctx.translate(Math.round(x), Math.round(y));
            this.drawFrame(petKey, petSpec.frameWidth, petSpec.frameHeight, petDirection,
              -size / 2, -size / 2, size, size);
            ctx.restore();
          } else {
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
    }

    drawEnemySprite(enemy, x, y, size) {
      const direction = this.direction4(enemy.vx, enemy.vy);
      const variantKey = enemy.elite
        ? (enemy.dangerPulse > 0 && enemy.eliteDangerVisual && this.assetImage(enemy.eliteDangerVisual)
          ? enemy.eliteDangerVisual : enemy.eliteVisual)
        : (enemy.dangerPulse > 0 && enemy.dangerVisual && this.assetImage(enemy.dangerVisual)
          ? enemy.dangerVisual : null);
      const variantImage = variantKey && this.assetImage(variantKey);
      if (variantImage) {
        const frameWidth = enemy.elite ? 96 : 64;
        const frameHeight = enemy.elite ? 96 : 64;
        const frame = direction;
        return this.drawFrame(variantKey, frameWidth, frameHeight, frame,
          x - size / 2, y - (enemy.elite ? 82 : 56) * (size / frameWidth), size, size);
      }
      const moving = Math.hypot(enemy.vx || 0, enemy.vy || 0) > 4;
      const state = enemy.actionState === 'attack' || enemy.actionState === 'hit' || enemy.actionState === 'death'
        ? enemy.actionState
        : (moving ? 'walk' : 'idle');
      const spec = this.enemyActionSpec(enemy, state);
      const frame = spec
        ? direction * spec.frameCount + Math.min(spec.frameCount - 1, spec.loop ? Math.floor(enemy.actionElapsed * spec.fps) % spec.frameCount : Math.floor(enemy.actionElapsed * spec.fps))
        : direction;
      const key = spec ? spec.key : enemy.visual;
      const drawn = spec
        ? this.drawFrame(key, spec.frameWidth, spec.frameHeight, frame, x - size / 2, y - size * 0.875, size, size)
        : this.drawFrame(key, 64, 64, frame, x - size / 2, y - size * 0.875, size, size);
      return drawn;
    }

    drawEnemyTelegraph(enemy, x, y) {
      // Danger state is represented by a full-body sprite variant. Keep this
      // hook for old callers, but never draw geometric red boxes/cones.
      return Boolean(enemy && enemy.dangerPulse > 0);
    }

    drawEnemy(enemy) {
      const screen = this.worldToScreen(enemy);
      if (screen.x < -80 || screen.x > W + 80 || screen.y < -105 || screen.y > H + 90) return;
      const ctx = this.ctx;
      const planet = this.contract.planet;
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      ctx.fillStyle = '#050708';
      ctx.beginPath();
      const shadowRadius = enemy.elite ? 36 : enemy.radius;
      ctx.ellipse(x, y + 5, shadowRadius, shadowRadius * 0.38, 0, 0, TAU);
      ctx.fill();
      const flash = enemy.hitFlash > 0;
      if (enemy.elite) {
        const eliteImage = (enemy.eliteVisual && this.assetImage(enemy.eliteVisual)) || (enemy.visual && this.assetImage(enemy.visual));
        const gait = Math.sin(enemy.animTime * 0.7) * 1.1;
        if (eliteImage) {
          const size = 96;
          ctx.save();
          ctx.translate(0, Math.round(gait));
          this.drawEnemySprite(enemy, x, y, size);
          if (flash) {
            ctx.globalAlpha = 0.68;
            ctx.globalCompositeOperation = 'lighter';
            this.drawEnemySprite(enemy, x, y, size);
          }
          ctx.restore();
        }
        this.drawSmallBar(x - 38, y - 101, 76, enemy.hp / enemy.maxHp, DATA.palette.danger);
        return;
      }
      if (enemy.visual && this.assetImage(enemy.visual)) {
        this.drawEnemySprite(enemy, x, y, 64);
        if (flash) {
          ctx.save();
          ctx.globalAlpha = 0.62;
          ctx.globalCompositeOperation = 'lighter';
          this.drawEnemySprite(enemy, x, y, 64);
          ctx.restore();
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
        const isMoon = planet.id === 'moon';
        ctx.fillStyle = flash ? DATA.palette.paper : (enemy.type === 'bloater' ? (isMoon ? '#506f87' : '#7a4196') : (isMoon ? '#314d59' : '#523069'));
        ctx.beginPath();
        ctx.arc(x, y - enemy.radius / 2, enemy.radius, 0, TAU);
        ctx.fill();
        ctx.fillStyle = planet.accent;
        ctx.fillRect(x - 5, y - enemy.radius / 2 - 4, 3, 3);
        ctx.fillRect(x + 3, y - enemy.radius / 2 - 4, 3, 3);
        ctx.strokeStyle = isMoon ? '#273f47' : '#402551';
        ctx.beginPath();
        ctx.moveTo(x - 5, y + 2);
        ctx.lineTo(x - 9, y + 9);
        ctx.moveTo(x + 5, y + 2);
        ctx.lineTo(x + 9, y + 9);
        ctx.stroke();
      }
    }

    drawAstronaut(x, y, classData, scale, angle, animateIdle = false) {
      const ctx = this.ctx;
      const characterKey = classData.id === 'gunner' ? 'character.gunner_mia' : (classData.id === 'warrior' ? 'character.warrior_kade' : 'character.mechanic_locke');
      if (this.assetImage(characterKey)) {
        const hasRuntimePlayer = Boolean(this.player && this.world && (this.state === 'playing' || this.state === 'levelup') && this.player.classId === classData.id);
        const useIdleLoop = animateIdle && !hasRuntimePlayer;
        const moving = hasRuntimePlayer && this.player.moving;
        const actionState = hasRuntimePlayer ? this.player.actionState : 'idle';
        const actionSkill = hasRuntimePlayer ? this.player.actionSkill : null;
        const actionElapsed = hasRuntimePlayer ? this.player.actionElapsed : (useIdleLoop ? this.now : 0);
        const renderActionState = hasRuntimePlayer ? actionState : (useIdleLoop ? 'idle' : null);
        const renderActionSkill = hasRuntimePlayer ? actionSkill : null;
        const actionDirection = hasRuntimePlayer && (actionState === 'attack' || actionState === 'skill') && this.player.actionDirection
          ? this.player.actionDirection
          : { x: Math.cos(angle), y: Math.sin(angle) };
        const frame = this.direction4(actionDirection.x, actionDirection.y);
        const roleSpec = this.assets && this.assets.manifest && this.assets.manifest.characterRoleSpecs
          ? this.assets.manifest.characterRoleSpecs[this.characterIdForClass(classData.id)]
          : null;
        const directionRowMap = roleSpec && Array.isArray(roleSpec.directionRowMap)
          ? roleSpec.directionRowMap
          : [0, 3, 2, 1];
        const drawRow = clamp(Number(directionRowMap[frame]) || 0, 0, 3);
        const actionSpec = hasRuntimePlayer
          ? (actionState === 'skill'
            ? this.characterActionSpec(classData.id, 'skill', actionSkill)
            : (actionState === 'attack'
              ? this.characterActionSpec(classData.id, 'attack')
              : (moving
                ? this.characterActionSpec(classData.id, 'walk')
                : this.characterActionSpec(classData.id, 'idle'))))
          : (useIdleLoop ? this.characterActionSpec(classData.id, 'idle') : null);
        const actionAvailable = Boolean(actionSpec && this.assetImage(actionSpec.key));
        // UI portraits use the authored idle sequence sheet. The visible
        // breathing motion is contained in those generated frames, so the
        // sprite anchor stays fixed and never drifts as a whole.
        const renderX = x;
        const renderY = y;
        const bob = !actionAvailable && moving ? Math.round(Math.sin(this.player.movePhase || this.now * 6) * 1.2) : 0;
        ctx.save();
        ctx.globalAlpha = 0.52;
        ctx.fillStyle = '#030506';
        ctx.beginPath();
        ctx.ellipse(Math.round(x), Math.round(y + scale * 2), 11 * scale, 4 * scale, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = this.player && this.player.invuln > 0 && Math.floor(this.now * 18) % 2 ? 0.55 : 1;
        const actionDrawn = actionAvailable && renderActionState
          && this.characterActionFrame(classData, renderActionState, renderActionSkill, frame, actionElapsed, renderX, renderY, scale);
        if (!actionDrawn) {
          this.drawFrame(characterKey, 64, 64, drawRow,
            renderX - 32 * scale, renderY - 56 * scale + bob, 64 * scale, 64 * scale);
        }
        if (!actionDrawn) {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = classData.color;
          const footShift = moving ? Math.sin((this.player.movePhase || this.now * 6) + Math.PI) * 1.2 : 0;
          ctx.fillRect(Math.round(renderX - 7 * scale + footShift), Math.round(renderY - 2 * scale), Math.max(1, Math.round(3 * scale)), Math.max(1, Math.round(2 * scale)));
          ctx.fillRect(Math.round(renderX + 4 * scale - footShift), Math.round(renderY - 2 * scale), Math.max(1, Math.round(3 * scale)), Math.max(1, Math.round(2 * scale)));
        }
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(scale, scale);
      const bob = Math.sin((this.player && this.player.movePhase) || this.now * 6) * 0.8;
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
      if (projectile.source === 'wave') {
        const spec = this.assets && this.assets.manifest && this.assets.manifest.vfx && this.assets.manifest.vfx.sword_wave;
        if (spec && this.assetImage(spec.key)) {
          const angle = Math.atan2(projectile.vy || 0, projectile.vx || 1);
          const frame = Math.min(spec.frameCount - 1, 3);
          const scale = 0.64;
          const ctx = this.ctx;
          ctx.save();
          ctx.globalCompositeOperation = spec.blendMode || 'source-over';
          ctx.translate(Math.round(screen.x), Math.round(screen.y));
          if (Math.abs(angle) > 0.01) ctx.rotate(angle);
          // A travelling wave is centered on its collision body. The casting
          // VFX separately uses the sword-core pivot at the player's hand.
          this.drawFrame(spec.key, spec.frameWidth, spec.frameHeight, frame,
            -spec.frameWidth * scale / 2, -spec.frameHeight * scale / 2,
            spec.frameWidth * scale, spec.frameHeight * scale);
          ctx.restore();
          return;
        }
      }
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

    drawOpenShardFallback(x, y, radius, color, alpha = 1, mode = 'burst') {
      const ctx = this.ctx;
      const safeRadius = Math.max(8, Number(radius) || 8);
      const phase = Math.floor(this.now * (mode === 'warning' ? 9 : 14));
      const count = mode === 'warning' ? 8 : 12;
      const requested = String(color || '').toLowerCase();
      const danger = String(DATA.palette.danger || '#ff4f72').toLowerCase();
      const primary = requested === danger ? DATA.palette.orange : (color || DATA.palette.cyan);
      const colors = [primary, DATA.palette.cyan, DATA.palette.acid, '#f2e4c6'];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.imageSmoothingEnabled = false;
      for (let index = 0; index < count; index += 1) {
        const angle = index / count * TAU + (phase % 11) * 0.035;
        const inner = safeRadius * (0.22 + ((index * 13 + phase * 3) % 15) / 100);
        const outer = safeRadius * (0.56 + ((index * 19 + phase * 5) % 28) / 100);
        const width = 1.5 + (index % 3);
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const px = -uy * width;
        const py = ux * width;
        ctx.fillStyle = colors[(index + phase) % colors.length];
        ctx.beginPath();
        ctx.moveTo(Math.round(x + ux * inner - px), Math.round(y + uy * inner - py));
        ctx.lineTo(Math.round(x + ux * outer + px), Math.round(y + uy * outer + py));
        ctx.lineTo(Math.round(x + ux * (outer * 0.68)), Math.round(y + uy * (outer * 0.68)));
        ctx.lineTo(Math.round(x + ux * inner + px), Math.round(y + uy * inner + py));
        ctx.fill();
        if (index % 2 === 0) {
          const spark = outer + 3 + ((index + phase) % 5);
          ctx.fillRect(Math.round(x + ux * spark - 1), Math.round(y + uy * spark - 1), 2 + index % 2, 2 + index % 2);
        }
      }
      ctx.restore();
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
        const spec = this.assets && this.assets.manifest && this.assets.manifest.vfx
          ? this.assets.manifest.vfx.radial_damage
          : null;
        const frameWidth = spec && spec.frameWidth ? spec.frameWidth : 96;
        const frameHeight = spec && spec.frameHeight ? spec.frameHeight : 96;
        const frameCount = spec && spec.frameCount ? spec.frameCount : 8;
        const progress = clamp(1 - alpha, 0, 1);
        const frame = Math.min(frameCount - 1, Math.floor(progress * frameCount));
        const size = Math.max(30, Math.round(particle.radius * (1.92 + progress * 0.24)));
        if (this.assetImage('vfx.radial_damage')) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * 0.94;
          ctx.imageSmoothingEnabled = false;
          this.drawFrame('vfx.radial_damage', frameWidth, frameHeight, frame,
            screen.x - size / 2, screen.y - size / 2, size, size);
          ctx.restore();
        } else {
          // Optional-asset load failure still gets the same language as the
          // authored sheet: detached, angular pixel fragments, never a ring.
          this.drawOpenShardFallback(screen.x, screen.y, size * 0.52, particle.color, alpha * 0.94, 'splash');
        }
      } else if (particle.type === 'slash') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, particle.range * (1 - alpha * 0.12), particle.angle - 0.65, particle.angle + 0.65);
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
      const ctx = this.ctx;
      const value = clamp(ratio, 0, 1);
      const colors = {
        health: '#ff4f72',
        xp: DATA.palette.violet || '#ad76ff',
        mission: DATA.palette.cyan,
        extraction: DATA.palette.acid
      };
      const color = colors[type] || DATA.palette.cyan;
      const segments = Math.max(4, Math.floor(w / 9));
      const gap = 2;
      const segmentWidth = Math.max(2, Math.floor((w - gap * (segments - 1)) / segments));
      ctx.fillStyle = '#03080b';
      ctx.fillRect(Math.round(x - 2), Math.round(y - 2), Math.round(w + 4), Math.round(height + 4));
      for (let index = 0; index < segments; index += 1) {
        const segmentStart = index / segments;
        const segmentRatio = clamp((value - segmentStart) * segments, 0, 1);
        const segmentX = Math.round(x + index * (segmentWidth + gap));
        ctx.fillStyle = '#1b3037';
        ctx.fillRect(segmentX, Math.round(y), segmentWidth, Math.max(2, Math.round(height)));
        if (segmentRatio > 0) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.45 + segmentRatio * 0.55;
          ctx.fillRect(segmentX + 1, Math.round(y + 1), Math.max(1, Math.round((segmentWidth - 2) * segmentRatio)), Math.max(1, Math.round(height - 2)));
          ctx.globalAlpha = 1;
        }
      }
      return true;
    }

    drawExitButton() {
      this.button(270, 132, 80, 24, '退出', () => this.openExitConfirm(), {
        buttonAsset: 'ui.exit.return_hq',
        nineSliceInset: 8,
        fill: '#20292c',
        text: DATA.palette.paper,
        ink: DATA.palette.paper,
        stroke: DATA.palette.cyan,
        size: 9
      });
    }

    drawExitModal() {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(2,5,7,0.78)';
      ctx.fillRect(0, 0, W, H);
      this.panel(40, 206, 280, 196, { uiVariant: 'inset', fill: '#0c1619', stroke: DATA.palette.danger, accent: DATA.palette.cyan, accentWidth: 5 });
      const warningIcon = this.assetImage('ui.exit.loss_icon');
      if (warningIcon) ctx.drawImage(warningIcon, 58, 226, 32, 32);
      this.text('退出外勤？', 180, 241, 17, DATA.palette.danger, 'center', true);
      this.text('退出将失去未撤离的额外战利品', 180, 276, 10, DATA.palette.paper, 'center', true);
      this.text('保底工资与货舱保护按失败结算规则保留', 180, 298, 8, DATA.palette.muted, 'center');
      this.button(54, 337, 118, 36, '继续任务', () => this.cancelExitConfirm(), {
        buttonAsset: 'ui.exit.return_hq',
        fill: '#20292c', text: DATA.palette.paper, ink: DATA.palette.paper, stroke: DATA.palette.cyan, size: 10
      });
      this.button(188, 337, 118, 36, '返回总部', () => this.confirmExitToHQ(), {
        buttonAsset: 'ui.exit.danger',
        uiTheme: 'danger', fill: DATA.palette.danger, text: '#ffd1c7', ink: '#ffd1c7', stroke: '#ff9b7a', size: 10
      });
      ctx.restore();
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
      if (this.anomalyRulesEnabled()) {
        this.drawAtlasIcon(this.contract.anomaly.id, 241, 37, 15);
        this.text(this.contract.anomaly.name, 344, 49, 7, this.contract.planet.accent, 'right', true);
      }

      this.panel(47, 65, 266, 30, { fill: 'rgba(7,10,12,0.91)', stroke: this.world.missionComplete ? DATA.palette.acid : '#575a52', accent: this.world.missionComplete ? DATA.palette.acid : DATA.palette.orange, accentWidth: 4 });
      const missionIcon = this.world.missionComplete ? 'success' : (this.world.objective.id === 'nests' ? 'mission_nest' : (this.world.objective.id === 'beacons' ? 'mission_beacon' : 'mission_drill'));
      this.drawAtlasIcon(missionIcon, 53, 69, 22);
      this.text(this.missionStatus(), 190, 85, 9, this.world.missionComplete ? DATA.palette.acid : DATA.palette.paper, 'center', true);
      if (this.world.objective.id === 'beacons') {
        const beacon = this.world.objective.items[this.world.objective.current] || this.world.objective.items[this.world.objective.items.length - 1];
        if (beacon) this.drawProgressBar(105, 88, 150, beacon.charge / beacon.required, 'mission', 6);
      }

      this.drawBeaconOverlay();
      this.drawObjectiveArrow();
      this.drawCacheArrow();
      this.drawJoystick();
      if (this.anomalyRulesEnabled()) {
        const anomalyInfo = this.anomalyDetails(this.contract.anomaly);
      const tideActive = anomalyInfo.id === 'energy_tide' && this.energyTideActive();
      const anomalyColor = tideActive ? DATA.palette.acid : this.contract.planet.accent;
      const anomalyLabel = tideActive
        ? `${anomalyInfo.name} // 双方加速`
        : `${anomalyInfo.name} // ${anomalyInfo.effect}`;
      this.panel(36, 103, 288, 25, { fill: 'rgba(7,10,12,0.9)', stroke: anomalyColor, accent: anomalyColor });
      this.drawAtlasIcon(anomalyInfo.id, 44, 106, 18);
        this.text(anomalyLabel, 190, 120, 7, anomalyColor, 'center', true);
      }
      if (this.world.missionComplete && this.world.extraction.progress > 0) {
        const ratio = clamp(this.world.extraction.progress / this.world.extraction.required, 0, 1);
        ctx.fillStyle = 'rgba(7,10,12,0.92)';
        ctx.fillRect(56, 606, 248, 24);
        this.drawProgressBar(61, 610, 238, ratio, 'extraction', 10);
        this.text('UPLINK // 保持在撤离区', 180, 627, 7, DATA.palette.paper, 'center', true, true);
      }
    }

    drawFutureHUD() {
      const ctx = this.ctx;
      const classData = DATA.classById[this.player.classId];
      const classColor = classData.color || DATA.palette.cyan;
      const objectiveColor = this.world.missionComplete ? DATA.palette.acid : DATA.palette.orange;
      const panelFill = 'rgba(5,13,18,0.94)';

      this.panel(5, 5, 143, 55, { fill: panelFill, stroke: classColor, accent: classColor, accentWidth: 5 });
      this.drawAtlasIcon('health', 10, 10, 21);
      this.text(`LIFE // ${classData.name}`, 36, 20, 7, classColor, 'left', true, true);
      this.text(`LV.${this.player.level}`, 137, 20, 8, DATA.palette.paper, 'right', true, true);
      this.text('VITAL', 36, 29, 5, DATA.palette.muted, 'left', true, true);
      this.drawProgressBar(58, 24, 77, this.player.hp / this.player.maxHp, 'health', 7);
      this.drawAtlasIcon('xp', 14, 40, 16);
      this.text('SYNC', 36, 48, 5, DATA.palette.muted, 'left', true, true);
      this.drawProgressBar(58, 43, 77, this.player.xp / this.player.nextXp, 'xp', 7);

      this.panel(153, 5, 76, 55, { fill: panelFill, stroke: DATA.palette.cyan, accent: DATA.palette.cyan, accentWidth: 3 });
      this.drawAtlasIcon('timer', 159, 10, 18);
      this.text('MISSION', 183, 18, 6, DATA.palette.muted, 'left', true, true);
      ctx.fillStyle = this.world.time > 600 ? DATA.palette.orange : DATA.palette.acid;
      ctx.fillRect(215, 14, 3, 3);
      this.text(formatTime(this.world.time), 191, 46, 17, DATA.palette.paper, 'center', true, true);
      this.text('FIELD CLOCK', 191, 55, 5, DATA.palette.muted, 'center', true, true);

      this.panel(234, 5, 121, 55, { fill: panelFill, stroke: DATA.palette.orange, accent: DATA.palette.orange, accentWidth: 4 });
      this.drawAtlasIcon('cargo', 241, 10, 19);
      this.text('CARGO // RAW', 265, 18, 6, DATA.palette.muted, 'left', true, true);
      this.text(String(this.player.loot).padStart(2, '0'), 344, 40, 17, DATA.palette.orange, 'right', true, true);
      ctx.fillStyle = DATA.palette.orange;
      ctx.fillRect(265, 47, 48, 2);
      if (this.anomalyRulesEnabled()) {
        this.drawAtlasIcon(this.contract.anomaly.id, 241, 37, 15);
        this.text(this.contract.anomaly.name, 344, 50, 7, this.contract.planet.accent, 'right', true);
      } else if (this.getCardLevel('shield') > 0) {
        const shieldLevel = this.getCardLevel('shield');
        this.drawPixelIcon('shield', 264, 36, 13, DATA.palette.cyan, this.player.classId);
        this.text(`SHIELD L${shieldLevel}`, 282, 49, 6, DATA.palette.cyan, 'left', true, true);
      } else {
        this.text('SEALED // 08-R', 265, 51, 5, DATA.palette.muted, 'left', true, true);
      }

      this.panel(45, 65, 270, 31, { fill: panelFill, stroke: objectiveColor, accent: objectiveColor, accentWidth: 5 });
      const missionIcon = this.world.missionComplete
        ? 'success'
        : (this.world.objective.id === 'nests' ? 'mission_nest' : (this.world.objective.id === 'beacons' ? 'mission_beacon' : 'mission_drill'));
      this.drawAtlasIcon(missionIcon, 52, 70, 21);
      this.text('OBJECTIVE', 82, 76, 5, DATA.palette.muted, 'left', true, true);
      this.text(this.missionStatus(), 190, 87, 9, this.world.missionComplete ? DATA.palette.acid : DATA.palette.paper, 'center', true);
      if (this.world.objective.id === 'beacons') {
        const beacon = this.world.objective.items[this.world.objective.current] || this.world.objective.items[this.world.objective.items.length - 1];
        if (beacon) this.drawProgressBar(108, 89, 146, beacon.charge / beacon.required, 'mission', 5);
      }

      this.drawBeaconOverlay();
      this.drawObjectiveArrow();
      this.drawCacheArrow();
      this.drawJoystick();
      if (this.anomalyRulesEnabled()) {
        const anomalyInfo = this.anomalyDetails(this.contract.anomaly);
        const tideActive = anomalyInfo.id === 'energy_tide' && this.energyTideActive();
        const anomalyColor = tideActive ? DATA.palette.acid : this.contract.planet.accent;
        const anomalyLabel = tideActive
          ? `${anomalyInfo.name} // 双向加速`
          : `${anomalyInfo.name} // ${anomalyInfo.effect}`;
        this.panel(36, 103, 288, 25, { fill: panelFill, stroke: anomalyColor, accent: anomalyColor });
        this.drawAtlasIcon(anomalyInfo.id, 44, 106, 18);
        this.text(anomalyLabel, 190, 120, 7, anomalyColor, 'center', true);
      }
      if (this.world.missionComplete && this.world.extraction.progress > 0) {
        const ratio = clamp(this.world.extraction.progress / this.world.extraction.required, 0, 1);
        this.panel(54, 604, 252, 27, { fill: panelFill, stroke: DATA.palette.acid, accent: DATA.palette.acid, accentWidth: 5 });
        this.drawProgressBar(62, 610, 236, ratio, 'extraction', 8);
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
      const x = this.pointer.active ? this.pointer.originX : 180;
      const y = this.pointer.active ? this.pointer.originY : 560;
      const dx = this.pointer.active ? clamp(this.pointer.x - x, -38, 38) : 0;
      const dy = this.pointer.active ? clamp(this.pointer.y - y, -38, 38) : 0;
      ctx.save();
      ctx.globalAlpha = this.pointer.active ? 0.9 : 0.36;
      ctx.strokeStyle = this.pointer.active ? DATA.palette.acid : DATA.palette.cyan;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 43, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.58;
      ctx.beginPath();
      ctx.arc(x, y, 29, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.72;
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(Math.round(x - 2), Math.round(y - 48), 4, 6);
      ctx.fillRect(Math.round(x - 2), Math.round(y + 42), 4, 6);
      ctx.fillRect(Math.round(x - 48), Math.round(y - 2), 6, 4);
      ctx.fillRect(Math.round(x + 42), Math.round(y - 2), 6, 4);
      ctx.globalAlpha = this.pointer.active ? 0.96 : 0.62;
      ctx.fillStyle = this.pointer.active ? DATA.palette.acid : '#203b43';
      this.techPath(x + dx - 16, y + dy - 16, 32, 32, 5);
      ctx.fill();
      ctx.fillStyle = '#071217';
      this.techPath(x + dx - 10, y + dy - 10, 20, 20, 3);
      ctx.fill();
      ctx.fillStyle = this.pointer.active ? DATA.palette.acid : DATA.palette.cyan;
      ctx.fillRect(Math.round(x + dx - 2), Math.round(y + dy - 2), 4, 4);
      ctx.restore();
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
      const currentCardLevel = !evolution && !overflow ? this.getCardLevel(card.id) : 0;
      const nextCardLevel = currentCardLevel + 1;
      // Make it explicit that the number is the level reached by choosing
      // this card. The old "LV.3/3" label looked like an already-maxed card.
      const level = evolution ? 'EVOLUTION' : (overflow ? '一次性超载' : `当前 Lv.${currentCardLevel}  →  Lv.${nextCardLevel}/${LIMITS.skillLevel}`);
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
      this.drawPixelIcon(card.id || kind, 38, y + 38, 60, color, classData.id);
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
          // The recipe is supporting information, but it is still the key
          // reason to choose this card. Give it enough contrast to survive
          // the scanlines and keep the resulting-combo line as the strongest
          // secondary cue without competing with the card title.
          this.text(`配方：${card.name} Lv.3 + ${otherCard.name} Lv.3`, 125, y + 131, 8, DATA.palette.paper, 'left', true);
          this.text(`→ ${recipe.name}`, 125, y + 144, 9, color, 'left', true);
        }
      } else if (evolution) {
        this.text('两项技能均达到 Lv.3', 125, y + 126, 8, DATA.palette.paper, 'left', true);
        this.text(this.evolutionRecipeText(classData, card), 125, y + 140, 8, DATA.palette.acid, 'left', true);
      }
      if (!evolution && !overflow) {
        const currentLevel = (this.player.cards[card.id] || 0) + 1;
        for (let pip = 0; pip < 3; pip += 1) {
          this.ctx.fillStyle = pip < currentLevel ? color : '#3b403b';
          this.ctx.fillRect(302 + pip * 10, y + 137, 7, 7);
        }
      }
      const staleMaxedCard = !evolution && !overflow && currentCardLevel >= LIMITS.skillLevel;
      this.buttons.push({
        x: 10,
        y,
        w: 340,
        h: 154,
        disabled: staleMaxedCard,
        action: () => this.chooseUpgrade(choice)
      });
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
        this.syncMusic(true);
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
      ctx.fillStyle = DATA.palette.paper;
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = DATA.palette.cyan;
      ctx.fillRect(0, 74, W, 1);
      ctx.fillRect(0, H - 76, W, 1);
      ctx.globalAlpha = 0.09;
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
