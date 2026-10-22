import * as THREE from 'three';
import {canExitRamp,sampleRampExit} from './ramp-exit.js';

export const laneWidth=3.7;
// Default junction movements: straight from the middle lane; right from the curb lane.
export const normalizeJunctionLane=(id,lane)=>['left','middle','right'].includes(lane)?lane:id==='08'?'right':'middle';
export const junctionApproachX=(id,lane)=>(['left','middle','right'].indexOf(normalizeJunctionLane(id,lane))+.5)*laneWidth;
export const junctionDirection=(id,lane)=>{const selected=normalizeJunctionLane(id,lane);return selected==='right'?'right':selected==='left'||id==='08'?'left':'straight';};
export const guidanceSceneIds=Object.freeze(['02','09','03','05','08','06','07']);
export const guidanceScenes=Object.freeze(['road','elevated','junction','ramp']);
export const defaultGuidanceColor='#1f6bf5';
const drivingSceneById=Object.freeze({'02':'road','09':'road','03':'elevated','05':'junction','08':'junction','06':'ramp','07':'ramp'});
export const drivingSceneKey=id=>drivingSceneById[id]||null;
export const junctionLaneEndZ=-28.5;
export function normalizeGuidanceColor(value,fallback=defaultGuidanceColor){
 return typeof value==='string'&&/^#?[\da-f]{6}$/i.test(value)?'#'+value.replace('#','').toLowerCase():fallback;
}
function guidanceColorVector(color){
 const value=parseInt(normalizeGuidanceColor(color).slice(1),16);
 return new THREE.Vector3((value>>16&255)/255,(value>>8&255)/255,(value&255)/255);
}
export const smoothLane=t=>{const q=Math.max(0,Math.min(1,t));return q*q*q*(q*(q*6-15)+10);};
export function sampleLanePath(plan,distance){
 const q=Math.max(0,Math.min(1,distance/plan.distance)),delta=plan.targetX-plan.startX;
 return {x:plan.startX+delta*smoothLane(q),z:plan.startZ-distance,yaw:-Math.atan(delta*30*q*q*(1-q)*(1-q)/plan.distance)};
}

export function roadLaneState(world){
 const scene=drivingSceneKey(world.state?.id),centered=['elevated','ramp'].includes(scene);
 const count=!scene?0:centered||scene==='junction'?3:Math.max(1,Math.floor((world.state?.laneCount||(world.state?.id==='09'?2:6))/2));
 const centers=Array.from({length:count},(_,i)=>centered?(i-1)*laneWidth:(i+.5)*laneWidth);
 const index=centers.reduce((best,x,i)=>Math.abs(world.car.position.x-x)<Math.abs(world.car.position.x-centers[best])?i:best,0);
 const distanceAvailable=scene==='junction'?Math.max(0,world.car.position.z-junctionLaneEndZ):Infinity;
 const ended=world.car.position.z < -185||distanceAvailable<8-1e-6||(centered&&Math.abs(world.car.position.x)>laneWidth*1.5);
 const blocked=target=>{
  if(target<0||target>=count||ended)return true;
  const zone=world.roadworkZone,x=centers[target],z=world.car.position.z;
  return !!(scene==='road'&&world.state?.roadworks&&zone&&x+1.05>=zone.left&&x-1.05<=zone.right&&z-51<zone.front&&z+3>zone.back);
 };
 const canChangeLane=scene!=='junction';
 const left=canChangeLane&&index>0&&!blocked(index-1),right=canChangeLane&&index<count-1&&!blocked(index+1);
 return {scene,centers,count,index,left,right,ended,distanceAvailable};
}

// Preserve the soft edges and long fade while changing only the ribbon hue.
export function createGuidanceMaterial(color=defaultGuidanceColor){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
  uniforms:{dark:{value:0},guideColor:{value:guidanceColorVector(color)},displayOpacity:{value:1}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 vUv;uniform float dark;uniform vec3 guideColor;uniform float displayOpacity;
   void main(){
    float side=abs(vUv.x-.5)*2.;
    float fade=smoothstep(0.,.025,vUv.y)*(1.-smoothstep(.42,1.,vUv.y));
    float body=1.-smoothstep(.69,.94,side);
    float glow=exp(-side*side*3.8)*(1.-smoothstep(.88,1.,side));
    float alpha=(body*.76+glow*.10)*fade*mix(.96,1.,dark);
    vec3 color=mix(guideColor,mix(guideColor,vec3(1.),.12),.28*(1.-side));
    gl_FragColor=vec4(color,alpha*displayOpacity);
   }`
 });
}

function sampleJunctionGuidance(id,lane,x,z,ahead){
  const direction=junctionDirection(id,lane);
  if(direction==='straight')return {x,z:z-ahead,yaw:0};
  const right=direction==='right',middle=normalizeJunctionLane(id,lane)==='middle';
  // Parallel left arcs join their matching westbound lanes; right turns join the curb lane.
  const radius=right?6:12+(middle?laneWidth:0),exitZ=right?-40+2.5*laneWidth:-40-(middle?1.5:.5)*laneWidth,sign=right?1:-1;
  const turnZ=exitZ+radius,approach=z-turnZ;
  if(ahead>approach){
   const distance=ahead-approach,arc=radius*Math.PI/2,angle=Math.min(distance/radius,Math.PI/2);
   return {x:x+sign*(radius*(1-Math.cos(angle))+Math.max(0,distance-arc)),z:turnZ-radius*Math.sin(angle),yaw:-sign*angle};
  }
  return {x,z:z-ahead,yaw:0};
}

export function sampleDrivingGuidance(world,ahead){
 const {car,state,roadGuidePath:plan}=world;
 if(plan&&guidanceSceneIds.includes(state?.id)){
  const distance=(plan.travelled||0)+ahead;
  if(plan.kind==='ramp-exit')return sampleRampExit(plan,distance);
  if(['05','08'].includes(state.id)&&distance>plan.distance)return sampleJunctionGuidance(state.id,state.junctionLane,plan.targetX,plan.startZ-plan.distance,distance-plan.distance);
  return sampleLanePath(plan,distance);
 }
 if(['05','08'].includes(state?.id))return sampleJunctionGuidance(state.id,state.junctionLane,car.position.x,car.position.z,ahead);
 const yaw=car.rotation.y;
 return {x:car.position.x-Math.sin(yaw)*ahead,z:car.position.z-Math.cos(yaw)*ahead,yaw};
}

// A continuous ribbon shares the vehicle's world-space trajectory. It is
// transparent display geometry, excluded from physical depth and reflections.
export function createRoadGuidance(){
 const segments=96,positions=new Float32Array((segments+1)*2*3),uv=new Float32Array((segments+1)*2*2),indices=[];
 for(let i=0;i<=segments;i++)for(let edge=0;edge<2;edge++){const vertex=i*2+edge;uv[vertex*2]=edge;uv[vertex*2+1]=i/segments;if(i<segments&&edge===0){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
 const material=createGuidanceMaterial();
 const mesh=new THREE.Mesh(geometry,material);mesh.name='ADAS forward guidance';mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=4;mesh.userData.displayOverlay=true;
 const api={mesh,enabled:true,time:0,color:defaultGuidanceColor,setColor(color){
  api.color=normalizeGuidanceColor(color,api.color);material.uniforms.guideColor.value.copy(guidanceColorVector(api.color));return api.color;
 },update(world){
  const {car,state}=world,driving=guidanceSceneIds.includes(state?.id);
  mesh.visible=api.enabled&&driving&&!!state.vehicle;if(!mesh.visible)return;
  const near=(car.userData.vehicleSpec.length||4.85)*.40;let far=34;
  const zone=world.roadworkZone;
  if(state.roadworks&&zone&&car.position.x+1.05>=zone.left&&car.position.x-1.05<=zone.right&&car.position.z>zone.front)far=Math.min(far,car.position.z-zone.front-3.5);
  if(far<=near+.3){mesh.visible=false;return;}
  for(let i=0;i<=segments;i++){
   const ahead=near+(far-near)*i/segments;
   const point=sampleDrivingGuidance(world,ahead);
   const dx=Math.cos(point.yaw),dz=-Math.sin(point.yaw),width=.70;
   for(let edge=0;edge<2;edge++){const side=edge?1:-1,offset=(i*2+edge)*3;positions[offset]=point.x+side*width*dx;positions[offset+1]=car.position.y+.035;positions[offset+2]=point.z+side*width*dz;}
  }
  geometry.attributes.position.needsUpdate=true;material.uniforms.dark.value=state.mode==='dark'?1:0;
 }};
 return api;
}

export function initRoadAssistControls({onLaneChange,onRampExit,onGuidanceChange,onColorChange,guidance=true,color=defaultGuidanceColor}){
 const block=document.createElement('div');block.id='road-assist-control';block.className='environment-control road-assist-control';block.hidden=true;block.setAttribute('aria-labelledby','road-assist-title');
 block.innerHTML='<span id="road-assist-title" class="settings-label">ADAS</span><div class="road-assist-buttons" role="group" aria-label="ADAS 变道方向"><button type="button" id="lane-change-left" aria-label="向左变道"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 17v-3c0-4-6-4-6-8V3m-3 3 3-3 3 3"/></svg>向左变道</button><button type="button" id="lane-change-right" aria-label="向右变道"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17v-3c0-4 6-4 6-8V3m-3 3 3-3 3 3"/></svg>向右变道</button></div><div class="switches"><label class="toggle"><span class="setting-copy"><span class="setting-title">前方引导光带</span></span><input id="road-guidance" type="checkbox" role="switch" aria-label="前方引导光带"><span class="track" aria-hidden="true"></span></label></div>';
 document.getElementById('scene-animation-control').before(block);
 const colorRow=document.createElement('div');colorRow.className='guidance-color-control';
 colorRow.innerHTML='<span class="setting-title">引导线颜色</span><div class="guidance-color-options" role="group" aria-label="引导线颜色"></div>';
 const colors=colorRow.querySelector('.guidance-color-options');
 for(const [value,name]of [[defaultGuidanceColor,'浅蓝色'],['#18b889','青绿色'],['#f59e3d','橙色'],['#a37cf5','紫色']]){
  const button=document.createElement('button');button.type='button';button.className='guidance-color-swatch';button.dataset.color=value;button.style.setProperty('--swatch',value);button.setAttribute('aria-label',name);button.title=name;button.addEventListener('click',()=>chooseColor(value));colors.append(button);
 }
 const custom=document.createElement('input');custom.type='color';custom.className='guidance-custom-color';custom.setAttribute('aria-label','自定义引导线颜色');custom.title='自定义颜色';colors.append(custom);block.append(colorRow);
 let selectedColor=normalizeGuidanceColor(color);
 function syncColor(){custom.value=selectedColor;for(const button of colors.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.color===selectedColor));}
 function chooseColor(value){selectedColor=normalizeGuidanceColor(value,selectedColor);syncColor();onColorChange?.(selectedColor);}
 custom.addEventListener('input',()=>chooseColor(custom.value));syncColor();
 const left=block.querySelector('#lane-change-left'),right=block.querySelector('#lane-change-right'),input=block.querySelector('#road-guidance');
 const straight=document.createElement('button');straight.type='button';straight.id='lane-go-straight';straight.setAttribute('aria-label','直行');
 straight.innerHTML='<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 17V3m-4 4 4-4 4 4"/></svg>直行';
 right.before(straight);straight.addEventListener('click',()=>onLaneChange(0));
 block.querySelector('.road-assist-buttons').setAttribute('aria-label','ADAS 行驶方向');
 const exitRow=document.createElement('div');exitRow.className='road-assist-buttons ramp-exit-buttons';exitRow.hidden=true;
 exitRow.innerHTML='<button type="button" id="ramp-exit" aria-label="驶下匝道" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17v-3c0-5 10-3 10-10m-4 3 4-3 3 4"/></svg>驶下匝道</button>';
 block.querySelector('.road-assist-buttons').after(exitRow);
 const exit=exitRow.querySelector('button');exit.addEventListener('click',()=>onRampExit?.());
 input.checked=guidance;left.addEventListener('click',()=>onLaneChange(-1));right.addEventListener('click',()=>onLaneChange(1));input.addEventListener('change',()=>onGuidanceChange(input.checked));
 return {sync(scene,ready,snapshot,world){
  block.hidden=!guidanceScenes.includes(scene);if(block.hidden)return;
  block.querySelector('.road-assist-buttons').hidden=scene==='junction';
  straight.hidden=!['road','elevated','ramp'].includes(scene);
  exitRow.hidden=scene!=='ramp'||world.state?.id!=='06';
  custom.disabled=!ready;for(const button of colors.querySelectorAll('button'))button.disabled=!ready;
  const info=roadLaneState(world),busy=['playing','paused'].includes(snapshot.status),changing=snapshot.laneChange;
  left.disabled=!ready||busy||!info.left;right.disabled=!ready||busy||!info.right;input.disabled=!ready;
  straight.disabled=!ready||busy||info.ended;
  exit.disabled=!ready||busy||!canExitRamp(world);exit.setAttribute('aria-pressed',String(!!snapshot.rampExit));
  block.dataset.state=changing||snapshot.rampExit?snapshot.status:'idle';
  const selected=!!changing&&['planned','playing','paused'].includes(snapshot.status);
  left.setAttribute('aria-pressed',String(selected&&changing.direction==='left'));right.setAttribute('aria-pressed',String(selected&&changing.direction==='right'));
  straight.setAttribute('aria-pressed',String(!snapshot.rampExit&&(selected?changing.direction==='straight':!busy)));
 }};
}
