import * as THREE from 'three';
import {maxTrafficVehicles,trafficVehicleLength} from './traffic-simulation.js';

// Each instance is the supplied model's original geometry and material. Only
// the object transforms change; no traffic-specific body, paint or trim is made.
export function createTrafficVehicles(scene,{retain=()=>()=>{}}={}){
 const group=new THREE.Group();group.name='Dynamic traffic';group.visible=false;scene.add(group);
 const pose=new THREE.Object3D(),matrix=new THREE.Matrix4();
 let templates=[],assignments=new Map(),egoId=null;
 function release(entries){
  for(const entry of entries){
   for(const {mesh}of entry.parts){mesh.removeFromParent();mesh.dispose();}
   entry.release();
  }
 }
 function setModels(models,nextEgoId){
  const sources=models.filter(model=>model.id!==nextEgoId);
  if(egoId===nextEgoId&&sources.length===templates.length&&sources.every((model,index)=>model.id===templates[index].id&&model.root===templates[index].source))return false;
  const next=[];
  try{
   for(const model of sources){
    const entry={id:model.id,source:model.root,parts:[],release:retain(model.id)};next.push(entry);
    const template=model.root.clone(true);template.position.set(0,0,0);template.rotation.set(0,0,0);template.visible=true;template.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(template),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
    if(!Number.isFinite(size.z)||size.z<=0||size.z>trafficVehicleLength+.05)throw Error(`Traffic vehicle has invalid dimensions: ${model.id}`);
    template.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));template.updateMatrixWorld(true);
    entry.length=size.z;entry.width=size.x;
    template.traverseVisible(part=>{
     if(!part.isMesh)return;
     if(part.isSkinnedMesh)throw Error(`Traffic vehicle needs a prepared static mesh: ${model.id}`);
     const mesh=new THREE.InstancedMesh(part.geometry,part.material,maxTrafficVehicles);
     mesh.name=`Traffic ${model.id} / ${part.name}`;mesh.count=0;mesh.frustumCulled=false;
     mesh.renderOrder=part.renderOrder;mesh.layers.mask=part.layers.mask;
     mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
     mesh.userData={...part.userData,sharedVehicleGeometry:true,trafficModelId:model.id,sourceMeshId:part.uuid};
     const morph=part.morphTargetInfluences?.some(value=>value!==0)?part:null;
     entry.parts.push({mesh,local:part.matrixWorld.clone(),morph});
    });
    if(!entry.parts.length)throw Error(`Traffic vehicle contains no visible meshes: ${model.id}`);
   }
  }catch(error){release(next);throw error;}
  const previous=templates;templates=next;egoId=nextEgoId;assignments.clear();
  for(const template of templates)for(const {mesh}of template.parts)group.add(mesh);
  release(previous);group.userData.modelIds=templates.map(template=>template.id);return true;
 }
 function update(cars,y){
  group.position.y=y;
  const alive=new Set(cars.map(car=>car.id));for(const id of assignments.keys())if(!alive.has(id))assignments.delete(id);
  const buckets=templates.map(()=>[]);
  for(const car of cars){
   if(!templates.length)break;
   if(!assignments.has(car.id))assignments.set(car.id,(car.id-1)%templates.length);
   buckets[assignments.get(car.id)].push(car);
  }
  templates.forEach((template,index)=>{
   const batch=buckets[index];
   for(const {mesh,local,morph}of template.parts){
    mesh.count=batch.length;
    batch.forEach((car,i)=>{
     pose.position.set(car.x,0,car.z);pose.rotation.set(0,car.yaw,0);pose.updateMatrix();
     matrix.multiplyMatrices(pose.matrix,local);mesh.setMatrixAt(i,matrix);if(morph)mesh.setMorphAt(i,morph);
    });
    mesh.instanceMatrix.needsUpdate=true;if(mesh.morphTexture)mesh.morphTexture.needsUpdate=true;
   }
  });
 }
 return {group,setModels,update,ready(id){return templates.length>0&&egoId===id;},
  modelId(carId){return templates[assignments.get(carId)]?.id||null;},
  audit(){return {source:'provided-vehicle-library',models:templates.map(template=>({id:template.id,length:template.length,width:template.width,meshes:template.parts.length})),renderedCount:templates.reduce((count,template)=>count+(template.parts[0]?.mesh.count||0),0)};},
  dispose(){release(templates);templates=[];assignments.clear();group.removeFromParent();}
 };
}
