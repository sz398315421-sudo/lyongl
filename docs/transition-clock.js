// The visible host owns the clock. An occluded iframe's GSAP ticker can be
// throttled, and GSAP's lag smoothing would stretch a three-second flight.
export function runTransitionTimeline(timeline,{
  requestFrame=callback=>requestAnimationFrame(callback),
  cancelFrame=id=>cancelAnimationFrame(id),
}={}){
  return new Promise((resolve,reject)=>{
    let start=null,frame=0,finished=false;
    const duration=timeline.totalDuration();
    const finish=error=>{
      if(finished)return;
      finished=true;
      if(frame)cancelFrame(frame);
      timeline.kill();
      if(error)reject(error);else resolve();
    };
    const tick=now=>{
      frame=0;
      try{
        if(start===null)start=now;
        const elapsed=Math.max(0,(now-start)/1000);
        timeline.totalTime(Math.min(duration,elapsed),false);
        if(elapsed>=duration)finish();else frame=requestFrame(tick);
      }catch(error){finish(error);}
    };
    try{timeline.pause();frame=requestFrame(tick);}catch(error){finish(error);}
  });
}
