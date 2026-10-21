import { initAnalyticsChoice, trackPngExport } from './analytics.js';
import {playThemeSound} from './theme-sound.js';
import {World} from './world.js';
import {structures,legacyScenes} from './structures.js';
import {createVehicle,createVehicleProxy} from './vehicle.js';
import {disposeVehicle} from './dispose-vehicle.js';
import {createTransportIcon} from './transport-icon.js';
import {initContinuousCorners} from './continuous-corners.js';
import {initExportControls} from './export-controls.js';
import {cameraMetadata,perspectiveSvg,renderDepth,exportSize,exportReadme} from './export-scene.js';
import {canvasPng,depthPng,zipFiles,downloadFile} from './export-files.js';
import {recordCanvasVideo,videoFormat} from './video-export.js';
import {initVehicleSelector} from './vehicle-selector.js';
import {vehicleCatalog,vehicleSpec,vehicleReadme} from './vehicle-catalog.js';
import {createParkingVehiclePool} from './parking-vehicle-pool.js';
import {refreshParkedVehicleModels} from './parked-vehicles.js';
import {loadPreparedVehicle} from './vehicle-library/three/load-prepared.js';
import {savePreviewSnapshot,savePreviewSnapshotAsync,previewSnapshotKey,previewSnapshotSearch} from './preview-snapshot.js';
import {vehicleFrame} from './framing.js';
import {createVehicleCache} from './vehicle-cache.js';
import {prepareVehicleChoice} from './prepare-vehicle-choice.js';
import {createScenePlayback,initScenePlaybackControls} from './scene-playback.js';
import {initRoadAssistControls,roadLaneState,guidanceScenes,normalizeGuidanceColor,defaultGuidanceColor,normalizeJunctionLane,junctionDirection} from './road-assist.js';
import {initParkingHmi} from './parking-maneuver.js';
initAnalyticsChoice();
const $=id=>document.getElementById(id),preview=$('preview');
const siteHeader=document.querySelector('header');
siteHeader.classList.toggle('is-scrolled',scrollY>1);
const headerObserver=new IntersectionObserver(([entry])=>siteHeader.classList.toggle('is-scrolled',!entry.isIntersecting));
headerObserver.observe($('header-sentinel'));
// Keep the scrolling workspace fade outside the stationary desktop navigation.
const sceneLayout=document.querySelector('main');
function syncHeaderLayout(){
 if(sceneLayout.hidden)return;
 const headerBox=siteHeader.getBoundingClientRect();
 const workspaceBox=document.querySelector('.workspace').getBoundingClientRect();
 siteHeader.style.setProperty('--workspace-left',`${Math.max(0,workspaceBox.left-headerBox.left)}px`);
 siteHeader.style.setProperty('--header-content-gap',getComputedStyle(sceneLayout).paddingTop);
 sceneLayout.style.setProperty('--sidebar-top',`${headerBox.height+parseFloat(getComputedStyle(sceneLayout).paddingTop)}px`);
}
const headerLayoutObserver=new ResizeObserver(syncHeaderLayout);
headerLayoutObserver.observe(sceneLayout);headerLayoutObserver.observe(siteHeader);headerLayoutObserver.observe(document.querySelector('.preview-shell'));
syncHeaderLayout();
const query=new URLSearchParams(location.search),requested=query.get('scene'),initial=legacyScenes[requested]||requested;
const first=structures.find(s=>s.layouts.some(([id])=>id===initial))||structures[0];
const preferences=new Map(structures.map(s=>[s.key,{id:s.layouts[0][0],buildings:!!s.buildings,waterfront:s.key==='road'&&requested==='13',trees:false,vehicle:true,roadworks:false,parkedCars:true}]));
preferences.get(first.key).id=initial&&first.layouts.some(([id])=>id===initial)?initial:first.layouts[0][0];
Object.assign(preferences.get('road'),{laneCount:initial==='09'?2:6,cameraView:first.key==='road'&&query.get('view')==='high'?'high':'low'});
preferences.get('junction').cameraView=first.key==='junction'&&query.get('view')==='low'?'low':'high';
preferences.get('junction').junctionPosition=query.get('position')==='approaching'||(first.key==='junction'&&query.get('view')==='low'&&!query.has('position'))?'approaching':'near';
preferences.get('junction').cameraView=preferences.get('junction').junctionPosition==='near'?'high':'low';
preferences.get('junction').junctionLanes={'05':'middle','08':'right'};
if(first.key==='junction')preferences.get('junction').junctionLanes[initial]=normalizeJunctionLane(initial,query.get('lane'));
preferences.get('elevated').cameraView=first.key==='elevated'&&query.get('view')==='high'?'high':'low';
preferences.get('ramp').cameraView=first.key==='ramp'&&query.get('view')==='high'?'high':'low';
if(['2','4','6'].includes(query.get('lanes')))preferences.get('road').laneCount=Number(query.get('lanes'));
if(requested==='01')preferences.get(first.key).buildings=false;
if(requested==='12')preferences.get(first.key).roadworks=true;
for(const key of ['buildings','waterfront','trees','roadworks','parkedCars'])if(query.has(key))preferences.get(first.key)[key]=query.get(key)==='1';
for(const preference of preferences.values())for(const key of ['buildings','waterfront','trees','vehicle','roadworks','parkedCars'])preference[key]=preferences.get(first.key)[key];
let savedTheme;try{savedTheme=localStorage.getItem('sr-theme');}catch{}
const initialTheme=query.get('mode')||savedTheme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
let selected=first.key,mode=initialTheme==='dark'?'dark':'light',displayedReference=false;
const comparingNav=false; // Production uses the selected grouped navigation; studies remain in the local scene project.
let navDesign=comparingNav&&['1','2','3'].includes(query.get('nav'))?query.get('nav'):'1';
const optionIds=['buildings','waterfront','trees','vehicle','roadworks','parkedCars'];
const environmentIds=optionIds.filter(key=>key!=='vehicle');
let vehicleReady=false,vehicleFullReady=false,junctionRequested=false,vehicleChanging=false;
let selectedVehicle=vehicleSpec(query.get('model')).id;
let roadGuidanceEnabled=query.get('guidance')!=='0';
let savedGuidanceColor;try{savedGuidanceColor=localStorage.getItem('sr-guidance-color');}catch{}
let roadGuidanceColor=normalizeGuidanceColor(query.get('guideColor'),normalizeGuidanceColor(savedGuidanceColor));
async function loadVehicle(id){const car=await (id==='x6'?createVehicle():loadPreparedVehicle(id,{url:new URL(`./vehicle-library/prepared/${id}/model.glb.gz`,import.meta.url),signal:AbortSignal.timeout(30000)}));car.userData.vehicleSpec.id=id;return car;}
const vehicleCache=createVehicleCache({load:loadVehicle,dispose:disposeVehicle,maxEntries:matchMedia('(max-width:760px)').matches?2:4});
const parkingPool=createParkingVehiclePool({ids:vehicleCatalog.map(model=>model.id),load:id=>vehicleCache.get(id),retain:id=>vehicleCache.retain(id),count:matchMedia('(max-width:760px)').matches?2:3});
let pendingParkingRender=null;
function needsParkingModels(){return active()?.group==='closed'&&preferences.get(selected).parkedCars;}
function parkingModelsReady(){return !needsParkingModels()||parkingPool.ready(selectedVehicle);}
async function prepareParkingModels(egoId){
 const pool=await parkingPool.ensure(egoId);if(!pool)return false;
 world.parkingVehicleModels=pool.models;world.parkingVehicleAssignment=pool.assignment;return true;
}
const readyVehicles=new WeakSet(),warmingVehicles=new WeakMap();let preparationQueue=Promise.resolve();
function prepareChoice(car){
 if(readyVehicles.has(car))return Promise.resolve();if(warmingVehicles.has(car))return warmingVehicles.get(car);
 const request=preparationQueue.then(()=>prepareVehicleChoice(world,car)).then(()=>readyVehicles.add(car)).finally(()=>warmingVehicles.delete(car));preparationQueue=request.catch(()=>{});warmingVehicles.set(car,request);return request;
}
function previewResolution(){const mobile=matchMedia('(max-width:760px)').matches;const width=Math.min(mobile?1280:1440,Math.max(640,Math.ceil(preview.clientWidth*Math.min(devicePixelRatio||1,2)/16)*16));return [width,Math.round(width*9/16)];}
// Attach rejection handling immediately, including while the renderer is starting.
const vehiclePromise=vehicleCache.get(selectedVehicle).then(car=>{vehicleCache.activate(selectedVehicle);return {car};},error=>({error}));
await new Promise(resolve=>setTimeout(resolve,0));
performance.mark('studio-renderer-start');
let world;
try{world=await World.create($('scene-canvas'),createVehicleProxy(),{width:previewResolution()[0],height:previewResolution()[1],measure:query.has("perf")});}
catch(error){error.code='renderer';throw error;}
$('scene-canvas').addEventListener('webglcontextlost',()=>{
 world.suspended=true;world.clearLayoutTransition();world.stopCameraMotion();world.stopEnvironmentMotion();world.stopLayoutMotion(false);
 scenePlayback.pause();syncScenePlayback();
});
world.retainVehicle=id=>vehicleCache.retain(id);
world.initializingScene=true;
world.roadGuidance.enabled=roadGuidanceEnabled;
world.roadGuidance.setColor(roadGuidanceColor);
let roadAssistControls;
const parkingHmi=initParkingHmi(preview);
const scenePlayback=createScenePlayback(world,{onChange:snapshot=>{
 syncScenePlayback(snapshot);
 preview.dataset.sceneMotion=JSON.stringify({...snapshot,car:world.car.position.toArray(),camera:world.camera.position.toArray()});
 if(!exporting&&snapshot.status!=='playing'&&vehicleReady&&!world.suspended){preview.dataset.audit=JSON.stringify(world.audit());rememberPreview();}
}});
const sceneMotionControls=initScenePlaybackControls({onToggle:()=>{
 if(scenePlayback.snapshot().status==='playing'){scenePlayback.pause();return;}
 if(!vehicleFullReady||vehicleChanging||world.suspended||preview.dataset.renderPending==='true')return;
 world.finishLayoutTransition();world.finishCameraMotion();world.finishEnvironmentMotion();world.finishLayoutMotion();
 document.querySelectorAll('.frame-cover').forEach(element=>element.remove());activeCover=null;
 scenePlayback.play(selected);
},onReset:()=>scenePlayback.reset()});
roadAssistControls=initRoadAssistControls({guidance:roadGuidanceEnabled,color:roadGuidanceColor,onLaneChange:direction=>{
 if(!guidanceScenes.includes(selected)||selected==='junction'||!vehicleFullReady||vehicleChanging||world.suspended||exporting||preview.dataset.renderPending==='true')return;
 world.finishLayoutTransition();world.finishCameraMotion();world.finishEnvironmentMotion();world.finishLayoutMotion();
 document.querySelectorAll('.frame-cover').forEach(element=>element.remove());activeCover=null;
 if(direction===0)scenePlayback.goStraight();else scenePlayback.changeLane(direction);
},onGuidanceChange:enabled=>{
 roadGuidanceEnabled=enabled;world.roadGuidance.enabled=enabled;
 if(!world.suspended)world.renderFrame();updateURL();rememberPreview();
},onColorChange:color=>{
 roadGuidanceColor=world.roadGuidance.setColor(color);
 try{localStorage.setItem('sr-guidance-color',roadGuidanceColor);}catch{}
 if(!world.suspended)world.renderFrame();updateURL();rememberPreview();
}});
function syncScenePlayback(snapshot=scenePlayback.snapshot()){
 const ready=vehicleFullReady&&!vehicleChanging&&!world.suspended&&!exporting&&preview.dataset.renderPending!=='true'&&parkingModelsReady();
 sceneMotionControls.sync(selected,ready,snapshot);roadAssistControls?.sync(selected,ready,snapshot,world);
 parkingHmi.sync(selected,snapshot);
}
const vehicleSelector=initVehicleSelector({selected:selectedVehicle,onPreview:async id=>{
 if(vehicleChanging||world.suspended)return;const release=vehicleCache.retain(id);
 try{const car=await vehicleCache.get(id);await prepareChoice(car);}catch{vehicleCache.invalidate(id);}finally{release();}
},onChange:async id=>{
 scenePlayback.reset();
 const previousCar=world.car,previousId=selectedVehicle;let car;vehicleChanging=true;$('download').disabled=true;
 syncScenePlayback();
 const release=vehicleCache.retain(id),timings={id,start:performance.now(),cacheHit:!!vehicleCache.peek(id)};let phase=timings.start;const mark=name=>{const now=performance.now();timings[name]=now-phase;phase=now;};
 try{
  car=await vehicleCache.get(id);mark('load');timings.loader=car.userData.loadTimings;await prepareChoice(car);mark('prepare');if(needsParkingModels()||parkingPool.current)await prepareParkingModels(id);
  selectedVehicle=id;world.setVehicle(car,{disposePrevious:false,preserveScene:true});mark('replace');world.update(state(),{deferRender:true});mark('update');world.renderFrame();mark('frame');vehicleCache.activate(id);
 }catch(error){
  selectedVehicle=previousId;
  if(parkingPool.current&&!parkingPool.ready(previousId))await prepareParkingModels(previousId);
  if(car&&world.car===car){world.setVehicle(previousCar,{disposePrevious:false,preserveScene:true});world.update(state(),{deferRender:true});world.renderFrame();}vehicleCache.invalidate(id);
  throw error;
 }finally{release();vehicleChanging=false;render(false);mark('ui');rememberPreview();mark('snapshot');timings.total=performance.now()-timings.start;timings.cache=vehicleCache.stats();if(query.has('qa')){const records=JSON.parse(preview.dataset.vehiclePerformance||'[]');records.push(timings);preview.dataset.vehiclePerformance=JSON.stringify(records.slice(-12));}}
}});
$('vehicle-picker-trigger').addEventListener('click',()=>scenePlayback.pause());
$('download').addEventListener('click',()=>scenePlayback.pause());
performance.measure('studio-renderer','studio-renderer-start');
await new Promise(resolve=>setTimeout(resolve,0));
world.onCameraFrame=moving=>{if(selected==='junction'){junctionRequested=false;syncJunctionTransport();}preview.dataset.cameraMoving=String(moving);if(!moving||query.has('perf'))preview.dataset.cameraPose=JSON.stringify({position:world.camera.position.toArray(),aim:world.cameraAim.toArray(),offset:world.camera.view.offsetY,car:world.car.position.toArray(),anchor:world.captureCamera().anchor.toArray()});if(!moving){preview.dataset.audit=JSON.stringify(world.audit());}};
world.onEnvironmentFrame=moving=>{preview.dataset.environmentMoving=String(moving);if(!moving){preview.dataset.audit=JSON.stringify(world.audit());}};
world.onLayoutFrame=moving=>{preview.dataset.layoutMoving=String(moving);if(!moving){preview.dataset.audit=JSON.stringify(world.audit());}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){scenePlayback.pause();world.finishLayoutTransition();world.finishCameraMotion();world.finishEnvironmentMotion();world.finishLayoutMotion();}});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{if(event.matches){scenePlayback.pause();world.finishLayoutTransition();world.finishCameraMotion();world.finishEnvironmentMotion();world.finishLayoutMotion();}});
const referenceView=null;let referenceVehicle=true;

function currentFrame(){return $('scene-canvas');}
let previewSaveTimer=0,previewSaveIdle=false,previewSaveRevision=0;
function rememberPreview(immediate=false){
 const revision=++previewSaveRevision;if(previewSaveTimer){if(previewSaveIdle)cancelIdleCallback(previewSaveTimer);else clearTimeout(previewSaveTimer);previewSaveTimer=0;}
 if(!vehicleReady||world.suspended)return;
 const save=()=>{previewSaveTimer=0;try{const offset={x:world.camera.view?.offsetX||0,y:world.camera.view?.offsetY||0};if(immediate)savePreviewSnapshot(currentFrame(),location.search,sessionStorage,offset,scrollY);else void savePreviewSnapshotAsync(currentFrame(),location.search,sessionStorage,offset,()=>revision===previewSaveRevision&&!world.suspended,scrollY);}catch{}};
 if(immediate){save();return;}previewSaveIdle=typeof requestIdleCallback==='function';previewSaveTimer=previewSaveIdle?requestIdleCallback(save,{timeout:1000}):setTimeout(save,200);
}
window.addEventListener('pagehide',()=>rememberPreview(true));
function active(){return structures.find(s=>s.key===selected);}
function state(){const st={...preferences.get(selected),mode,vehicle:true};for(const key of environmentIds)st[key]=!!active()[key]&&!!st[key];if(selected==='road')st.id=st.laneCount===2?'09':'02';if(selected==='junction')st.junctionLane=normalizeJunctionLane(st.id,st.junctionLanes[st.id]);return st;}
function updateURL(){const q=new URLSearchParams();q.set('scene',selected==='reference'?'reference':state().id);q.set('mode',mode);if(selected==='road')q.set('lanes',state().laneCount);if(['road','ramp','junction','elevated'].includes(selected))q.set('view',state().cameraView);if(selected==='junction'){q.set('position',state().junctionPosition);q.set('lane',state().junctionLane);}for(const key of optionIds)q.set(key,(key==='parkedCars'?preferences.get(selected)[key]:state()[key])?'1':'0');if(selectedVehicle!=='x6')q.set('model',selectedVehicle);if(guidanceScenes.includes(selected)){if(!roadGuidanceEnabled)q.set('guidance','0');if(roadGuidanceColor!==defaultGuidanceColor)q.set('guideColor',roadGuidanceColor.slice(1));}if(comparingNav){q.set('study','1');q.set('nav',navDesign);}if(query.has('motion'))q.set('motion',query.get('motion'));if(query.has('qa'))q.set('qa','1');if(document.getElementById('credits-view')&&!document.getElementById('credits-view').hidden)q.set('page','credits');history.replaceState(null,'',`?${q}`);}
const sceneButtons=new Map(),sceneGroups=new Map(),categoryButtons=new Map();
const groupSelection=new Map([['open',first.group==='open'?selected:'road'],['closed',first.group==='closed'?selected:'parking']]);
const folderSVG='<svg class="folder-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 6V4.75A1.5 1.5 0 0 1 4 3.25h3.1c.4 0 .78.16 1.06.44l1.62 1.62a.75.75 0 0 0 .53.22H16A1.5 1.5 0 0 1 17.5 7.03v8.22A1.5 1.5 0 0 1 16 16.75H4a1.5 1.5 0 0 1-1.5-1.5V6Z" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const categorySwitch=document.createElement('div');categorySwitch.className='nav-category-switch';categorySwitch.setAttribute('role','group');categorySwitch.setAttribute('aria-label','场景分类');
for(const [key,label]of [['open','行驶'],['closed','泊车']]){
 const button=document.createElement('button');button.type='button';button.innerHTML=folderSVG;button.append(document.createTextNode(label));button.setAttribute('aria-pressed',String(first.group===key));
 button.addEventListener('click',()=>{selected=groupSelection.get(key);requestRender();});categoryButtons.set(key,button);categorySwitch.append(button);
}
$('scenes').append(categorySwitch);
for(const [key,title]of [['open','行驶场景'],['closed','泊车场景']]){
 const section=document.createElement('section'),heading=document.createElement('h2'),items=document.createElement('div');
 section.className='scene-group';heading.className='structure-heading';heading.innerHTML=folderSVG;heading.append(document.createTextNode(title));items.className='structure-items';items.id=`group-${key}`;
 for(const scene of structures.filter(scene=>scene.group===key)){
  const button=document.createElement('button'),image=document.createElement('img'),label=document.createElement('span');
  button.type='button';button.className='scene';button.dataset.structure=scene.key;
  image.className='scene-thumbnail';image.alt='';image.width=240;image.height=135;image.decoding='async';
  label.className='scene-label';label.textContent=scene.name;button.append(image,label);
  button.addEventListener('click',()=>{if(selected===scene.key)return;selected=scene.key;requestRender();});items.append(button);sceneButtons.set(scene.key,button);
 }
 section.append(heading,items);sceneGroups.set(key,section);$('scenes').append(section);
}
const navPill=document.createElement('span');navPill.className='nav-pill';navPill.hidden=true;navPill.setAttribute('aria-hidden','true');$('scenes').prepend(navPill);
const studyButtons=new Map();
if(comparingNav){
 const study=document.createElement('div'),label=document.createElement('span'),options=document.createElement('div');study.className='nav-study';label.className='nav-study-label';label.textContent='导航方案';options.className='nav-study-options';options.setAttribute('role','group');options.setAttribute('aria-label','导航方案');
 for(const [id,name]of [['1','01 分组'],['2','02 模式'],['3','03 缩略图']]){
  const button=document.createElement('button');button.type='button';button.textContent=name;button.setAttribute('aria-pressed',String(id===navDesign));
  button.addEventListener('click',()=>{navDesign=id;moveSelection();updateURL();});options.append(button);studyButtons.set(id,button);
 }
 study.append(label,options);document.querySelector('header').after(study);
}
function syncNavigation(){
 document.documentElement.dataset.navDesign=navDesign;
 groupSelection.set(active().group,selected);
 for(const [key,section]of sceneGroups)section.hidden=navDesign==='2'&&key!==active().group;
 for(const [key,button]of categoryButtons)button.setAttribute('aria-pressed',String(key===active().group));
 for(const [id,button]of studyButtons)button.setAttribute('aria-pressed',String(id===navDesign));
 for(const [key,button]of sceneButtons){
  button.setAttribute('aria-current',String(key===selected));
  const image=button.querySelector('img');
  if(navDesign==='3'){
   const source=`assets/nav/${key}-${mode}.webp`;
   if(image.getAttribute('src')!==source)image.src=source;
  }
 }
}
syncNavigation();
const scenePicker=$('scene-picker'),sceneMenu=$('mobile-scene-menu'),sceneNav=$('scenes'),desktopAside=document.querySelector('aside'),mobileNav=$('mobile-scene-nav'),mobileMedia=matchMedia('(max-width:760px)');
function closeSceneSheet(){if(sceneMenu.contains(document.activeElement)&&mobileMedia.matches)scenePicker.focus({preventScroll:true});sceneMenu.classList.remove('is-open');sceneMenu.inert=true;sceneMenu.setAttribute('aria-hidden','true');scenePicker.setAttribute('aria-expanded','false');scenePicker.setAttribute('aria-label','选择场景');}
function placeSceneNav(){closeSceneSheet();(mobileMedia.matches?mobileNav:desktopAside).append(sceneNav);requestAnimationFrame(moveSelection);}
scenePicker.addEventListener('click',()=>{const open=scenePicker.getAttribute('aria-expanded')!=='true';sceneMenu.classList.toggle('is-open',open);sceneMenu.inert=!open;sceneMenu.setAttribute('aria-hidden',String(!open));scenePicker.setAttribute('aria-expanded',String(open));scenePicker.setAttribute('aria-label',open?'关闭场景菜单':'选择场景');if(open)requestAnimationFrame(()=>{moveSelection();if(sceneMenu.getBoundingClientRect().top<siteHeader.getBoundingClientRect().bottom)window.scrollTo({top:0,behavior:'instant'});});});
sceneMenu.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSceneSheet();scenePicker.focus({preventScroll:true});}});
scenePicker.addEventListener('keydown',e=>{if(e.key==='Escape')closeSceneSheet();});
mobileMedia.addEventListener('change',placeSceneNav);placeSceneNav();
let transitionFrame=0,activeCover=null,pendingRender=0,renderRevision=0;
function moveSelection(){
 syncNavigation();
 const button=sceneButtons.get(selected),nav=$('scenes');
 if(navDesign!=='1'||!button?.getClientRects().length){navPill.hidden=true;navPill.dataset.ready='false';return;}
 const target=button.getBoundingClientRect(),origin=nav.getBoundingClientRect();
 navPill.style.width=target.width+'px';navPill.style.height=target.height+'px';
 navPill.style.transform=`translate3d(${target.left-origin.left}px,${target.top-origin.top}px,0)`;
 navPill.hidden=false;
 if(navPill.dataset.ready!=='true')requestAnimationFrame(()=>{navPill.dataset.ready='true';});
}
// Pointer and keyboard choices share selected colors; repeated keyboard actions snap immediately.
document.addEventListener('pointerdown',()=>{document.documentElement.dataset.choiceInput='pointer';},true);
document.addEventListener('keydown',event=>{if(['Enter',' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))document.documentElement.dataset.choiceInput='keyboard';},true);
const morphTransportIcon=createTransportIcon(document.querySelector('.junction-motion-icon'));
let junctionTransportState='',junctionProgressPercent=-1;
function syncJunctionTransport(){
 const near=preferences.get('junction').junctionPosition==='near',moving=selected==='junction'&&!!world.cameraMotion,busy=moving||junctionRequested,progress=moving?(world.cameraMotion.progress||0):junctionRequested?0:near?1:0;
 const status=busy?'playing':near?'replay':'ready';
 if(status!==junctionTransportState){junctionTransportState=status;const button=$('junction-play');button.dataset.motionState=status;$('junction-positions').dataset.motionState=status;button.hidden=false;button.disabled=busy;$('junction-playing').hidden=!busy;$('junction-play-label').textContent='播放';button.setAttribute('aria-label','播放接近路口动画');morphTransportIcon(busy);}
 const bar=$('junction-progress');$('junction-positions').style.setProperty('--progress',String(progress));const percent=Math.round(progress*100);if(percent!==junctionProgressPercent){junctionProgressPercent=percent;bar.setAttribute('aria-valuenow',String(percent));bar.setAttribute('aria-valuetext',busy?`已完成 ${percent}%`:near?'已停在路口':'准备接近路口');}
}
function syncJunctionLanes(){
 const junction=selected==='junction';$('junction-lane-control').hidden=!junction;
 if(!junction)return;
 const st=state(),directions={left:'左转',straight:'直行',right:'右转'};
 for(const button of document.querySelectorAll('[data-junction-lane]')){
  const lane=button.dataset.junctionLane;button.textContent=st.id==='08'&&lane==='middle'?'中间左转':directions[junctionDirection(st.id,lane)];button.setAttribute('aria-pressed',lane===st.junctionLane);
 }
}
function syncSelectedControls(){
 const st=selected==='reference'?null:state();if(!st)return;
 for(const b of $('road-controls').querySelectorAll('button'))b.setAttribute('aria-pressed',String(st[b.dataset.road])===b.dataset.value);
 for(const b of $('parking-views').querySelectorAll('button'))b.setAttribute('aria-pressed',b.dataset.view===(selected==='outdoor'?({'17':'10','18':'16','19':'14'}[st.id]):st.id));
 for(const b of $('layout-options').querySelectorAll('button'))b.setAttribute('aria-pressed',b.dataset.layout===st.id);
 for(const b of $('junction-views').querySelectorAll('button'))b.setAttribute('aria-pressed',selected==='junction'&&b.dataset.junctionView===st.cameraView);
 for(const b of $('ramp-views').querySelectorAll('button'))b.setAttribute('aria-pressed',['ramp','elevated'].includes(selected)&&b.dataset.rampView===st.cameraView);
 syncJunctionTransport();syncJunctionLanes();
 updateSegmentIndicators();
}
function revealActiveGroup(){
 const group=active()?.group;if(!group)return;
 const items=$('group-'+group);items.hidden=false;
}
document.querySelector('.wordmark').addEventListener('click',event=>{
 if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
 event.preventDefault();selected='road';window.scrollTo({top:0,behavior:'instant'});requestRender();
});
function requestRender(motion='scene'){
 scenePlayback.reset({render:false});
 ++renderRevision;
 preview.dataset.renderPending='true';syncScenePlayback();

 if($('current-scene-name'))$('current-scene-name').textContent=active().name;
 cancelAnimationFrame(pendingRender);revealActiveGroup();
 for(const [key,b]of sceneButtons)b.setAttribute('aria-current',key===selected);
 moveSelection();syncSelectedControls();
 pendingRender=requestAnimationFrame(()=>{pendingRender=requestAnimationFrame(()=>{const begin=performance.now();render(true,false,motion);preview.dataset.renderMs=(performance.now()-begin).toFixed(1);});});
}

function render(animate=false,themeWipe=false,motion='scene',preservePlayback=false){
 if(vehicleReady&&!parkingModelsReady()){
  preview.dataset.renderPending='true';$('download').disabled=true;$('status').textContent='正在加载旁车模型…';$('status').dataset.parkingLoading='true';syncScenePlayback();
  const egoId=selectedVehicle;
  if(pendingParkingRender?.egoId!==egoId){
   const request=prepareParkingModels(egoId);pendingParkingRender={egoId,request};
   request.then(ready=>{if(!ready||selectedVehicle!==egoId)return;refreshParkedVehicleModels(world);if(needsParkingModels())render(false,false,'element',true);}).catch(error=>{console.error('Nearby vehicles failed to load',error);if(selectedVehicle===egoId&&needsParkingModels()){$('status').textContent='旁车模型加载失败，请关闭后重新开启旁车显示以重试。';preview.dataset.renderPending='false';}}).finally(()=>{if(pendingParkingRender?.request===request)pendingParkingRender=null;});
  }
  return;
 }
 if($('status').dataset.parkingLoading){$('status').replaceChildren();delete $('status').dataset.parkingLoading;}
 if(!preservePlayback)scenePlayback.reset({render:false});
 const revision=++renderRevision;
 if($('current-scene-name'))$('current-scene-name').textContent=active().name;
 cancelAnimationFrame(transitionFrame);
 let cover,previous;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const environmentMotion=animate&&motion==='growth'&&vehicleReady&&!reduced&&document.documentElement.dataset.choiceInput!=='keyboard';
 const structureMotion=animate&&motion==='layout'&&selected==='junction'&&vehicleReady&&!reduced&&document.documentElement.dataset.choiceInput!=='keyboard';
 const layoutMotion=animate&&motion==='layout'&&selected==='road'&&vehicleReady&&!reduced&&document.documentElement.dataset.choiceInput!=='keyboard';
 const cameraMotion=animate&&motion==='camera'&&vehicleReady&&!reduced&&document.documentElement.dataset.choiceInput!=='keyboard';
 if(animate&&vehicleReady&&!reduced&&!cameraMotion&&!environmentMotion&&!layoutMotion&&!structureMotion&&document.documentElement.dataset.choiceInput!=='keyboard'){
  const frame=currentFrame();cover=document.createElement('canvas');cover.width=frame.width;cover.height=frame.height;
  const ctx=cover.getContext('2d');ctx.drawImage(frame,0,0);
  if(activeCover){ctx.globalAlpha=Number(getComputedStyle(activeCover).opacity);ctx.drawImage(activeCover,0,0,cover.width,cover.height);ctx.globalAlpha=1;}
  cover.className='frame-cover';
  if(themeWipe){previous=document.createElement('canvas');previous.width=1920;previous.height=1080;previous.getContext('2d').drawImage(cover,0,0,1920,1080);cover.width=1920;cover.height=1080;ctx.drawImage(previous,0,0);}
 }
 document.querySelectorAll('.frame-cover').forEach(el=>el.remove());activeCover=cover||null;if(cover)preview.append(cover);
 const isReference=selected==='reference',s=active(),st=isReference?null:state();
 if(!isReference){
  const mask=optionIds.slice(0,5).reduce((bits,key,i)=>bits+(st[key]?1<<i:0),0),lanes=selected==='road'?st.laneCount:0,view=['road','ramp','junction','elevated'].includes(selected)?st.cameraView:'low';
  const posterMask=selectedVehicle==='x6'?mask:mask&~8;
  preview.dataset.poster=`assets/startup/states/${st.id}-${lanes}-${view}-${mode}-${posterMask}.webp?v=139`;
  if(!vehicleReady&&!document.documentElement.dataset.cachedPreview)document.documentElement.style.setProperty('--startup-frame',`url("${preview.dataset.poster}")`);
 }
 const deferred=animate&&!cameraMotion&&!environmentMotion&&!layoutMotion&&!structureMotion&&!isReference&&vehicleReady;preview.dataset.renderPending=String(deferred);
 if(isReference)referenceView.render(mode,referenceVehicle);else if(!world.initializingScene&&(vehicleReady||!st.vehicle))world.update({...st,vehicle:vehicleReady&&st.vehicle},{cameraMotion,environmentMotion,layoutMotion,structureMotion,deferRender:deferred});
 $('scene-canvas').hidden=false;$('reference-image').hidden=true;displayedReference=isReference;
 $('reference').setAttribute('aria-current',isReference);
 $('scene-title').textContent=isReference?'视觉参考':s.name;
 $('scene-canvas').setAttribute('aria-label',isReference?`视觉参考，${mode==='dark'?'深色':'浅色'}，宝马车辆`:`${s.name}，${mode==='dark'?'深色':'浅色'}，${optionIds.filter(k=>st[k]).map(k=>({buildings:'建筑',waterfront:'海岸',trees:'树木',vehicle:'车辆',roadworks:'道路施工',parkedCars:'旁车显示'}[k])).join('、')}`);
 document.documentElement.dataset.theme=mode;
 try{localStorage.setItem('sr-theme',mode);}catch{}

 const themeButton=$('theme-toggle');themeButton.setAttribute('aria-pressed',mode==='dark');themeButton.setAttribute('aria-label',`切换为${mode==='dark'?'浅色':'深色'}主题`);themeButton.title=themeButton.getAttribute('aria-label');
 for(const key of environmentIds){const available=!isReference&&!!s[key];$(key).closest('.toggle').hidden=!available;$(key).disabled=!available;$(key).checked=available&&st[key];}
 $('buildings').closest('.environment-control').hidden=!environmentIds.some(key=>!$(key).disabled);
 const parking=!isReference&&s.group==='closed';
 const hasLayouts=!isReference&&!parking&&s.key!=='road'&&s.layouts.length>1;$('layout-control').hidden=!hasLayouts;
 if(hasLayouts){
  $('layout-label').textContent=s.key==='junction'?'路口类型':'匝道类型';
  $('layout').replaceChildren(...s.layouts.map(([id,name])=>new Option(name,id)));$('layout').value=st.id;
  if($('layout-options').dataset.structure!==s.key){$('layout-options').replaceChildren(...s.layouts.map(([id,name])=>{const b=document.createElement('button');b.type='button';b.textContent=name.replace('High-angle ','').replace('crossroads','Crossroads');b.dataset.layout=id;b.addEventListener('click',()=>{preferences.get(selected).id=id;requestRender('layout');});return b;}));$('layout-options').dataset.structure=s.key;}
  for(const b of $('layout-options').querySelectorAll('button'))b.setAttribute('aria-pressed',b.dataset.layout===st.id);
 }

 $('parking-views').hidden=!parking;$('parking-control').hidden=!parking;$('road-controls').hidden=isReference||s.key!=='road';
 const junction=!isReference&&s.key==='junction';
 $('junction-camera-control').hidden=true;
 $('junction-position-control').hidden=!junction;syncJunctionLanes();
 syncJunctionTransport();
 for(const button of $('junction-views').querySelectorAll('button')){button.disabled=!junction;button.setAttribute('aria-pressed',junction&&button.dataset.junctionView===st.cameraView);}
 const ramp=!isReference&&['ramp','elevated'].includes(s.key);
 $('ramp-camera-control').hidden=!ramp;
 for(const button of $('ramp-views').querySelectorAll('button')){button.disabled=!ramp;button.setAttribute('aria-pressed',ramp&&button.dataset.rampView===st.cameraView);}
 for(const b of $('road-controls').querySelectorAll('button'))b.setAttribute('aria-pressed',!isReference&&String(st[b.dataset.road])===b.dataset.value);
 $('camera-control').hidden=!(parking||hasLayouts||ramp);document.querySelector('.toolbar').hidden=!(parking||hasLayouts||ramp);
 for(const button of $('parking-views').querySelectorAll('button'))button.setAttribute('aria-pressed',parking&&button.dataset.view===(s.key==='outdoor'?({'17':'10','18':'16','19':'14'}[st.id]):st.id));
 for(const [key,b]of sceneButtons)b.setAttribute('aria-current',key===selected);
 preview.dataset.mode=mode;preview.setAttribute('aria-busy',String(world.initializingScene||!vehicleReady&&(isReference?referenceVehicle:st.vehicle)));if(!deferred&&(isReference||world.state))preview.dataset.audit=JSON.stringify(isReference?referenceView.audit():world.audit());$('download').disabled=!vehicleFullReady||deferred||vehicleChanging;$('download').title=vehicleFullReady?'下载':'正在准备导出';updateURL();
 vehicleSelector.sync(vehicleReady);preview.dataset.vehicleModel=selectedVehicle;
 syncScenePlayback();
 document.querySelector('.wordmark').href=`./?scene=02&mode=${mode}&lanes=6&view=low`;revealActiveGroup();updateSegmentIndicators();moveSelection();
 const revealFrame=()=>{
 if(revision!==renderRevision)return;
 if(deferred){if(!world.preparedRoots.has(world.root))world.renderPreparedFrame();world.renderFrame();preview.dataset.audit=JSON.stringify(world.audit());preview.dataset.renderPending='false';$('download').disabled=!vehicleFullReady||vehicleChanging;}
 if(cover){
  const finish=()=>{cover.remove();if(activeCover===cover)activeCover=null;};
  if(themeWipe){
   const ctx=cover.getContext('2d'),start=performance.now(),toDark=mode==='dark',band=600;
   const tick=now=>{const t=Math.min(1,(now-start)/480),ease=t*t*(3-2*t),x=toDark?1920+band-(1920+2*band)*ease:-band+(1920+2*band)*ease;
    ctx.clearRect(0,0,1920,1080);ctx.globalCompositeOperation='source-over';ctx.drawImage(previous,0,0);
    ctx.globalCompositeOperation='destination-in';const mask=ctx.createLinearGradient(x-band/2,0,x+band/2,0);mask.addColorStop(0,toDark?'#000':'#0000');mask.addColorStop(1,toDark?'#0000':'#000');ctx.fillStyle=mask;ctx.fillRect(0,0,1920,1080);ctx.globalCompositeOperation='source-over';
    if(t<1)transitionFrame=requestAnimationFrame(tick);else finish();};transitionFrame=requestAnimationFrame(tick);
  }else{const animation=cover.animate([{opacity:1},{opacity:0}],{duration:layoutMotion?160:motion==='element'?240:motion==='layout'?500:220,easing:motion==='layout'&&selected==='ramp'?'cubic-bezier(.4,0,.2,1)':'cubic-bezier(.33,0,.2,1)'});animation.onfinish=finish;}
 }
 };
 // Compile new scene programs without holding the input handler until GPU completion.

 const revealPlayback=()=>{revealFrame();syncScenePlayback();};
 if(deferred){world.prepareScene().then(revealPlayback).catch(error=>{console.error(error);revealPlayback();});}else revealPlayback();
}
function updateSegmentIndicators(){
 for(const group of document.querySelectorAll('.view-segments')){if(group.hidden||group.closest('[hidden]'))continue;const active=group.querySelector('[aria-pressed=true]');if(!active)continue;group.style.setProperty('--selection-x',active.offsetLeft+'px');group.style.setProperty('--selection-width',active.offsetWidth+'px');}
}
let resizeChoicesTimer=0;
function syncChoiceGeometry(){document.documentElement.dataset.resizing='true';clearTimeout(resizeChoicesTimer);resizeChoicesTimer=setTimeout(()=>{delete document.documentElement.dataset.resizing;},120);updateSegmentIndicators();}
const choiceResizeTimers=new WeakMap();
const choiceResizeObserver=new ResizeObserver(entries=>{
 for(const {target:group} of entries){group.dataset.resizing='true';clearTimeout(choiceResizeTimers.get(group));choiceResizeTimers.set(group,setTimeout(()=>{delete group.dataset.resizing;},120));}
 updateSegmentIndicators();
});
for(const group of document.querySelectorAll('.view-segments'))choiceResizeObserver.observe(group);
let resizeFrameTimer=0;
window.addEventListener('resize',()=>{
 syncChoiceGeometry();moveSelection();clearTimeout(resizeFrameTimer);
 // CSS keeps the current frame visible while dragging. Reallocate GPU targets once settled.
 resizeFrameTimer=setTimeout(()=>{
  if(world.suspended||exporting)return;
  const [w,h]=previewResolution();if(world.width===w&&world.height===h)return;
  world.finishLayoutTransition();world.finishCameraMotion();world.finishEnvironmentMotion();world.finishLayoutMotion();
  world.setResolution(w,h);requestRender();
 },120);
});
new ResizeObserver(()=>{moveSelection();}).observe($('scenes'));
for(const b of $('road-controls').querySelectorAll('button'))b.addEventListener('click',()=>{const key=b.dataset.road,value=key==='laneCount'?Number(b.dataset.value):b.dataset.value;if(preferences.get('road')[key]===value)return;preferences.get('road')[key]=value;requestRender(key==='cameraView'?'camera':'layout');});
for(const button of $('ramp-views').querySelectorAll('button'))button.addEventListener('click',()=>{if(preferences.get(selected).cameraView===button.dataset.rampView)return;preferences.get(selected).cameraView=button.dataset.rampView;requestRender('camera');});

for(const button of $('junction-views').querySelectorAll('button'))button.addEventListener('click',()=>{if(preferences.get('junction').cameraView===button.dataset.junctionView)return;preferences.get('junction').cameraView=button.dataset.junctionView;requestRender('camera');});

for(const button of document.querySelectorAll('[data-junction-lane]'))button.addEventListener('click',()=>{
 if(selected!=='junction')return;
 const preference=preferences.get('junction'),lane=button.dataset.junctionLane;
 if(normalizeJunctionLane(preference.id,preference.junctionLanes[preference.id])===lane)return;
 preference.junctionLanes[preference.id]=lane;requestRender('element');
});

$('junction-play').addEventListener('click',()=>{
 if(junctionRequested||world.cameraMotion)return;
 // Settle a type change before resetting the camera for an approach replay.
 world.finishLayoutTransition();
 const preference=preferences.get('junction');
 if(preference.junctionPosition==='near'){
  preference.junctionPosition='approaching';preference.cameraView='low';
  world.update(state());
 }
 junctionRequested=true;preference.junctionPosition='near';preference.cameraView='high';requestRender('camera');
});

let pageTransition=null,requestedTheme=mode,themeAnimation=null,transitionTo=null;
function changeTheme(theme){
 if(requestedTheme===theme)return;
 requestedTheme=theme;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!reduced)playThemeSound(theme==='dark');
 if(pageTransition){
  if(themeAnimation){themeAnimation.updatePlaybackRate(theme===transitionTo?1:-1);themeAnimation.play();}
  return;
 }
 const commit=()=>{mode=theme;render(false);};
 if(!document.startViewTransition||reduced){mode=theme;render(!reduced,true);return;}
 // R14: reveal from the actual theme control, as in the reference.
 const rect=$('theme-toggle').getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
 const feather=140,radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y))+feather;
 const sheet=document.getElementById('theme-wipe-style')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'theme-wipe-style'}));
 sheet.textContent=`::view-transition-old(root){z-index:1;mask:none}::view-transition-new(root){z-index:2;mask-image:radial-gradient(circle at ${x}px ${y}px,#000 max(0px,calc(var(--theme-radius) - ${feather}px)),transparent max(1px,var(--theme-radius)));mask-repeat:no-repeat}`;
 document.documentElement.classList.add('theme-changing');
 transitionTo=theme;
 const transition=document.startViewTransition(commit);pageTransition=transition;
 transition.ready.then(()=>{
  themeAnimation=document.documentElement.animate([{'--theme-radius':'0px'},{'--theme-radius':`${radius}px`}],{duration:400,easing:'cubic-bezier(.65,0,.35,1)',fill:'both',pseudoElement:'::view-transition-new(root)'});
  if(requestedTheme!==transitionTo){themeAnimation.currentTime=0;themeAnimation.reverse();}
  themeAnimation.onfinish=()=>{if(pageTransition===transition&&mode!==requestedTheme){mode=requestedTheme;render(false);}};
 }).catch(()=>{if(mode!==requestedTheme){mode=requestedTheme;render(false);}});
 transition.finished.catch(()=>{}).finally(()=>{if(pageTransition===transition){pageTransition=null;themeAnimation=null;document.documentElement.classList.remove('theme-changing');if(mode!==requestedTheme){mode=requestedTheme;render(false);}}});
}
$('theme-toggle').addEventListener('click',()=>changeTheme(requestedTheme==='dark'?'light':'dark'));
const scenePage=document.querySelector('main'),creditsPage=$('credits-view');let sceneScroll=0;
function showCredits(open,push=false){
 if(open)scenePlayback.pause();
 if(open){sceneScroll=scrollY;closeSceneSheet();}
 scenePage.hidden=open;creditsPage.hidden=!open;siteHeader.classList.toggle('credits-open',open);scenePicker.hidden=open;
 document.title=open?'鸣谢与授权 · 自动驾驶道路场景':'自动驾驶道路场景';
 const target=open?creditsPage:scenePage;
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)target.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.22,1,.36,1)'});
 if(push){const q=new URLSearchParams(location.search);q.set('page','credits');history.pushState({srCredits:true},'',`?${q}`);}
 scrollTo({top:open?0:sceneScroll,behavior:'instant'});
 if(open)$('credits-title').focus({preventScroll:true});else (mobileMedia.matches?scenePicker:document.querySelector('.wordmark')).focus({preventScroll:true});
}

$('credits-back').addEventListener('click',e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();if(history.state?.srCredits)history.back();else{showCredits(false);updateURL();}});
document.querySelector('.wordmark').addEventListener('click',e=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();showCredits(false);selected='road';Object.assign(preferences.get('road'),{id:'02',laneCount:6,cameraView:'low'});requestRender();});
window.addEventListener('popstate',()=>showCredits(new URLSearchParams(location.search).get('page')==='credits'));
for(const key of environmentIds)$(key).addEventListener('change',()=>{for(const preference of preferences.values())preference[key]=$(key).checked;requestRender(key==='parkedCars'?'element':'growth');});
for(const button of $('parking-views').querySelectorAll('button'))button.addEventListener('click',()=>{const id=selected==='outdoor'?({'10':'17','16':'18','14':'19'}[button.dataset.view]):button.dataset.view;if(preferences.get(selected).id===id)return;preferences.get(selected).id=id;requestRender('camera');});
$('layout').addEventListener('change',()=>{preferences.get(selected).id=$('layout').value;requestRender('layout');});
function frameName(){if(selected==='reference')return `waterfront-study-${mode}-1920x1080`;const st=state();return `${selected}-${st.id}${selected==='road'?'-'+st.laneCount+'lanes-'+st.cameraView:selected==='junction'?'-'+st.junctionLane+'-'+st.junctionPosition+'-'+st.cameraView:['ramp','elevated'].includes(selected)?'-'+st.cameraView:''}-${selectedVehicle}-${mode}-${optionIds.map(k=>`${k}-${st[k]?'on':'off'}`).join('-')}`;}
let exporting=false;
const exportControls=initExportControls($('download'),exportAssets);
async function exportAnimation(){
 if(!videoFormat())throw new Error('此浏览器暂不支持视频导出，请使用新版 Chrome、Edge 或 Safari。');
 const original=scenePlayback.snapshot(),wasActive=scenePlayback.active,originalPose=world.captureCamera(),originalRotation=world.car.quaternion.clone(),originalFraming=world.framing;
 const preference=preferences.get(selected),originalPreference={...preference},controller=new AbortController();
 const cancel=()=>controller.abort(new DOMException('已取消动画导出。','AbortError'));
 const onHidden=()=>{if(document.hidden)controller.abort(new DOMException('导出已中断，请保持页面在前台后重试。','AbortError'));};
 document.addEventListener('visibilitychange',onHidden);
 exportControls.showVideoProgress(cancel);
 const canvas=document.createElement('canvas');canvas.width=exportSize.width;canvas.height=exportSize.height;const context=canvas.getContext('2d',{alpha:false});
 const name=frameName();
 try{
  world.setResolution(exportSize.width,exportSize.height);
  let durationMs,sample;
  if(selected==='junction'){
   // Reuse the exact approach/lift choreography shown by the junction Play button.
   Object.assign(preference,{junctionPosition:'approaching',cameraView:'low'});world.update(state());const from=world.captureCamera();
   Object.assign(preference,{junctionPosition:'near',cameraView:'high'});world.update(state());world.startCameraMotion(from);
   const motion=world.cameraMotion;if(!motion)throw new Error('当前路口动画暂不可用，请重试。');
   cancelAnimationFrame(motion.frame);motion.paused=true;durationMs=motion.duration;sample=elapsed=>motion.sample(elapsed);
  }else{
   if(!wasActive&&!scenePlayback.play(selected))throw new Error('当前场景暂不支持演示动画。');
   scenePlayback.pause();durationMs=scenePlayback.snapshot().durationMs;
   sample=elapsed=>{
    if(!scenePlayback.seek(elapsed,{notifyChange:false}))throw new Error('场景发生变化，请重新导出。');
    parkingHmi.sync(selected,{...scenePlayback.snapshot(),status:'playing'});
   };
  }
  const result=await recordCanvasVideo({canvas,durationMs,signal:controller.signal,onProgress:value=>exportControls.updateVideoProgress(value),renderFrame:elapsed=>{
   if(world.suspended)throw new Error('画面渲染已中断，请恢复页面后重试。');
   sample(elapsed);context.drawImage(currentFrame(),0,0,canvas.width,canvas.height);
   // The parking phase title is HTML in the preview, so include it explicitly.
   const pose=scenePlayback.snapshot().parking;
   if(['parking','outdoor'].includes(selected)&&pose){context.fillStyle=mode==='dark'?'#edf4fb':'#202b36';context.font='500 32px "Bahnschrift", "Microsoft YaHei UI", sans-serif';context.textBaseline='top';context.fillText(pose.title,canvas.width*.04,canvas.height*.08);}
  }});
  downloadFile(result.blob,name+'-demo.'+result.extension);exportControls.announce('演示动画已下载。');
 }finally{
  document.removeEventListener('visibilitychange',onHidden);
  if(selected==='junction'){world.stopCameraMotion();Object.assign(preference,originalPreference);world.update(state());}
  world.setResolution(...previewResolution());
  if(wasActive)scenePlayback.seek(original.elapsedMs,{status:original.status});else scenePlayback.reset({render:false});
  world.applyCamera(originalPose);world.car.quaternion.copy(originalRotation);world.framing=originalFraming;
  if(!world.suspended)world.renderFrame();syncScenePlayback();syncSelectedControls();exportControls.hideVideoProgress();
 }
}
async function exportAssets(format='image'){
 if(exporting||!vehicleFullReady||vehicleChanging||world.initializingScene||world.suspended||preview.dataset.renderPending==='true'||!parkingModelsReady())return;
 scenePlayback.pause();exporting=true;syncScenePlayback();exportControls.setBusy(true);exportControls.announce('正在准备导出…');
 const previousSize=[world.width,world.height];let captured;
 try{
  world.finishLayoutTransition();world.finishCameraMotion();world.finishEnvironmentMotion();world.finishLayoutMotion();
  if(format==='video'){await exportAnimation();return;}
  const name=frameName(),exportScene=selected,exportTheme=mode;
  try{
   world.setResolution(exportSize.width,exportSize.height);world.update(state());
   const metadata=cameraMetadata(world,{sceneName:exportScene,sourceUrl:location.href});metadata.scene.vehicleModel=selectedVehicle;metadata.scene.vehicleAttribution={...vehicleSpec(selectedVehicle)};metadata.scene.parkedVehicles=world.state.parkedCars?world.parkedVehicles:[];metadata.scene.parkedVehicleAttributions=[...new Set(metadata.scene.parkedVehicles.map(car=>car.modelId))].map(id=>({...vehicleSpec(id)}));metadata.image.file=format==='kit'?'scene.png':name+'.png';metadata.depth.file=format==='kit'?'depth.png':name+'-depth.png';
   if(scenePlayback.active)metadata.scene.animation=scenePlayback.snapshot();
   if(guidanceScenes.includes(selected))metadata.scene.roadAssist={guidance:roadGuidanceEnabled,color:roadGuidanceColor,lane:roadLaneState(world).index+1,lanesPerDirection:roadLaneState(world).count,laneChange:scenePlayback.snapshot().laneChange};
   const canvas=document.createElement('canvas');canvas.width=exportSize.width;canvas.height=exportSize.height;
   if(format==='image'||format==='kit')canvas.getContext('2d').drawImage(currentFrame(),0,0);
   captured={name,exportScene,exportTheme,canvas,metadata,guide:format==='kit'?perspectiveSvg(world):null,pixels:format==='depth'||format==='kit'?renderDepth(world):null};
  }finally{world.setResolution(...previousSize);render(false,false,'scene',true);}
  const cameraJson=JSON.stringify(captured.metadata,null,2)+'\n';let blob,filename;
  if(format==='camera'){blob=new Blob([cameraJson],{type:'application/json'});filename=captured.name+'-camera.json';}
  else if(format==='depth'){blob=await depthPng(captured.pixels,exportSize.width,exportSize.height);filename=captured.name+'-depth.png';}
  else if(format==='kit'){
   const [image,depth]=await Promise.all([canvasPng(captured.canvas),depthPng(captured.pixels,exportSize.width,exportSize.height)]);
   blob=await zipFiles([['scene.png',image],['camera.json',cameraJson],['depth.png',depth],['perspective.svg',captured.guide],['README.txt',vehicleReadme(exportReadme,captured.metadata.scene.vehicleModel,captured.metadata.scene.parkedVehicleAttributions.map(model=>model.id))]]);filename=captured.name+'-perspective-kit.zip';
  }else{blob=await canvasPng(captured.canvas);filename=captured.name+'.png';}
  downloadFile(blob,filename);
  if(format==='image'||format==='kit')trackPngExport(captured.exportScene,captured.exportTheme);
  exportControls.announce(format==='kit'?'透视套件已下载。':format==='camera'?'相机参数 JSON 已下载。':format==='depth'?'深度图 PNG 已下载。':'PNG 图片已下载。');
 }catch(error){if(error.name!=='AbortError')console.error('Scene export failed',error);exportControls.announce(error.name==='AbortError'?error.message:format==='video'?error.message:'导出失败，请重试。',error.name!=='AbortError');}
 finally{exporting=false;exportControls.setBusy(false);$('download').disabled=!vehicleFullReady||vehicleChanging||world.suspended||preview.dataset.renderPending==='true';syncScenePlayback();}
}

try{render();}catch(e){$('status').textContent='此预览需要 WebGL 支持，请使用新版浏览器打开。';throw e;}

initContinuousCorners({forceFallback:query.has('corner-fallback')});
if(query.get('page')==='credits'){showCredits(true);const q=new URLSearchParams(location.search);q.set('page','credits');history.replaceState(null,'',`?${q}`);}

async function installVehicle(car,full=false,animate=false,retainPrevious=false){
 performance.mark('studio-scene-start');
 if(needsParkingModels()){$('status').textContent='正在加载旁车模型…';await prepareParkingModels(car.userData.vehicleSpec.id);}
 delete preview.dataset.loadError;world.setVehicle(car,{disposePrevious:!retainPrevious});
 // Keep the matching poster visible until the final mesh, shaders and shadow
 // map have produced complete frames. Never reveal the decimated loading car.
 world.initializingScene=true;
 try{let requested;
  do{
   requested=state();await world.prepareInitialScene(requested);
   world.update({...requested,vehicle:true},{deferRender:true});
   try{const cached=JSON.parse(sessionStorage.getItem(previewSnapshotKey)),offset=cached?.viewOffset;if(previewSnapshotSearch(cached?.search)===previewSnapshotSearch(location.search)&&Number.isFinite(offset?.x)&&Number.isFinite(offset?.y)){world.camera.setViewOffset(1920,1080,offset.x,offset.y,1920,1080);world.camera.updateMatrixWorld(true);world.framing={...world.framing,viewOffset:offset,vehicleFrame:vehicleFrame(car,world.camera)};}}catch{}
   performance.measure('studio-scene','studio-scene-start');
   await new Promise(resolve=>setTimeout(resolve,0));
   performance.mark('studio-warm-start');
   await world.prepareScene();world.renderPreparedFrame();
   performance.measure('studio-warm','studio-warm-start');
   await new Promise(requestAnimationFrame);world.renderFrame();
  }while(requested.id!==state().id||requested.laneCount!==state().laneCount);
 }finally{world.initializingScene=false;}
 vehicleReady=true;vehicleFullReady=full;$('status').replaceChildren();render(animate,false,'element');preview.dataset.vehicleReady='true';preview.dataset.vehicleQuality=full?'full':'startup';
 readyVehicles.add(car);
 window.dispatchEvent(new Event('studio:ready'));
 rememberPreview();
}
function failedVehicle(error){console.error(error);window.dispatchEvent(new CustomEvent('studio:error',{detail:{kind:error.code==='asset'?'asset':'startup'}}));}
vehiclePromise.then(({car,error})=>{if(error)throw error;return installVehicle(car,true);}).catch(failedVehicle);
