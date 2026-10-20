// Finite forward trips stay inside each authored environment. The camera and
// vehicle travel together, preserving both the chosen view and vehicle framing.
export const sceneTripDurationMs=4000;
export const sceneTrips=Object.freeze(Object.fromEntries(Object.entries({
 road:{distance:48,durationMs:sceneTripDurationMs},elevated:{distance:48,durationMs:sceneTripDurationMs},
 ramp:{distance:40,durationMs:sceneTripDurationMs},parking:{distance:14,durationMs:sceneTripDurationMs},
 outdoor:{distance:14,durationMs:sceneTripDurationMs}
}).map(([key,value])=>[key,Object.freeze(value)])));

export function createScenePlayback(world,{requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),onChange=()=>{}}={}){
 let status='idle',scene=null,trip=null,base=null,root=null,elapsedMs=0,frame=0,lastTime=null;
 const snapshot=()=>({scene,status,progress:trip?elapsedMs/trip.durationMs:0,elapsedMs,durationMs:trip?.durationMs||sceneTripDurationMs,distanceMeters:trip?.distance||0});
 const notify=()=>onChange(snapshot());
 const cancel=()=>{if(frame)cancelFrame(frame);frame=0;lastTime=null;};
 function apply(){
  const t=Math.min(1,elapsedMs/trip.durationMs),ease=t*t*t*(t*(t*6-15)+10),distance=trip.distance*ease;
  world.applyCamera({...base,position:base.position.clone().addScaledVector(base.forward,distance),carPosition:base.carPosition.clone().addScaledVector(base.forward,distance),aim:base.aim.clone().addScaledVector(base.forward,distance)});
  world.framing=base.framing;world.renderFrame(true);
 }
 function pause(){if(status!=='playing')return;cancel();status='paused';notify();}
 function reset({render=true}={}){
  if(!base&&status==='idle')return;
  cancel();if(base&&world.root===root){world.applyCamera(base);world.framing=base.framing;if(render&&!world.suspended)world.renderFrame();}
  status='idle';scene=null;trip=null;base=null;root=null;elapsedMs=0;notify();
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
  if(scene!==key||world.root!==root||status==='finished')reset({render:false});
  if(!base){
   scene=key;trip={...sceneTrips[key]};root=world.root;base=world.captureCamera();
   // In a narrow roadwork lane, stop short of the taper rather than enter cones.
   if(key==='road'&&world.state?.roadworks&&world.roadworkZone?.blocksEgoLane)trip.distance=6;
   base.forward=base.carPosition.clone().set(0,0,-1).applyQuaternion(world.car.quaternion);
   elapsedMs=0;
  }
  status='playing';lastTime=null;notify();frame=requestFrame(tick);return true;
 }
 return {play,pause,reset,snapshot,get active(){return !!base;}};
}

export function initScenePlaybackControls({onToggle,onReset}){
 const block=document.createElement('div');block.id='scene-animation-control';block.className='scene-animation-control';block.hidden=true;
 block.innerHTML='<div class="scene-motion-heading"><span class="choice-label">场景动画</span><span id="scene-motion-time" aria-hidden="true">0:00 / 0:04</span></div><div class="scene-motion-buttons"><button id="scene-motion-play" type="button" aria-label="播放场景动画" aria-pressed="false" disabled><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg><span>播放</span></button><button id="scene-motion-reset" type="button" aria-label="重置场景动画" title="重置动画" disabled><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a6 6 0 1 1-.2 5M4 3v4h4"/></svg></button></div><progress id="scene-motion-progress" value="0" max="100" aria-label="场景动画进度"></progress>';
 document.querySelector('.vehicle-entry').before(block);
 const play=block.querySelector('#scene-motion-play'),reset=block.querySelector('#scene-motion-reset'),icon=play.querySelector('svg'),label=play.querySelector('span'),time=block.querySelector('#scene-motion-time'),progress=block.querySelector('progress');
 play.addEventListener('click',onToggle);reset.addEventListener('click',onReset);
 let previousStatus;
 const format=ms=>`0:${String(Math.floor(ms/1000)).padStart(2,'0')}`;
 return {sync(scene,ready,state){
  block.hidden=!sceneTrips[scene];const {status}=state;block.dataset.state=status;
  play.disabled=!ready;reset.disabled=!ready||status==='idle';
  if(status!==previousStatus){
   label.textContent={idle:'播放',playing:'暂停',paused:'继续',finished:'重播'}[status];
   play.setAttribute('aria-label',label.textContent+'场景动画');play.setAttribute('aria-pressed',String(status==='playing'));
   icon.innerHTML=status==='playing'?'<path d="M7 5v10M13 5v10"/>':'<path d="m7 4 9 6-9 6Z"/>';
   previousStatus=status;
  }
  const percent=Math.round(state.progress*100);progress.value=percent;progress.setAttribute('aria-valuetext',`${percent}%，${{idle:'准备播放',playing:'播放中',paused:'已暂停',finished:'播放完成'}[status]}`);
  time.textContent=`${format(state.elapsedMs)} / ${format(state.durationMs)}`;
 }};
}
