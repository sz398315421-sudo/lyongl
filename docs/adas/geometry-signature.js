// Parking instances share geometry. Hash each position buffer once per version,
// rather than rescanning every vertex of every neighboring-car instance.
const signatures=new WeakMap();
const source=attribute=>attribute?.isInterleavedBufferAttribute?attribute.data:attribute;
const mix=(hash,value)=>Math.imul(hash^Math.round(value*100000),16777619)>>>0;
export function geometryPositionSignature(attribute){
 if(!attribute)return 0;
 const data=source(attribute),cached=signatures.get(data);
 if(cached?.version===data.version&&cached.array===data.array)return cached.value;
 let value=2166136261;for(const n of data.array)value=mix(value,n);
 signatures.set(data,{version:data.version,array:data.array,value});return value;
}
export async function prepareGeometrySignatures(root,{yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0)),now=()=>performance.now()}={}){
 const attributes=new Set();root.traverse(object=>{const data=source(object.geometry?.getAttribute('position'));if(data)attributes.add(data);});
 let slice=now();
 for(const data of attributes){
  const cached=signatures.get(data);if(cached?.version===data.version&&cached.array===data.array)continue;
  const {array,version}=data;let value=2166136261;
  for(let i=0;i<array.length;i++){
   value=mix(value,array[i]);
   if((i+1)%16384===0&&now()-slice>=4){await yieldTask();slice=now();}
  }
  if(data.array===array&&data.version===version)signatures.set(data,{array,version,value});
  if(now()-slice>=4){await yieldTask();slice=now();}
 }
}
