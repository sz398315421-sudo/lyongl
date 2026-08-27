(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const renderScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(360, Math.round(rect.width * renderScale));
    canvas.height = Math.max(640, Math.round(rect.height * renderScale));
  }

  resizeCanvas();

  class SynthAudio {
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
        if (!this.context || this.context.state === 'closed') {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) return null;
          this.context = new AudioContextClass();
          this.musicBus = null;
        }
        if (this.context.state === 'suspended' && this.context.resume) {
          const resumeResult = this.context.resume();
          if (resumeResult && resumeResult.catch) resumeResult.catch(() => {});
        }
        if (!this.musicBus && this.context.createGain && this.context.destination) {
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
        // The browser may still require another gesture; the scheduler will retry.
      }
      return this.resumeMusic();
    }

    play(name, minimumGap = 0.035) {
      const context = this.ensure();
      if (!context) return;
      try {
        const now = context.currentTime;
        if (now - (this.lastPlayed[name] || 0) < minimumGap) return;
        this.lastPlayed[name] = now;
        const presets = {
          confirm: [220, 0.025, 'square', 0.018],
          terminal: [320, 0.07, 'square', 0.025],
          deploy: [92, 0.32, 'sawtooth', 0.045],
          shot: [150, 0.035, 'square', 0.018],
          slash: [95, 0.06, 'sawtooth', 0.022],
          drone: [420, 0.028, 'square', 0.012],
          rail: [680, 0.14, 'sawtooth', 0.045],
          blast: [64, 0.18, 'sawtooth', 0.055],
          hurt: [72, 0.12, 'square', 0.045],
          dash: [280, 0.11, 'sawtooth', 0.025],
          dodge: [520, 0.06, 'square', 0.02],
          reload: [260, 0.05, 'square', 0.02],
          objective: [470, 0.16, 'square', 0.035],
          level: [620, 0.2, 'square', 0.04],
          evolution: [760, 0.42, 'square', 0.05],
          elite: [82, 0.45, 'sawtooth', 0.05],
          elite_down: [180, 0.35, 'square', 0.05],
          loot: [580, 0.14, 'square', 0.035],
          deploy_turret: [310, 0.08, 'square', 0.025],
          upgrade: [540, 0.18, 'square', 0.04],
          mission_complete: [720, 0.42, 'square', 0.05],
          success: [820, 0.55, 'square', 0.055],
          failure: [68, 0.62, 'sawtooth', 0.05]
        };
        const preset = presets[name] || presets.confirm;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = preset[2];
        oscillator.frequency.setValueAtTime(preset[0], now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(38, preset[0] * (name === 'failure' ? 0.45 : 1.35)), now + preset[1]);
        gain.gain.setValueAtTime(preset[3], now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + preset[1]);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + preset[1] + 0.01);
      } catch (error) {
        this.lastAudioError = error;
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
      const configured = window.StarDutyData && window.StarDutyData.music && window.StarDutyData.music[trackId];
      return configured || this.musicDefaults[trackId] || this.musicDefaults.explore;
    }

    isMusicActive() {
      return Boolean(this.musicEnabled && this.music && this.musicTimer !== null && this.context && this.context.state !== 'closed');
    }

    resumeMusic() {
      if (!this.musicEnabled) return false;
      const context = this.ensure();
      if (!context) return false;
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
      if (this.musicTimer === null) {
        this.musicTimer = window.setInterval(() => this.musicTick(), this.musicScheduleMs);
      }
      this.musicTick();
      return true;
    }

    musicTick() {
      if (!this.music || !this.musicEnabled) return false;
      const context = this.ensure();
      if (!context || context.state === 'suspended') return false;
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
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = config.waveform || (state.trackId === 'extract' ? 'square' : 'sawtooth');
        oscillator.frequency.setValueAtTime(root * Math.pow(2, semitone / 12), when);
        gain.gain.setValueAtTime(volume, when);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        oscillator.connect(gain).connect(destination);
        oscillator.start(when);
        oscillator.stop(when + duration + 0.015);
        if (state.step % 4 === 0) {
          const bass = context.createOscillator();
          const bassGain = context.createGain();
          const bassDuration = Math.min(state.stepDuration * 2.8, 0.62);
          bass.type = 'square';
          bass.frequency.setValueAtTime(root / 2, when);
          bassGain.gain.setValueAtTime(volume * 0.68, when);
          bassGain.gain.exponentialRampToValueAtTime(0.0001, when + bassDuration);
          bass.connect(bassGain).connect(destination);
          bass.start(when);
          bass.stop(when + bassDuration + 0.015);
        }
      } catch (error) {
        // Keep the timer alive so a temporarily unavailable audio node can recover.
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
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      this.fadeMusic(0.0001, 0.08);
      this.music = null;
    }
  }

  const storage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        // The prototype remains playable when storage is unavailable.
      }
    }
  };

  const assetStore = new window.StarDutyAssets.AssetStore({
    createImage: () => new Image(),
    cacheBust: 'v85-difficulty-combo-20260827'
  });
  let game = null;
  let loading = true;

  function drawLoading() {
    if (!loading) return;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(canvas.width / 360, canvas.height / 640);
    const offsetX = (canvas.width - 360 * scale) / 2;
    const offsetY = (canvas.height - 640 * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#090d10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#141a1d';
    ctx.fillRect(24, 278, 312, 84);
    ctx.fillStyle = '#59625b';
    ctx.fillRect(24, 278, 312, 3);
    ctx.fillStyle = '#51d9d1';
    ctx.fillRect(34, 334, 292 * (assetStore.loadedCount / Math.max(1, assetStore.totalCount)), 6);
    ctx.font = '12px "FusionPixel12", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ddd5ba';
    ctx.fillText('正在装载外勤资产……', 38, 309);
    ctx.fillStyle = '#817f72';
    ctx.fillText(`${assetStore.loadedCount}/${assetStore.totalCount}`, 278, 309);
    window.requestAnimationFrame(drawLoading);
  }

  async function bootstrap() {
    drawLoading();
    const fontReady = document.fonts && document.fonts.load
      ? document.fonts.load('12px "FusionPixel12"').catch(() => [])
      : Promise.resolve([]);
    await Promise.all([assetStore.loadAll(), fontReady]);
    loading = false;
    if (assetStore.failures.length) console.warn('Some game assets failed to load.', assetStore.failures);
    game = new window.StarDuty.StarDutyGame(canvas, {
      storage,
      assets: assetStore,
      fontFamily: 'FusionPixel12',
      audio: new SynthAudio(),
      raf: (callback) => window.requestAnimationFrame(callback)
    });
    window.starDutyGame = game;
  }

  function pointFromEvent(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const pixelX = (clientX - rect.left) / rect.width * canvas.width;
    const pixelY = (clientY - rect.top) / rect.height * canvas.height;
    const scale = Math.min(canvas.width / 360, canvas.height / 640);
    const offsetX = (canvas.width - 360 * scale) / 2;
    const offsetY = (canvas.height - 640 * scale) / 2;
    return {
      x: (pixelX - offsetX) / scale,
      y: (pixelY - offsetY) / scale
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!game) return;
    canvas.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event.clientX, event.clientY);
    game.pointerDown(point.x, point.y, event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!game) return;
    const point = pointFromEvent(event.clientX, event.clientY);
    game.pointerMove(point.x, point.y, event.pointerId);
  });

  canvas.addEventListener('pointerup', (event) => { if (game) game.pointerUp(event.pointerId); });
  canvas.addEventListener('pointercancel', (event) => { if (game) game.pointerUp(event.pointerId); });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (!game) return;
    game.setPaused(document.hidden);
    if (document.hidden) game.audio.stopMusic();
    else game.syncMusic(true);
  });
  window.addEventListener('blur', () => {
    if (!game) return;
    game.setPaused(true);
    if (game.audio.stopMusic) game.audio.stopMusic();
  });
  window.addEventListener('focus', () => {
    if (!game) return;
    game.setPaused(false);
    if (game.syncMusic) game.syncMusic(true);
  });
  window.addEventListener('resize', resizeCanvas);
  window.requestAnimationFrame(resizeCanvas);

  bootstrap();
}());
