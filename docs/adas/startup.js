// This small entry point remains available even when importing the 3D app fails.
(()=>{
 const preview=document.getElementById('preview'),canvas=document.getElementById('scene-canvas');
 const feedback=document.createElement('div');feedback.className='preview-feedback';feedback.hidden=false;
 const message=document.createElement('span');message.setAttribute('role','status');message.textContent='正在加载 3D 场景，完成后即可操作…';
 const retry=document.createElement('button');retry.type='button';retry.textContent='重试';
 retry.addEventListener('click',()=>{retry.disabled=true;location.reload();});
 feedback.append(message,retry);preview.after(feedback);
 const controls=[...document.querySelectorAll('#scenes,.preview-settings,#scene-picker,#theme-toggle,#download')];
 const previousInert=controls.map(control=>control.inert);
 controls.forEach(control=>control.inert=true);
 let failed=false,interactive=false;
 const unlock=()=>controls.forEach((control,index)=>control.inert=previousInert[index]);
 function show(text){message.textContent=text;feedback.hidden=false;}
 const slow=setTimeout(()=>show(interactive?'3D 场景仍在加载，可以先调整设置，或重试。':'3D 场景加载时间较长，请稍候或重试。'),15000);
 function fail(kind){
  failed=true;clearTimeout(slow);preview.dataset.loadError='true';preview.setAttribute('aria-busy','false');
  if(preview.dataset.poster)preview.style.setProperty('--startup-frame',`url("${preview.dataset.poster}")`);
  controls.forEach(control=>control.inert=true);document.getElementById('download').disabled=true;
  const messages={
   renderer:'3D 场景无法启动，当前显示静态预览。请刷新页面或更换浏览器。',
   context:'3D 场景已中断，请刷新页面后继续。',
   asset:'场景文件加载失败，请检查网络连接后重试。',
   startup:'3D 场景加载失败，当前显示静态预览。请重试。'
  };
  show(messages[kind]||messages.startup);
 }
 window.addEventListener('studio:interactive',()=>{
  if(failed)return;
  interactive=true;unlock();show('3D 场景正在加载，可以先选择场景与样式…');
 });
 window.addEventListener('studio:ready',()=>{
  if(failed)return;
  clearTimeout(slow);feedback.hidden=true;
  unlock();
 });
 window.addEventListener('studio:error',event=>fail(event.detail?.kind));
 canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('context');});
 import('./app.bundle.js?v=20261021-mobile-startup-1').catch(error=>{
  console.error('DriveScene startup failed',error);fail(error.code||'startup');
 });
})();
