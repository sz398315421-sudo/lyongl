import {videoFormat} from './video-export.js';
import {sizeLabel} from './screen-format.js';

export function initExportControls(download,onExport){
 const dialog=document.createElement('dialog');dialog.id='export-dialog';dialog.className='export-dialog';dialog.setAttribute('aria-labelledby','export-dialog-title');dialog.setAttribute('aria-describedby','export-dialog-size');
 const header=document.createElement('div'),heading=document.createElement('h2'),size=document.createElement('p'),closeButton=document.createElement('button');
 header.className='export-heading';heading.id='export-dialog-title';heading.textContent='下载';size.id='export-dialog-size';size.textContent='1920 × 1080';
 closeButton.type='button';closeButton.className='export-close';closeButton.setAttribute('aria-label','关闭下载窗口');closeButton.innerHTML='<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';
 header.append(heading,closeButton);
 const choices=document.createElement('fieldset'),legend=document.createElement('legend');legend.className='export-sr-only';legend.textContent='文件格式';choices.append(legend);
 const video=videoFormat();
 const formats=[['image','PNG 图片','场景图像','PNG'],['video','演示动画',video?'当前场景完整动画 · '+video.extension.toUpperCase():'此浏览器暂不支持视频导出',video?.extension.toUpperCase()||'视频'],['kit','透视套件','图像、相机参数、深度图及 Figma 参考','ZIP'],['camera','相机参数','投影矩阵与相机设置','JSON'],['depth','深度图','16 位 · 线性 · 0–200 米','PNG']];
 const submit=document.createElement('button');submit.type='button';submit.className='export-submit';submit.textContent='下载 PNG';
 for(const [format,title,description,extension]of formats){
  const label=document.createElement('label'),input=document.createElement('input'),copy=document.createElement('span'),name=document.createElement('span'),detail=document.createElement('span');
  label.className='export-choice';input.type='radio';input.name='export-format';input.value=format;input.checked=format==='image';name.textContent=title;detail.textContent=description;detail.className='export-detail';copy.append(name,detail);label.append(input,copy);choices.append(label);
  if(format==='video'&&!video)input.disabled=true;
  input.addEventListener('change',()=>{if(input.checked){submit.textContent='下载 '+extension;const sized=format==='image'||format==='video';size.style.visibility=sized?'visible':'hidden';if(sized)dialog.setAttribute('aria-describedby',size.id);else dialog.removeAttribute('aria-describedby');}});
 }
 dialog.append(header,size,choices,submit);document.body.append(dialog);
 const feedback=document.createElement('span');feedback.className='export-feedback';feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');document.querySelector('.preview-shell').append(feedback);
 download.setAttribute('aria-haspopup','dialog');download.setAttribute('aria-controls','export-dialog');download.setAttribute('aria-label','下载');download.title='下载';
 let busy=false,feedbackTimer=0,previousOverflow='',openingFrame=0;
 const close=async()=>{
  if(!dialog.open||dialog.dataset.state==='closing')return;
  const closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
  cancelAnimationFrame(openingFrame);dialog.dataset.state='closing';
  const animations=dialog.getAnimations();
  const finish=()=>{if(dialog.open&&dialog.dataset.state==='closing')dialog.close();};
  if(animations.length)await Promise.allSettled(animations.map(animation=>animation.finished));finish();await closed;
 };
 download.addEventListener('click',()=>{
  if(download.disabled||busy||dialog.open)return;
  size.textContent=sizeLabel();previousOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';dialog.dataset.state='entering';dialog.showModal();choices.querySelector('input:checked').focus({preventScroll:true});
  dialog.getBoundingClientRect();
  openingFrame=requestAnimationFrame(()=>{if(dialog.open&&dialog.dataset.state==='entering')dialog.dataset.state='open';});
 });
 dialog.addEventListener('close',()=>{cancelAnimationFrame(openingFrame);delete dialog.dataset.state;document.documentElement.style.overflow=previousOverflow;});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 closeButton.addEventListener('click',close);
 dialog.addEventListener('click',event=>{const bounds=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))close();});
 submit.addEventListener('click',async()=>{if(submit.disabled||dialog.dataset.state==='closing')return;const format=choices.querySelector('input:checked').value;await close();onExport(format);});
 const sync=()=>{if(busy&&!download.disabled)download.disabled=true;submit.disabled=busy||download.disabled||download.inert;if(download.inert)close();};
 new MutationObserver(sync).observe(download,{attributes:true,attributeFilter:['disabled','inert']});
 const progressDialog=document.createElement('dialog');progressDialog.className='export-dialog export-progress-dialog';progressDialog.dataset.state='open';progressDialog.setAttribute('aria-labelledby','video-export-title');progressDialog.setAttribute('aria-describedby','video-export-copy');
 progressDialog.innerHTML='<div class="export-heading"><h2 id="video-export-title">正在导出演示动画</h2></div><p id="video-export-copy">1920 × 1080 · 完成后自动下载</p><progress max="100" value="0" aria-label="演示动画导出进度"></progress><p class="export-progress-value" role="status" aria-live="polite">0%</p><button type="button" class="export-submit">取消导出</button>';
 document.body.append(progressDialog);
 let cancelVideo,progressOverflow='';const cancel=()=>cancelVideo?.();
 progressDialog.querySelector('button').addEventListener('click',cancel);progressDialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
 return {
  close,
  showVideoProgress(onCancel){cancelVideo=onCancel;progressDialog.querySelector('#video-export-copy').textContent=sizeLabel()+' · 完成后自动下载';progressOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';progressDialog.querySelector('progress').value=0;progressDialog.querySelector('.export-progress-value').textContent='0%';progressDialog.showModal();},
  updateVideoProgress(progress){const percent=Math.round(progress*100),bar=progressDialog.querySelector('progress'),label=progressDialog.querySelector('.export-progress-value');bar.value=percent;if(label.textContent!==percent+'%')label.textContent=percent+'%';},
  hideVideoProgress(){if(progressDialog.open){progressDialog.close();document.documentElement.style.overflow=progressOverflow;}cancelVideo=null;},
  setBusy(value){busy=value;sync();download.setAttribute('aria-busy',String(value));},
  announce(text,error=false){clearTimeout(feedbackTimer);feedback.textContent=text;feedback.hidden=false;feedback.dataset.error=String(error);if(!error)feedbackTimer=setTimeout(()=>{feedback.hidden=true;},5000);}
 };
}
