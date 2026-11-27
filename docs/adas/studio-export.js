import {videoFormat} from './video-export.js';
import {exportDimensions} from './screen-format.js';

export function mountStudioExport(panel,download,{getFormat,source,drawWeather,depthPreview,onExport}){
 const section=document.createElement('section');
 section.className='studio-export';
 const video=videoFormat();
 section.innerHTML='<h2>导出</h2><label class="studio-property"><span>格式</span><select aria-label="导出格式"><option value="image">PNG 图片</option><option value="kit">透视套件 ZIP</option><option value="camera">相机参数 JSON</option><option value="depth">深度图 PNG</option><option value="video">演示动画</option></select></label><label class="studio-property"><span>尺寸</span><select aria-label="导出尺寸"><option value="1"></option><option value="2"></option></select></label><details class="studio-export-preview"><summary>预览</summary><canvas role="img" aria-label="导出画面预览"></canvas><p aria-live="polite"></p></details><button type="button" class="studio-export-button" disabled>导出文件</button>';
 const [format,scale]=section.querySelectorAll('select');
 let imageScale='2',previewFrame=0;
 scale.value=imageScale;
 format.options[4].disabled=!video;
 format.options[4].textContent=video?'演示动画 '+video.extension.toUpperCase():'演示动画（不可用）';
 const submit=section.querySelector('button'),details=section.querySelector('details');
 const canvas=details.querySelector('canvas'),description=details.querySelector('p');
 const labels={image:'场景图像',kit:'图像、相机参数、深度图和透视参考',camera:'相机位置与投影参数',depth:'近处较暗，远处较亮',video:'动画按完整时间线导出'};
 const ctx=canvas.getContext('2d');
 function sync(){
  const {width,height}=getFormat();
  scale.options[0].textContent=width+' × '+height;
  const high=exportDimensions({width,height},true);
  scale.options[1].textContent=high.width+' × '+high.height;
  const allowsHighRes=format.value!=='video';
  scale.options[1].disabled=!allowsHighRes;
  const unavailable=download.disabled||download.inert;
  format.disabled=unavailable;
  scale.disabled=unavailable||!allowsHighRes;
  scale.value=allowsHighRes?imageScale:'1';
  submit.disabled=unavailable;
 }
 function refresh(){
  sync();
  if(!details.open)return;
  const {width,height}=getFormat();
  const output=exportDimensions({width,height},scale.value==='2');
  description.textContent=output.width+' × '+output.height+' · '+labels[format.value];
  const frame=source();
  if(submit.disabled)description.textContent='正在准备画面…';
  canvas.hidden=!frame?.width||submit.disabled||format.value==='camera';
  if(canvas.hidden)return;
  canvas.width=480;canvas.height=Math.round(canvas.width*height/width);
  try{
   if(format.value==='depth')depthPreview(ctx,canvas.width,canvas.height);
   else{
    ctx.drawImage(frame,0,0,canvas.width,canvas.height);
    drawWeather(ctx,canvas.width,canvas.height,performance.now());
   }
  }catch{canvas.hidden=true;description.textContent='暂时无法生成预览。';}
 }
 section.addEventListener('change',event=>{
  if(event.target===scale&&!scale.disabled)imageScale=scale.value;
  refresh();
 });
 details.addEventListener('toggle',refresh);
 submit.addEventListener('click',()=>onExport(format.value,Number(scale.value)));
 new MutationObserver(()=>{
  sync();
  cancelAnimationFrame(previewFrame);
  if(details.open)previewFrame=requestAnimationFrame(refresh);
 }).observe(download,{attributes:true,attributeFilter:['disabled','inert']});
 panel.append(section);sync();
 return {sync,refresh};
}
