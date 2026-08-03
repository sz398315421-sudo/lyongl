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
    }

    ensure() {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) this.context = new AudioContextClass();
      }
      if (this.context && this.context.state === 'suspended') this.context.resume();
      return this.context;
    }

    play(name, minimumGap = 0.035) {
      const context = this.ensure();
      if (!context) return;
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
    }

    intensity(value) {
      const context = this.context;
      if (!context) return;
      const now = context.currentTime;
      if (!this.music && value >= 0) {
        const low = context.createOscillator();
        const high = context.createOscillator();
        const lowGain = context.createGain();
        const highGain = context.createGain();
        low.type = 'square';
        high.type = 'sawtooth';
        low.frequency.value = 55;
        high.frequency.value = 82.5;
        lowGain.gain.value = 0.0001;
        highGain.gain.value = 0.0001;
        low.connect(lowGain).connect(context.destination);
        high.connect(highGain).connect(context.destination);
        low.start();
        high.start();
        this.music = { low, high, lowGain, highGain };
      }
      if (!this.music) return;
      const target = value < 0 ? 0.0001 : 0.0018 + value * 0.0022;
      const highTarget = value < 0 ? 0.0001 : Math.max(0.0001, (value - 0.28) * 0.0023);
      this.music.lowGain.gain.setTargetAtTime(target, now, 0.35);
      this.music.highGain.gain.setTargetAtTime(highTarget, now, 0.28);
      this.music.high.frequency.setTargetAtTime(82.5 + Math.max(0, value) * 27.5, now, 0.4);
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
    createImage: () => new Image()
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

  document.addEventListener('visibilitychange', () => { if (game) game.setPaused(document.hidden); });
  window.addEventListener('blur', () => { if (game) game.setPaused(true); });
  window.addEventListener('focus', () => { if (game) game.setPaused(false); });
  window.addEventListener('resize', resizeCanvas);
  window.requestAnimationFrame(resizeCanvas);

  bootstrap();
}());
