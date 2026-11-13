import {recordCanvasVideo} from '../adas/video-export.js';

const codecs = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8'];
const width = 96;
const height = 64;
const unavailable = '此浏览器无法录制带透明通道的 WebM，请使用新版 Chrome 或 Edge。';

export function supportsHudWebm() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    codecs.some(codec => MediaRecorder.isTypeSupported(codec));
}

async function retainsAlpha(blob) {
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  try {
    video.muted = true;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 2500);
      const finish = () => { clearTimeout(timer); resolve(); };
      video.onloadeddata = finish;
      video.onerror = finish;
      video.src = url;
    });
    if (video.readyState < 2) return false;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (video.seekable.length && video.seekable.end(0) > .12) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 1500);
        video.onseeked = () => { clearTimeout(timer); resolve(); };
        video.currentTime = .12;
      });
    }
    context.drawImage(video, 0, 0);
    const empty = context.getImageData(10, 16, 1, 1).data[3];
    const translucent = context.getImageData(60, 16, 1, 1).data[3];
    return empty < 16 && translucent > 96 && translucent < 160;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

let verifiedFormat;
export async function transparentVideoFormat(signal) {
  if (verifiedFormat) return verifiedFormat;
  if (!supportsHudWebm()) throw new Error(unavailable);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  for (const mimeType of codecs.filter(codec => MediaRecorder.isTypeSupported(codec))) {
    const format = {mimeType, extension: 'webm'};
    try {
      const {blob} = await recordCanvasVideo({canvas, durationMs: 600, format, signal, renderFrame: elapsed => {
        context.clearRect(0, 0, width, height);
        context.fillStyle = 'rgba(0, 207, 243, .5)';
        context.fillRect(48 + Math.floor(elapsed / 34) % 4, 0, 40, height);
      }});
      if (await retainsAlpha(blob)) {
        signal.throwIfAborted();
        verifiedFormat = format;
        return format;
      }
    } catch {
      signal.throwIfAborted();
    }
  }
  signal.throwIfAborted();
  throw new Error(unavailable);
}
