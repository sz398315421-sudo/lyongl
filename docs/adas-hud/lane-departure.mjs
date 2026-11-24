import {screenFormat} from '../adas/screen-format.js';

const states = {
  recognition: {label: '识别车道线', description: '两侧蓝色细线', shift: 0},
  left: {label: '左侧压线', description: '左侧车道线变黄', approachLabel: '正在向左偏移', shift: 1},
  right: {label: '右侧压线', description: '右侧车道线变黄', approachLabel: '正在向右偏移', shift: -1},
  lcc: {label: 'LCC 已启动', description: '两侧车道线变为亮蓝色', shift: 0}
};
const blue = '7, 135, 255';
const brightBlue = '74, 177, 255';
const yellow = '255, 186, 43';
const departureMs = 1200;
const recenterMs = 350;
const get = id => document.getElementById(id);
const canvas = get('scene-canvas');
const context = canvas.getContext('2d', {alpha: false});
const status = get('lane-status');
const stateLabel = get('lane-current-state');
const remaining = get('lane-remaining');
const progress = get('lane-progress');
const buttons = [...document.querySelectorAll('[data-lane-state]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let visual = {key: 'recognition', shift: 0};
let playback;
let frameRequest = 0;

function drawLane(side, shift, rgb) {
  // The near end moves farther on screen, keeping the distant vanishing point stable.
  const farX = side * 59 + shift * 19;
  const nearX = side * 246 + shift * 72;
  const farY = -85;
  const nearY = 85;
  const dx = nearX - farX;
  const dy = nearY - farY;
  const length = Math.hypot(dx, dy);
  const color = alpha => `rgba(${rgb}, ${alpha})`;

  context.save();
  context.translate(farX, farY);
  context.rotate(Math.atan2(dy, dx));

  const line = context.createLinearGradient(0, 0, length, 0);
  line.addColorStop(0, color(0));
  line.addColorStop(.27, color(.91));
  line.addColorStop(.66, color(1));
  line.addColorStop(.86, color(.36));
  line.addColorStop(1, color(0));
  context.fillStyle = line;
  context.beginPath();
  context.moveTo(0, -.6);
  context.lineTo(length, -3.7);
  context.lineTo(length, 3.7);
  context.lineTo(0, .6);
  context.closePath();
  context.fill();
  context.restore();
}

function draw() {
  const {width, height} = canvas;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / 700, height / 330);
  context.save();
  context.translate(width / 2, height / 2);
  context.scale(scale, scale);
  const laneBlue = visual.key === 'lcc' ? brightBlue : blue;
  drawLane(-1, visual.shift, visual.key === 'left' ? yellow : laneBlue);
  drawLane(1, visual.shift, visual.key === 'right' ? yellow : laneBlue);
  context.restore();
}

function startPlayback(key, seconds, now) {
  const {shift} = states[key];
  const movement = shift ? departureMs : recenterMs;
  const moveMs = reducedMotion.matches || visual.shift === shift ? 0 : movement;
  const holdMs = seconds * 1000;
  // Hold the warning color for the configured time after the lateral movement.
  const holdStart = now + (shift ? moveMs : 0);
  playback = {key, from: visual.shift, start: now, moveMs, holdStart, holdMs};
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.laneState === key));
}

function frame(now) {
  frameRequest = 0;
  if (playback.holdMs && now >= playback.holdStart + playback.holdMs) startPlayback('recognition', 0, now);
  const {key, from, start, moveMs, holdStart, holdMs} = playback;
  const target = states[key];
  const fraction = moveMs ? Math.min(1, Math.max(0, (now - start) / moveMs)) : 1;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const shift = from + (target.shift - from) * eased;
  const approaching = target.shift !== 0 && now < holdStart;
  const lineState = approaching ? 'recognition' : key;
  if (visual.key !== lineState || visual.shift !== shift) {
    visual = {key: lineState, shift};
    draw();
  }
  const displayState = approaching ? `${key}-approach` : key;
  if (status.dataset.state !== displayState) {
    const label = approaching ? target.approachLabel : target.label;
    const description = approaching ? states.recognition.description : target.description;
    status.dataset.state = displayState;
    stateLabel.textContent = label;
    canvas.setAttribute('aria-label', `${label}，${description}`);
  }
  const countingDown = holdMs > 0 && !approaching;
  remaining.hidden = progress.hidden = !countingDown;
  if (countingDown) {
    const left = Math.min(holdMs, holdStart + holdMs - now);
    const label = `${(Math.ceil(left / 100) / 10).toFixed(1)} 秒`;
    if (remaining.textContent !== label) remaining.textContent = label;
    progress.value = 1 - left / holdMs;
  }
  if (holdMs || fraction < 1) frameRequest = requestAnimationFrame(frame);
}

for (const button of buttons) {
  button.addEventListener('click', () => {
    const input = get(button.dataset.duration);
    if (!input.reportValidity()) return;
    cancelAnimationFrame(frameRequest);
    const now = performance.now();
    startPlayback(button.dataset.laneState, input.valueAsNumber, now);
    frame(now);
  });
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
    const {width, height} = screenFormat(button.dataset.screenFormat);
    document.documentElement.style.setProperty('--screen-aspect', String(width / height));
    canvas.width = width;
    canvas.height = height;
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

draw();
