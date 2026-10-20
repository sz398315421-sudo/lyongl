import * as THREE from 'three';
import {parkingBaySize} from './parking-layout.js';

// Keep the right-hand target and its approach bay empty for reverse parking.
export function occupiedParkingBays(bays){
 return bays.filter(b=>b.x<0?[7.2,0,-7.2,-14.4].includes(b.z):[3.6,-7.2,-14.4].includes(b.z));
}

export function releaseParkedVehicles(group){
 if(!group)return;
 group.removeFromParent();
 const release=group.userData.releaseParkedVehicle;
 delete group.userData.releaseParkedVehicle;release?.();
}

function parkingTemplate(source){
 const template=source.clone(true);template.position.set(0,0,0);template.rotation.set(0,0,0);template.visible=true;template.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(template),size=bounds.getSize(new THREE.Vector3());
 // Uniform scaling only; supplied geometry, textures and materials are reused.
 const scale=Math.min(1,(parkingBaySize.length-.16)/size.z,(parkingBaySize.width-.3)/size.x);
 template.scale.multiplyScalar(scale);template.updateMatrixWorld(true);bounds.setFromObject(template);
 const center=bounds.getCenter(new THREE.Vector3());template.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
 template.traverse(part=>{if(part.isMesh)part.userData.sharedVehicleGeometry=true;});
 return {template,width:size.x*scale,length:size.z*scale};
}

export function buildParkedVehicles(world){
 const group=new THREE.Group();group.name='Parked vehicles';world.root.add(group);world.parkedVehicleGroup=group;
 const egoId=world.car?.userData.vehicleSpec?.id||'x6';
 const models=(world.parkingVehicleModels||[]).filter(model=>model.id!==egoId);
 const templates=new Map(models.map(model=>[model.id,{...parkingTemplate(model.root),source:model.root}]));
 const releases=models.map(model=>world.retainVehicle?.(model.id));
 group.userData.releaseParkedVehicle=()=>releases.splice(0).forEach(release=>release?.());
 group.userData.modelIds=models.map(model=>model.id);
 world.parkedVehicles=models.length?occupiedParkingBays(world.parkingBays).map((bay,index)=>{
  const planned=world.parkingVehicleAssignment?.[index];
  const modelId=templates.has(planned)?planned:models[index%models.length].id;
  const {template,source,width,length}=templates.get(modelId);
  const car=new THREE.Group();car.name=`Parked ${source.name}`;car.add(template.clone(true));car.position.set(bay.x,.02,bay.z);car.rotation.y=bay.x>0?Math.PI/2:-Math.PI/2;group.add(car);
  return {x:bay.x,z:bay.z,width,length,angle:car.rotation.y,modelId};
 }):[];
 world.parkingReplica.occupiedBays=world.parkedVehicles.length;
}

export function syncParkedVehicles(world,visible){
 if(!world.parkedVehicleGroup)return;
 world.parkedVehicleGroup.visible=visible;
 world.parkingReplica.occupiedBays=visible?world.parkedVehicles.length:0;
}

export function refreshParkedVehicleModels(world,source=world.car){
 const targets=new Map();
 for(const cached of world.sceneCache.values())if(cached.fields.parkedVehicleGroup)targets.set(cached.fields.root,cached.fields);
 if(world.parkedVehicleGroup)targets.set(world.root,world);
 for(const [root,fields]of targets){
  const previous=fields.parkedVehicleGroup,visible=previous.visible;
  const context={...fields,car:source,retainVehicle:world.retainVehicle,parkingVehicleModels:world.parkingVehicleModels,parkingVehicleAssignment:world.parkingVehicleAssignment};
  buildParkedVehicles(context);syncParkedVehicles(context,visible);releaseParkedVehicles(previous);world.preparedRoots.delete(root);
  fields.parkedVehicleGroup=context.parkedVehicleGroup;fields.parkedVehicles=context.parkedVehicles;
  for(const cached of world.sceneCache.values())if(cached.fields.root===root){cached.fields.parkedVehicleGroup=fields.parkedVehicleGroup;cached.fields.parkedVehicles=fields.parkedVehicles;}
 }
}
