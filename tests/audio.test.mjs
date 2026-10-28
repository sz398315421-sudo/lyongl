import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await readFile(new URL('../docs/welcome.js', import.meta.url), 'utf8');
function fixture() {
  const nodes = new Map(), listeners = new Map(), timers = new Map(), contexts = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {dataset:{sceneState:'ready'},attributes:{},classList:{toggle(){},remove(){},add(){}},
      setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},focus(){},inert:false});
    return nodes.get(id);
  };
  const param = () => ({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(v){this.value=v;}});
  const audioNode = () => ({connect(){},disconnect(){},gain:param(),frequency:param(),threshold:param(),ratio:param(),start(){},stop(){}});
  class Context {
    constructor(){this.state='suspended';this.currentTime=0;this.listeners=[];this.notes=[];contexts.push(this);}
    createGain(){return audioNode();} createBiquadFilter(){return audioNode();} createDynamicsCompressor(){return audioNode();}
    createOscillator(){const n=audioNode();this.notes.push(n);return n;}
    createAnalyser(){return {...audioNode(),getFloatTimeDomainData(a){a.fill(.02);}};}
    addEventListener(_,fn){this.listeners.push(fn);}
    change(state){this.state=state;this.listeners.forEach(fn=>fn());}
    async resume(){if(this.resumeHook)await this.resumeHook();else this.change('running');}
    async suspend(){this.change('suspended');}
  }
  const document = {hidden:false,documentElement:{dataset:{page:'projects'},hasAttribute:()=>true},body:node('body'),
    querySelector:node,addEventListener:(event,fn)=>listeners.set(event,fn)};
  const sandbox={document,window:{AudioContext:Context},location:{hash:'#projects'},matchMedia:()=>({matches:false}),
    Float32Array,Math,clearTimeout:id=>timers.delete(id),setTimeout:fn=>{const id={};timers.set(id,fn);return id;},
    clearInterval(){},setInterval:()=>1};
  runInNewContext(source,sandbox);
  return {nodes,contexts,document,listeners,timers,enable:value=>runInNewContext(`setSound(${value})`,sandbox),button:node('#sound-toggle')};
}

test('a muted entry does not allocate or start audio; enabling schedules a score',async()=>{
  const f=fixture();assert.equal(f.contexts.length,0);
  await f.enable(true);
  assert.equal(f.button.attributes['aria-pressed'],'true');
  assert.equal(f.button.dataset.audioState,'running');
  assert.ok(f.contexts[0].notes.length>=16);
  assert.ok(f.contexts[0].notes.every(note=>note.frequency.value>80&&note.frequency.value<1200));
});
test('muting during an unresolved resume cannot be undone by the stale enable',async()=>{
  const f=fixture();await f.enable(true);const context=f.contexts[0];context.change('suspended');
  let finish;context.resumeHook=()=>new Promise(resolve=>{finish=resolve;});
  const pending=f.enable(true);await f.enable(false);
  context.change('running');finish();await pending;
  assert.equal(f.button.attributes['aria-pressed'],'false');
  for(const fn of [...f.timers.values()])fn();
  assert.equal(context.state,'suspended');
});
test('a blocked or interrupted context is not displayed as playing',async()=>{
  const f=fixture();await f.enable(true);const context=f.contexts[0];
  context.change('interrupted');assert.equal(f.button.attributes['aria-pressed'],'false');
  context.resumeHook=()=>{};await f.enable(true);
  assert.equal(f.button.attributes['aria-pressed'],'false');
  context.resumeHook=null;await f.enable(true);
  assert.equal(f.button.attributes['aria-pressed'],'true');
});
test('visibility pauses playback and restores only an enabled score',async()=>{
  const f=fixture();await f.enable(true);f.document.hidden=true;f.listeners.get('visibilitychange')();
  assert.equal(f.contexts[0].state,'suspended');assert.equal(f.button.attributes['aria-pressed'],'false');
  f.document.hidden=false;f.listeners.get('visibilitychange')();await Promise.resolve();
  assert.equal(f.button.attributes['aria-pressed'],'true');
  await f.enable(false);f.document.hidden=true;f.listeners.get('visibilitychange')();
  f.document.hidden=false;f.listeners.get('visibilitychange')();
  assert.equal(f.button.attributes['aria-pressed'],'false');
});
