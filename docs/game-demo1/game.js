'use strict';

const { StarDutyGame } = require('./src/game-core.js');
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
  }

  ensure() {
    try {
      if (!this.context && wx.createWebAudioContext) this.context = wx.createWebAudioContext();
      if (this.context && this.context.state === 'suspended' && this.context.resume) this.context.resume();
    } catch (error) {
      this.context = null;
    }
    return this.context;
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

  intensity(value) {
    const context = this.context;
    if (!context || !context.createOscillator) return;
    try {
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
        low.connect(lowGain);
        high.connect(highGain);
        lowGain.connect(context.destination);
        highGain.connect(context.destination);
        low.start();
        high.start();
        this.music = { low, high, lowGain, highGain };
      }
      if (!this.music) return;
      const now = context.currentTime;
      const target = value < 0 ? 0.0001 : 0.0018 + value * 0.0022;
      const highTarget = value < 0 ? 0.0001 : Math.max(0.0001, (value - 0.28) * 0.0023);
      this.music.lowGain.gain.setTargetAtTime(target, now, 0.35);
      this.music.highGain.gain.setTargetAtTime(highTarget, now, 0.28);
    } catch (error) {
      this.music = null;
    }
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
  createImage: () => (canvas.createImage ? canvas.createImage() : wx.createImage())
});
let game = null;

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
  context.fillStyle = '#51d9d1';
  context.fillRect(34, 334, 292 * (assetStore.loadedCount / Math.max(1, assetStore.totalCount)), 6);
  context.fillStyle = '#ddd5ba';
  context.font = '12px sans-serif';
  context.fillText('LOADING FIELD ASSETS', 38, 309);
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

drawBootScreen();
assetStore.loadAll().then(() => {
  game = new StarDutyGame(canvas, {
    storage,
    assets: assetStore,
    fontFamily: loadPixelFont(),
    audio: new WeChatSynthAudio(),
    raf
  });
});

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
  if (!game) return;
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

wx.onHide(() => { if (game) game.setPaused(true); });
wx.onShow(() => { if (game) game.setPaused(false); });
