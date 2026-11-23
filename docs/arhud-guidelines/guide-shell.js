/* Common in-page directory. Page navigation remains standard static links. */
(() => {
 'use strict';
 const links=[...document.querySelectorAll('.sidebar nav a[href^="#"]')];
 const targets=links.map(link=>({link,target:document.getElementById(decodeURIComponent(link.hash.slice(1)))})).filter(x=>x.target);
 let scheduled=false;
 function update(){
  scheduled=false;
  const threshold=document.querySelector('.site-header').getBoundingClientRect().bottom+55;
  let current=targets[0];
  for(const item of targets)if(item.target.getBoundingClientRect().top<=threshold)current=item;
  targets.forEach(item=>{
   const active=item===current;
   item.link.classList.toggle('active',active);
   if(active)item.link.setAttribute('aria-current','location');else item.link.removeAttribute('aria-current');
  });
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
 window.addEventListener('scroll',schedule,{passive:true});
 window.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('hashchange',schedule);
 window.addEventListener('load',schedule);
 if('ResizeObserver'in window)new ResizeObserver(schedule).observe(document.querySelector('main'));
 if(document.body.dataset.page==='layout')document.getElementById('print').addEventListener('click',()=>window.print());
 update();
})();
