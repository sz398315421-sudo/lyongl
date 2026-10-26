import * as THREE from 'three';
import {fluidVelocity,fluidDivergence,fluidPressure,fluidSubtract} from './reference-motion.js';

// UNSEEN's four original simulation passes, run in local ping-pong targets.
export function createReferenceFluid(renderer){
  const size=128,scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));scene.add(quad);
  const target=()=>new THREE.WebGLRenderTarget(size,size,{type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,depthBuffer:false});
  const make=(fragment,uniforms)=>({targets:[target(),target()],read:0,material:new THREE.ShaderMaterial({uniforms:{uTexture:{value:null},uCellSize:{value:new THREE.Vector2(1/size,1/size)},...uniforms},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}',fragmentShader:fragment})});
  const velocity=make(fluidVelocity.replace('dot(ba, ba)','max(dot(ba, ba),0.00000001)'),{uMouse:{value:new THREE.Vector2(-1,-1)},uPrevMouse:{value:new THREE.Vector2(-1,-1)},uMouseVelocity:{value:new THREE.Vector2()},uForce:{value:new THREE.Vector2()},uMouseRadius:{value:.2},uPressure:{value:.999}});
  const divergence=make(fluidDivergence,{uVelocity:{value:null},uViscosity:{value:.999}});
  const pressure=make(fluidPressure,{uDivergence:{value:null},uAlpha:{value:-1},uBeta:{value:.25}});
  const subtract=make(fluidSubtract,{uPressure:{value:null},uVelocity:{value:null}});
  const passes=[velocity,divergence,pressure,subtract];
  for(const pass of passes)for(const buffer of pass.targets){renderer.setRenderTarget(buffer);renderer.clear();}
  renderer.setRenderTarget(null);
  const point=new THREE.Vector2(-1,-1),previous=new THREE.Vector2(-1,-1);let moved=false;
  document.addEventListener('pointermove',event=>{if(event.pointerType==='touch')return;point.set(event.clientX/innerWidth,1-event.clientY/innerHeight);moved=true;},{passive:true});
  const texture=pass=>pass.targets[pass.read].texture;
  function step(pass){pass.material.uniforms.uTexture.value??=texture(pass);quad.material=pass.material;renderer.setRenderTarget(pass.targets[1-pass.read]);renderer.render(scene,camera);pass.read=1-pass.read;pass.material.uniforms.uTexture.value=texture(pass);}
  return {get texture(){return texture(subtract);},update(){
    const u=velocity.material.uniforms;
    if(moved){if(previous.x<0)previous.copy(point);u.uPrevMouse.value.copy(previous);u.uMouse.value.copy(point);u.uForce.value.subVectors(point,previous).multiplyScalar(20);u.uMouseVelocity.value.subVectors(point,previous).divideScalar(16);previous.copy(point);}
    else {u.uMouse.value.set(-1,-1);u.uPrevMouse.value.set(-1,-1);u.uForce.value.set(0,0);previous.set(-1,-1);}
    moved=false;u.uTexture.value=texture(subtract);step(velocity);
    divergence.material.uniforms.uVelocity.value=texture(velocity);step(divergence);
    pressure.material.uniforms.uDivergence.value=texture(divergence);step(pressure);
    subtract.material.uniforms.uVelocity.value=texture(velocity);subtract.material.uniforms.uPressure.value=texture(pressure);step(subtract);
    renderer.setRenderTarget(null);
  }};
}
