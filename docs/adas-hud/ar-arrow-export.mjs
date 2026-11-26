import {initExportControls} from '../adas/export-controls.js';
import {canvasPng, downloadFile} from '../adas/export-files.js';
import {exportSize} from '../adas/screen-format.js';
import {recordCanvasVideo} from '../adas/video-export.js';
import {createSequenceFields, renderPngSequence} from './hud-png-sequence.mjs';
import {supportsHudWebm, transparentVideoFormat} from './hud-video.mjs';
import {createArArrowScene} from './ar-arrow-scene.bundle.mjs?v=13';

export function initArArrowExport(button, clip, capture) {
  const sequence = createSequenceFields();
  const supportsAlpha = supportsHudWebm();
  let snapshot;
  let sequenceOptions;
  button.addEventListener('click', () => {
    if (!button.disabled) snapshot = {...capture(), ...exportSize};
  });
  const description = `${clip.name} · ${clip.durationMs / 1000} 秒`;
  const controls = initExportControls(button, exportScene, {
    formats: video => [
      ['image', 'PNG 图片', '当前画面 · 黑色背景', 'PNG'],
      ['transparent', '透明 PNG', '当前画面 · 仅箭头', 'PNG'],
      ['video', '演示动画', video ? description : '此浏览器暂不支持视频导出', video?.extension.toUpperCase() || '视频', !!video],
      ['transparent-video', '透明视频（WebM）', supportsAlpha ? description : '此浏览器暂不支持透明 WebM', 'WebM', supportsAlpha],
      ['png-sequence', '透明 PNG 序列（AE）', description, 'ZIP']
    ],
    fields: sequence.fields,
    isSized: () => true,
    onFormatChange: format => { sequence.fields.hidden = format !== 'png-sequence'; },
    validate(format) {
      sequenceOptions = format === 'png-sequence' ? sequence.read() : undefined;
      return sequenceOptions !== null;
    }
  });

  async function exportScene(format) {
    const {model, referenceMotion, elapsed, width, height, offsets, view} = snapshot;
    const animation = ['video', 'transparent-video', 'png-sequence'].includes(format);
    const transparent = format !== 'image' && format !== 'video';
    const controller = new AbortController();
    const {signal} = controller;
    const name = `HUD-AR箭头-${clip.name}${transparent ? '-透明' : ''}`;
    let renderer;
    controls.setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', {alpha: transparent});
      const glCanvas = document.createElement('canvas');
      renderer = createArArrowScene(glCanvas, model, clip, {transparent, offsets, view, referenceMotion});
      renderer.resize(width, height);
      const renderFrame = time => {
        renderer.draw(time);
        context.globalCompositeOperation = 'copy';
        context.drawImage(glCanvas, 0, 0);
      };
      if (animation) {
        controls.showVideoProgress(() => controller.abort());
        const options = {canvas, durationMs: clip.durationMs, signal, renderFrame, onProgress: controls.updateVideoProgress};
        const {blob, extension} = format === 'png-sequence'
          ? await renderPngSequence({...options, options: sequenceOptions})
          : await recordCanvasVideo({...options, format: transparent ? await transparentVideoFormat(signal) : undefined});
        downloadFile(blob, `${name}.${extension}`);
      } else {
        renderFrame(elapsed);
        downloadFile(await canvasPng(canvas), `${name}.png`);
      }
      controls.announce('已下载。');
    } catch (error) {
      controls.announce(signal.aborted ? '已取消导出。' : error.message || '导出失败，请重试。', !signal.aborted);
    } finally {
      renderer?.dispose();
      controls.hideVideoProgress();
      button.disabled = false;
      controls.setBusy(false);
    }
  }
}
