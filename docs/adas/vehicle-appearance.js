import {normalizeVehicleSettings} from './vehicle-settings.js';

const customized=new WeakMap();
const isPaint=material=>material.userData.surfaceRole==='paint'||(!material.userData.surfaceRole&&material.name==='body');
export function supportsVehiclePaint(car){let supported=false;car.traverse(mesh=>{if(mesh.isMesh&&(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(isPaint))supported=true;});return supported;}
export function restoreVehicleAppearance(car){
 const record=customized.get(car);if(!record)return;
 for(const [mesh,material]of record.meshes)mesh.material=material;
 for(const material of record.materials.values())material.dispose();
 customized.delete(car);
}
export function applyVehicleAppearance(car,value){
 const settings=normalizeVehicleSettings(value);
 if(settings.paint==='original'&&settings.material==='original'){restoreVehicleAppearance(car);return;}
 let record=customized.get(car);
 if(!record){
  record={meshes:new Map(),materials:new Map()};
  car.traverse(mesh=>{
   if(!mesh.isMesh)return;
   const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];if(!source.some(isPaint))return;
   record.meshes.set(mesh,mesh.material);
   const materials=source.map(original=>{
    if(!isPaint(original))return original;
    if(!record.materials.has(original)){const copy=original.clone();copy.onBeforeCompile=original.onBeforeCompile;copy.customProgramCacheKey=original.customProgramCacheKey;record.materials.set(original,copy);}
    return record.materials.get(original);
   });
   mesh.material=Array.isArray(mesh.material)?materials:materials[0];
  });customized.set(car,record);
 }
 const finishes={gloss:{metalness:.18,roughness:.18,clearcoat:1,clearcoatRoughness:.12},metallic:{metalness:.78,roughness:.27,clearcoat:1,clearcoatRoughness:.2},matte:{metalness:.05,roughness:.82,clearcoat:0,clearcoatRoughness:.7}};
 for(const [original,material]of record.materials){
  material.color.copy(original.color);if(settings.paint!=='original')material.color.set(settings.paint);
  const hadClearcoat=material.clearcoat>0;
  for(const key of ['metalness','roughness','clearcoat','clearcoatRoughness'])if(key in material)material[key]=finishes[settings.material]?.[key]??original[key];
  if(hadClearcoat!==(material.clearcoat>0))material.needsUpdate=true;
 }
}

// Called after the scene establishes its normal day/night lighting, so a
// brightness adjustment is absolute and never compounds across updates.
export function applyVehicleLighting(world,value){
 const settings=normalizeVehicleSettings(value),preset=settings.lighting;
 if(preset==='studio'){world.hemi.color.set('#e4edff');world.sun.color.set('#fffaf2');world.fill.color.set('#d8e6ff');world.hemi.intensity*=1.3;world.sun.intensity*=.65;world.fill.intensity*=1.8;}
 if(preset==='warm'){world.hemi.color.set('#eadcc9');world.sun.color.set('#ffd39e');world.fill.color.set('#e8c3a0');}
 if(preset==='cool'){world.hemi.color.set('#b9d8ff');world.sun.color.set('#d7e8ff');world.fill.color.set('#92bcff');}
 const strength=settings.intensity/100;for(const light of [world.hemi,world.sun,world.fill])light.intensity*=strength;
 world.scene.environmentIntensity*=strength;
 const key=JSON.stringify([world.state.id,world.state.mode,preset,strength]);
 if(world.vehicleLightingKey!==key){world.vehicleLightingKey=key;world.reflectionSceneRoot=null;world.renderer.shadowMap.needsUpdate=true;}
}
