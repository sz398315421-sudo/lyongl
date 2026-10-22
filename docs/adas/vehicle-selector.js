import {vehicleCatalog} from './vehicle-catalog.js';
import {defaultVehicleSettings,normalizeVehicleSettings,paintOptions,materialOptions,viewOptions,lightingOptions} from './vehicle-settings.js';

export function initVehicleSelector({selected,onChange,onPreview=()=>{},settings=defaultVehicleSettings,onSettingsChange=()=>{},getPreview,onClose=()=>{},canCustomize=()=>true}){
 const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;};
 const trigger=document.getElementById('vehicle-picker-trigger'),value=document.getElementById('vehicle-current');
 const panel=element('dialog','vehicle-picker');panel.id='vehicle-picker';panel.setAttribute('aria-labelledby','vehicle-picker-title');
 const header=element('div','vehicle-picker-header'),title=element('h2','','车辆选择与设置'),close=element('button','vehicle-picker-close'),grid=element('div','vehicle-options'),feedback=element('p','vehicle-feedback');
 title.id='vehicle-picker-title';close.type='button';close.setAttribute('aria-label','关闭车辆选择');feedback.id='vehicle-feedback';feedback.setAttribute('role','status');feedback.hidden=true;
 close.innerHTML='<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';
 header.append(title,close);
 const body=element('div','vehicle-picker-body'),content=element('div','vehicle-picker-content'),tabs=element('div','vehicle-picker-tabs'),modelsTab=element('button','','车型'),settingsTab=element('button','','设置'),settingsPanel=element('div','vehicle-settings');
 tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','车辆选项');
 modelsTab.id='vehicle-models-tab';settingsTab.id='vehicle-settings-tab';grid.id='vehicle-models-panel';settingsPanel.id='vehicle-settings-panel';
 for(const [tab,target]of [[modelsTab,grid],[settingsTab,settingsPanel]]){tab.type='button';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',target.id);target.setAttribute('aria-labelledby',tab.id);}
 const showTab=tab=>{const models=tab===modelsTab;modelsTab.setAttribute('aria-selected',String(models));settingsTab.setAttribute('aria-selected',String(!models));modelsTab.tabIndex=models?0:-1;settingsTab.tabIndex=models?-1:0;grid.hidden=!models;settingsPanel.hidden=models;panel.scrollTop=0;};
 for(const tab of [modelsTab,settingsTab]){tab.addEventListener('click',()=>showTab(tab));tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?modelsTab:event.key==='End'?settingsTab:tab===modelsTab?settingsTab:modelsTab;showTab(next);next.focus();});}
 tabs.append(modelsTab,settingsTab);content.append(tabs,grid,settingsPanel);body.append(content);panel.append(header,body,feedback);document.body.append(panel);showTab(modelsTab);
 let appearance=normalizeVehicleSettings(settings),previewCanvas,previewName;
 if(getPreview){
  panel.className+=' vehicle-picker-with-preview';
  const stage=element('div','vehicle-picker-stage'),caption=element('div','vehicle-preview-caption'),hint=element('span','','车辆外观预览 · 视角仅在此生效');
  previewCanvas=element('canvas','vehicle-live-preview');previewCanvas.width=800;previewCanvas.height=450;previewCanvas.setAttribute('role','img');previewCanvas.setAttribute('aria-label','车辆设置实时预览');previewName=element('strong','');caption.append(previewName,hint);stage.append(previewCanvas,caption);body.append(stage,content);
 }
 function refreshPreview(){
  if(!previewCanvas||!panel.open)return;
  const source=getPreview({...appearance});if(!source?.width||!source.height)return;
  previewCanvas.height=Math.round(previewCanvas.width*source.height/source.width);
  previewCanvas.getContext('2d').drawImage(source,0,0,previewCanvas.width,previewCanvas.height);
 }
 const settingControls=[],choiceButtons=[],colorInputs=[];
 function section(label,key){const group=element('fieldset','vehicle-setting-section'),legend=element('legend','',label);group.id='vehicle-setting-'+key;group.append(legend);settingsPanel.append(group);return group;}
 const paint=section('车漆','paint'),swatches=element('div','vehicle-paint-options');swatches.setAttribute('role','group');swatches.setAttribute('aria-label','车漆颜色');paint.append(swatches);
 function changeSetting(key,value){
  if(switching||!ready)return;
  appearance=normalizeVehicleSettings({...appearance,[key]:value});
  onSettingsChange({...appearance});updateSettings();refreshPreview();
 }
 for(const [id,label]of paintOptions){const button=element('button','vehicle-paint-swatch');button.type='button';button.id='vehicle-paint-'+(id==='original'?'original':id.slice(1));button.title=label;button.setAttribute('aria-label',label+'车漆');button.setAttribute('style','--paint-color:'+(id==='original'?'#edf0f4':id));button.dataset.paint=id;button.addEventListener('click',()=>changeSetting('paint',id));swatches.append(button);settingControls.push(button);choiceButtons.push([button,'paint',id]);}
 const customRow=element('label','vehicle-custom-paint'),customLabel=element('span','','自定义颜色'),color=element('input',''),colorValue=element('span','vehicle-color-value');color.type='color';color.id='vehicle-paint-custom';color.setAttribute('aria-label','自定义车漆颜色');color.addEventListener('input',()=>changeSetting('paint',color.value));customRow.append(customLabel,colorValue,color);paint.append(customRow);settingControls.push(color);colorInputs.push(color);
 const paintHint=element('p','vehicle-settings-note','此车型保留原始赛车涂装，车漆和材质不可调整。');paintHint.id='vehicle-paint-hint';paint.append(paintHint);
 function choices(label,key,options){const group=section(label,key),buttons=element('div','vehicle-setting-choices');buttons.setAttribute('role','group');buttons.setAttribute('aria-label',label);for(const [id,text]of options){const button=element('button','',text);button.type='button';button.id='vehicle-'+key+'-'+id;button.addEventListener('click',()=>changeSetting(key,id));buttons.append(button);settingControls.push(button);choiceButtons.push([button,key,id]);}group.append(buttons);return group;}
 choices('材质','material',materialOptions);choices('视角','view',viewOptions);const lighting=choices('灯光','lighting',lightingOptions);
 const brightnessRow=element('label','vehicle-brightness'),brightnessLabel=element('span','','亮度'),brightness=element('input',''),brightnessValue=element('output','');brightness.type='range';brightness.id='vehicle-light-intensity';brightness.min='30';brightness.max='150';brightness.step='5';brightness.setAttribute('aria-label','灯光亮度');brightnessValue.setAttribute('for',brightness.id);brightness.addEventListener('input',()=>changeSetting('intensity',brightness.value));brightnessRow.append(brightnessLabel,brightness,brightnessValue);lighting.append(brightnessRow,element('p','vehicle-settings-note','灯光与亮度应用于整个场景。'));settingControls.push(brightness);
 const reset=element('button','vehicle-settings-reset','恢复默认设置');reset.id='vehicle-settings-reset';reset.type='button';reset.addEventListener('click',()=>{if(switching||!ready)return;appearance={...defaultVehicleSettings};onSettingsChange({...appearance});updateSettings();refreshPreview();});settingsPanel.append(reset);settingControls.push(reset);
 function updateSettings(){
  const supported=canCustomize();paintHint.hidden=supported;
  for(const control of settingControls)control.disabled=switching||!ready;
  for(const [button,key,id]of choiceButtons){button.setAttribute('aria-pressed',String(appearance[key]===id));if(!supported&&['paint','material'].includes(key))button.disabled=true;}
  for(const input of colorInputs){input.disabled=switching||!ready||!supported;input.value=appearance.paint==='original'?'#edf0f4':appearance.paint;}
  colorValue.textContent=appearance.paint==='original'?'原厂':appearance.paint.toUpperCase();brightness.value=String(appearance.intensity);brightnessValue.textContent=appearance.intensity+'%';brightness.setAttribute('aria-valuetext',appearance.intensity+'%');
 }
 let switching=false,current=selected,ready=false,openingFrame=0,previousOverflow='',intentTimer=0,openEpoch=0,focusId=selected;
 grid.setAttribute('role','group');grid.setAttribute('aria-label','车辆模型');
 const cards=new Map();
 function update(){
  for(const [id,card]of cards){card.disabled=switching||!ready;card.setAttribute('aria-pressed',String(id===current));card.tabIndex=id===focusId?0:-1;}
  trigger.disabled=!ready&&!switching;
  value.textContent=vehicleCatalog.find(model=>model.id===current).label;
  trigger.setAttribute('aria-label','选择车辆：'+value.textContent);
  if(previewName)previewName.textContent=value.textContent;
  updateSettings();
 }
 async function choose(id){
  if(switching||!ready)return;
  if(id===current){dismiss();return;}
  const choosingEpoch=openEpoch;
  cards.get(id).append(feedback);
  clearTimeout(intentTimer);switching=true;panel.setAttribute('aria-busy','true');feedback.hidden=true;feedback.dataset.loading='true';const feedbackTimer=setTimeout(()=>{feedback.textContent='加载中…';feedback.hidden=false;},150);update();
  try{await onChange(id);current=id;if(!panel.open||choosingEpoch!==openEpoch)feedback.hidden=true;if(choosingEpoch===openEpoch)dismiss();}
  catch(error){console.error('Vehicle selection failed',error);panel.append(feedback);delete feedback.dataset.loading;feedback.hidden=false;feedback.textContent='车辆切换失败，请重试。';}
  finally{clearTimeout(feedbackTimer);switching=false;if(!panel.open)feedback.hidden=true;panel.removeAttribute('aria-busy');update();}
 }
 for(const model of vehicleCatalog){
  const card=element('button','vehicle-option'),picture=element('img','vehicle-picture'),darkPicture=element('img','vehicle-picture vehicle-picture-dark'),name=element('span','vehicle-name',model.label);
  card.type='button';card.id='vehicle-option-'+model.id;card.setAttribute('aria-label',model.label);picture.src='vehicle-previews/'+model.id+'.png?v=grille-15';darkPicture.src='vehicle-previews/'+model.id+'-dark.png?v=grille-15';
  for(const image of [picture,darkPicture]){image.alt='';image.width=300;image.height=180;image.loading='lazy';}
  card.append(picture,darkPicture,name);card.addEventListener('click',()=>choose(model.id));cards.set(model.id,card);grid.append(card);
  const preview=event=>{clearTimeout(intentTimer);if(event?.type==='pointerenter'&&globalThis.matchMedia?.('(hover:hover) and (pointer:fine)').matches===false)return;if(switching||!ready||model.id===current)return;intentTimer=setTimeout(()=>{Promise.resolve().then(()=>onPreview(model.id)).catch(()=>{});},100);};
  card.addEventListener('focus',()=>{focusId=model.id;update();});
  card.addEventListener('pointerenter',preview);card.addEventListener('focus',preview);card.addEventListener('pointerleave',()=>clearTimeout(intentTimer));card.addEventListener('blur',()=>clearTimeout(intentTimer));
 }
 function dismiss(){
  if(!panel.open||panel.dataset.state==='closing')return;
  clearTimeout(intentTimer);
  cancelAnimationFrame(openingFrame);panel.dataset.state='closing';
  const animations=panel.getAnimations(),finish=()=>{if(panel.open&&panel.dataset.state==='closing')panel.close();};
  if(animations.length)Promise.allSettled(animations.map(animation=>animation.finished)).then(finish);else finish();
 }
 trigger.addEventListener('click',()=>{
  if(panel.open||trigger.disabled)return;
  openEpoch++;focusId=current;if(!switching){feedback.hidden=true;panel.append(feedback);}update();
  previousOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';panel.dataset.state='entering';panel.showModal();trigger.setAttribute('aria-expanded','true');(grid.hidden?settingsTab:cards.get(current)).focus({preventScroll:true});refreshPreview();panel.getBoundingClientRect();
  openingFrame=requestAnimationFrame(()=>{if(panel.open&&panel.dataset.state==='entering')panel.dataset.state='open';});
 });
 close.addEventListener('click',dismiss);
 panel.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 panel.addEventListener('close',()=>{cancelAnimationFrame(openingFrame);delete panel.dataset.state;if(!switching)feedback.hidden=true;document.documentElement.style.overflow=previousOverflow;trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});onClose();});
 panel.addEventListener('click',event=>{const bounds=panel.getBoundingClientRect();if(event.target===panel&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))dismiss();});
 panel.addEventListener('keydown',event=>{
  const buttons=[...cards.values()],index=buttons.indexOf(document.activeElement),moves={ArrowRight:1,ArrowLeft:-1,ArrowDown:2,ArrowUp:-2};
  if(index>=0){
   let target=index;
   if(event.key==='Home')target=0;else if(event.key==='End')target=buttons.length-1;
   else if(event.key==='ArrowRight'&&index%2===0)target=index+1;
   else if(event.key==='ArrowLeft'&&index%2===1)target=index-1;
   else if(event.key==='ArrowDown'&&index+2<buttons.length)target=index+2;
   else if(event.key==='ArrowUp'&&index-2>=0)target=index-2;
   else if(!(event.key in moves))return;
   event.preventDefault();buttons[target].focus();return;
  }
 });
 update();return {sync(isReady){ready=isReady;update();}};
}
