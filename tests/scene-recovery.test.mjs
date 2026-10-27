import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../docs/original-hero.js',import.meta.url),'utf8'))
  .replace('export async function','async function')
  .replaceAll('import.meta.url',JSON.stringify('https://portfolio.test/original-hero.js'));

function setup(initialState='loading',{autoVerify=true,reduced=false}={}) {
  class Element extends EventTarget {
    dataset={};attributes=new Map();children=[];hidden=false;
    classList={values:new Set(),add(...values){values.forEach(v=>this.values.add(v));},remove(...values){values.forEach(v=>this.values.delete(v));},contains(v){return this.values.has(v);}};
    setAttribute(k,v){this.attributes.set(k,v);}
    removeAttribute(k){this.attributes.delete(k);if(k==='tabindex')delete this.tabIndex;}
    append(...children){for(const child of children){child.remove();child.parent=this;this.children.push(child);}}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
    querySelector(selector){return this.elements?.[selector];}
  }
  const host=new Element(),hero=new Element(),cta=new Element(),title=new Element();
  host.dataset.sceneState=initialState;
  hero.elements={'.primary-cta':cta,h1:title};
  const document=new Element(),window=new EventTarget();
  document.elements={'#world':host,'.hero':hero};document.documentElement=new Element();
  document.documentElement.dataset.page='home';document.body=new Element();
  document.body.classList.add('intro-pending');
  let frame,failRender=false,draws=0;
  document.createElement=tag=>{const el=new Element();if(tag==='iframe'){frame=el;el.contentWindow={unseenScene:{view:'home',pause(){},setHostDriven(){},renderFrame(){if(failRender)throw new Error('context lost');draws++;return {};}}};}return el;};
  const timers=new Map();let nextTimer=0;
  const frames=new Map();let nextFrame=0,now=0;
  const flushFrames=(count=1)=>{for(let i=0;i<count;i++){const pending=[...frames.values()];frames.clear();now+=16;pending.forEach(fn=>fn(now));}};
  vm.runInNewContext(source,{document,window,URL,Event,CustomEvent,console:{warn(){}},location:{origin:'https://portfolio.test'},
    matchMedia:()=>Object.assign(new EventTarget(),{matches:reduced}),
    requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),
    IntersectionObserver:class{observe(){}},MutationObserver:class{observe(){}},
    setTimeout:(fn,delay)=>{fn.delay=delay;timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
  const status=hero.children[0],retry=status.children[1];
  function message(type,extra={},origin='https://portfolio.test',sender=frame.contentWindow){
    const event=new Event('message');Object.assign(event,{origin,source:sender,data:{type,...extra}});window.dispatchEvent(event);
    if(type==='unseen:ready'&&autoVerify)flushFrames(2);
  }
  return {host,hero,frame,status,retry,cta,timers,message,flushFrames,frames,get draws(){return draws;},failRender(){failRender=true;},
    enter(){document.body.classList.remove('intro-pending');document.dispatchEvent(new Event('portfolio:content'));},
    visibility(hidden){document.hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));},
    timeout:()=>document.dispatchEvent(new Event('portfolio:scene-fallback'))};
}

test('readiness requires two real host frames and rendering continues after Enter',()=>{
  const s=setup('loading',{autoVerify:false});s.message('unseen:ready');
  assert.equal(s.host.dataset.sceneState,'verifying');assert.equal(s.host.dataset.sceneProgress,'99');
  s.flushFrames();assert.equal(s.host.dataset.sceneState,'verifying');
  s.flushFrames();assert.equal(s.host.dataset.sceneState,'ready');assert.equal(s.frames.size,0);
  s.enter();s.flushFrames(8);assert.equal(s.draws,10);assert.equal(s.host.dataset.sceneFrames,'10');
  s.visibility(true);s.flushFrames(4);assert.equal(s.draws,10);
  s.visibility(false);s.flushFrames(3);assert.equal(s.draws,13);
});

test('a failed verification never announces a dynamic scene as ready',()=>{
  const s=setup('loading',{autoVerify:false});s.message('unseen:ready');s.failRender();s.flushFrames();
  assert.equal(s.host.dataset.sceneState,'fallback');assert.equal(s.frame.parent,null);
  assert.notEqual(s.host.dataset.sceneProgress,'100');assert.equal(s.frames.size,0);
});

test('a scene that finishes after entry starts only one rendering loop',()=>{
  const s=setup();s.enter();s.message('unseen:ready');
  assert.equal(s.frames.size,1);s.flushFrames(5);assert.equal(s.draws,7);assert.equal(s.frames.size,1);
});

test('reduced motion explains the pause and offers an explicit play action',()=>{
  const s=setup('loading',{reduced:true});s.message('unseen:ready');s.enter();
  assert.equal(s.frames.size,0);assert.equal(s.status.hidden,false);assert.equal(s.retry.textContent,'播放动画');
  s.retry.dispatchEvent(new Event('click'));s.flushFrames(3);
  assert.equal(s.draws,5);assert.equal(s.status.hidden,true);
});

test('a slow first load retains the iframe and recovers after the welcome timeout',()=>{
  const s=setup();s.timeout();
  assert.equal(s.host.dataset.sceneState,'fallback');assert.equal(s.frame.parent,s.host);
  assert.equal(s.status.hidden,false);
  s.message('unseen:ready');
  assert.equal(s.host.dataset.sceneState,'ready');assert.equal(s.status.hidden,true);
  assert.equal(s.hero.classList.contains('scene-fallback'),false);
});
test('the host still starts if its module arrives after the welcome timeout',()=>{
  const s=setup('fallback');assert.equal(s.frame.parent,s.host);s.message('unseen:ready');
  assert.equal(s.host.dataset.sceneState,'ready');
});
test('a stale timeout cannot regress an already ready scene',()=>{
  const s=setup();s.message('unseen:ready');s.timeout();
  assert.equal(s.host.dataset.sceneState,'ready');assert.equal(s.status.hidden,true);
});
test('a confirmed engine failure offers retry and restores the fallback link',()=>{
  const s=setup();s.message('unseen:ready');s.message('unseen:error',{message:'decoder unavailable'});
  assert.equal(s.frame.parent,null);assert.equal(s.host.dataset.sceneReason,'decoder unavailable');
  assert.equal(s.cta.attributes.has('aria-hidden'),false);
  s.retry.dispatchEvent(new Event('click'));assert.equal(s.frame.parent,s.host);
  s.message('unseen:ready');assert.equal(s.host.dataset.sceneState,'ready');assert.equal(s.timers.size,0);
});
test('retry remains available if another download stalls',()=>{
  const s=setup();s.timeout();s.retry.dispatchEvent(new Event('click'));
  for(const timer of [...s.timers.values()].filter(timer=>timer.delay===20000))timer();
  assert.equal(s.retry.hidden,false);assert.equal(s.frame.parent,s.host);
  s.message('unseen:ready');assert.equal(s.host.dataset.sceneState,'ready');
});
test('a stalled attempt ends in static mode instead of promising to load forever',()=>{
  const s=setup();s.timeout();
  const deadline=[...s.timers.values()].find(timer=>timer.delay===45000);assert.ok(deadline);deadline();
  assert.equal(s.host.dataset.sceneLoading,'false');assert.equal(s.frame.parent,null);
  assert.equal(s.host.dataset.sceneReason,'load-timeout');
  assert.equal(s.status.children[0].textContent,'当前为静态首页。');assert.equal(s.retry.hidden,false);
  s.retry.dispatchEvent(new Event('click'));assert.equal(s.frame.parent,s.host);
  assert.equal(new URL(s.frame.src).searchParams.get('quality'),'low');
  s.message('unseen:ready');assert.equal(s.host.dataset.sceneState,'ready');assert.equal(s.timers.size,0);
});
test('genuine scene progress is monotonic and completion clears every deadline',()=>{
  const s=setup();s.message('unseen:progress',{progress:42,stage:'assets'});assert.equal(s.host.dataset.sceneProgress,'42');
  s.message('unseen:progress',{progress:10,stage:'assets'});assert.equal(s.host.dataset.sceneProgress,'42');
  s.message('unseen:ready');assert.equal(s.host.dataset.sceneProgress,'100');assert.equal(s.timers.size,0);
});
test('only the same-origin scene frame can mark the courtyard ready',()=>{
  const s=setup();s.message('unseen:ready',{},'https://other.test');
  s.message('unseen:ready',{},'https://portfolio.test',{});
  assert.equal(s.host.dataset.sceneState,'loading');
});
