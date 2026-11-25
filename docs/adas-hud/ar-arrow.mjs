import {exportSize} from '../adas/screen-format.js';
import {rightTurn as clip} from './ar-arrow-motion.mjs';
import {createArArrowScene, loadArArrow} from './ar-arrow-scene.bundle.mjs?v=1';
import {initArArrowExport} from './ar-arrow-export.mjs';
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
  return {model, elapsed};
});
new ResizeObserver(resizePreview).observe(canvas);
sync();

async function init() {
  retry.hidden = true;
  loadMessage.textContent = '正在加载箭头模型…';
  preview.setAttribute('aria-busy', 'true');
  try {
    model ??= await loadArArrow();
    renderer = createArArrowScene(canvas, model, clip);
    renderer.resize(canvas.width, canvas.height);
    resizePreview();
    loadMessage.parentElement.hidden = true;
    download.disabled = get('hud-immersive').disabled = get('ar-playback').disabled = false;
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
