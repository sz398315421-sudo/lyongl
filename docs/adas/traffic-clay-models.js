import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {gunzipSync} from 'three/addons/libs/fflate.module.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

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
  const body=new THREE.MeshPhysicalMaterial({roughness:.56,metalness:.04,clearcoat:.18,clearcoatRoughness:.46,vertexColors:true});
  body.name='Satin gray traffic body';
  const paint=new THREE.Color({sedan:'#cbd4dd',hatchback:'#d5dade',suv:'#ccd5d9'}[spec.id]);
  const glass=new THREE.Color('#889ba9'),tire=new THREE.Color('#81878c'),sample=new THREE.Color();
  const smooth=THREE.MathUtils.smoothstep;
  root.traverse(mesh=>{
   if(!mesh.isMesh)return;
   mesh.castShadow=true;mesh.receiveShadow=true;mesh.material=body;
   const original=mesh.geometry;
   mesh.geometry=toCreasedNormals(original,.87);
   if(original!==mesh.geometry)original.dispose();
   const position=mesh.geometry.getAttribute('position');
   const normal=mesh.geometry.getAttribute('normal');
   mesh.geometry.computeBoundingBox();
   const {min,max}=mesh.geometry.boundingBox;
   const colors=new Float32Array(position.count*3);
   for(let i=0;i<position.count;i++){
    const x=(position.getX(i)-min.x)/(max.x-min.x);
    const y=(position.getY(i)-min.y)/(max.y-min.y);
    const z=(position.getZ(i)-min.z)/(max.z-min.z);
    const tireWeight=(1-smooth(y,.20,.36))*smooth(Math.abs(x-.5),.30,.45);
    const cabin=smooth(y,.53,.72)*smooth(z,.12,.30)*(1-smooth(z,.72,.91));
    const windows=cabin*(1-.85*smooth(normal.getY(i),.64,.97));
    sample.copy(paint).lerp(glass,windows*.87).lerp(tire,tireWeight*.89);
    sample.toArray(colors,i*3);
   }
   mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  });
  root.userData.vehicleSpec={id:spec.id,length:spec.length,wheels:[]};
  return {...spec,root};
 }));
}
