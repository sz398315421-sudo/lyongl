// Reuse the existing controls so keyboard handling and scene behavior stay shared.
export function mountWorkbench({onAssist,onLoop}){
 const settings=document.querySelector('.preview-settings');
 const inspector=document.createElement('div');
 inspector.className='studio-inspector-scroll';
 inspector.append(...settings.childNodes);
 settings.append(inspector);
 const heading=document.getElementById('scene-title');
 heading.hidden=false;
 inspector.prepend(heading);
 const entry=document.querySelector('.vehicle-entry');
 const position=document.createComment('Vehicle control position on narrow screens');
 entry.before(position);
 const name=document.getElementById('vehicle-current');
 const thumbnail=document.createElement('img');
 thumbnail.className='studio-vehicle-thumbnail';
 thumbnail.alt='';
 const caption=document.createElement('span');
 caption.className='studio-vehicle-caption';
 caption.append(entry.querySelector('.vehicle-entry-label'),name);
 document.getElementById('vehicle-picker-trigger').prepend(thumbnail,caption);
 const media=matchMedia('(min-width: 1000px)');
 function placeVehicle(){
  if(media.matches)document.querySelector('main > aside').append(entry);
  else position.after(entry);
 }
 media.addEventListener('change',placeVehicle);
 placeVehicle();
 const transport=document.createElement('div');
 transport.className='studio-transport';
 document.getElementById('preview').after(transport);
 const strip=document.createElement('div');strip.className='studio-transport-strip';
 const assist=document.createElement('button');
 assist.type='button';assist.className='studio-assist';assist.role='switch';assist.textContent='辅助驾驶';
 assist.addEventListener('click',onAssist);
 const loading=document.createElement('span');loading.className='studio-loading';loading.setAttribute('role','status');loading.textContent='Loading…';
 const loop=document.createElement('button');loop.type='button';loop.className='studio-loop';loop.textContent='循环播放';
 loop.addEventListener('click',onLoop);
 strip.append(assist,loading,loop);
 transport.append(strip,document.getElementById('scene-animation-control'));
 return {
  syncTransport({ready,busy,parking,junction,assisted,looping}){
   assist.hidden=busy;assist.disabled=!ready;
   assist.textContent=parking?'泊车辅助':'辅助驾驶';
   assist.setAttribute('aria-checked',String(assisted));
   loop.hidden=busy||parking||junction;loop.disabled=!ready;
   loop.setAttribute('aria-pressed',String(looping));loading.hidden=!busy;
   transport.dataset.loading=String(busy);
  },
  syncVehicle(id,mode){
   const src='vehicle-previews/'+id+(mode==='dark'?'-dark':'')+'.png?v=grille-15';
   if(thumbnail.getAttribute('src')!==src)thumbnail.src=src;
  }
 };
}
