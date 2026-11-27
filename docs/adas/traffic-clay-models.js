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
  const body=new THREE.MeshStandardMaterial({color:'#e2e6e9',roughness:.56,metalness:.06,vertexColors:true});
  body.name='Neutral traffic body';
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.castShadow=true;mesh.receiveShadow=true;mesh.material=body;
   const position=mesh.geometry.getAttribute('position');
   mesh.geometry.computeBoundingBox();
   const {min,max}=mesh.geometry.boundingBox;
   const colors=new Float32Array(position.count*3);
   for(let i=0;i<position.count;i++){
    const x=(position.getX(i)-min.x)/(max.x-min.x);
    const y=(position.getY(i)-min.y)/(max.y-min.y);
    const z=(position.getZ(i)-min.z)/(max.z-min.z);
    const wheels=y<.30&&Math.abs(x-.5)>.34;
    const cabin=y>.57&&z>.25&&z<.77;
    const shade=wheels?.52:cabin?.82:1;
    colors.set([shade*.98,shade,shade],i*3);
   }
   mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  });
  root.userData.vehicleSpec={id:spec.id,length:spec.length,wheels:[]};
  return {...spec,root};
 }));
}
