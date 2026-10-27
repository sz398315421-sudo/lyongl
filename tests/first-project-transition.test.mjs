import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const startup=(await readFile(new URL('../docs/scene-start.js',import.meta.url),'utf8'))
  .replace(/import\('\.\/water\.js[^']*'\)/g,'loadWater()')
  .replace(/import\('\.\/original-hero\.js[^']*'\)/g,'Promise.resolve()')
  .replace(/import\('\.\/project-ocean\.js[^']*'\)/g,'Promise.resolve()');
const controller=await readFile(new URL('../docs/app-controller.js',import.meta.url),'utf8');
const navigation=controller.slice(controller.indexOf('async function navigate('),controller.indexOf("document.addEventListener('click'"));

function setup({failure=false}={}){
  const sequence=[],status=[];let imports=0,release;
  class Element extends EventTarget {
    dataset={};classList={add(){}};
    setAttribute(){}append(el){status.push(el);}remove(){status.splice(status.indexOf(this),1);}
  }
  const document=new Element(),window={};
  document.documentElement=new Element();document.documentElement.dataset.page='home';document.body=new Element();
  document.querySelector=()=>new Element();document.createElement=()=>new Element();
  const pending=new Promise((resolve,reject)=>{release=()=>{
    if(failure){reject(new Error('network unavailable'));return;}
    window.portfolioWater={async dive(change){sequence.push('animate');change();}};resolve();
  };});
  const context=vm.createContext({document,window,Event,console:{warn(){}},matchMedia:()=>({matches:true}),
    loadWater(){imports++;return pending;},URL,location:{href:'https://portfolio.test/'},
    navigating:false,pendingHistory:null,workScroll:0,page:()=>document.documentElement.dataset.page,
    history:{pushState(){sequence.push('route');}},applyRoute(){document.documentElement.dataset.page='projects';document.dispatchEvent(new Event('portfolio:content'));},
    transitionRoutes:Promise.resolve({viewFor:()=> 'projects',transitionFor:()=> 'water'})});
  vm.runInContext(startup+'\n'+navigation,context);
  return {document,window,sequence,status,release,get imports(){return imports;},navigate:()=>vm.runInContext("navigate('/projects/')",context)};
}

test('mobile home remains lazy, but the first navigation waits for animation before changing routes',async()=>{
  const s=setup();s.document.dispatchEvent(new Event('portfolio:scene-settled'));
  assert.equal(s.imports,0);
  const navigation=s.navigate();await new Promise(setImmediate);
  assert.equal(s.imports,1);assert.equal(s.document.documentElement.dataset.page,'home');
  assert.deepEqual(s.sequence,[]);assert.equal(s.status.length,1);
  await s.navigate();assert.equal(s.imports,1);
  s.release();await navigation;
  assert.deepEqual(s.sequence,['animate','route']);assert.equal(s.status.length,0);
  await s.navigate();assert.equal(s.imports,1);assert.deepEqual(s.sequence,['animate','route','animate','route']);
});

test('a failed first download clears preparation and still opens the native gallery',async()=>{
  const s=setup({failure:true}),navigation=s.navigate();await new Promise(setImmediate);s.release();await navigation;
  assert.deepEqual(s.sequence,['route']);assert.equal(s.status.length,0);
});
