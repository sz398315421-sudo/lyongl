'use strict';

const { StarDutyGame } = require('./src/game-core.js');
const DATA = require('./src/data.js');
const { AssetStore, manifest: assetManifest } = require('./src/assets.js');

const system = wx.getSystemInfoSync();
const canvas = wx.createCanvas();
const pixelRatio = Math.min(2, system.pixelRatio || 1);
canvas.width = Math.round(system.windowWidth * pixelRatio);
canvas.height = Math.round(system.windowHeight * pixelRatio);

class WeChatSynthAudio {
  constructor() {
    this.context = null;
    this.lastPlayed = {};
    this.music = null;
    this.musicTimer = null;
    this.musicEnabled = true;
    this.musicUnlocked = false;
    this.musicBus = null;
    this.musicRequest = null;
    this.musicLookahead = 0.18;
    this.musicScheduleMs = 40;
    this.musicDefaults = {
      cockpit: { bpm: 88, root: 110, waveform: 'triangle', pattern: [0, 4, 7, 12, 7, 4, 2, 7] },
      explore: { bpm: 104, root: 123.47, waveform: 'sawtooth', pattern: [0, 3, 7, 10, 7, 3, 5, 10] },
      extract: { bpm: 136, root: 146.83, waveform: 'square', pattern: [0, 7, 10, 12, 10, 7, 14, 17] }
    };
  }

  ensure() {
    try {
      if ((!this.context || this.context.state === 'closed') && wx.createWebAudioContext) {
        this.context = wx.createWebAudioContext();
        this.musicBus = null;
      }
      if (this.context && this.context.state === 'suspended' && this.context.resume) {
        const resumeResult = this.context.resume();
        if (resumeResult && resumeResult.catch) resumeResult.catch(() => {});
      }
      if (this.context && !this.musicBus && this.context.createGain && this.context.destination) {
        const bus = this.context.createGain();
        if (bus.gain && bus.gain.setValueAtTime) bus.gain.setValueAtTime(0.0001, this.context.currentTime);
        bus.connect(this.context.destination);
        this.musicBus = bus;
      }
    } catch (error) {
      this.context = null;
      this.musicBus = null;
    }
    return this.context;
  }

  unlockMusic() {
    const context = this.ensure();
    if (!context) return false;
    this.musicUnlocked = true;
    try {
      if (context.resume) {
        const resumeResult = context.resume();
        if (resumeResult && resumeResult.catch) resumeResult.catch(() => {});
      }
    } catch (error) {
      // The mini-game runtime may require another touch to resume audio.
    }
    return this.resumeMusic();
  }

  play(name, minimumGap = 0.05) {
    const context = this.ensure();
    if (!context || !context.createOscillator) return;
    const now = context.currentTime;
    if (now - (this.lastPlayed[name] || 0) < minimumGap) return;
    this.lastPlayed[name] = now;
    const map = {
      shot: [150, 0.035], slash: [95, 0.06], drone: [420, 0.028],
      hurt: [72, 0.12], blast: [64, 0.18], level: [620, 0.2],
      success: [820, 0.5], failure: [68, 0.55], evolution: [760, 0.38]
    };
    const preset = map[name] || [300, 0.06];
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = name === 'blast' || name === 'failure' ? 'sawtooth' : 'square';
      oscillator.frequency.setValueAtTime(preset[0], now);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + preset[1]);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + preset[1] + 0.01);
    } catch (error) {
      // Some base-library versions expose WebAudio without oscillator nodes.
    }
  }

  setMusicEnabled(value) {
    this.musicEnabled = Boolean(value);
    if (!this.musicEnabled) {
      this.musicRequest = null;
      this.stopMusic();
    } else if (this.context) {
      this.resumeMusic();
    }
  }

  setMusic(trackId, options = {}) {
    if (!this.musicEnabled) return;
    const planet = options.planet || '';
    const config = this.trackConfig(trackId);
    this.musicRequest = {
      trackId,
      planet,
      intensity: options.intensity === undefined ? 0.4 : options.intensity,
      config
    };
    if (this.music && this.music.trackId === trackId && this.music.planet === planet) {
      this.pulseIntensity(this.musicRequest.intensity);
      this.resumeMusic();
      return true;
    }
    this.stopMusic();
    return this.resumeMusic();
  }

  trackConfig(trackId) {
    return DATA.music && DATA.music[trackId] ? DATA.music[trackId] : (this.musicDefaults[trackId] || this.musicDefaults.explore);
  }

  isMusicActive() {
    return Boolean(this.musicEnabled && this.music && this.musicTimer !== null && this.context && this.context.state !== 'closed');
  }

  resumeMusic() {
    if (!this.musicEnabled) return false;
    const context = this.ensure();
    if (!context || !context.createOscillator) return false;
    if (!this.music && this.musicRequest) {
      const request = this.musicRequest;
      const config = request.config || this.trackConfig(request.trackId);
      const bpm = Math.max(1, Number(config.bpm) || 104);
      this.music = {
        trackId: request.trackId,
        planet: request.planet,
        intensity: request.intensity,
        config,
        step: 0,
        stepDuration: 60 / bpm / 2,
        nextTime: context.currentTime + 0.02
      };
    }
    if (!this.music) return false;
    this.fadeMusic(0.72, 0.08);
    if (this.musicTimer === null) this.musicTimer = setInterval(() => this.musicTick(), this.musicScheduleMs);
    this.musicTick();
    return true;
  }

  musicTick() {
    if (!this.music || !this.musicEnabled) return false;
    const context = this.ensure();
    if (!context || !context.createOscillator || context.state === 'suspended') return false;
    const state = this.music;
    const now = context.currentTime;
    if (!Number.isFinite(state.nextTime) || state.nextTime < now - 0.3) state.nextTime = now + 0.02;
    let scheduled = 0;
    while (state.nextTime < now + this.musicLookahead && scheduled < 12) {
      this.scheduleMusicStep(state, state.nextTime);
      state.nextTime += state.stepDuration;
      state.step += 1;
      scheduled += 1;
    }
    return scheduled > 0;
  }

  scheduleMusicStep(state, when) {
    const context = this.context;
    if (!context) return;
    try {
      const config = state.config || this.trackConfig(state.trackId);
      const pattern = Array.isArray(config.pattern) && config.pattern.length ? config.pattern : this.musicDefaults.explore.pattern;
      const offset = state.planet === 'spore' ? -3 : (state.planet === 'moon' ? 5 : 0);
      const semitone = pattern[state.step % pattern.length] + offset;
      const root = Number(config.root) || 123.47;
      const duration = Math.min(state.stepDuration * 0.9, state.trackId === 'extract' ? 0.18 : 0.28);
      const volume = 0.022 + state.intensity * 0.024;
      const destination = this.musicBus || context.destination;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = config.waveform || (state.trackId === 'extract' ? 'square' : 'sawtooth');
      osc.frequency.setValueAtTime(root * Math.pow(2, semitone / 12), when);
      gain.gain.setValueAtTime(volume, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(when);
      osc.stop(when + duration + 0.015);
      if (state.step % 4 === 0) {
        const bass = context.createOscillator();
        const bassGain = context.createGain();
        const bassDuration = Math.min(state.stepDuration * 2.8, 0.62);
        bass.type = 'square';
        bass.frequency.setValueAtTime(root / 2, when);
        bassGain.gain.setValueAtTime(volume * 0.68, when);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, when + bassDuration);
        bass.connect(bassGain);
        bassGain.connect(destination);
        bass.start(when);
        bass.stop(when + bassDuration + 0.015);
      }
    } catch (error) {
      // Keep the timer alive so a temporary WebAudio failure can recover.
      this.lastMusicError = error;
    }
  }

  fadeMusic(value, duration) {
    if (!this.musicBus || !this.context) return;
    try {
      const now = this.context.currentTime;
      this.musicBus.gain.cancelScheduledValues(now);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value || 0.0001, now);
      this.musicBus.gain.linearRampToValueAtTime(value, now + duration);
    } catch (error) {
      // Gain automation is optional on older WebAudio implementations.
    }
  }

  pulseIntensity(value) {
    if (this.music) this.music.intensity = Math.max(0, Math.min(1, value));
  }

  intensity(value) {
    if (value < 0) this.stopMusic();
    else this.pulseIntensity(value);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.fadeMusic(0.0001, 0.08);
    this.music = null;
  }
}

const storage = {
  get(key) {
    return wx.getStorageSync(key) || null;
  },
  set(key, value) {
    wx.setStorageSync(key, value);
  }
};

const raf = canvas.requestAnimationFrame
  ? (callback) => canvas.requestAnimationFrame(callback)
  : (callback) => requestAnimationFrame(callback);

const assetStore = new AssetStore({
  createImage: () => (canvas.createImage ? canvas.createImage() : wx.createImage()),
  // WeChat local-package image paths must remain exact. Package versions
  // already invalidate the cache; browser-style query strings can make
  // wx.createImage reject otherwise valid subpackage files.
  cacheBust: ''
});
let game = null;
let runtimePackageStatus = 'idle';
let runtimePackageProgress = 0;
let runtimePackageError = '';
let runtimeAssetLoadPromise = null;

function drawBootScreen() {
  if (game) return;
  const context = canvas.getContext('2d');
  const scale = Math.min(canvas.width / 360, canvas.height / 640);
  const offsetX = (canvas.width - 360 * scale) / 2;
  const offsetY = (canvas.height - 640 * scale) / 2;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#090d10';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  context.fillStyle = '#141a1d';
  context.fillRect(24, 278, 312, 84);
  const assetProgress = assetStore.loadedCount / Math.max(1, assetStore.totalCount);
  const packageProgress = runtimePackageStatus === 'ready' ? 1 : runtimePackageProgress;
  const progress = runtimePackageStatus === 'ready'
    ? 0.35 + assetProgress * 0.65
    : packageProgress * 0.35;
  context.fillStyle = '#51d9d1';
  context.fillRect(34, 334, 292 * Math.max(0, Math.min(1, progress)), 6);
  context.fillStyle = '#ddd5ba';
  context.font = '12px sans-serif';
  const label = runtimePackageStatus === 'error'
    ? 'RUNTIME PACKAGE FAILED'
    : runtimePackageStatus === 'ready'
      ? 'LOADING FIELD ASSETS'
      : 'LOADING RUNTIME PACKAGE';
  context.fillText(label, 38, 309);
  if (runtimePackageStatus === 'error') {
    context.fillStyle = '#ffad73';
    context.font = '9px sans-serif';
    context.fillText('TAP TO RETRY', 38, 322);
  }
  raf(drawBootScreen);
}

function loadPixelFont() {
  if (!wx.loadFont) return 'sans-serif';
  try {
    return wx.loadFont(assetManifest.font) || 'sans-serif';
  } catch (error) {
    return 'sans-serif';
  }
}

function loadRuntimeAssets() {
  if (runtimeAssetLoadPromise) return runtimeAssetLoadPromise;
  runtimePackageStatus = 'loading';
  runtimePackageProgress = 0;
  runtimePackageError = '';
  try { console.info('[star-duty] loading subpackage runtime_assets'); } catch (error) {}
  runtimeAssetLoadPromise = new Promise((resolve, reject) => {
    if (typeof wx.loadSubpackage !== 'function') {
      // Older local runtimes may not expose subpackage loading. The normal
      // package still works there, while production builds use the configured
      // runtime_assets package.
      runtimePackageStatus = 'ready';
      runtimePackageProgress = 1;
      resolve();
      return;
    }
    let task = null;
    let settled = false;
    const succeed = () => {
      if (settled) return;
      settled = true;
      runtimePackageStatus = 'ready';
      runtimePackageProgress = 1;
      try { console.info('[star-duty] runtime_assets loaded'); } catch (error) {}
      resolve();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      runtimePackageStatus = 'error';
      runtimePackageError = String(error && (error.errMsg || error.message) || error || 'unknown error');
      try { console.error('[star-duty] runtime_assets failed:', runtimePackageError); } catch (logError) {}
      reject(error instanceof Error ? error : new Error(runtimePackageError));
    };
    try {
      task = wx.loadSubpackage({
        name: 'runtime_assets',
        success: succeed,
        fail
      });
      if (task && typeof task.onProgressUpdate === 'function') {
        task.onProgressUpdate((result) => {
          const value = Number(result && result.progress);
          if (Number.isFinite(value)) runtimePackageProgress = Math.max(0, Math.min(1, value / 100));
        });
      }
    } catch (error) {
      fail(error);
    }
  }).then(() => assetStore.loadAll()).then(() => {
    if (assetStore.failures.length) {
      try { console.warn('[star-duty] asset load failures:', assetStore.failures); } catch (error) {}
    } else {
      try { console.info(`[star-duty] assets loaded: ${assetStore.loadedCount}/${assetStore.totalCount}`); } catch (error) {}
    }
    if (!game) {
      game = new StarDutyGame(canvas, {
        storage,
        assets: assetStore,
        fontFamily: loadPixelFont(),
        audio: new WeChatSynthAudio(),
        raf
      });
    }
    return game;
  }).catch((error) => {
    runtimePackageStatus = 'error';
    runtimePackageError = String(error && (error.message || error.errMsg) || error || 'unknown error');
    try { console.error('[star-duty] bootstrap failed:', runtimePackageError); } catch (logError) {}
    runtimeAssetLoadPromise = null;
    throw error;
  });
  return runtimeAssetLoadPromise;
}

drawBootScreen();
loadRuntimeAssets().catch(() => {});

function logicalPoint(touch) {
  const pixelX = touch.clientX * pixelRatio;
  const pixelY = touch.clientY * pixelRatio;
  const scale = Math.min(canvas.width / 360, canvas.height / 640);
  const offsetX = (canvas.width - 360 * scale) / 2;
  const offsetY = (canvas.height - 640 * scale) / 2;
  return {
    x: (pixelX - offsetX) / scale,
    y: (pixelY - offsetY) / scale
  };
}

wx.onTouchStart((event) => {
  if (!game) {
    if (runtimePackageStatus === 'error') loadRuntimeAssets().catch(() => {});
    return;
  }
  for (const touch of event.changedTouches) {
    const point = logicalPoint(touch);
    game.pointerDown(point.x, point.y, touch.identifier || 0);
  }
});

wx.onTouchMove((event) => {
  if (!game) return;
  for (const touch of event.changedTouches) {
    const point = logicalPoint(touch);
    game.pointerMove(point.x, point.y, touch.identifier || 0);
  }
});

wx.onTouchEnd((event) => {
  if (!game) return;
  for (const touch of event.changedTouches) game.pointerUp(touch.identifier || 0);
});

wx.onTouchCancel((event) => {
  if (!game) return;
  for (const touch of event.changedTouches) game.pointerUp(touch.identifier || 0);
});

wx.onHide(() => {
  if (!game) return;
  game.setPaused(true);
  if (game.audio.stopMusic) game.audio.stopMusic();
});
wx.onShow(() => {
  if (!game) return;
  game.setPaused(false);
  if (game.syncMusic) game.syncMusic(true);
});
