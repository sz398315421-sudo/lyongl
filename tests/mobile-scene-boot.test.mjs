import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../docs/unseen-engine/boot.js',import.meta.url),'utf8');

async function boot({mobile=true,assetError=false,search=''}={}){
  class Element extends EventTarget {style={};dataset={};classList={toggle(){},remove(){}};}
  const canvas=new Element(),button=new Element(),cursor=new Element(),document=new Element();
  document.body=new Element();document.querySelector=selector=>selector==='#gl'?canvas:selector==='.scene-cta'?button:cursor;
  const messages=[],limits=[],events=new Map(),times=[];let renders=0,updates=0,glyphsReady=0,ticks=0;
  const o={window:{dpr:3}};
  const n={on:(name,fn)=>events.set(name,fn),off:name=>events.delete(name)};
  class Assets {
    constructor(options={}){
      this.promisesToLoad=options.name==='TextLoader'?[]:[assetError?Promise.reject(new Error('asset failed')):Promise.resolve()];
      this.dracoLoader={setWorkerLimit:value=>limits.push(['draco',value])};
      this.ktxLoader={setWorkerLimit:value=>limits.push(['basis',value])};
    }
    load(){events.get('AssetsProgress')?.({percent:50});return assetError?new Promise(()=>{}):Promise.resolve();}
  }
  class Home {
    constructor(){
      this.homeTextMesh={material:{uniforms:{uOpacity:{},uProgress:{}}}};
      for(const name of ['introText','line1','line2'])this[name]=new class extends EventTarget {
        textRenderInfo=null;
        sync(){Promise.resolve().then(()=>{this.textRenderInfo={};glyphsReady++;this.dispatchEvent(new Event('synccomplete'));});}
      }();
    }
    build(){}enable(){}showUI(){}updateCameraPosition(){}
  }
  const window={globalData:{},applyCourtyardPalette(){}};
  const context={window,document,URLSearchParams,location:{search,origin:'https://portfolio.test'},
    parent:{postMessage:data=>messages.push({...data,renders,updates,glyphsReady})},matchMedia:()=>({matches:mobile}),
    innerWidth:mobile?390:1920,innerHeight:mobile?844:1080,console:{error(){}}};
  // Deliberately provide no requestAnimationFrame. A hidden WebView may never fire it.
  vm.runInNewContext(source,context);
  await window.bootUnseenScene({o,n,c:class{constructor(){o.events={RAF:'RAF'};}},m:class{fire(time){if(!window.__unseenPaused){updates++;times.push(time);}}},tt:Assets,
    Lt:class{clock={getDelta(){}};composer={render(){renders++;}};renderer={getPixelRatio(){return Math.min(2,o.window.dpr);}};addPasses(){}},
    ws:Home,co:class{},l:{ZP:{ticker:{time:0,tick(){ticks++;events.get('RAF')?.(0);},wake(){}}}}});
  return {messages,limits,o,canvas,window,times,get ticks(){return ticks;}};
}

test('the host advances live scene callbacks even when iframe RAF never fires',async()=>{
  const result=await boot(),scene=result.window.unseenScene;
  scene.setHostDriven(true);scene.pause(false);
  const before=result.times.length;
  scene.renderFrame(1);scene.renderFrame(2);
  assert.equal(result.ticks,2);assert.equal(result.times.length,before+2);
  assert.deepEqual(result.times.slice(-2),[1,2]);assert.equal(result.window.__unseenPaused,true);
  assert.equal(result.canvas.dataset.frameCount,'2');
});

test('lost or empty WebGL output cannot pass the live frame verification',async()=>{
  const result=await boot(),scene=result.window.unseenScene;
  result.o.Gl.renderer.getContext=()=>({isContextLost:()=>true});
  assert.throws(()=>scene.renderFrame(1,{validate:true}),/graphics-context-lost/);
  result.o.Gl.renderer.getContext=()=>({isContextLost:()=>false,readPixels(){}});
  assert.throws(()=>scene.renderFrame(2,{validate:true}),/empty-render-frame/);
  assert.equal(result.canvas.dataset.frameCount,undefined);
});

test('a hidden mobile scene becomes ready without waiting for animation frames',async()=>{
  const result=await boot();const ready=result.messages.find(m=>m.type==='unseen:ready');
  assert.ok(ready,JSON.stringify(result.messages));assert.ok(ready.renders>0);assert.ok(ready.updates>=2);assert.equal(ready.glyphsReady,3);
  assert.equal(ready.pixelRatio,1.25);assert.equal(result.canvas.dataset.ready,'true');
  assert.deepEqual(result.limits,[['draco',1],['basis',1]]);
  assert.ok(result.messages.some(m=>m.type==='unseen:progress'&&m.progress>5&&m.progress<95));
});
test('an individual failed asset escapes the original unresolved aggregate promise',async()=>{
  const result=await boot({assetError:true});
  assert.ok(result.messages.some(m=>m.type==='unseen:error'&&m.message.includes('asset failed')));
  assert.ok(!result.messages.some(m=>m.type==='unseen:ready'));
});
test('retry uses a smaller render scale while desktop retains its usual quality',async()=>{
  const low=await boot({mobile:false,search:'?quality=low'});
  assert.equal(low.messages.find(m=>m.type==='unseen:ready').pixelRatio,1);
  const desktop=await boot({mobile:false});assert.equal(desktop.messages.find(m=>m.type==='unseen:ready').pixelRatio,2);
});
