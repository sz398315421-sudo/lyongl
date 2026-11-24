import {initExportControls} from '../adas/export-controls.js';
import {canvasPng, downloadFile} from '../adas/export-files.js';
import {recordCanvasVideo} from '../adas/video-export.js';
import {createSequenceFields, renderPngSequence} from './hud-png-sequence.mjs';
import {supportsHudWebm, transparentVideoFormat} from './hud-video.mjs';
import {renderLanes} from './lane-render.mjs';

const animationFormats = ['video', 'transparent-video', 'png-sequence'];

export function initLaneExport(button, captureScene) {
  const sequence = createSequenceFields();
  const supportsAlphaVideo = supportsHudWebm();
  let snapshot;
  let sequenceOptions;
  button.addEventListener('click', () => {
    if (!button.disabled) snapshot = captureScene();
  });
  const controls = initExportControls(button, exportScene, {
    formats: video => [
      ['image', 'PNG 图片', '当前画面 · 黑色背景', 'PNG'],
      ['transparent', '透明 PNG', '当前画面 · 仅车道线', 'PNG'],
      ['video', '演示动画', video ? '' : '此浏览器暂不支持视频导出', video?.extension.toUpperCase() || '视频', !!video],
      ['transparent-video', '透明视频（WebM）', supportsAlphaVideo ? '' : '此浏览器暂不支持透明 WebM', 'WebM', supportsAlphaVideo],
      ['png-sequence', '透明 PNG 序列（AE）', '', 'ZIP'],
      ['camera', '相机参数', '当前视角、画幅及车道线颜色', 'JSON']
    ],
    fields: sequence.fields,
    isSized: format => format !== 'camera',
    onFormatChange: format => { sequence.fields.hidden = format !== 'png-sequence'; },
    describe(format, detail) {
      if (!animationFormats.includes(format) || detail.closest('label').querySelector('input').disabled) return;
      detail.textContent = format === 'png-sequence' ? `${snapshot.clip.label} · 支持设置帧率和总帧数` : snapshot.clip.label;
    },
    validate(format) {
      sequenceOptions = format === 'png-sequence' ? sequence.read() : undefined;
      return sequenceOptions !== null;
    }
  });

  async function exportScene(format) {
    const {clip, visual, view, colors, width, height, name} = snapshot;
    const animation = animationFormats.includes(format);
    const controller = new AbortController();
    const {signal} = controller;
    controls.setBusy(true);
    try {
      if (format === 'camera') {
        const metadata = {scene: name, width, height, camera: view.metadata, colors};
        downloadFile(new Blob([JSON.stringify(metadata, null, 2)], {type: 'application/json'}), `${name}-camera.json`);
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const transparent = format !== 'image' && format !== 'video';
        if (!animation) {
          renderLanes(context, view, visual, colors, transparent);
          downloadFile(await canvasPng(canvas), `${name}${transparent ? '-transparent' : ''}.png`);
        } else {
          controls.showVideoProgress(() => controller.abort());
          const options = {
            canvas, durationMs: clip.durationMs, signal,
            onProgress: controls.updateVideoProgress,
            renderFrame: elapsed => renderLanes(context, view, clip.sample(elapsed), colors, transparent)
          };
          const result = format === 'png-sequence'
            ? await renderPngSequence({...options, options: sequenceOptions})
            : await recordCanvasVideo({...options, format: format === 'transparent-video' ? await transparentVideoFormat(signal) : undefined});
          downloadFile(result.blob, `${name}-${clip.key}${transparent ? '-transparent' : ''}.${result.extension}`);
        }
      }
      controls.announce('已下载。');
    } catch (error) {
      controls.announce(signal.aborted ? '已取消导出。' : error.message || '导出失败，请重试。', !signal.aborted);
    } finally {
      controls.hideVideoProgress();
      button.disabled = false;
      controls.setBusy(false);
    }
  }
}
