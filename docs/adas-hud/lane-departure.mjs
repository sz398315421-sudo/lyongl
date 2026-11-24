import {screenFormat} from '../adas/screen-format.js';

const states = {
  recognition: {label: '识别车道线', description: '两侧蓝色细线', shift: 0, leftGlow: 0, rightGlow: 0, leftYellow: 0, rightYellow: 0},
  left: {label: '向左偏离', description: '左侧车道线靠近中央并变黄', shift: 1, leftGlow: 1, rightGlow: 0, leftYellow: 1, rightYellow: 0},
  right: {label: '向右偏离', description: '右侧车道线靠近中央并变黄', shift: -1, leftGlow: 0, rightGlow: 1, leftYellow: 0, rightYellow: 1},
  lcc: {label: 'LCC 已启动', description: '两侧车道线泛蓝光', shift: 0, leftGlow: 1, rightGlow: 1, leftYellow: 0, rightYellow: 0}
};
const visualKeys = ['shift', 'leftGlow', 'rightGlow', 'leftYellow', 'rightYellow'];
const get = id => document.getElementById(id);
const canvas = get('scene-canvas');
const context = canvas.getContext('2d', {alpha: false});
const status = get('lane-status');
const stateLabel = get('lane-current-state');
const remaining = get('lane-remaining');
const progress = get('lane-progress');
const buttons = [...document.querySelectorAll('[data-lane-state]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const transitionMs = 300;
let visual = states.recognition;
let target = visual;
let transition;
let endTime = 0;
let duration = 0;
let frameRequest = 0;

function drawLane(side, shift, glow, yellow) {
  // The near end moves farther on screen, keeping the distant vanishing point stable.
  const farX = side * 59 + shift * 19;
  const nearX = side * 246 + shift * 72;
  const farY = -85;
  const nearY = 85;
  const dx = nearX - farX;
  const dy = nearY - farY;
  const length = Math.hypot(dx, dy);
  const red = 7 + 248 * yellow;
  const green = 135 + 51 * yellow;
  const blue = 255 - 212 * yellow;
  const color = alpha => `rgba(${red}, ${green}, ${blue}, ${alpha})`;

  context.save();
  context.translate(farX, farY);
  context.rotate(Math.atan2(dy, dx));
  context.scale(1, side);

  if (glow > 0) {
    context.save();
    context.translate(length * .58, 17);
    context.scale(length * .47, 46);
    const halo = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    halo.addColorStop(0, color(.56 * glow));
    halo.addColorStop(.38, color(.36 * glow));
    halo.addColorStop(.69, color(.11 * glow));
    halo.addColorStop(1, color(0));
    context.fillStyle = halo;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  }

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
  drawLane(-1, visual.shift, visual.leftGlow, visual.leftYellow);
  drawLane(1, visual.shift, visual.rightGlow, visual.rightYellow);
  context.restore();
}

function activate(key, seconds, now) {
  target = states[key];
  endTime = seconds ? now + seconds * 1000 : 0;
  duration = seconds * 1000;
  transition = !reducedMotion.matches && visual !== target ? {from: visual, start: now} : null;
  if (!transition) {
    visual = target;
    draw();
  }
  status.dataset.state = key;
  stateLabel.textContent = target.label;
  canvas.setAttribute('aria-label', `${target.label}，${target.description}`);
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.laneState === key));
  remaining.hidden = progress.hidden = !endTime;
}

function frame(now) {
  frameRequest = 0;
  if (endTime && now >= endTime) activate('recognition', 0, now);
  if (transition) {
    const fraction = Math.max(0, Math.min(1, (now - transition.start) / transitionMs));
    const eased = fraction * fraction * (3 - 2 * fraction);
    visual = Object.fromEntries(visualKeys.map(key => [key, transition.from[key] + (target[key] - transition.from[key]) * eased]));
    if (fraction === 1) {
      visual = target;
      transition = null;
    }
    draw();
  }
  if (endTime) {
    const left = Math.min(duration, endTime - now);
    const label = `${(Math.ceil(left / 100) / 10).toFixed(1)} 秒`;
    if (remaining.textContent !== label) remaining.textContent = label;
    progress.value = 1 - left / duration;
  }
  if (endTime || transition) frameRequest = requestAnimationFrame(frame);
}

for (const button of buttons) {
  button.addEventListener('click', () => {
    const input = get(button.dataset.duration);
    if (!input.reportValidity()) return;
    cancelAnimationFrame(frameRequest);
    const now = performance.now();
    activate(button.dataset.laneState, input.valueAsNumber, now);
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
