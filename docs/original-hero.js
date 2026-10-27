// Host the original renderer in its own document so its Three.js/GSAP runtime
// and event system cannot interfere with the portfolio gallery.
const host = document.querySelector('#world');
const hero = document.querySelector('.hero');
const frame = document.createElement('iframe');
frame.className = 'original-scene';
frame.title = '互动庭院：移动鼠标探索空间，触碰水面与文字';
frame.src = new URL(document.documentElement.dataset.page==='about'?'./unseen-engine/?view=contact&v=20261027-mobile-loading':'./unseen-engine/?v=20261027-mobile-loading', import.meta.url).href;
frame.setAttribute('allow', 'autoplay');
host.removeAttribute('aria-hidden');
let ready = false, inView = true, diving = false, travelling = false, abandoned = false;
const status = document.createElement('div');
status.className = 'scene-status';status.hidden = true;
const statusCopy = document.createElement('span');statusCopy.setAttribute('role','status');
const retry = document.createElement('button');retry.type = 'button';retry.textContent = '重试动态场景';
let retryTimeout,attemptTimeout;
function reportProgress(value,stage='assets') {
  const progress=Math.max(Number(host.dataset.sceneProgress)||0,Math.min(100,Math.max(0,Number(value)||0)));
  host.dataset.sceneProgress=String(progress);host.dataset.scenePhase=stage;
  document.dispatchEvent(new CustomEvent('portfolio:scene-progress',{detail:{progress,stage}}));
}
function clearDeadlines(){clearTimeout(retryTimeout);clearTimeout(attemptTimeout);}
function startDeadlines(){
  clearDeadlines();
  retryTimeout=setTimeout(()=>useFallback(),20000);
  attemptTimeout=setTimeout(()=>useFallback({permanent:true,reason:'load-timeout'}),45000);
}
status.append(statusCopy,retry);hero.append(status);
if (host.dataset.sceneState !== 'fallback') host.dataset.sceneState = 'loading';
host.dataset.sceneLoading = 'true';host.append(frame);
host.dataset.sceneProgress='0';startDeadlines();
retry.addEventListener('click', () => {
  clearDeadlines();frame.remove();
  abandoned = false;ready = false;host.dataset.sceneLoading = 'true';
  host.dataset.sceneReason = 'retry';
  statusCopy.textContent = '正在重新加载动态场景…';retry.hidden = true;
  host.dataset.sceneProgress='0';reportProgress(0,'scripts');
  const url=new URL(frame.src);url.searchParams.set('quality','low');frame.src=url.href;host.append(frame);
  startDeadlines();
});
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function engine() { return ready ? frame.contentWindow?.unseenScene : null; }
export async function prepareCourtyardView(view='home') {
  if(!ready&&!abandoned){
    await new Promise(resolve=>{
      const finish=()=>{clearTimeout(timeout);document.removeEventListener('portfolio:scene-settled',finish);resolve();};
      const timeout=setTimeout(()=>{useFallback();finish();},12000);
      document.addEventListener('portfolio:scene-settled',finish);
    });
  }
  const scene=engine();
  if(scene){await scene.setView(view,{instant:true});scene.pause(true);}
  return scene;
}
function sync() {
  const view=document.documentElement.dataset.page;
  const sceneVisible=['home','about'].includes(view);
  if(ready&&sceneVisible&&!travelling&&engine()?.view!==view)engine()?.setView(view,{instant:true});
  const paused = (!inView&&!travelling) || document.hidden || document.body.classList.contains('intro-pending') || document.body.classList.contains('locked') || !sceneVisible || reduced.matches || diving;
  engine()?.pause(paused);
  if (ready && !document.body.classList.contains('intro-pending') && document.activeElement === hero.querySelector('.primary-cta')) {
    const title = hero.querySelector('h1'); title.tabIndex = -1; title.focus({ preventScroll: true });
  }
}
window.portfolioCourtyard={
  get busy(){return travelling;},
  async travel(change,{to}){
    if(travelling)return false;
    if(!ready||reduced.matches){change();engine()?.setView(to,{instant:true});return true;}
    travelling=true;document.body.classList.add('studio-travel');
    try{change();engine().pause(false);await engine().setView(to);}
    finally{travelling=false;document.body.classList.remove('studio-travel');sync();}
    return true;
  }
};
function useFallback({ permanent = false, reason = 'timeout' } = {}) {
  // A slow download can still finish; only a confirmed failure removes it.
  if (ready && !permanent) return;
  clearTimeout(retryTimeout);if(permanent)clearTimeout(attemptTimeout);
  abandoned = permanent;ready = false;if(permanent)frame.remove();host.classList.remove('ready');
  host.dataset.sceneState = 'fallback';hero.classList.remove('original-engine-ready');hero.classList.add('scene-fallback');
  const cta = hero.querySelector('.primary-cta');cta.removeAttribute('tabindex');cta.removeAttribute('aria-hidden');
  host.dataset.sceneLoading = String(!permanent);host.dataset.sceneReason = reason;
  status.hidden = false;retry.hidden = false;
  statusCopy.textContent = permanent ? '当前为静态首页。' : '动态场景加载较慢，正在继续尝试…';
  document.dispatchEvent(new Event('portfolio:scene-settled'));
}
document.addEventListener('portfolio:scene-fallback', () => useFallback());
frame.addEventListener('error', () => useFallback({permanent:true,reason:'frame-error'}));
window.addEventListener('message', event => {
  if (abandoned || event.origin !== location.origin || event.source !== frame.contentWindow) return;
  if (event.data?.type === 'unseen:ready') {
    ready = true; host.classList.add('ready'); host.dataset.scene = 'unseen-original';
    clearDeadlines();reportProgress(100,'ready');
    host.dataset.sceneLoading = 'false';delete host.dataset.sceneReason;
    status.hidden = true;hero.classList.remove('scene-fallback');
    hero.classList.add('original-engine-ready');
    const cta = hero.querySelector('.primary-cta'); cta.tabIndex = -1; cta.setAttribute('aria-hidden', 'true');
    host.dataset.sceneState = 'ready';sync();
    if(Number.isFinite(event.data.pixelRatio))host.dataset.scenePixelRatio=String(event.data.pixelRatio);
    document.dispatchEvent(new Event('portfolio:scene-settled'));
  } else if (event.data?.type === 'unseen:progress') {
    reportProgress(event.data.progress,event.data.stage);
  } else if (event.data?.type === 'unseen:projects') {
    hero.querySelector('.primary-cta').click();
  } else if (event.data?.type === 'unseen:error') {
    useFallback({permanent:true,reason:String(event.data.message || 'engine-error')});
    console.warn('The static courtyard remains available.', event.data.message);
  }
});
// The welcome timeout can elapse before this module arrives over the network.
if(host.dataset.sceneState === 'fallback')useFallback();
new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }).observe(hero);
new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-page'] });
document.addEventListener('visibilitychange', sync);
document.addEventListener('portfolio:content', sync);
reduced.addEventListener('change', sync);
document.addEventListener('portfolio:capture', event => {
  const source = engine()?.capture(); if (source) event.detail.capture(source);
});
document.addEventListener('portfolio:submerge', event => {
  const source = engine()?.submerge(event.detail.progress, event.detail.end);
  if (source && event.detail.capture) event.detail.capture(source);
});

document.addEventListener('portfolio:ascend', event => {
  const source = engine()?.ascend(event.detail.progress, event.detail.end);
  if (source && event.detail.capture) event.detail.capture(source);
});
document.addEventListener('portfolio:dive', event => { diving = event.detail.active; sync(); });
