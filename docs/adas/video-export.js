// Record the authored timeline locally; no upload or screen-sharing permission.
export function videoFormat(){
 if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||!HTMLCanvasElement.prototype.captureStream)return null;
 const mimeType=['video/mp4;codecs=avc1.420028','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
 return mimeType?{mimeType,extension:mimeType.startsWith('video/mp4')?'mp4':'webm'}:null;
}

export async function recordCanvasVideo({canvas,durationMs,renderFrame,onProgress=()=>{},signal}){
 const format=videoFormat();if(!format)throw new Error('此浏览器暂不支持视频导出，请使用新版 Chrome、Edge 或 Safari。');
 signal?.throwIfAborted();
 const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
 let recorder,recordingError,started=false;const chunks=[];
 try{
  if(!track?.requestFrame)throw new Error('此浏览器暂不支持视频逐帧导出，请使用新版 Chrome 或 Edge。');
  recorder=new MediaRecorder(stream,{mimeType:format.mimeType,videoBitsPerSecond:12000000});
  const stopped=new Promise(resolve=>{
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onstop=resolve;
   recorder.onerror=event=>{recordingError=event.error||new Error('视频编码失败，请重试。');resolve();};
  });
  const capture=elapsed=>{
   signal?.throwIfAborted();if(recordingError)throw recordingError;
   renderFrame(elapsed);track.requestFrame();onProgress(elapsed/durationMs);
  };
  // Prime the canvas before starting so the file always begins at frame zero.
  renderFrame(0);recorder.start();started=true;capture(0);
  try{
   const start=performance.now();let elapsed=0;
   while(elapsed<durationMs){
    await new Promise(resolve=>setTimeout(resolve,1000/30));
    elapsed=Math.min(durationMs,performance.now()-start);capture(elapsed);
   }
   // Let the encoder consume the final requested frame before flushing.
   await new Promise(resolve=>setTimeout(resolve,100));signal?.throwIfAborted();
  }finally{
   if(recorder.state!=='inactive')recorder.stop();await stopped;
  }
  if(recordingError)throw recordingError;
  const blob=new Blob(chunks,{type:recorder.mimeType||format.mimeType});
  if(!blob.size)throw new Error('未生成有效视频，请重试。');
  return {blob,extension:format.extension};
 }finally{
  if(started&&recorder.state!=='inactive')recorder.stop();
  stream.getTracks().forEach(track=>track.stop());
 }
}
