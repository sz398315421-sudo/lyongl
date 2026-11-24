import {canvasPng, zipFiles} from '../adas/export-files.js';
import {hudPreferences} from './hud-storage.mjs';

const maxFrames = 1200;
const maxFps = 60;

export function createSequenceFields() {
  const fields = document.createElement('fieldset');
  fields.className = 'hud-sequence-fields';
  fields.hidden = true;
  fields.innerHTML = `<legend>序列帧设置</legend>
    <label>帧率（fps）<input name="sequence-fps" type="number" min="1" max="${maxFps}" value="30" required></label>
    <label>总帧数<input name="sequence-count" type="number" min="1" max="${maxFrames}" placeholder="自动"></label>
    <p>总帧数留空时按动画时长计算。手动设置时会重新采样整段动画，播放时长为总帧数 ÷ 帧率。</p>`;
  const fps = fields.querySelector('[name="sequence-fps"]');
  const count = fields.querySelector('[name="sequence-count"]');
  const values = () => ({fps: fps.valueAsNumber, count: count.value === '' ? null : count.valueAsNumber});
  try {
    const saved = JSON.parse(hudPreferences.getItem('png-sequence'));
    if (Number.isInteger(saved?.fps) && saved.fps >= 1 && saved.fps <= maxFps) fps.value = saved.fps;
    if (Number.isInteger(saved?.count) && saved.count >= 1 && saved.count <= maxFrames) count.value = saved.count;
  } catch {}
  fields.addEventListener('input', () => {
    if (!fps.validity.valid || !count.validity.valid) return;
    try { hudPreferences.setItem('png-sequence', JSON.stringify(values())); } catch {}
  });
  return {fields, read() {
    if (!fps.reportValidity() || !count.reportValidity()) return null;
    return values();
  }};
}

export async function renderPngSequence({canvas, durationMs, options, renderFrame, onProgress, signal}) {
  const {fps} = options;
  const count = options.count ?? Math.max(1, Math.round(durationMs / 1000 * fps));
  if (!Number.isInteger(fps) || fps < 1 || fps > maxFps || !Number.isInteger(count) || count < 1 || count > maxFrames) {
    throw new Error('请检查帧率和总帧数设置。');
  }

  const files = [];
  for (let index = 0; index < count; index++) {
    signal.throwIfAborted();
    const elapsed = count === 1 ? 0 : durationMs * index / (count - 1);
    renderFrame(elapsed);
    const png = await canvasPng(canvas);
    files.push([`frames/HUD_${String(index + 1).padStart(4, '0')}.png`, png]);
    onProgress(.98 * (index + 1) / count);
  }

  files.push(['README.txt', `HUD 透明 PNG 序列\n分辨率：${canvas.width} × ${canvas.height}\n帧率：${fps} fps\n总帧数：${count}\n播放时长：${(count / fps).toFixed(3)} 秒\n透明通道：Straight (Unmatted)\n\n解压后，在 After Effects 中导入 frames/HUD_0001.png，勾选 PNG 序列。\n在「解释素材 → 主要」中将帧率设为 ${fps} fps。\n`]);
  signal.throwIfAborted();
  const blob = await zipFiles(files, signal);
  signal.throwIfAborted();
  onProgress(1);
  return {blob, extension: 'zip'};
}
