import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {gunzipSync} from 'three/addons/libs/fflate.module.js';

export const clayModels=Object.freeze([
 {id:'sedan',label:'轿车',triangles:2954,length:4.5},
 {id:'hatchback',label:'两厢车',triangles:3124,length:4.15},
 {id:'suv',label:'SUV',triangles:3294,length:4.75}
]);
export async function loadClayModels(){
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 return Promise.all(clayModels.map(async spec=>{
  const response=await fetch(new URL(`./assets/traffic-clay/${spec.id}.glb.gz`,import.meta.url));
  if(!response.ok)throw Error(`模型加载失败：${spec.label}`);
  let bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes[0]===0x1f&&bytes[1]===0x8b)bytes=gunzipSync(bytes);
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const root=gltf.scene;root.name=spec.label;
  root.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;mesh.material=new THREE.MeshStandardMaterial({color:'#c5cbd3',roughness:.78,metalness:0});}});
  root.userData.vehicleSpec={id:spec.id,length:spec.length,wheels:[]};
  return {...spec,root};
 }));
}
