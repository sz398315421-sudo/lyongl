// On phones, give the courtyard first use of the network, decoders and GPU.
// Other scenes should not allocate four WebGL contexts behind the welcome page.
const root=document.documentElement;
const host=document.querySelector('#world');
const surface=()=>['home','about'].includes(root.dataset.page);
const mobile=matchMedia('(max-width:600px), (pointer:coarse)').matches;
let ocean;
function prepareOcean(){
  if(root.dataset.page==='project')ocean??=import('./project-ocean.js').catch(error=>console.warn('Static project background remains available.',error));
}
document.addEventListener('portfolio:content',prepareOcean);prepareOcean();
if(surface())import('./original-hero.js?v=20261027-mobile-loading').catch(error=>{
  host.dataset.sceneState='fallback';host.dataset.sceneLoading='false';
  document.querySelector('.hero').classList.add('scene-fallback');
  document.dispatchEvent(new Event('portfolio:scene-settled'));
  console.warn('The static courtyard remains available.',error);
});
async function startWater(){
if(mobile&&surface())await new Promise(resolve=>{
  let timeout;
  const finish=()=>{clearTimeout(timeout);for(const name of events)document.removeEventListener(name,check);resolve();};
  const check=()=>{if(!surface()||host.dataset.sceneState==='ready'||(host.dataset.sceneState==='fallback'&&host.dataset.sceneLoading!=='true'))finish();};
  const events=['portfolio:scene-settled','portfolio:content','portfolio:scene-fallback'];
  events.forEach(name=>document.addEventListener(name,check));
  timeout=setTimeout(finish,46000);check();
});
await import('./water.js?v=20261027-mobile-loading').catch(error=>console.warn('Native gallery remains available.',error));
}
startWater();
