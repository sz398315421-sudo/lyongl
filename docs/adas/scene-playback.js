import {roadLaneState,sampleLanePath,junctionLaneEndZ} from './road-assist.js';
import {canExitRamp,sampleRampExit,rampExitDurationMs} from './ramp-exit.js';
import {planParking,sampleParkingPose,createParkingGraphics,parkingDurationMs} from './parking-maneuver.js';

// Finite forward trips stay inside each authored environment. The camera and
// vehicle travel together, preserving both the chosen view and vehicle framing.
export const sceneTripDurationMs=4000;
export const sceneTrips=Object.freeze(Object.fromEntries(Object.entries({
 road:{distance:48,durationMs:sceneTripDurationMs},elevated:{distance:48,durationMs:sceneTripDurationMs},
 ramp:{distance:40,durationMs:sceneTripDurationMs},junction:{distance:24,durationMs:sceneTripDurationMs},parking:{distance:14,durationMs:sceneTripDurationMs},
 outdoor:{distance:14,durationMs:sceneTripDurationMs}
}).map(([key,value])=>[key,Object.freeze(value)])));

export function createScenePlayback(world,{requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),onChange=()=>{}}={}){
 let status='idle',scene=null,trip=null,base=null,origin=null,root=null,elapsedMs=0,frame=0,lastTime=null,parkingGraphics=null;
 const snapshot=()=>({scene,status,progress:trip?elapsedMs/trip.durationMs:0,elapsedMs,durationMs:trip?.durationMs||sceneTripDurationMs,distanceMeters:trip?.distance||0,parking:trip?.parking?sampleParkingPose(trip.parking,elapsedMs):null,rampExit:!!trip?.rampExit,laneChange:trip?.laneChange?{direction:trip.laneChange.direction,fromLane:trip.laneChange.fromLane,toLane:trip.laneChange.toLane}:null});
 const notify=()=>onChange(snapshot());
 const cancel=()=>{if(frame)cancelFrame(frame);frame=0;lastTime=null;};
 function apply(){
  if(trip.parking){
   const point=sampleParkingPose(trip.parking,elapsedMs),pose={...base,carPosition:base.carPosition.clone().set(point.x,base.carPosition.y,point.z)};
   world.applyCamera(pose);world.car.quaternion.copy(base.carQuaternion);world.car.rotateY(point.yaw);
   parkingGraphics?.update(elapsedMs);world.framing=base.framing;world.renderFrame(true);return;
  }
  const t=Math.min(1,elapsedMs/trip.durationMs),ease=t*t*t*(t*(t*6-15)+10),distance=trip.distance*ease;
  const pose={...base,position:base.position.clone().addScaledVector(base.forward,distance),carPosition:base.carPosition.clone().addScaledVector(base.forward,distance),aim:base.aim.clone().addScaledVector(base.forward,distance)};
  world.car.quaternion.copy(base.carQuaternion);
  if(trip.rampExit){
   const point=sampleRampExit(trip.rampExit,distance);
   pose.carPosition.set(point.x,base.carPosition.y,point.z);world.car.rotateY(point.yaw);
   const turn=world.car.quaternion.clone().multiply(base.carQuaternion.clone().invert());
   pose.position.copy(base.position).sub(base.carPosition).applyQuaternion(turn).add(pose.carPosition);
   pose.aim.copy(base.aim).sub(base.carPosition).applyQuaternion(turn).add(pose.carPosition);
   pose.quaternion=base.quaternion.clone().premultiply(turn);
   world.roadGuidePath={...trip.rampExit,travelled:distance};
  }
  if(trip.laneChange){
   const point=sampleLanePath(trip.laneChange,distance),offset=point.x-base.carPosition.x;
   pose.carPosition.x+=offset;pose.position.x+=offset;pose.aim.x+=offset;world.car.rotateY(point.yaw);
   world.roadGuidePath={...trip.laneChange,travelled:distance};
  }
  if(world.roadGuidance)world.roadGuidance.time=elapsedMs/1000;
  world.applyCamera(pose);
  world.framing=base.framing;world.renderFrame(true);
 }
 function pause(){if(status!=='playing')return;cancel();status='paused';notify();}
 function reset({render=true}={}){
  parkingGraphics?.dispose();parkingGraphics=null;
  world.roadGuidePath=null;if(world.roadGuidance)world.roadGuidance.time=0;
  if(!base&&status==='idle')return;
  cancel();if(origin&&world.root===root){world.applyCamera(origin);world.car.quaternion.copy(origin.carQuaternion);world.framing=origin.framing;if(render&&!world.suspended)world.renderFrame();}
  status='idle';scene=null;trip=null;base=null;origin=null;root=null;elapsedMs=0;notify();
 }
 function tick(now){
  frame=0;if(status!=='playing')return;
  if(world.suspended){pause();return;}
  if(world.root!==root){reset({render:false});return;}
  if(lastTime===null)lastTime=now;
  // Limit reflection-heavy rendering to 30 fps, but use real elapsed time so
  // slower frames do not also slow the vehicle down. Pause resets this clock.
  const delta=now-lastTime;
  if(delta>=1000/30){elapsedMs=Math.min(trip.durationMs,elapsedMs+delta);lastTime=now;apply();if(elapsedMs>=trip.durationMs){status='finished';lastTime=null;notify();return;}notify();}
  frame=requestFrame(tick);
 }
 function play(key){
  if(!sceneTrips[key]||world.suspended)return false;
  if(status==='playing')return true;
  if(scene===key&&world.root===root&&status==='finished'&&(trip.laneChange||trip.rampExit)){
   elapsedMs=0;world.applyCamera(base);world.car.quaternion.copy(base.carQuaternion);world.framing=base.framing;apply();
   status='playing';lastTime=null;notify();frame=requestFrame(tick);return true;
  }
  if(scene!==key||world.root!==root||status==='finished')reset({render:false});
  if(!base){
   scene=key;trip={...sceneTrips[key]};root=world.root;base=world.captureCamera();base.carQuaternion=world.car.quaternion.clone();origin=base;
   // In a narrow roadwork lane, stop short of the taper rather than enter cones.
   if(key==='road'&&world.state?.roadworks&&world.roadworkZone?.blocksEgoLane)trip.distance=6;
   if(key==='junction'&&['05','08'].includes(world.state?.id))trip.distance=Math.max(0,Math.min(trip.distance,world.car.position.z-junctionLaneEndZ));
   base.forward=base.carPosition.clone().set(0,0,-1).applyQuaternion(world.car.quaternion);
   if(['parking','outdoor'].includes(key)){
    const plan=planParking(world);
    if(plan){trip.parking=plan;trip.durationMs=parkingDurationMs;parkingGraphics=createParkingGraphics(world,plan);}
   }
   elapsedMs=0;
  }
  status='playing';lastTime=null;if(trip.parking)apply();notify();frame=requestFrame(tick);return true;
 }
 function changeLane(direction){
  if(![-1,1].includes(direction))return false;
  return planDirection(direction);
 }
 function goStraight(){return planDirection(0);}
 function exitRamp(){
  if(!canExitRamp(world)||world.suspended||['playing','paused'].includes(status))return false;
  if(root&&world.root!==root)reset({render:false});
  root=world.root;scene='ramp';base=world.captureCamera();base.carQuaternion=world.car.quaternion.clone();
  if(!origin)origin=base;
  base.forward=base.carPosition.clone().set(0,0,-1);
  const distance=base.carPosition.z+90;
  trip={distance,durationMs:rampExitDurationMs,rampExit:{kind:'ramp-exit',startX:base.carPosition.x,startZ:base.carPosition.z,distance}};
  elapsedMs=0;lastTime=null;status='planned';apply();notify();return true;
 }
 function planDirection(direction){
  if(world.suspended||['playing','paused'].includes(status))return false;
  const info=roadLaneState(world);
  if(direction===0?!['road','elevated','ramp'].includes(info.scene)||info.ended:!(direction<0?info.left:info.right))return false;
  if(root&&world.root!==root)reset({render:false});
  root=world.root;scene=info.scene;base=world.captureCamera();base.carQuaternion=world.car.quaternion.clone();
  if(!origin)origin=base;
  base.forward=base.carPosition.clone().set(0,0,-1);
  const target=info.index+direction;
  const distance=Math.min(sceneTrips[scene].distance,info.distanceAvailable,direction===0&&scene==='road'&&world.state?.roadworks&&world.roadworkZone?.blocksEgoLane?6:Infinity);
  trip={...sceneTrips[scene],distance,laneChange:{startX:base.carPosition.x,startZ:base.carPosition.z,targetX:direction===0?base.carPosition.x:info.centers[target],distance,fromLane:info.index+1,toLane:target+1,direction:direction===0?'straight':direction<0?'left':'right'}};
  elapsedMs=0;lastTime=null;status='planned';apply();notify();return true;
 }
 function seek(milliseconds,{notifyChange=true,status:nextStatus='paused'}={}){
  if(!trip||world.root!==root||world.suspended||!Number.isFinite(milliseconds))return false;
  cancel();elapsedMs=Math.max(0,Math.min(trip.durationMs,milliseconds));
  status=elapsedMs>=trip.durationMs?'finished':nextStatus==='planned'&&elapsedMs===0?'planned':'paused';
  apply();if(notifyChange)notify();return true;
 }
 return {play,changeLane,goStraight,exitRamp,pause,reset,seek,snapshot,get active(){return !!base;}};
}

export function initScenePlaybackControls({onToggle,onReset}){
 const block=document.createElement('div');block.id='scene-animation-control';block.className='scene-animation-control';block.hidden=true;
 block.innerHTML='<div class="scene-motion-heading"><span class="choice-label">场景动画</span><span id="scene-motion-time" aria-hidden="true">0:00 / 0:04</span></div><div class="scene-motion-buttons"><button id="scene-motion-play" type="button" aria-label="播放场景动画" aria-pressed="false" disabled><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg><span>播放</span></button><button id="scene-motion-reset" type="button" aria-label="重置场景动画" title="重置动画" disabled><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a6 6 0 1 1-.2 5M4 3v4h4"/></svg></button></div><progress id="scene-motion-progress" value="0" max="100" aria-label="场景动画进度"></progress>';
 document.querySelector('.vehicle-entry').before(block);
 const play=block.querySelector('#scene-motion-play'),reset=block.querySelector('#scene-motion-reset'),icon=play.querySelector('svg'),label=play.querySelector('span'),time=block.querySelector('#scene-motion-time'),progress=block.querySelector('progress'),heading=block.querySelector('.choice-label');
 play.addEventListener('click',onToggle);reset.addEventListener('click',onReset);
 let previousStatus;
 const format=ms=>`0:${String(Math.floor(ms/1000)).padStart(2,'0')}`;
 return {sync(scene,ready,state){
  block.hidden=scene==='junction'||!sceneTrips[scene];const {status}=state;block.dataset.state=status;
  const parking=['parking','outdoor'].includes(scene);heading.textContent=parking?'自动泊车动画':'场景动画';
  play.disabled=block.hidden||!ready;reset.disabled=block.hidden||!ready||status==='idle';
  if(status!==previousStatus){
   label.textContent={idle:'播放',planned:'播放',playing:'暂停',paused:'继续',finished:'重播'}[status];
   play.setAttribute('aria-label',label.textContent+'场景动画');play.setAttribute('aria-pressed',String(status==='playing'));
   icon.innerHTML=status==='playing'?'<path d="M7 5v10M13 5v10"/>':'<path d="m7 4 9 6-9 6Z"/>';
   previousStatus=status;
  }
  const percent=Math.round(state.progress*100);progress.value=percent;progress.setAttribute('aria-valuetext',`${percent}%，${{idle:'准备播放',planned:'准备播放',playing:'播放中',paused:'已暂停',finished:'播放完成'}[status]}`);
  time.textContent=`${format(state.elapsedMs)} / ${format(parking&&status==='idle'?parkingDurationMs:state.durationMs)}`;
 }};
}
