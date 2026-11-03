import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await readFile(new URL('../docs/access-control.js', import.meta.url), 'utf8');
function fixture(route, {stored = false, storageBlocked = false} = {}) {
  const events = {}, windowEvents = {}, fields = {};
  const root = {dataset: {}};
  const nodes = {};
  const node = id => nodes[id] ??= {hidden:false,open:id==='access-gate',value:'',textContent:'',attributes:{},
    addEventListener(type, fn) { fields[`${id}:${type}`] = fn; },
    matches() { return this.modal; }, close() { this.open = this.modal = false; },
    showModal() { this.open = this.modal = true; }, focus() {}, select() {},
    setAttribute(k,v) { this.attributes[k]=v; }, removeAttribute(k) { delete this.attributes[k]; }};
  let ready = false, session = stored ? 'granted' : null;
  const location = new URL(route, 'https://lyongl.xyz');
  const document = {documentElement:root,
    getElementById:id => ready ? node(id) : null,
    addEventListener:(type,fn)=>events[type]=fn,
    dispatchEvent:event=>events[event.type]?.(event)};
  const window = {addEventListener:(type,fn)=>windowEvents[type]=fn};
  const sessionStorage = {getItem() { if(storageBlocked)throw Error(); return session; },
    setItem(_,value) { if(storageBlocked)throw Error(); session=value; }};
  runInNewContext(source, {document,window,location,sessionStorage,URL,Event});
  ready = true; events.DOMContentLoaded();
  return {root,window,location,node,events,windowEvents,
    submit(value) { node('access-password').value=value;fields['access-form:submit']({preventDefault(){}}); }};
}

test('only exploration and its experiment trees are public', () => {
  for (const route of ['/explore/','/explore','/explore/index.html','/#explore','/index.html#explore','/adas/','/adas/privacy.html',
    '/adas/vehicle-library/','/luyoupu/','/danmugame/','/game-demo2/','/xszw','/xszw/','/xszw/index.html']) {
    const f=fixture(route);assert.equal(f.root.dataset.access,'open',route);assert.equal(f.node('access-gate').hidden,true);
  }
  for (const route of ['/','/#home','/#about','/#work','/#project/hongqi','/about/','/projects/',
    '/projects/hongqi/','/projects/hongqi/#explore','/explore-private/','/explore/private/','/adas-private/','/xszw-private/','/unseen-engine/']) {
    const f=fixture(route);assert.equal(f.root.dataset.access,'locked',route);assert.equal(f.node('access-gate').modal,true);
  }
});

test('wrong or empty passwords stay locked; correct password unlocks the original deep link', () => {
  const f=fixture('/projects/hongqi/');let notified=false;f.events['portfolio:unlocked']=()=>notified=true;
  for (const value of ['', '1234','666','66666',' 6666']) {
    f.submit(value);assert.equal(f.root.dataset.access,'locked');assert.ok(f.node('access-error').textContent);
  }
  f.submit('6666');assert.equal(f.root.dataset.access,'open');assert.equal(f.node('access-gate').open,false);
  assert.equal(f.location.pathname,'/projects/hongqi/');assert.equal(notified,true);
  assert.equal(f.node('access-password').value,'');
});

test('session unlock survives reload; storage denial still permits this document to unlock', () => {
  assert.equal(fixture('/about/',{stored:true}).root.dataset.access,'open');
  const f=fixture('/',{storageBlocked:true});f.submit('6666');assert.equal(f.root.dataset.access,'open');
  assert.equal(f.window.portfolioAccess.canView('/projects/'),true);
});

test('switching from public hashes back to private routes locks again without granting access', () => {
  const f=fixture('/#explore');f.location.hash='#about';f.windowEvents.hashchange();
  assert.equal(f.root.dataset.access,'locked');
  f.location.hash='#explore';f.windowEvents.hashchange();assert.equal(f.root.dataset.access,'open');
  assert.equal(f.window.portfolioAccess.canView('/about/'),false);
});

test('courtyard frame responds when the parent unlocks the shared tab session', () => {
  const f=fixture('/unseen-engine/');f.windowEvents.storage({key:'yongle:portfolio-access:v1',newValue:'granted'});
  assert.equal(f.root.dataset.access,'open');assert.equal(f.node('access-gate').open,false);
});

test('every portfolio document locks before other scripts; public products are untouched', async () => {
  const root=new URL('../docs/',import.meta.url);
  const projects=await readdir(new URL('projects/',root),{withFileTypes:true});
  for (const route of ['index.html','about/index.html','explore/index.html','projects/index.html','unseen-engine/index.html',
    ...projects.filter(p=>p.isDirectory()).map(p=>`projects/${p.name}/index.html`)]) {
    const html=await readFile(new URL(route,root),'utf8');
    assert.match(html,/<html[^>]+data-access="locked"/);
    assert.equal((html.match(/id="access-gate"/g)||[]).length,1,route);
    assert.ok(html.indexOf('/access-control.js?')<html.indexOf('</head>'));
  }
  for (const route of ['adas/index.html','adas/privacy.html','luyoupu/index.html','danmugame/index.html','game-demo2/index.html','xszw/index.html']) {
    assert.doesNotMatch(await readFile(new URL(route,root),'utf8'),/access-control|access-gate/);
  }
});
