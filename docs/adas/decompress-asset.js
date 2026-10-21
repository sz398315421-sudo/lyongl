import {gunzipSync} from 'three/addons/libs/fflate.module.js';

// Older iOS and embedded Android browsers can render WebGL but lack native gzip streams.
export async function decompressAsset(bytes){
 const data=new Uint8Array(bytes);
 if(data[0]!==0x1f||data[1]!==0x8b)return bytes;
 if(typeof DecompressionStream==='function'){
  try{return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}catch{}
 }
 const decoded=gunzipSync(data);
 return decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength);
}
