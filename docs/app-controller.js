const grid=document.querySelector('#projects');
grid.innerHTML=projects.map((p,i)=>`<article class="project-card" data-category="${p.category}"><a class="project-button" href="/projects/${p.id}/" data-project="${p.id}" aria-label="查看${p.title}，${p.images.length}张设计页"><div class="project-image"><img src="assets/${p.cover}.webp" srcset="assets/${p.cover}-sm.webp 760w, assets/${p.cover}.webp 1920w" sizes="(max-width:600px) calc(100vw - 32px), (max-width:1000px) calc(50vw - 46px), (min-width:2000px) 862px, calc(44vw - 18px)" width="1920" height="1080" loading="${i<4?'eager':'lazy'}" alt="${p.title}作品封面"></div><div class="project-meta"><div><h3>${p.title}</h3><p>${p.type}</p></div><span class="project-index">${String(i+1).padStart(2,'0')} / ${String(p.images.length).padStart(2,'0')} PAGES</span></div></a></article>`).join('');

const detail=document.querySelector('#project-dialog'),lightbox=document.querySelector('#lightbox');
const menu=document.querySelector('#menu'),menuButton=document.querySelector('.menu-toggle');
let currentProject=0,currentImage=0,workScroll=0,heroLoaded=false,navigating=false;
const page=()=>document.documentElement.dataset.page;
if('scrollRestoration' in history)history.scrollRestoration='manual';

function toggleMenu(open){menu.classList.toggle('open',open);menu.inert=!open;menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'关闭菜单':'打开菜单');document.body.classList.toggle('locked',open);}
menuButton.addEventListener('click',()=>toggleMenu(!menu.classList.contains('open')));
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>toggleMenu(false)));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open')){toggleMenu(false);menuButton.focus();}});
menu.addEventListener('keydown',e=>{if(e.key==='Tab'){const links=[...menu.querySelectorAll('a')];if(!e.shiftKey&&document.activeElement===links.at(-1)){e.preventDefault();menuButton.focus();}}});
menuButton.addEventListener('keydown',e=>{if(menu.classList.contains('open')&&e.key==='Tab'){e.preventDefault();const links=menu.querySelectorAll('a');(e.shiftKey?links[links.length-1]:links[0]).focus();}});

document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
 document.querySelectorAll('[data-filter]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 let count=0;document.querySelectorAll('.project-card').forEach(card=>{card.hidden=button.dataset.filter!=='all'&&card.dataset.category!==button.dataset.filter;if(!card.hidden)count++;});
 document.querySelector('#filter-count').textContent=`01—${String(count).padStart(2,'0')}`;
 document.dispatchEvent(new Event('portfolio:content'));
}));

function renderProject(id){
 const index=projects.findIndex(p=>p.id===id);if(index<0)return false;
 currentProject=index;const p=projects[index];
 document.querySelector('#detail-content').innerHTML=`<div class="detail-header"><div><p class="eyebrow"><span class="detail-number">${String(index+1).padStart(2,'0')} / ${String(projects.length).padStart(2,'0')}</span>${p.en}</p><h1 id="detail-title" tabindex="-1">${p.title}</h1><p>${p.description}</p></div><div class="detail-type">${p.type}<p>${p.images.length} DESIGN PAGES · 点击图片查看大图</p></div></div><div class="detail-gallery">${p.images.map((n,i)=>`<div class="detail-sheet"><button class="detail-page" data-image="${i}" aria-label="放大${p.title}第${i+1}页"><div class="detail-visual"><img src="assets/${n}.webp" width="1920" height="1080" alt="${p.title} — 设计展示 ${i+1}" loading="${i<2?'eager':'lazy'}"></div></button></div>`).join('')}</div>`;
 const previous=projects[(index-1+projects.length)%projects.length],next=projects[(index+1)%projects.length];
 for(const [direction,project,label,english,arrow] of [['prev',previous,'上一个作品','PREVIOUS PROJECT','←'],['next',next,'下一个作品','NEXT PROJECT','→']]){
  const link=document.querySelector('#'+direction+'-project');link.href='/projects/'+project.id+'/';link.dataset.project=project.id;
  link.setAttribute('aria-label',label+'：'+project.title);
  const icon='<span class="project-switch-arrow" aria-hidden="true">'+arrow+'</span>';
  const copy='<span class="project-switch-copy"><small>'+label+' / '+english+'</small><span>'+project.title+'</span></span>';
  link.innerHTML=direction==='prev'?icon+copy:copy+icon;
 }
 document.title=`${p.title} — 刘泳乐 · Design Portfolio`;
 return true;
}

function applyRoute({restore=false,focus=false}={}){
 if(lightbox.open)lightbox.close();toggleMenu(false);
 let path=location.pathname,hash=location.hash;
 // Keep links to earlier versions useful, while giving every view a real URL.
 if(hash==='#work'){history.replaceState(null,'','/projects/');path='/projects/';hash='';}
 else if(hash.startsWith('#project/')){path=`/projects/${hash.split('/')[1]}/`;history.replaceState(null,'',path);hash='';}
 const match=path.match(/^\/projects\/([^/]+)\/?$/);
 let target=match?'project':path.startsWith('/projects')?'projects':'home';
 if(target==='home'&&(/^\/about\/?$/.test(path)||hash==='#about'||hash==='#contact'))target='about';
 if(target==='home'&&(/^\/explore\/?$/.test(path)||hash==='#explore'))target='explore';
 if(target==='project'&&!renderProject(match[1])){history.replaceState(null,'','/projects/');target='projects';}
 detail.hidden=target!=='project';document.documentElement.dataset.page=target;
 document.querySelector('#work').inert=target!=='projects';
 if(target!=='project'){
  const titles={home:'刘泳乐 · Yongle Liu — Design Portfolio',projects:'Selected Projects — 刘泳乐 · Design Portfolio',about:'关于与联系 — 刘泳乐 · Design Portfolio',explore:'探索 AI 产品 — 刘泳乐 · Design Portfolio'};
  document.title=titles[target];
 }
 document.querySelectorAll('.site-header nav a').forEach(link=>{
  const url=new URL(link.href,location.href);
  const active=['projects','about','explore'].includes(target)?url.pathname===`/${target}/`:target==='project'?url.pathname==='/projects/':url.pathname==='/'&&url.hash==='#home';
  link.setAttribute('aria-current',active?'page':'false');
 });
 document.querySelector('#home').setAttribute('aria-hidden',String(target!=='home'));
 if(['home','about'].includes(target)&&!heroLoaded){heroLoaded=true;import('./original-hero.js?v=20261027-live-scene').catch(error=>console.warn('The static courtyard remains available.',error));}
 const scroll=target==='projects'&&restore?workScroll:0;
 window.scrollTo({top:scroll,behavior:'instant'});
 document.dispatchEvent(new Event('portfolio:content'));
 if(focus){
  const headings={home:'#hero-title',projects:'#work-title',project:'#detail-title',about:'#about-title',explore:'#explore-title'};
  const heading=document.querySelector(headings[target]);
  if(heading&&!heading.hasAttribute('tabindex')&&heading.tagName!=='A')heading.tabIndex=-1;
  heading?.focus({preventScroll:true});
 }
 if(target==='home')window.dispatchEvent(new Event('resize'));
}

async function navigate(url,{image,origin,restore=false}={}){
 if(navigating||window.portfolioWater?.busy||window.portfolioSky?.busy||window.portfolioCourtyard?.busy)return;
 navigating=true;
 if(page()==='projects')workScroll=window.scrollY;
 try{
  const change=()=>{history.pushState(null,'',url);applyRoute({restore,focus:true});};
  const destination=new URL(url,location.href);
  const toAbout=destination.pathname.startsWith('/about')||['#about','#contact'].includes(destination.hash);
  const toHome=destination.pathname==='/'&&(!destination.hash||destination.hash==='#home');
  if(window.portfolioCourtyard&&((page()==='home'&&toAbout)||(page()==='about'&&toHome)))await window.portfolioCourtyard.travel(change,{to:toAbout?'about':'home'});
  else if(page()==='explore'&&window.portfolioSky&&(toHome||toAbout||/^\/projects\/?$/.test(destination.pathname)))await window.portfolioSky.descend(change,{to:toAbout?'about':toHome?'home':'projects'});
  else if(page()==='project'&&/^\/projects\/[^/]+\/?$/.test(destination.pathname))change();
  else if(window.portfolioSky&&(destination.pathname.startsWith('/explore')||destination.hash==='#explore'))await window.portfolioSky.fly(change);
  else if(window.portfolioWater)await window.portfolioWater.dive(change,{image,origin,to:url});else change();
 }finally{navigating=false;}
}

document.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const imageButton=event.target.closest('[data-image]');
 if(imageButton){if(window.portfolioWater?.busy)return;currentImage=Number(imageButton.dataset.image);showImage();lightbox.showModal();document.body.classList.add('locked');return;}
 const featured=event.target.closest('button[data-project]');
 if(featured){navigate(`/projects/${featured.dataset.project}/`,{image:featured.querySelector('img'),origin:{x:event.clientX,y:event.clientY}});return;}
 const link=event.target.closest('a');if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
 const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;
 if(/^\/(projects|about|explore)(\/|$)/.test(url.pathname)||url.pathname==='/'){
  if(link.classList.contains('skip-link')&&page()==='projects')return;
  event.preventDefault();
  navigate(url.pathname+url.hash,{image:link.dataset.project?link.querySelector('img'):null,origin:{x:event.clientX,y:event.clientY},restore:link.id==='close-project'});
 }
});

function showImage(){const p=projects[currentProject];const img=document.querySelector('#lightbox-image');img.src=`assets/${p.images[currentImage]}.webp`;img.alt=`${p.title} — 第${currentImage+1}页`;document.querySelector('#lightbox-count').textContent=`${currentImage+1} / ${p.images.length}`;document.querySelector('#prev-image').disabled=currentImage===0;document.querySelector('#next-image').disabled=currentImage===p.images.length-1;}
function moveImage(direction){currentImage=Math.max(0,Math.min(projects[currentProject].images.length-1,currentImage+direction));showImage();}
document.querySelector('#prev-image').addEventListener('click',()=>moveImage(-1));
document.querySelector('#next-image').addEventListener('click',()=>moveImage(1));
document.querySelector('#close-lightbox').addEventListener('click',()=>lightbox.close());
lightbox.addEventListener('close',()=>document.body.classList.remove('locked'));
lightbox.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')moveImage(-1);if(event.key==='ArrowRight')moveImage(1);});
window.addEventListener('popstate',async()=>{
 const skyDestination=/^\/about\/?$/.test(location.pathname)?'about':/^\/projects\/?$/.test(location.pathname)?'projects':location.pathname==='/'&&(!location.hash||location.hash==='#home')?'home':null;
 const fromSky=page()==='explore'&&skyDestination;
 if(fromSky&&window.portfolioSky&&!navigating&&!window.portfolioSky.busy){
  navigating=true;
  try{await window.portfolioSky.descend(()=>applyRoute({focus:true}),{to:skyDestination});}
  finally{navigating=false;}
  return;
 }
 const returning=page()==='projects'&&location.pathname==='/'&&(!location.hash||location.hash==='#home');
 if(returning&&window.portfolioWater&&!navigating&&!window.portfolioWater.busy){
  navigating=true;
  try{await window.portfolioWater.dive(()=>applyRoute({restore:true,focus:true}),{to:location.pathname+location.hash});}
  finally{navigating=false;}
 }else applyRoute({restore:true,focus:true});
});
applyRoute();
