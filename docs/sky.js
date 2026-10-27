(() => {
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const world=document.createElement('div');world.className='sky-world';world.setAttribute('aria-hidden','true');document.body.prepend(world);
 const smooth=(a,b,v)=>{const p=Math.max(0,Math.min(1,(v-a)/(b-a)));return p*p*(3-2*p);};
 const pointer={x:0,y:0},view={x:0,y:0};
 const travel={target:0,position:0,impulse:0,velocity:0};let lastScroll=0,wasExploring=false;
 const explore=document.querySelector('#explore');
 const interaction={pointer:{x:0,y:0},wind:{x:0,y:0},energy:0,pulses:[]};
 const windTarget={x:0,y:0,energy:0};let lastPointer=null,touchTap=null;
 const hint=document.createElement('span');hint.className='sky-interaction-hint';hint.hidden=true;
 hint.textContent=matchMedia('(pointer:coarse)').matches?'滑动穿行云间 · 轻触拨开云朵':'移动鼠标环顾云海 · 滚动穿行云间 · 点击拨开云朵';
 document.querySelector('.explore-heading > p')?.append(hint);
 let cloudWorld=null,loading=null,raf=0,last=0,time=0,busy=false,lifecycle='';
 let courtyardImport=null,courtyardScheduled=false;
 const preloadCourtyard=()=>courtyardImport??=import('./original-hero.js?v=20261027-live-scene').catch(error=>{console.warn('Static courtyard remains available.',error);return null;});
 function scheduleCourtyard(){
  if(courtyardScheduled)return;courtyardScheduled=true;
  setTimeout(()=>{if(document.documentElement.dataset.page==='explore')preloadCourtyard();else courtyardScheduled=false;},1300);
 }
 const initialize=()=>loading??=(import('./sky-clouds.js').then(module=>{cloudWorld=module.createCloudWorld(world);hint.hidden=false;sync();return cloudWorld;}).catch(error=>{console.warn('Static sky remains available.',error);return null;}));
 function cameraPose(scrolling=true){
  if(reduced.matches)return{height:19,tilt:-.12,advance:0,x:0,y:0,yaw:0,pitch:0,roll:0};
  const distance=scrolling?travel.position/Math.max(1,innerHeight):0;
  const progress=scrolling?Math.min(1,travel.position/Math.max(1,document.documentElement.scrollHeight-innerHeight)):0;
  const momentum=scrolling?travel.velocity:0;
  return{height:19-progress*1.3,tilt:-.12-momentum*.035,advance:distance*7,x:view.x*2,y:-view.y,yaw:view.x*.18,pitch:-view.y*.14,roll:-view.x*.012-momentum*.006};
 }
 function render(){cloudWorld?.render({...cameraPose(),time,interaction:reduced.matches?undefined:interaction});}
 function flightPose(elevation,top=cameraPose(false)){
  return{...top,height:-12+(top.height+12)*elevation,tilt:.12+(top.tilt-.12)*elevation,advance:32+(top.advance-32)*elevation,transit:true,range:22*smooth(.24,.42,elevation)+298*smooth(.6,.9,elevation)};
 }
 function tick(now){raf=0;if(document.hidden||document.documentElement.dataset.page!=='explore'||reduced.matches||document.body.classList.contains('locked')||busy)return;
  if(now-last>42){
   const dt=Math.min((now-last)/1000,.1);time+=dt;last=now;
   const follow=1-Math.exp(-dt*3.4);
   view.x+=(pointer.x-view.x)*follow;view.y+=(pointer.y-view.y)*follow;
   travel.position+=(travel.target-travel.position)*(1-Math.exp(-dt*4));
   travel.velocity+=(travel.impulse-travel.velocity)*(1-Math.exp(-dt*5));
   travel.impulse*=Math.exp(-dt*3.2);
   explore.style.setProperty('--sky-x',(view.x*2).toFixed(4));explore.style.setProperty('--sky-y',(view.y*2).toFixed(4));
   explore.style.setProperty('--sky-scroll',travel.velocity.toFixed(4));
   const response=1-Math.exp(-dt*7);
   interaction.pointer.x+=(pointer.x*2-interaction.pointer.x)*response;interaction.pointer.y+=(-pointer.y*2-interaction.pointer.y)*response;
   interaction.wind.x+=(windTarget.x-interaction.wind.x)*response;interaction.wind.y+=(windTarget.y-interaction.wind.y)*response;
   interaction.energy+=(windTarget.energy-interaction.energy)*response;
   windTarget.energy*=Math.exp(-dt*2.5);
   interaction.pulses=interaction.pulses.filter(p=>time-p.time<6);render();
  }raf=requestAnimationFrame(tick);
 }
 function sync(){
  // Other renderers may write the same body classes every frame. Only restart
  // our clock when a state that affects the sky actually changes.
  const state=[document.documentElement.dataset.page,document.hidden,reduced.matches,document.body.classList.contains('locked'),busy,Boolean(cloudWorld)].join('|');
  if(state===lifecycle)return;
  lifecycle=state;
  const exploring=document.documentElement.dataset.page==='explore';
  if(exploring&&!wasExploring){lastScroll=Math.max(0,scrollY);travel.position=travel.target=lastScroll;}
  wasExploring=exploring;
  if(raf){cancelAnimationFrame(raf);raf=0;}
  if(document.documentElement.dataset.page==='explore'&&!document.hidden){initialize();scheduleCourtyard();if(!busy)render();last=performance.now();if(!busy&&!reduced.matches&&!document.body.classList.contains('locked'))raf=requestAnimationFrame(tick);}
  else if(!exploring){interaction.pulses=[];interaction.energy=windTarget.energy=0;lastPointer=null;travel.impulse=travel.velocity=0;}
  if(reduced.matches){view.x=view.y=0;for(const name of ['--sky-x','--sky-y','--sky-scroll'])explore.style.removeProperty(name);}
 }
 async function fly(change){
  if(busy)return false;
  if(reduced.matches){change();return true;}
  busy=true;
  const scene=await initialize();
  if(!scene){busy=false;change();return true;}
  const fromHome=document.documentElement.dataset.page==='home';
  const overlay=document.createElement('canvas');overlay.className='sky-flight';overlay.setAttribute('aria-hidden','true');overlay.dataset.motion='continuous-cloud-ascent';
  const ctx=overlay.getContext('2d');if(!ctx){busy=false;change();return true;}
  const scale=Math.min(devicePixelRatio||1,1.4);
  const resize=()=>{overlay.width=Math.round(innerWidth*scale);overlay.height=Math.round(innerHeight*scale);ctx.setTransform(scale,0,0,scale,0,0);scene.resize();};resize();
  let changed=false,source=null;const capture=canvas=>{source=canvas;};
  if(fromHome)document.dispatchEvent(new CustomEvent('portfolio:capture',{detail:{capture}}));
  document.body.append(overlay);document.body.classList.add('ascending');
  document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:true}}));
  window.addEventListener('resize',resize,{passive:true});
  try{
   await new Promise((resolve,reject)=>{
    const start=performance.now(),duration=fromHome?5200:2600;let previous=start;
    function frame(now){
     try{
      const p=Math.min(1,(now-start)/duration),w=innerWidth,h=innerHeight;
      time+=Math.min(.1,(now-previous)/1000);previous=now;
      overlay.dataset.progress=p.toFixed(3);ctx.clearRect(0,0,w,h);
      const elevation=fromHome?smooth(0,1,p):.55+.45*smooth(0,1,p);
      const cloudOnly=fromHome&&p<.66;
      if(cloudOnly){
       document.dispatchEvent(new CustomEvent('portfolio:ascend',{detail:{progress:elevation,capture}}));
       if(source?.width>0&&source?.height>0)ctx.drawImage(source,0,0,w,h);
      }
      scene.render({...flightPose(elevation),time,cloudOnly,backdrop:fromHome?smooth(.24,.66,elevation):1});ctx.drawImage(scene.canvas,0,0,w,h);
      // Hand the same moving cloud canvas to the destination without fading it.
      if(p>=.7&&!changed){changed=true;change();overlay.remove();}
      if(p>=.78)document.body.classList.add('sky-arriving');
      if(p<1)requestAnimationFrame(frame);else resolve();
     }catch(error){reject(error);}
    }requestAnimationFrame(frame);
   });
  }finally{
   if(!changed)change();
   document.dispatchEvent(new CustomEvent('portfolio:ascend',{detail:{end:true}}));
   document.body.classList.remove('ascending','sky-arriving');overlay.remove();window.removeEventListener('resize',resize);
   document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:false}}));busy=false;render();sync();
  }return true;
 }
 async function descend(change,{to='home'}={}){
  if(busy)return false;
  busy=true;
  const root=document.documentElement,body=document.body,explore=document.querySelector('#explore');
  let overlay=null,changed=false,engine=null,arrival=null,resize=null;
  root.setAttribute('data-sky-return','');root.dataset.skyDestination=to;explore.inert=true;
  try{
   if(reduced.matches){change();changed=true;return true;}
   // Keep the cloud page visible while the incoming courtyard loads off-screen.
   const [scene,module]=await Promise.all([initialize(),to==='projects'?null:preloadCourtyard()]);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   if(to==='projects')arrival=await window.portfolioWater?.prepareSkyArrival();
   else engine=await module?.prepareCourtyardView(to);
   if(reduced.matches||!scene){change();changed=true;return true;}
   overlay=document.createElement('canvas');overlay.className='sky-flight';overlay.setAttribute('aria-hidden','true');overlay.dataset.motion=`clouds-to-${to}`;
   const ctx=overlay.getContext('2d');if(!ctx){change();changed=true;return true;}
   const scale=Math.min(devicePixelRatio||1,1.4);
   resize=()=>{overlay.width=Math.round(innerWidth*scale);overlay.height=Math.round(innerHeight*scale);ctx.setTransform(scale,0,0,scale,0,0);scene.resize();};resize();
   body.append(overlay);body.classList.add('descending');
   document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:true}}));
   window.addEventListener('resize',resize,{passive:true});
   const fallback=to==='projects'?null:to==='about'?new Image():document.querySelector('.hero-fallback img');
   if(to==='about')fallback.src=new URL('/assets/studio-scene.png',location.href).href;
   if(!engine&&fallback?.decode)await fallback.decode().catch(()=>{});
   const departure=cameraPose();
   await new Promise((resolve,reject)=>{
    const start=performance.now();let previous=start;
    function frame(now){
     try{
      const p=Math.min(1,(now-start)/5200),w=innerWidth,h=innerHeight;
      time+=Math.min(.1,(now-previous)/1000);previous=now;
      overlay.dataset.progress=p.toFixed(3);
      ctx.clearRect(0,0,w,h);
      let courtyard=null;
      const elevation=1-smooth(0,1,p);
      if(arrival)courtyard=arrival.render(elevation);
      else if(engine){const source=engine.ascend(elevation);if(source?.width>0&&source?.height>0)courtyard=source;}
      else if(fallback?.complete&&fallback.naturalWidth)courtyard=fallback;
      // Without WebGL in the destination, reveal its native layout beneath
      // the same moving clouds rather than replacing it with a generic veil.
      const cloudOnly=Boolean(courtyard)||to==='projects';
      if(courtyard)ctx.drawImage(courtyard,0,0,w,h);
      scene.render({...flightPose(elevation,departure),time,cloudOnly,backdrop:cloudOnly?smooth(.24,.66,elevation):1});ctx.drawImage(scene.canvas,0,0,w,h);
      if(p>=.74&&!changed){changed=true;change();arrival?.layout();}
      if(p>=.83)body.classList.add('sky-home-arriving');
      if(p<1)requestAnimationFrame(frame);else resolve();
     }catch(error){reject(error);}
    }requestAnimationFrame(frame);
   });
  }finally{
   if(!changed)change();
   engine?.ascend(0,true);
   arrival?.finish();
   root.removeAttribute('data-sky-return');delete root.dataset.skyDestination;body.classList.remove('descending','sky-home-arriving');
   overlay?.remove();if(resize)window.removeEventListener('resize',resize);explore.inert=false;
   document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:false}}));
   busy=false;sync();
  }
  return true;
 }
 window.portfolioSky={fly,descend,get busy(){return busy;}};
 window.addEventListener('resize',()=>{cloudWorld?.resize();if(!busy)render();},{passive:true});
 const canInteract=()=>document.documentElement.dataset.page==='explore'&&!document.hidden&&!document.body.classList.contains('locked')&&!busy&&!reduced.matches;
 window.addEventListener('scroll',()=>{
  if(!canInteract())return;
  const position=Math.max(0,scrollY),delta=position-lastScroll;lastScroll=position;travel.target=position;
  travel.impulse=Math.max(-1,Math.min(1,travel.impulse+delta/Math.max(1,innerHeight)*1.8));
 },{passive:true});
 function movePointer(event){
  if(!canInteract())return;
  const now=performance.now(),x=event.clientX/innerWidth-.5,y=event.clientY/innerHeight-.5;
  if(lastPointer){const dt=Math.max(.016,(now-lastPointer.time)/1000),vx=(x-lastPointer.x)/dt,vy=(y-lastPointer.y)/dt;
   windTarget.x=Math.max(-1.5,Math.min(1.5,vx*.65));windTarget.y=Math.max(-1.5,Math.min(1.5,vy*.65));
   windTarget.energy=Math.min(1.4,Math.hypot(vx,vy)*.8);
  }
  pointer.x=x;pointer.y=y;lastPointer={x,y,time:now};
 }
 document.addEventListener('pointermove',movePointer,{passive:true});
 function pulse(){
  const hit=cloudWorld.projectPoint({x:pointer.x*2,y:-pointer.y*2},cameraPose());
  interaction.pulses.unshift({...hit,time});interaction.pulses=interaction.pulses.slice(0,3);
  windTarget.energy=Math.max(.7,windTarget.energy);
 }
 document.addEventListener('pointerdown',event=>{
  if(!canInteract()||!cloudWorld||event.isPrimary===false||event.button!==0||event.target.closest('a,button,input,textarea,select,summary,[role="button"]'))return;
  movePointer(event);
  if(event.pointerType==='touch'){touchTap={x:event.clientX,y:event.clientY,time:performance.now(),id:event.pointerId};return;}
  pulse();
 },{passive:true});
 document.addEventListener('pointerup',event=>{
  if(event.pointerType!=='touch')return;
  if(touchTap?.id===event.pointerId&&canInteract()&&performance.now()-touchTap.time<500&&Math.hypot(event.clientX-touchTap.x,event.clientY-touchTap.y)<14){movePointer(event);pulse();}
  touchTap=null;lastPointer=null;pointer.x=pointer.y=0;
 },{passive:true});
 document.addEventListener('pointercancel',()=>{touchTap=null;lastPointer=null;pointer.x=pointer.y=0;},{passive:true});
 document.addEventListener('pointerleave',()=>{lastPointer=null;windTarget.energy=0;pointer.x=pointer.y=0;},{passive:true});
 new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-page']});new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);sync();
})();
