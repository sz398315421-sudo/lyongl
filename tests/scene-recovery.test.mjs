import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('../docs/original-hero.js',import.meta.url),'utf8'))
  .replace('export async function','async function')
  .replaceAll('import.meta.url',JSON.stringify('https://portfolio.test/original-hero.js'));

function setup(initialState='loading') {
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
  let frame;
  document.createElement=tag=>{const el=new Element();if(tag==='iframe'){frame=el;el.contentWindow={unseenScene:{view:'home',pause(){}}};}return el;};
  const timers=new Map();let nextTimer=0;
  vm.runInNewContext(source,{document,window,URL,Event,console:{warn(){}},location:{origin:'https://portfolio.test'},
    matchMedia:()=>Object.assign(new EventTarget(),{matches:false}),
    IntersectionObserver:class{observe(){}},MutationObserver:class{observe(){}},
    setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
  const status=hero.children[0],retry=status.children[1];
  function message(type,extra={},origin='https://portfolio.test',sender=frame.contentWindow){
    const event=new Event('message');Object.assign(event,{origin,source:sender,data:{type,...extra}});window.dispatchEvent(event);
  }
  return {host,hero,frame,status,retry,cta,timers,message,timeout:()=>document.dispatchEvent(new Event('portfolio:scene-fallback'))};
}

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
  for(const timer of [...s.timers.values()])timer();
  assert.equal(s.retry.hidden,false);assert.equal(s.frame.parent,s.host);
  s.message('unseen:ready');assert.equal(s.host.dataset.sceneState,'ready');
});
test('only the same-origin scene frame can mark the courtyard ready',()=>{
  const s=setup();s.message('unseen:ready',{},'https://other.test');
  s.message('unseen:ready',{},'https://portfolio.test',{});
  assert.equal(s.host.dataset.sceneState,'loading');
});
