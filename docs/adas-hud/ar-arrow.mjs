import {exportSize} from '../adas/screen-format.js';
import {createRightTurn, rightTurn, turnPresets} from './ar-arrow-motion.mjs?v=17';
import {createArArrowScene, loadArArrow, loadArArrowMotion} from './ar-arrow-scene.bundle.mjs?v=17';
import {initArArrowExport} from './ar-arrow-export.mjs?v=17';
import {carpetView} from './hud-camera-view.mjs';
import {hudPreferences} from './hud-storage.mjs';
import {initHudSubpageFormats, initHudSubpageImmersive, initHudSubpageNavigation} from './hud-subpage.mjs';

const get = id => document.getElementById(id);
const canvas = get('scene-canvas');
const preview = get('preview');
const play = get('ar-play');
const timeline = get('ar-time');
const timeDisplay = get('ar-time-display');
const stageLabel = get('ar-stage');
const choices = get('ar-stage-choices');
const guideFlash = get('ar-guide-flash');
const download = get('download');
const loadMessage = get('ar-load-message');
const retry = get('ar-retry');
const positionControls = get('ar-position-controls');
const cameraControls = get('ar-camera-controls');
const preset = new URLSearchParams(location.search).get('scene');
let clip = Object.hasOwn(turnPresets, preset) ? turnPresets[preset] : rightTurn;
const positionStorageKey = clip === rightTurn ? 'ar-arrow-position-v1' : `ar-arrow-position-v1-${clip.id}`;
const cameraStorageKey = 'ar-arrow-camera-v1';
const flashStorageKey = 'ar-arrow-guide-flash-v1';
const guideStorageKey = 'ar-arrow-guide-timing-v1';
const offsets = {start: [0, 0, 0], far: [0, 0, 0]};
const view = {...carpetView};
let model;
let referenceMotion;
let renderer;
let elapsed = 0;
let frameRequest = 0;
let startedAt = 0;
let activeStage = -1;

document.title = `${clip.name} · AR箭头 · HUD`;
get('scene-title').textContent = clip.name;
canvas.setAttribute('aria-label', `蓝色折面箭头的${clip.name}预览`);
for (const link of document.querySelectorAll('[data-ar-preset]')) {
  if (link.dataset.arPreset === clip.id) link.setAttribute('aria-current', 'page');
  else link.removeAttribute('aria-current');
}

const stageButtons = clip.stages.map((stage, index) => {
  if (stage.preview === undefined) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = stage.label;
  button.addEventListener('click', () => seek(clip.stages[index].preview));
  choices.append(button);
  return button;
});
timeline.max = clip.durationMs;

function displayTime(ms) {
  return `${(ms / 1000).toFixed(2)} 秒`;
}

function sync() {
  const stage = clip.stages.findLastIndex(phase => elapsed >= phase.start);
  if (stage !== activeStage) {
    if (stageLabel.textContent !== clip.stages[stage].label) stageLabel.textContent = clip.stages[stage].label;
    stageButtons.forEach(button => button?.setAttribute('aria-pressed', String(button.textContent === stageLabel.textContent)));
    activeStage = stage;
  }
  timeline.value = elapsed;
  const value = `${displayTime(elapsed)} / ${displayTime(clip.durationMs)}`;
  timeDisplay.value = value;
  timeline.setAttribute('aria-valuetext', value);
  const label = frameRequest ? '暂停' : elapsed >= clip.durationMs ? '重播' : elapsed > 0 ? '继续播放' : '播放';
  if (play.textContent !== label) play.textContent = label;
  renderer?.draw(elapsed);
}

function pause() {
  if (frameRequest) cancelAnimationFrame(frameRequest);
  frameRequest = 0;
}

function seek(time) {
  pause();
  elapsed = time;
  sync();
}

function readSetting(key) {
  try { return JSON.parse(hudPreferences.getItem(key)); } catch { return null; }
}

if (clip.guideFlash) {
  const guideControls = get('ar-guide-controls');
  guideControls.hidden = false;
  const settings = {};
  const saved = readSetting(guideStorageKey);
  function updateGuide() {
    const previousEnd = clip.guideFlash.end;
    clip = createRightTurn(settings.holdSeconds, settings.flashSpeed);
    const end = clip.guideFlash.end;
    elapsed = elapsed >= previousEnd ? elapsed + end - previousEnd : Math.min(elapsed, end);
    if (frameRequest) startedAt = performance.now() - elapsed;
    timeline.max = clip.durationMs;
    renderer?.setClip(clip);
    sync();
  }
  for (const input of guideControls.querySelectorAll('input[type="range"]')) {
    const key = input.dataset.guide;
    bindRange(input, {
      saved: saved?.[key],
      update: value => { settings[key] = value; },
      change() {
        try { hudPreferences.setItem(guideStorageKey, JSON.stringify(settings)); } catch {}
        updateGuide();
      }
    });
  }
  updateGuide();
  guideFlash.checked = readSetting(flashStorageKey) === true;
  guideFlash.addEventListener('change', () => {
    try { hudPreferences.setItem(flashStorageKey, JSON.stringify(guideFlash.checked)); } catch {}
    renderer?.setFlashEnabled(guideFlash.checked);
    renderer?.draw(elapsed);
  });
}

function bindRange(input, {saved, fallback = input.defaultValue, signed = false, update, change}) {
  const output = input.closest('label').querySelector('output');
  const min = Number(input.min);
  const max = Number(input.max);
  const unit = input.dataset.unit ?? '%';
  input.value = Number.isFinite(saved) ? saved : fallback;
  const syncField = () => {
    const value = input.valueAsNumber;
    update(value);
    output.value = `${signed && value > 0 ? '+' : ''}${value}${unit}`;
    input.setAttribute('aria-valuetext', output.value);
    input.style.setProperty('--range-fill', `${(value - min) / (max - min) * 100}%`);
  };
  input.addEventListener('input', () => {
    syncField();
    change();
  });
  syncField();
  return () => {
    input.value = fallback;
    syncField();
  };
}

function updatePositions(endpoint) {
  try { hudPreferences.setItem(positionStorageKey, JSON.stringify(offsets)); } catch {}
  renderer?.setOffsets(offsets);
  if (endpoint) {
    seek(clip.stages.find(stage => stage.position === endpoint).preview);
  } else {
    sync();
  }
}

const savedOffsets = readSetting(positionStorageKey);
const positionFields = [...positionControls.querySelectorAll('input')].map(input => {
  const endpoint = input.closest('[data-ar-endpoint]').dataset.arEndpoint;
  const axis = Number(input.dataset.axis);
  return bindRange(input, {
    saved: savedOffsets?.[endpoint]?.[axis], signed: true,
    update: value => { offsets[endpoint][axis] = value; },
    change: () => updatePositions(endpoint)
  });
});
get('ar-position-reset').addEventListener('click', () => {
  positionFields.forEach(reset => reset());
  updatePositions();
});

function updateCamera() {
  try { hudPreferences.setItem(cameraStorageKey, JSON.stringify(view)); } catch {}
  renderer?.setView(view);
  renderer?.draw(elapsed);
}

const savedView = readSetting(cameraStorageKey);
const cameraFields = [...cameraControls.querySelectorAll('input')].map(input => {
  const key = input.dataset.camera;
  return bindRange(input, {
    saved: savedView?.[key], fallback: carpetView[key],
    update: value => { view[key] = value; },
    change: updateCamera
  });
});
get('ar-camera-reset').addEventListener('click', () => {
  cameraFields.forEach(reset => reset());
  updateCamera();
});

function tick(now) {
  elapsed = Math.max(0, Math.min(clip.durationMs, now - startedAt));
  frameRequest = elapsed < clip.durationMs ? requestAnimationFrame(tick) : 0;
  sync();
}

play.addEventListener('click', () => {
  if (frameRequest) {
    pause();
  } else {
    if (elapsed >= clip.durationMs) elapsed = 0;
    startedAt = performance.now() - elapsed;
    frameRequest = requestAnimationFrame(tick);
  }
  sync();
});
get('ar-reset').addEventListener('click', () => seek(0));
timeline.addEventListener('input', () => seek(timeline.valueAsNumber));

function resizePreview() {
  const {width, height} = exportSize;
  const scale = Math.min(1, canvas.clientWidth * Math.min(devicePixelRatio, 2) / width);
  if (!renderer || scale === 0) return;
  const renderWidth = Math.round(width * scale);
  const renderHeight = Math.round(height * scale);
  if (canvas.width !== renderWidth || canvas.height !== renderHeight) renderer.resize(renderWidth, renderHeight);
  renderer.draw(elapsed);
}

initHudSubpageNavigation();
initHudSubpageFormats(get('ar-dimensions'), resizePreview);
if (clip.referenceMotion) document.querySelector('[data-screen-format="1920x720"]').click();
initHudSubpageImmersive(canvas);
initArArrowExport(download, () => {
  seek(elapsed);
  return {clip, model, referenceMotion, elapsed, offsets: structuredClone(offsets), view: {...view}, flashEnabled: guideFlash.checked};
});
new ResizeObserver(resizePreview).observe(canvas);
sync();

async function init() {
  retry.hidden = true;
  loadMessage.textContent = '正在加载箭头模型…';
  preview.setAttribute('aria-busy', 'true');
  try {
    [model, referenceMotion] = await Promise.all([
      model ?? loadArArrow(),
      clip.referenceMotion ? referenceMotion ?? loadArArrowMotion() : null
    ]);
    renderer = createArArrowScene(canvas, model, clip, {offsets, view, referenceMotion, flashEnabled: guideFlash.checked});
    renderer.resize(canvas.width, canvas.height);
    resizePreview();
    loadMessage.parentElement.hidden = true;
    download.disabled = get('hud-immersive').disabled = get('ar-playback').disabled = positionControls.disabled = cameraControls.disabled = false;
  } catch (error) {
    console.error('Could not load the HUD AR arrow scene', error);
    loadMessage.textContent = '无法加载三维箭头。';
    retry.hidden = false;
  } finally {
    preview.setAttribute('aria-busy', 'false');
  }
}
retry.addEventListener('click', init);
init();
