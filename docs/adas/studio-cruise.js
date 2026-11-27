// A low-cost continuous pass for the idle driving artboard. Manual timelines
// always start from the authored camera, with their own pause and reset rules.
export function createStudioCruise(world,preview){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let frame=0,base=null,root=null,last=null,distance=0,running=false;
 function tick(time){
  frame=0;
  if(!running||document.hidden||world.suspended||world.root!==root){running=false;last=null;return;}
  if(last===null)last=time;
  const elapsed=time-last;
  if(elapsed>=1000/30){
   const before=distance;
   distance=(distance+Math.min(elapsed,75)*.009)%130;
   last=time;
   const pose={...base,position:base.position.clone(),aim:base.aim.clone(),carPosition:base.carPosition.clone()};
   pose.position.z-=distance;pose.aim.z-=distance;pose.carPosition.z-=distance;
   world.applyCamera(pose);world.renderFrame(true);
   if(distance<before&&!reduced.matches)preview.animate([{opacity:.78},{opacity:1}],{duration:240});
  }
  frame=requestAnimationFrame(tick);
 }
 function sync(enabled){
  const next=enabled&&!reduced.matches&&!document.hidden;
  if(!next){
   running=false;cancelAnimationFrame(frame);frame=0;last=null;return;
  }
  if(running)return;
  if(!base||root!==world.root){base=world.captureCamera();root=world.root;distance=0;}
  running=true;frame=requestAnimationFrame(tick);
 }
 function reset(){
  sync(false);
  if(base&&root===world.root){world.applyCamera(base);world.framing=base.framing;}
  base=null;root=null;distance=0;
 }
 return {sync,reset,get running(){return running;}};
}
