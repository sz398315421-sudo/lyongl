import * as THREE from 'three';

export function createVehicleIndicators(){
 const group=new THREE.Group();
 group.name='Ego turn indicators';
 group.visible=false;
 const shape=new THREE.SphereGeometry(1,12,8);
 const lens=new THREE.MeshBasicMaterial({color:'#ffc23b',toneMapped:false,transparent:true,depthWrite:false});
 const halo=new THREE.MeshBasicMaterial({color:'#ff9933',transparent:true,opacity:.19,toneMapped:false,depthWrite:false});
 const reflectionShape=new THREE.PlaneGeometry(.64,1.12);
 const reflectionMaterial=new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
  uniforms:{brightness:{value:.34}},
  vertexShader:`varying vec2 uvPoint;
   void main(){uvPoint=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 uvPoint;
   uniform float brightness;
   void main(){
    vec2 delta=uvPoint*2.-1.;
    float glow=pow(max(0.,1.-dot(delta,delta)),2.);
    gl_FragColor=vec4(.97,.40,.035,glow*brightness);
    #include <colorspace_fragment>
   }`
 });
 const lamps={left:[],right:[]};
 for(const side of Object.keys(lamps)){
  for(let end=0;end<2;end++){
   const bulb=new THREE.Mesh(shape,lens),glow=new THREE.Mesh(shape,halo);
   const reflection=new THREE.Mesh(reflectionShape,reflectionMaterial);
   bulb.userData.displayOverlay=glow.userData.displayOverlay=reflection.userData.displayOverlay=true;
   glow.renderOrder=2;
   reflection.rotation.x=-Math.PI/2;
   const lamp=new THREE.Group();
   group.add(lamp,reflection);lamp.add(bulb,glow);
   lamps[side].push({lamp,reflection});
  }
 }
 let mountedCar=null;
 const ray=new THREE.Raycaster(),along=new THREE.Vector3(1,0,0);
 function placeLamps(car){
  car.updateWorldMatrix(true,true);
  const inverse=car.matrixWorld.clone().invert(),bounds=new THREE.Box3(),local=new THREE.Matrix4(),meshes=[];
  car.traverseVisible(mesh=>{
   if(!mesh.isMesh)return;
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
   local.multiplyMatrices(inverse,mesh.matrixWorld);
   bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(local));
   meshes.push(mesh);
  });
  if(bounds.isEmpty())return false;
  const y=bounds.min.y+(bounds.max.y-bounds.min.y)*.54;
  for(const [side,sign] of [['left',-1],['right',1]]){
   const edge=side==='left'?bounds.min.x:bounds.max.x;
   for(const [index,end] of [-1,1].entries()){
    const z=end<0?bounds.min.z:bounds.max.z;
    const forward=new THREE.Vector3(0,-.32,-end).transformDirection(car.matrixWorld);
    const pointAt=offset=>{
     const x=edge*offset;
     ray.set(new THREE.Vector3(x,y+.32,z+end).applyMatrix4(car.matrixWorld),forward);
     const hit=ray.intersectObjects(meshes,false)[0];
     if(!hit)return new THREE.Vector3(x,y,z+end*.035);
     const surface=hit.point.applyMatrix4(inverse);
     return surface.add(new THREE.Vector3(sign*.025,.065,end*.095));
    };
    const inside=pointAt(.64),outside=pointAt(.87);
    const tangent=outside.clone().sub(inside).multiplyScalar(sign);
    const width=THREE.MathUtils.clamp(tangent.length()*.58,.12,.19);
    const {lamp,reflection}=lamps[side][index];
    lamp.position.copy(inside).lerp(outside,.5);
    lamp.quaternion.setFromUnitVectors(along,tangent.normalize());
    lamp.children[0].scale.set(width,.054,.061);
    lamp.children[1].scale.set(width+.050,.083,.095);
    reflection.position.set(lamp.position.x+sign*.11,.004,lamp.position.z+end*.27);
   }
  }
  mountedCar=car;
  return true;
 }
 return {
  group,
  update(car,direction,dark){
   if(!direction||!car.visible||(mountedCar!==car&&!placeLamps(car))){group.visible=false;return;}
   group.position.copy(car.position);
   group.quaternion.copy(car.quaternion);
   group.scale.copy(car.scale);
   reflectionMaterial.uniforms.brightness.value=dark?.65:.41;
   for(const [side,markers] of Object.entries(lamps))for(const {lamp,reflection} of markers)lamp.visible=reflection.visible=side===direction;
   group.visible=true;
  }
 };
}
