// Record the authored timeline locally; no upload or screen-sharing permission.
function supportedVideoFormats(){
 if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||!HTMLCanvasElement.prototype.captureStream)return null;
 return ['video/mp4;codecs=avc1.420028','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
  .filter(type=>MediaRecorder.isTypeSupported(type));
}
export function videoFormat(){
 const mimeType=supportedVideoFormats()?.[0];
 return mimeType?{mimeType,extension:mimeType.startsWith('video/mp4')?'mp4':'webm'}:null;
}

export async function recordCanvasVideo({canvas,durationMs,renderFrame,onProgress=()=>{},signal}){
 const format=videoFormat();if(!format)throw new Error('此浏览器暂不支持视频导出，请使用新版 Chrome、Edge 或 Safari。');
 signal?.throwIfAborted();
 renderFrame(0);
 const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];
 let recorder,recordingError,started=false;const chunks=[];
 try{
  if(!track?.requestFrame)throw new Error('此浏览器暂不支持视频逐帧导出，请使用新版 Chrome 或 Edge。');
  let mimeType;
  for(const candidate of supportedVideoFormats()){
   try{
    recorder=new MediaRecorder(stream,{mimeType:candidate,videoBitsPerSecond:12000000});
    recorder.start();mimeType=candidate;started=true;break;
   }catch{recorder=null;}
  }
  if(!recorder)throw new Error('浏览器无法启动视频编码，请降低分辨率后重试。');
  const stopped=new Promise(resolve=>{
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onstop=resolve;
   recorder.onerror=event=>{recordingError=event.error||new Error('视频编码失败，请重试。');resolve();};
  });
  const capture=elapsed=>{
   signal?.throwIfAborted();if(recordingError)throw recordingError;
   renderFrame(elapsed);track.requestFrame();onProgress(elapsed/durationMs);
  };
  capture(0);
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
  const blob=new Blob(chunks,{type:recorder.mimeType||mimeType});
  if(!blob.size)throw new Error('未生成有效视频，请重试。');
  return {blob,extension:blob.type.startsWith('video/mp4')?'mp4':'webm'};
 }finally{
  if(started&&recorder.state!=='inactive')recorder.stop();
  stream.getTracks().forEach(track=>track.stop());
 }
}
