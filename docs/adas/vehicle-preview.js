import * as THREE from 'three';
import {createContactShadows} from './contact-shadows.js';

// The inspection camera belongs to the dialog, never to the driving scene.
export function configureVehiclePreviewCamera(camera,bounds,view='scene'){
 const center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(.1,bounds.getBoundingSphere(new THREE.Sphere()).radius);
 const directions={scene:[1,.6,1.5],rear:[1,.6,1.5],front:[-1,.5,-1.5],side:[1,.2,.001],top:[0,1,.001]};
 const halfFov=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
 const distance=radius/Math.sin(halfFov)*1.08;
 camera.clearViewOffset();camera.position.copy(new THREE.Vector3(...(directions[view]||directions.scene)).normalize().multiplyScalar(distance).add(center));
 camera.near=.1;camera.far=distance+radius*10;camera.lookAt(center);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}

export function createVehiclePreview(getWorld){
 let renderer,scene,camera,source,car,bounds,contacts;
 const pairs=[];
 function removeContacts(){if(!contacts)return;contacts.removeFromParent();contacts.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});contacts=null;}
 function initialize(){
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(800,500,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(32,800/500,.1,100);
 }
 return {
  render(settings){
   const world=getWorld();if(!world?.car||world.suspended)return null;
   if(!renderer)initialize();
   if(source!==world.car){
    car?.removeFromParent();removeContacts();source=world.car;car=source.clone(true);car.position.set(0,.02,0);car.rotation.set(0,0,0);car.visible=true;scene.add(car);
    const originals=[];source.traverse(mesh=>{if(mesh.isMesh)originals.push(mesh);});pairs.length=0;
    car.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=false;mesh.receiveShadow=false;pairs.push([originals[pairs.length],mesh]);}});
    bounds=new THREE.Box3().setFromObject(car);contacts=createContactShadows(car);scene.add(contacts);
   }
   // Meshes share the current appearance, including changes that replace a
   // paint material, without cloning or changing the source vehicle's pose.
   for(const [original,mesh]of pairs)mesh.material=original.material;
   for(const child of [...scene.children])if(child.isLight)child.removeFromParent();
   for(const original of [world.hemi,world.sun,world.fill]){const light=original.clone();light.castShadow=false;scene.add(light);}
   scene.environment=world.scene.environment;scene.environmentIntensity=world.scene.environmentIntensity;scene.environmentRotation.copy(world.scene.environmentRotation);
   scene.background=new THREE.Color(world.state.mode==='dark'?'#25282d':'#e9ebee');renderer.toneMappingExposure=world.renderer.toneMappingExposure;
   configureVehiclePreviewCamera(camera,bounds,settings.view);renderer.render(scene,camera);return renderer.domElement;
  },
  dispose(){
   if(!renderer)return;
   removeContacts();car?.removeFromParent();pairs.length=0;
   // Only the preview's GPU context is released; vehicle assets belong to the main scene.
   renderer.dispose();renderer.forceContextLoss();renderer=scene=camera=source=car=bounds=null;
  }
 };
}
