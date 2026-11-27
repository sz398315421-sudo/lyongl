export const weatherOptions=[['clear','晴天'],['rain','下雨'],['snow','下雪']];
export const normalizeWeather=value=>weatherOptions.some(([id])=>id===value)?value:'clear';

export function initSceneWeather(preview,onChange){
 const block=document.createElement('section');
 block.className='studio-weather';
 block.innerHTML='<h2>环境</h2><div class="studio-property"><span>天气</span><div class="studio-weather-options" role="group" aria-label="室外场景天气"></div></div>';
 const options=block.querySelector('.studio-weather-options');
 for(const [id,label] of weatherOptions){
  const button=document.createElement('button');
  button.type='button';
  button.dataset.weather=id;
  button.textContent=label;
  button.addEventListener('click',()=>onChange(id));
  options.append(button);
 }
 const canvas=document.createElement('canvas');
 canvas.className='studio-weather-layer';
 canvas.setAttribute('aria-hidden','true');
 canvas.hidden=true;
 preview.append(canvas);
 const context=canvas.getContext('2d');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const particles=Array.from({length:168},(_,i)=>({
  x:(i*.61803398875)%1,y:(i*.41421356237)%1,weight:.28+((i*.72654)%1)*.72
 }));
 let active='clear',dark=false,frame=0,last=0;
 function draw(target,w,h,ms){
  if(active==='clear')return;
  const rain=active==='rain';
  target.save();
  target.scale(w,h);
  const haze=target.createLinearGradient(0,0,0,1);
  haze.addColorStop(0,rain?(dark?'#0b182449':'#24394949'):(dark?'#c4d8ed24':'#f2f8ff72'));
  haze.addColorStop(.64,rain?'#42678316':'#ecf7ff26');
  haze.addColorStop(1,rain?'#16253628':'#eff6ff38');
  target.fillStyle=haze;
  target.fillRect(0,0,1,1);
  target.strokeStyle=dark?'#b7d9f6aa':'#e1ecf5ab';
  target.fillStyle='#f5fbffeb';
  for(const p of particles){
   const speed=rain?.00072:.00011;
   const y=(p.y+ms*speed*p.weight)%1;
   const x=(p.x+1+(rain?-.21*y:.022*Math.sin(ms*.001+p.y*25)))%1;
   target.globalAlpha=.24+p.weight*.46;
   target.beginPath();
   if(rain){
    target.lineWidth=(.55+p.weight*.7)/900;
    target.moveTo(x,y);
    target.lineTo(x-.006*p.weight,y+.050*p.weight);
    target.stroke();
   }else{
    const radius=.0011+.0015*p.weight;
    target.ellipse(x,y,radius,radius*w/h,0,0,Math.PI*2);
    target.fill();
   }
  }
  target.restore();
 }
 function paint(ms){
  const width=Math.min(1024,Math.max(1,preview.clientWidth));
  const height=Math.max(1,Math.round(width*preview.clientHeight/Math.max(1,preview.clientWidth)));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  context.clearRect(0,0,width,height);
  draw(context,width,height,ms);
 }
 function tick(now){
  frame=0;
  if(active==='clear'||document.hidden||reduced.matches)return;
  if(now-last>=30){last=now;paint(now);}
  frame=requestAnimationFrame(tick);
 }
 function schedule(){
  cancelAnimationFrame(frame);frame=0;
  if(active==='clear'||!context)return;
  paint(reduced.matches?0:performance.now());
  if(!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);
 }
 document.addEventListener('visibilitychange',schedule);
 reduced.addEventListener('change',schedule);
 new ResizeObserver(()=>{if(active!=='clear'&&context)paint(reduced.matches?0:performance.now());}).observe(preview);
 return {
  block,draw,
  sync(value,{outdoor,mode,ready}){
   block.hidden=!outdoor;
   for(const button of options.children){
    button.disabled=!ready;
    button.setAttribute('aria-pressed',String(value===button.dataset.weather));
   }
   const next=outdoor?value:'clear';
   if(next===active&&dark===(mode==='dark'))return;
   active=next;dark=mode==='dark';canvas.hidden=active==='clear';schedule();
  }
 };
}
