import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {homeImmersionProfile,immersionEase} from '../docs/home-return-motion.js';

test('tall screens retain at least 20% of the real camera clearance',()=>{
  for(const height of [390,720,1080,1271,2160,4320])for(const clearance of [.006,.0224,.08]){
    const {offset}=homeImmersionProfile({viewportHeight:height,clearance,returning:true});
    assert.ok(clearance+offset>=clearance*.2-Number.EPSILON);
  }
  assert.equal(homeImmersionProfile({viewportHeight:1271,clearance:.0224}).offset,
    homeImmersionProfile({viewportHeight:4320,clearance:.0224}).offset);
});

test('the return starts moving promptly and does not spend a second in an exponential tail',()=>{
  const profile=homeImmersionProfile({viewportHeight:1271,clearance:.0224,returning:true});
  assert.equal(profile.duration,2.4);assert.equal(profile.ease,'power2.inOut');
  assert.ok(immersionEase(.25,true)>.05);assert.ok(immersionEase(.75,true)<.95);
  assert.equal(immersionEase(0,true),0);assert.equal(immersionEase(1,true),1);
});

test('the original entry timing and easing remain unchanged',()=>{
  const profile=homeImmersionProfile({viewportHeight:720,clearance:.1});
  assert.equal(profile.duration,3);assert.equal(profile.ease,'power4.inOut');
  assert.equal(immersionEase(.25,false),.015625);
});

test('the actual scene adapter updates tiny offsets without GSAP rounding them into plateaus',async()=>{
  const source=await readFile(new URL('../docs/unseen-engine/boot.js',import.meta.url),'utf8');
  const start=source.indexOf('projectsTransition('),end=source.indexOf('get view()',start);
  const method=source.slice(start,end).trim().replace(/,$/,'');
  let options,timeline;const samples=[],positions=[];
  const home={tweenParams:{cameraYOffset:0},updateCameraPosition(){positions.push(this.tweenParams.cameraYOffset);}};
  const ctx={o:{HomeContact:home,Gl:{clock:{getDelta(){}}}},innerHeight:1271,sceneTimeOffset:0,
    l:{ZP:{ticker:{time:0},timeline(input){options=input;timeline={fromTo(){return this;},time(){return 0;}};return timeline;}}},
    renderTransitionFrame:()=>home.tweenParams.cameraYOffset};
  const adapter=vm.runInNewContext('({'+method+'})',ctx),state={progress:1};
  const offset=-.01792;
  adapter.projectsTransition(state,value=>samples.push(value),{returning:true,surfaceOffset:offset,
    runTimeline(){for(const p of [1,.9999,.9998,.9997,0]){state.progress=p;options.onUpdate();}}});
  assert.equal(samples.length,5);
  for(let i=1;i<4;i++)assert.ok(samples[i]>samples[i-1]);
  assert.equal(samples[1],offset*.9999);assert.equal(Math.abs(samples.at(-1)),0);
  assert.equal(positions.length,5);
});
