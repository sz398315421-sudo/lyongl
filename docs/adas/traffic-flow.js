import {createTrafficVehicles} from './traffic-vehicles.js';
import {roadLaneState} from './road-assist.js';
import {createTrafficSimulation,trafficScenes,trafficLimits} from './traffic-simulation.js';

function trafficContext(world){
 const info=roadLaneState(world);
 if(!trafficScenes.includes(info.scene))return null;
 return {centers:info.centers,minZ:-238,maxZ:62,y:world.state.id==='03'?8.52:.02,
  ego:{x:world.car.position.x,z:world.car.position.z,length:world.car.userData.vehicleSpec?.length||5.2},
  closure:world.state.roadworks?world.roadworkZone:null};
}

function createControls(settings,onChange,onPause,onReset){
 const block=document.createElement('section');block.id='traffic-control';block.className='traffic-control';block.setAttribute('aria-labelledby','traffic-title');
 block.innerHTML=`<div class="traffic-heading"><div><h2 id="traffic-title" class="settings-label">动态交通流</h2><span id="traffic-state" class="traffic-state" role="status">准备中</span></div><label class="toggle traffic-toggle"><span class="sr-only">启用动态交通流</span><input id="traffic-enabled" type="checkbox" role="switch" aria-label="启用动态交通流"><span class="track" aria-hidden="true"></span></label></div>
 <div id="traffic-settings" class="traffic-settings"><fieldset class="traffic-fields"><legend class="sr-only">交通流参数</legend>${[
  ['density','交通密度','%',1],['speed','旁车速度','km/h',1],['overtake','超车概率','%',1],['gap','最小车距','m',1],['variation','速度波动','km/h',1]
 ].map(([key,title,unit,step])=>`<div class="traffic-field" data-traffic-field="${key}"><div class="traffic-field-heading"><label for="traffic-${key}">${title}</label><div class="traffic-value">${key==='variation'?'<span>±</span>':''}<input id="traffic-${key}-value" type="number" inputmode="numeric" min="${trafficLimits[key][0]}" max="${trafficLimits[key][1]}" step="${step}" aria-label="${title}数值"><span>${unit}</span></div></div><input id="traffic-${key}" type="range" min="${trafficLimits[key][0]}" max="${trafficLimits[key][1]}" step="${step}" aria-label="${title}"></div>`).join('')}</fieldset>
 <div class="traffic-actions"><button id="traffic-pause" type="button" aria-pressed="false">暂停交通流</button><button id="traffic-reset" type="button">重新布车</button></div><p id="traffic-note" class="traffic-note">旁车速度为道路绝对速度；实际速度随跟车情况降低。超车概率按受阻时的变道机会计算。</p></div>`;
 document.querySelector('.preview-settings').append(block);
 const enabled=block.querySelector('#traffic-enabled'),content=block.querySelector('#traffic-settings'),fields=block.querySelector('fieldset'),pause=block.querySelector('#traffic-pause'),reset=block.querySelector('#traffic-reset'),state=block.querySelector('#traffic-state'),note=block.querySelector('#traffic-note');
 enabled.setAttribute('aria-controls',content.id);
 enabled.addEventListener('change',()=>onChange({enabled:enabled.checked}));pause.addEventListener('click',onPause);reset.addEventListener('click',onReset);
 function values(config){
  enabled.checked=config.enabled;
  content.hidden=!config.enabled;state.hidden=!config.enabled;block.dataset.expanded=String(config.enabled);
  for(const key of Object.keys(trafficLimits)){
   const range=block.querySelector(`#traffic-${key}`),number=block.querySelector(`#traffic-${key}-value`);
   range.value=config[key];number.value=config[key];
   range.style.setProperty('--range-fill',`${(config[key]-Number(range.min))/(Number(range.max)-Number(range.min))*100}%`);
   range.setAttribute('aria-valuetext',key==='variation'?`正负 ${config[key]} 千米每小时`:`${config[key]} ${key==='speed'?'千米每小时':key==='gap'?'米':'%'}`);
  }
 }
 for(const key of Object.keys(trafficLimits)){
  block.querySelector(`#traffic-${key}`).addEventListener('input',event=>onChange({[key]:Number(event.target.value)}));
  block.querySelector(`#traffic-${key}-value`).addEventListener('change',event=>{const value=event.target.value;if(value===''){values(settings());return;}onChange({[key]:Number(value)});});
 }
 return {values,sync({supported,ready,interactive,paused,count,lanes}){
  const config=settings();block.hidden=!supported;if(!supported)return;
  enabled.disabled=!interactive;fields.disabled=!ready||!config.enabled;pause.disabled=!ready||!config.enabled||config.density===0;reset.disabled=!ready||!config.enabled;
  const label=!ready?'准备中':!config.enabled?'已关闭':config.density===0?'空车流':paused?'已暂停':'运行中';
  state.textContent=`${label}${ready&&config.enabled?` · ${count} 辆`:''}`;block.dataset.state=label;block.dataset.count=count;
  pause.textContent=paused?'继续交通流':'暂停交通流';pause.setAttribute('aria-pressed',String(paused));
  for(const input of block.querySelector('[data-traffic-field="overtake"]').querySelectorAll('input'))input.disabled=lanes<2;
  note.textContent=lanes<2?'当前同向仅 1 条车道，旁车只跟车、不超车。车距为车身之间的最小间隔。':'旁车速度为道路绝对速度；跟车时会减速。超车概率按受阻时的变道机会计算，车距为车身间隔。';
 }};
}

export function initTrafficFlow(world,{settings,onSettingsChange=()=>{},onAudit=()=>{},requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}={}){
 const simulation=createTrafficSimulation({settings}),fleet=createTrafficVehicles(world.scene,{retain:id=>world.retainVehicle?.(id)||(()=>{})});
 let scene=null,ready=false,interactive=false,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,frame=0,last=null,key=null,context=null,lastAudit=-1,exporting=false,syncKey='';
 const cancel=()=>{if(frame)cancelFrame(frame);frame=0;last=null;};
 const supported=()=>trafficScenes.includes(scene);
 const running=()=>ready&&supported()&&simulation.settings.enabled&&simulation.settings.density>0&&!paused&&!document.hidden&&!world.suspended&&!exporting;
 const snapshot=()=>{const state=simulation.snapshot();return {...state,cars:state.cars.map(car=>({...car,modelId:fleet.modelId(car.id)})),fleet:fleet.audit(),settings:simulation.settings,paused,running:running(),scene};};
 function controlsSync(){controls.sync({supported:supported(),ready,interactive,paused,count:simulation.cars.length,lanes:context?.centers.length||0});}
 function syncWorld(){
  context=world.state?trafficContext(world):null;
  const next=context?JSON.stringify([world.state.id,context.centers,world.state.roadworks,context.y]):null;
  if(next!==key){key=next;simulation.reset(context);audit();}else if(context)simulation.updateContext(context);
  fleet.group.visible=!!context&&ready&&simulation.settings.enabled&&fleet.ready(world.car.userData.vehicleSpec?.id);
  if(context)fleet.update(simulation.cars,context.y);
 }
 function audit(){const value=snapshot();onAudit(value);controlsSync();}
 function tick(now){
  frame=0;if(!running()){cancel();return;}
  syncWorld();if(last===null)last=now;
  const delta=now-last;
  if(delta>=1000/30){
   simulation.step(Math.min(delta/1000,.25),context);last=now;
   // The authored vehicle/camera animations already submit their own frames.
   if(!world.cameraMotion&&!world.layoutMotion&&!world.environmentMotion&&!world.structureMotion&&!api.externalAnimation)world.renderFrame(true);
   if(now-lastAudit>500){lastAudit=now;audit();}
  }
  frame=requestFrame(tick);
 }
 function schedule(){if(!running())cancel();else if(!frame)frame=requestFrame(tick);}
 function redraw(){syncWorld();if(ready&&!world.suspended)world.renderFrame(true);audit();schedule();}
 const controls=createControls(()=>simulation.settings,patch=>{
  simulation.configure(patch);controls.values(simulation.settings);onSettingsChange(simulation.settings);redraw();
 },()=>{paused=!paused;redraw();},()=>{simulation.reset(context);redraw();});
 controls.values(simulation.settings);
 const api={group:fleet.group,externalAnimation:false,syncWorld,snapshot,
  setModels(models,egoId){fleet.setModels(models,egoId);syncWorld();audit();},
  modelsReady:egoId=>fleet.ready(egoId),
  sync(nextScene,nextReady,{interactive:nextInteractive=nextReady}={}){
   const wasVisible=fleet.group.visible;scene=nextScene;ready=nextReady;interactive=nextInteractive;syncWorld();controlsSync();schedule();
   const nextKey=JSON.stringify([scene,ready,key,simulation.cars.length]);if(syncKey!==nextKey){syncKey=nextKey;audit();}
   if(wasVisible!==fleet.group.visible&&ready&&!world.suspended)world.renderFrame(true);
  },
  pause(){paused=true;redraw();},
  setExporting(value){if(exporting===value)return;exporting=value;cancel();audit();schedule();},
  capture(){return simulation.capture();},restore(value){simulation.restore(value);syncWorld();audit();},
  advance(seconds){syncWorld();for(let left=seconds;left>1e-8;left-=1/30)simulation.step(Math.min(left,1/30),context);},
  get settings(){return simulation.settings;},
  dispose(){cancel();fleet.dispose();}
 };
 document.addEventListener('visibilitychange',()=>{cancel();schedule();});
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches)api.pause();});
 return api;
}
