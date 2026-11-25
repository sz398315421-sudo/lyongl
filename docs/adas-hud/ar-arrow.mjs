import {exportSize} from '../adas/screen-format.js';
import {rightTurn as clip} from './ar-arrow-motion.mjs?v=6';
import {createArArrowScene, loadArArrow} from './ar-arrow-scene.bundle.mjs?v=6';
import {initArArrowExport} from './ar-arrow-export.mjs?v=6';
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
const download = get('download');
const loadMessage = get('ar-load-message');
const retry = get('ar-retry');
const positionControls = get('ar-position-controls');
const positionStorageKey = 'ar-arrow-position-v1';
const offsets = {start: [0, 0, 0], far: [0, 0, 0]};
let model;
let renderer;
let elapsed = 0;
let frameRequest = 0;
let startedAt = 0;
let activeStage = -1;

const stageButtons = clip.stages.map(stage => {
  if (stage.preview === undefined) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = stage.label;
  button.addEventListener('click', () => seek(stage.preview));
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

function updatePositions(endpoint) {
  try { hudPreferences.setItem(positionStorageKey, JSON.stringify(offsets)); } catch {}
  renderer?.setOffsets(offsets);
  if (endpoint) {
    seek(clip.stages.find(stage => stage.position === endpoint).preview);
  } else {
    sync();
  }
}

let savedOffsets;
try { savedOffsets = JSON.parse(hudPreferences.getItem(positionStorageKey)); } catch {}
const positionFields = [...positionControls.querySelectorAll('input')].map(input => {
  const endpoint = input.closest('[data-ar-endpoint]').dataset.arEndpoint;
  const axis = Number(input.dataset.axis);
  const output = input.closest('label').querySelector('output');
  const min = Number(input.min);
  const max = Number(input.max);
  const unit = input.dataset.unit ?? '%';
  const saved = savedOffsets?.[endpoint]?.[axis];
  if (Number.isFinite(saved)) input.value = saved;
  const syncField = () => {
    const value = input.valueAsNumber;
    offsets[endpoint][axis] = value;
    output.value = `${value > 0 ? '+' : ''}${value}${unit}`;
    input.setAttribute('aria-valuetext', output.value);
    input.style.setProperty('--range-fill', `${(value - min) / (max - min) * 100}%`);
  };
  input.addEventListener('input', () => {
    syncField();
    updatePositions(endpoint);
  });
  syncField();
  return () => {
    input.value = input.defaultValue;
    syncField();
  };
});
get('ar-position-reset').addEventListener('click', () => {
  positionFields.forEach(reset => reset());
  updatePositions();
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
initHudSubpageImmersive(canvas);
initArArrowExport(download, clip, () => {
  seek(elapsed);
  return {model, elapsed, offsets: structuredClone(offsets)};
});
new ResizeObserver(resizePreview).observe(canvas);
sync();

async function init() {
  retry.hidden = true;
  loadMessage.textContent = '正在加载箭头模型…';
  preview.setAttribute('aria-busy', 'true');
  try {
    model ??= await loadArArrow();
    renderer = createArArrowScene(canvas, model, clip, {offsets});
    renderer.resize(canvas.width, canvas.height);
    resizePreview();
    loadMessage.parentElement.hidden = true;
    download.disabled = get('hud-immersive').disabled = get('ar-playback').disabled = positionControls.disabled = false;
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
