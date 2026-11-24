import {setScreenFormat, sizeLabel} from '../adas/screen-format.js';
import {bindHexColor} from './hud-hex.mjs';
import {hudPreferences} from './hud-storage.mjs';
import {initLaneCamera} from './lane-camera.mjs';
import {initLaneExport} from './lane-export.mjs';
import {easeLaneMotion, renderLanes} from './lane-render.mjs';

const states = {
  recognition: {label: '识别车道线', description: '两侧显示常规车道线颜色'},
  left: {label: '左侧压线', description: '左侧车道线显示提醒颜色', approachLabel: '正在向左偏移', shift: 1},
  right: {label: '右侧压线', description: '右侧车道线显示提醒颜色', approachLabel: '正在向右偏移', shift: -1},
  lcc: {label: 'LCC 已启动', description: '两侧车道线显示 LCC 颜色'},
  straight: {label: '直行', description: '两侧车道线为直线', approachLabel: '正在出弯回正'},
  'curve-left': {label: '左弯', description: '两侧车道线向左弯曲', approachLabel: '正在进入左弯', curve: -1},
  'curve-right': {label: '右弯', description: '两侧车道线向右弯曲', approachLabel: '正在进入右弯', curve: 1}
};
const colors = {recognition: '#0787ff', warning: '#ffba2b', lcc: '#4ab1ff'};
const colorStorageKey = 'lane-line-colors-v1';
try {
  const saved = JSON.parse(hudPreferences.getItem(colorStorageKey));
  for (const name of Object.keys(colors)) {
    if (/^#[0-9a-f]{6}$/i.test(saved?.[name])) colors[name] = saved[name];
  }
} catch {}

const departureMs = 1200;
const recenterMs = 350;
const curveMs = 1500;
const curveMode = new URLSearchParams(location.search).get('scene') === 'curve';
const get = id => document.getElementById(id);
const canvas = get('scene-canvas');
const context = canvas.getContext('2d', {alpha: false});
const status = get('lane-status');
const stateLabel = get('lane-current-state');
const remaining = get('lane-remaining');
const progress = get('lane-progress');
const pauseAfter = get('pause-on-departure');
const resumeButton = get('lane-resume');
const resumeControl = get('lane-resume-control');
const buttons = [...document.querySelectorAll('[data-lane-state]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const getCamera = initLaneCamera(get('lane-camera-controls'), curveMode ? 'curve' : 'departure', draw);
let visual = {key: 'recognition', shift: 0, curve: 0};
let playback;
let frameRequest = 0;
let lastAnimation = curveMode ? 'curve-left' : 'right';

function draw() {
  renderLanes(context, getCamera(), visual, colors);
  const {key} = visual;
  status.style.setProperty('--lane-accent', states[key].shift ? colors.warning : key === 'lcc' ? colors.lcc : colors.recognition);
}

function captureScene() {
  const key = lastAnimation;
  const {shift = 0, curve = 0, label} = states[key];
  const activeButton = buttons.find(button => button.dataset.laneState === key);
  const duration = get(activeButton?.dataset.duration);
  const hold = curve ? 1000 : (duration.validity.valid ? duration.valueAsNumber : Number(duration.defaultValue)) * 1000;
  const enter = curve ? curveMs : shift ? departureMs : 0;
  const exit = curve ? curveMs : shift ? recenterMs : 0;
  const endHold = enter + hold;
  const idle = curveMode ? 'straight' : 'recognition';
  const clip = {
    key, label: curve ? `${label} · 进弯至出弯` : `${label} · 完整演示`,
    durationMs: endHold + exit,
    sample(elapsed) {
      if (elapsed < enter) {
        const amount = easeLaneMotion(elapsed / enter);
        return {key: idle, shift: shift * amount, curve: curve * amount};
      }
      if (elapsed < endHold) return {key, shift, curve};
      if (!exit) return {key: idle, shift: 0, curve: 0};
      const amount = 1 - easeLaneMotion((elapsed - endHold) / exit);
      return {key: idle, shift: shift * amount, curve: curve * amount};
    }
  };
  return {clip, visual, view: getCamera(), colors: {...colors}, width: canvas.width, height: canvas.height, name: curveMode ? 'hud-lane-curve' : 'hud-lane-departure'};
}

function startPlayback(key, seconds, now) {
  const {shift = 0, curve = 0} = states[key];
  const movement = curveMode ? curveMs : shift ? departureMs : recenterMs;
  const moveMs = reducedMotion.matches || (visual.shift === shift && visual.curve === curve) ? 0 : movement;
  const holdMs = seconds * 1000;
  // Hold the warning color for the configured time after the lateral movement.
  const holdStart = now + (shift ? moveMs : 0);
  playback = {key, from: visual, start: now, moveMs, holdStart, holdMs, pauseOnArrival: !!shift && pauseAfter.checked, pausedAt: null};
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.laneState === key));
}

function frame(now) {
  frameRequest = 0;
  if (playback.pauseOnArrival && now >= playback.holdStart) {
    playback.pausedAt = playback.holdStart;
    playback.pauseOnArrival = false;
  }
  if (playback.pausedAt === null && playback.holdMs && now >= playback.holdStart + playback.holdMs) {
    startPlayback('recognition', 0, now);
  }
  const {key, from, start, moveMs, holdStart, holdMs, pausedAt} = playback;
  const target = states[key];
  const fraction = moveMs ? Math.min(1, Math.max(0, (now - start) / moveMs)) : 1;
  const eased = easeLaneMotion(fraction);
  const shift = from.shift + ((target.shift ?? 0) - from.shift) * eased;
  const curve = from.curve + ((target.curve ?? 0) - from.curve) * eased;
  const approaching = !!target.shift && now < holdStart;
  const turning = curveMode && fraction < 1;
  const paused = pausedAt !== null;
  const lineState = approaching ? 'recognition' : key;
  if (visual.key !== lineState || visual.shift !== shift || visual.curve !== curve) {
    visual = {key: lineState, shift, curve};
    draw();
  }
  const displayState = approaching ? `${key}-approach` : turning ? `${key}-moving` : key;
  if (status.dataset.state !== displayState || status.dataset.paused !== String(paused)) {
    const label = approaching || turning ? target.approachLabel : paused ? `${target.label} · 已暂停` : target.label;
    const description = approaching ? states.recognition.description : turning ? '车道线弧度正在变化' : target.description;
    status.dataset.state = displayState;
    status.dataset.paused = String(paused);
    stateLabel.textContent = label;
    canvas.setAttribute('aria-label', `${label}，${description}`);
  }
  const hasCountdown = holdMs > 0 && !approaching;
  resumeControl.hidden = !paused;
  remaining.hidden = progress.hidden = !hasCountdown;
  if (hasCountdown) {
    const left = Math.min(holdMs, holdStart + holdMs - (pausedAt ?? now));
    const label = `${(Math.ceil(left / 100) / 10).toFixed(1)} 秒`;
    if (remaining.textContent !== label) remaining.textContent = label;
    progress.value = 1 - left / holdMs;
  }
  if (fraction < 1 || (holdMs && !paused)) frameRequest = requestAnimationFrame(frame);
}

function updatePlayback(now) {
  cancelAnimationFrame(frameRequest);
  frame(now);
}

function resumePlayback(now) {
  if (playback.pausedAt === null) return;
  playback.holdStart += now - playback.pausedAt;
  playback.pausedAt = null;
}

for (const button of buttons) {
  button.addEventListener('click', () => {
    const input = get(button.dataset.duration);
    if (input && !input.reportValidity()) return;
    const now = performance.now();
    const key = button.dataset.laneState;
    if (key !== 'straight') lastAnimation = key;
    startPlayback(key, input?.valueAsNumber ?? 0, now);
    updatePlayback(now);
  });
}

pauseAfter.addEventListener('change', () => {
  if (!states[playback.key].shift) return;
  const now = performance.now();
  playback.pauseOnArrival = pauseAfter.checked && now < playback.holdStart;
  if (!pauseAfter.checked) resumePlayback(now);
  else if (playback.pausedAt === null && now >= playback.holdStart && now < playback.holdStart + playback.holdMs) {
    playback.pausedAt = now;
  }
  updatePlayback(now);
});

resumeButton.addEventListener('click', () => {
  const now = performance.now();
  resumePlayback(now);
  updatePlayback(now);
  pauseAfter.focus({preventScroll: true});
});

for (const row of document.querySelectorAll('[data-lane-color]')) {
  const name = row.dataset.laneColor;
  const picker = row.querySelector('input[type="color"]');
  const hex = row.querySelector('input[type="text"]');
  const setColor = value => {
    colors[name] = picker.value = value;
    syncHex(value);
    try { hudPreferences.setItem(colorStorageKey, JSON.stringify(colors)); } catch {}
    draw();
  };
  const syncHex = bindHexColor(hex, setColor);
  picker.value = colors[name];
  syncHex(colors[name]);
  picker.addEventListener('input', () => setColor(picker.value));
}

if (curveMode) {
  document.title = '弯道模拟 · HUD';
  get('scene-title').textContent = '弯道模拟';
  get('departure-navigation').removeAttribute('aria-current');
  get('curve-navigation').setAttribute('aria-current', 'page');
  get('departure-controls').hidden = get('departure-note').hidden = true;
  for (const row of document.querySelectorAll('[data-departure-only]')) row.hidden = true;
  get('curve-controls').hidden = false;
}

const formats = [...document.querySelectorAll('[data-screen-format]')];
const formatGroup = formats[0].parentElement;
function syncFormatIndicator() {
  const active = formatGroup.querySelector('[aria-pressed="true"]');
  formatGroup.style.setProperty('--selection-x', `${active.offsetLeft}px`);
  formatGroup.style.setProperty('--selection-width', `${active.offsetWidth}px`);
}

for (const button of formats) {
  button.addEventListener('click', () => {
    const {width, height} = setScreenFormat(button.dataset.screenFormat);
    document.documentElement.style.setProperty('--screen-aspect', String(width / height));
    canvas.width = width;
    canvas.height = height;
    get('lane-dimensions').textContent = sizeLabel();
    for (const format of formats) format.setAttribute('aria-pressed', String(format === button));
    syncFormatIndicator();
    draw();
  });
}
new ResizeObserver(syncFormatIndicator).observe(formatGroup);

const picker = get('scene-picker');
const menu = get('mobile-scene-menu');
const nav = get('scenes');
const mobile = matchMedia('(max-width: 760px)');
function showMenu(open) {
  menu.classList.toggle('is-open', open);
  menu.inert = !open;
  menu.setAttribute('aria-hidden', String(!open));
  picker.setAttribute('aria-expanded', String(open));
  picker.setAttribute('aria-label', open ? '关闭场景菜单' : '选择场景');
}
function placeNavigation() {
  showMenu(false);
  (mobile.matches ? get('mobile-scene-nav') : menu.parentElement).append(nav);
}
picker.addEventListener('click', () => showMenu(menu.inert));
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || menu.inert) return;
  showMenu(false);
  picker.focus();
});
mobile.addEventListener('change', placeNavigation);
placeNavigation();

const immersive = get('hud-immersive');
const dialog = get('hud-immersive-dialog');
const preview = get('preview');
immersive.addEventListener('click', () => {
  dialog.append(canvas);
  dialog.showModal();
});
dialog.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  preview.append(canvas);
  immersive.focus({preventScroll: true});
});

const initTime = performance.now();
startPlayback(curveMode ? 'straight' : 'recognition', 0, initTime);
frame(initTime);
draw();
const downloadButton = get('download');
initLaneExport(downloadButton, captureScene);
downloadButton.disabled = false;
