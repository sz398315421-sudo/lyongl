import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../docs/device-parallax.js',import.meta.url),'utf8');

function setup({permission,coarse=true,reduced=false,secure=true,sensor=true,intro=false,motion=false,generic=false,preGranted=false}={}){
  class Element extends EventTarget {
    dataset={};hidden=false;attributes=new Map();children=[];
    classList={values:new Set(intro?['intro-pending']:[]),contains(value){return this.values.has(value);}};
    setAttribute(name,value){this.attributes.set(name,value);}
    append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(item=>item!==child);this.children.push(child);child.parentElement=this;}
  }
  const window=new EventTarget(),document=new Element(),root=new Element(),shell=new Element(),welcome=new Element();
  const media=[Object.assign(new EventTarget(),{matches:coarse}),Object.assign(new EventTarget(),{matches:reduced})];
  root.dataset.page='home';document.documentElement=root;document.body=new Element();
  document.querySelector=selector=>selector==='#welcome'?welcome:shell;document.createElement=()=>new Element();
  let requests=0,subscriptions=0,clock=0;const observers=[],timers=new Map();
  const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
  window.addEventListener=(name,fn,...args)=>{if(name==='deviceorientation')subscriptions++;add(name,fn,...args);};
  window.removeEventListener=(name,fn)=>{if(name==='deviceorientation')subscriptions--;remove(name,fn);};
  window.isSecureContext=secure;window.screen={orientation:Object.assign(new EventTarget(),{angle:0})};
  window.performance={now:()=>clock};
  if(preGranted)window.navigator={permissions:{query:async()=>({state:'granted'})}};
  const nativeSensors=[];
  if(generic)window.Accelerometer=class extends EventTarget {
    constructor(){super();nativeSensors.push(this);}
    start(){this.running=true;}stop(){this.running=false;}
  };
  if(sensor){window.DeviceOrientationEvent={};if(permission)window.DeviceOrientationEvent.requestPermission=()=>{requests++;return permission();};}
  if(motion)window.DeviceMotionEvent={};
  vm.runInNewContext(source,{window,document,CustomEvent,Math,Number,Promise,setTimeout:(fn,delay)=>{const id={};timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    matchMedia:query=>media[query.includes('reduced')?1:0],
    MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}}});
  function sync(){observers.forEach(fn=>fn());}
  function orient(beta,gamma){const e=new Event('deviceorientation');Object.assign(e,{beta,gamma});window.dispatchEvent(e);}
  function gravity(x,y,z){const e=new Event('devicemotion');e.accelerationIncludingGravity={x,y,z};window.dispatchEvent(e);}
  return {window,document,root,media,shell,welcome,button:shell.children[0]||welcome.children[0],state:window.portfolioMotion,sync,orient,
    gravity,nativeSensors,advance(ms){clock+=ms;},signalTimeout(){for(const {fn,delay} of [...timers.values()])if(delay===4000)fn();},
    startNative(){for(const {fn,delay} of [...timers.values()])if(delay===1000)fn();},
    get requests(){return requests;},get subscriptions(){return subscriptions;}};
}

test('Android with requestPermission APIs starts automatically when site sensor permission is already granted',async()=>{
  const s=setup({permission:()=>Promise.resolve('granted'),preGranted:true,intro:true});
  assert.equal(s.subscriptions,0);await new Promise(setImmediate);
  assert.equal(s.requests,0);assert.equal(s.subscriptions,1);
  s.orient(45,0);assert.equal(s.button.dataset.sensorState,'connected');
});

test('native accelerometer fallback works without legacy events and stops while hidden',()=>{
  const s=setup({sensor:false,generic:true,intro:true});s.startNative();
  const native=s.nativeSensors[0];assert.equal(native.running,true);
  Object.assign(native,{x:0,y:6.93,z:6.93});native.dispatchEvent(new Event('reading'));
  Object.assign(native,{x:-3,y:8,z:5});for(let i=0;i<30;i++)native.dispatchEvent(new Event('reading'));
  assert.equal(s.state.source,'gravity');assert.ok(s.state.x>0&&s.state.y>0);
  s.document.hidden=true;s.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(native.running,false);assert.equal(s.state.active,false);
});

test('Android uses gravity readings without a gyro or permission prompt and reports a real connection',()=>{
  const s=setup({sensor:false,motion:true,intro:true});assert.equal(s.requests,0);
  assert.equal(s.button.dataset.sensorState,'waiting');assert.doesNotMatch(s.button.textContent,/已连接/);
  s.gravity(null,null,null);s.signalTimeout();assert.equal(s.button.dataset.sensorState,'unavailable');
  s.gravity(0,6.93,6.93);assert.equal(s.state.source,'gravity');assert.equal(s.state.x,0);
  for(let i=0;i<30;i++)s.gravity(-3,8,5);
  assert.ok(s.state.x>0&&s.state.y>0);assert.equal(s.button.dataset.sensorState,'connected');
  assert.match(s.button.textContent,/已连接/);s.button.dispatchEvent(new Event('click'));
  assert.equal(s.state.active,false);assert.equal(s.button.dataset.sensorState,'off');
});

test('unavailable direction data falls back to gravity and valid direction readings take priority',()=>{
  const s=setup({motion:true});s.orient(null,null);s.gravity(0,0,9.81);s.gravity(-2,2,9);
  assert.equal(s.state.source,'gravity');s.orient(45,0);s.orient(55,15);
  const x=s.state.x;s.gravity(8,0,6);assert.equal(s.state.source,'orientation');assert.equal(s.state.x,x);
  s.advance(800);s.gravity(0,0,9.81);assert.equal(s.state.source,'gravity');assert.equal(s.state.x,0);
});

test('a silent sensor is never labeled connected and retry restarts a single listener',async()=>{
  const s=setup();assert.equal(s.button.dataset.sensorState,'waiting');s.signalTimeout();
  assert.equal(s.button.dataset.sensorState,'unavailable');assert.match(s.button.textContent,/点击重试/);
  s.button.dispatchEvent(new Event('click'));await new Promise(setImmediate);
  assert.equal(s.subscriptions,1);assert.equal(s.button.dataset.sensorState,'waiting');
  s.orient(45,0);assert.equal(s.button.dataset.sensorState,'connected');
});

test('calibrates against the held pose, ignores invalid readings and clamps large tilts',()=>{
  const s=setup();assert.equal(s.subscriptions,1);
  s.orient(null,null);assert.equal(s.state.active,false);
  s.orient(45,12);assert.equal(s.state.x,0);assert.equal(s.state.y,0);
  s.orient(45.2,12.3);assert.equal(s.state.x,0);assert.equal(s.state.y,0);
  s.orient(60,24);assert.ok(s.state.x>0&&s.state.x<1);assert.ok(s.state.y>0&&s.state.y<1);
  s.orient(170,-80);assert.equal(s.state.x,-1);assert.equal(s.state.y,1);
  for(let i=0;i<10;i++)s.sync();assert.equal(s.subscriptions,1);
});

test('iOS asks only on click and can be disabled and enabled without duplicate listeners',async()=>{
  const s=setup({permission:()=>Promise.resolve('granted')});assert.equal(s.requests,0);assert.equal(s.subscriptions,0);
  s.button.dispatchEvent(new Event('click'));assert.equal(s.requests,1);await new Promise(setImmediate);
  assert.equal(s.subscriptions,1);assert.equal(s.button.attributes.get('aria-pressed'),'true');
  s.orient(45,0);s.orient(55,12);assert.ok(s.state.active);
  s.button.dispatchEvent(new Event('click'));assert.equal(s.subscriptions,0);assert.equal(s.state.active,false);
  s.button.dispatchEvent(new Event('click'));await new Promise(setImmediate);assert.equal(s.subscriptions,1);
});

test('denied or failed permission keeps navigation usable and sensor stopped',async()=>{
  for(const permission of [()=>Promise.resolve('denied'),()=>Promise.reject(new Error('blocked'))]){
    const s=setup({permission});s.button.dispatchEvent(new Event('click'));await new Promise(setImmediate);
    assert.equal(s.subscriptions,0);assert.equal(s.state.active,false);assert.equal(s.button.disabled,false);
    assert.match(s.button.textContent,/点击重试/);
  }
});

test('welcome samples tilt before entry and hands the same permission and button to the scene',()=>{
  const s=setup({intro:true});assert.equal(s.button.hidden,false);assert.equal(s.subscriptions,1);
  assert.equal(s.button.parentElement,s.welcome);assert.equal(s.button.dataset.welcome,'true');
  s.orient(45,0);s.orient(50,12);assert.ok(s.state.x>0);
  s.document.body.classList.values.clear();s.sync();
  assert.equal(s.button.parentElement,s.shell);assert.equal(s.welcome.children.length,0);
  assert.equal(s.subscriptions,1);s.orient(50,12);assert.equal(s.state.x,0);
});

test('menus, hidden pages, reduced motion and other routes stop sampling and recalibrate',()=>{
  const s=setup();s.orient(45,0);s.orient(50,12);
  assert.ok(s.state.x>0);
  for(const name of ['locked','diving','ascending','descending','studio-travel']){
    s.document.body.classList.values.add(name);s.sync();assert.equal(s.subscriptions,0);assert.equal(s.state.active,false);
    s.document.body.classList.values.delete(name);s.sync();s.orient(60,15);assert.equal(s.state.x,0);
  }
  s.document.hidden=true;s.document.dispatchEvent(new Event('visibilitychange'));assert.equal(s.subscriptions,0);
  s.document.hidden=false;s.document.dispatchEvent(new Event('visibilitychange'));assert.equal(s.subscriptions,1);
  s.media[1].matches=true;s.media[1].dispatchEvent(new Event('change'));assert.equal(s.subscriptions,0);
  s.media[1].matches=false;s.media[1].dispatchEvent(new Event('change'));assert.equal(s.subscriptions,1);
  s.root.dataset.page='projects';s.sync();assert.equal(s.subscriptions,0);assert.equal(s.button.hidden,true);
  s.root.dataset.page='explore';s.sync();assert.equal(s.subscriptions,1);
});

test('screen rotation recalibrates then maps movement into landscape axes',()=>{
  const s=setup();s.orient(45,10);s.orient(55,20);
  s.window.screen.orientation.angle=90;s.window.screen.orientation.dispatchEvent(new Event('change'));
  s.orient(45,10);assert.equal(s.state.x,0);assert.equal(s.state.y,0);
  s.orient(56,10);assert.ok(s.state.x>0);assert.ok(Math.abs(s.state.y)<.001);
  s.orient(45,21);assert.ok(s.state.y<0);assert.ok(Math.abs(s.state.x)<.001);
});

test('desktop, missing API and insecure contexts retain their existing interaction',()=>{
  for(const options of [{coarse:false},{sensor:false},{secure:false}]){
    const s=setup(options);assert.equal(s.button,undefined);assert.equal(s.subscriptions,0);assert.equal(s.state.active,false);
  }
});
