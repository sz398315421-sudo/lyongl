import * as THREE from 'three';
import {projectVertex,projectFragment,entryFragment,screenFragment} from './reference-motion.js';
import {loadReferenceGallery} from './reference-gallery.js';
import {createReferenceFluid} from './reference-fluid.js';
import {runTransitionTimeline} from './transition-clock.js';
import {homeImmersionProfile,immersionEase} from './home-return-motion.js';

// One image compositor, one shared underwater world. Native images remain the fallback.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const traceTransitions=new URLSearchParams(location.search).has('motion-stats');
const dialog = document.querySelector('#project-dialog');
const work = document.querySelector('#work');
const isProject=()=>document.documentElement.dataset.page==='project';
const stage = document.createElement('div');
stage.className = 'aquatic-stage';
stage.setAttribute('aria-hidden', 'true');
stage.innerHTML = '<div class="aquatic-haze"></div><div class="aquatic-grain"></div>';
document.body.prepend(stage);
let busy = false;
let sceneRenderer, imageRenderer, transitionRenderer, world, camera, surfaceScene, surfaceCamera, transitionScene;
let transitionMaterial, immersionMaterial, worldMaterials = [], motes;
let roomTarget, roomScene, roomMaterial;
let galleryTarget,screenScene,screenMaterial;
let fluid;
const debris=[];
const surfaces = new Map();
const visible = new Set();
let sheets=[];
const loader = new THREE.TextureLoader();
const pointer = new THREE.Vector2(.5, .5);
const smoothPointer=new THREE.Vector2(.5,.5);
const layouts=new WeakMap();
let entryDepth=0,entryYOffset=0,enteringProjects=false;
let entryTarget;
let fontRevision=0;
document.fonts.ready.then(()=>fontRevision++);
const vertexShader = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
const geometry = new THREE.PlaneGeometry(2, 2);
const sheetGeometry=new THREE.PlaneGeometry(1,1,24,24);
// Preserve UNSEEN's world-space bend, ripple and projection equations.
const sheetVertex=projectVertex;
let galleryRoom=null;
const galleryCamera=new THREE.PerspectiveCamera(30,1,100,4500);
galleryCamera.position.z=2000;
const entryNoise=loader.load(new URL('./assets/unseen-reference/gradient-noise.jpg',import.meta.url).href);
entryNoise.wrapS=entryNoise.wrapT=THREE.MirroredRepeatWrapping;
let lastTime = 0, active = false, lastWidth = 0, lastHeight = 0, worldDirty = true;
let previousScroll=window.scrollY,scrollVelocity=0;
let scrollTarget=window.scrollY,inertia=false,lastRoomFrame=0;

function makeRenderer(className, parent) {
  const renderer = new THREE.WebGLRenderer({alpha:true, antialias:className==='water-images', powerPreference:className==='water-images'?'high-performance':'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, className==='water-images'?2:1.4));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = className;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  parent.append(renderer.domElement);
  return renderer;
}

function makeArch(x, z, height, rotation) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.8, -2); shape.lineTo(-1.8, height); shape.lineTo(1.8, height);
  shape.lineTo(1.8, -2); shape.lineTo(1.12, -2); shape.lineTo(1.12, 3.8);
  shape.absarc(0, 3.8, 1.12, 0, Math.PI, false); shape.lineTo(-1.12, -2); shape.closePath();
  const mat = new THREE.MeshStandardMaterial({color:'#c8c9cd',roughness:.8});
  mat.onBeforeCompile = shader => {
    shader.uniforms.waterTime = {value:0};
    worldMaterials.push(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 causticPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ncausticPosition=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float waterTime; varying vec3 causticPosition;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 p=causticPosition;
        float a=sin(p.x*2.8+p.z*1.5+sin(p.y*2.-waterTime*.35));
        float b=sin(p.y*3.3-p.z*2.+sin(p.x*2.5+waterTime*.3));
        float caustic=pow(max(0.,1.-abs(a+b)*.85),12.);
        diffuseColor.rgb+=vec3(.13,.18,.18)*caustic;`);
  };
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:true,bevelSize:.04,bevelThickness:.04,bevelSegments:2,curveSegments:32}),mat);
  mesh.position.set(x, -2.2, z); mesh.rotation.y = rotation; world.add(mesh);
}

try {
  sceneRenderer = makeRenderer('aquatic-world', stage);
  world = new THREE.Scene(); world.background = new THREE.Color('#dedde0');
  world.fog = new THREE.FogExp2('#dedde0', .057);
  camera = new THREE.PerspectiveCamera(48,1,.1,100);
  world.add(new THREE.HemisphereLight('#f1ffff','#a5abb7',2.2));
  const sun = new THREE.DirectionalLight('#f8ffff',2.5); sun.position.set(-5,12,6); world.add(sun);
  for(let i=0;i<5;i++) { makeArch(-7-i*.4,-i*7,12,.15); makeArch(7+i*.4,-i*7-3,12,-.15); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:'#cecccd',roughness:.6}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-4.2; world.add(floor);
  const positions = new Float32Array(170*3);
  for(let i=0;i<170;i++){positions[i*3]=Math.sin(i*51.3)*15;positions[i*3+1]=Math.cos(i*17.1)*8;positions[i*3+2]=-((i*1.61)%42);}
  const particles = new THREE.BufferGeometry(); particles.setAttribute('position',new THREE.BufferAttribute(positions,3));
  motes = new THREE.Points(particles,new THREE.PointsMaterial({color:'#ffffff',size:.035,transparent:true,opacity:.5,depthWrite:false}));world.add(motes);
  const shardGeometry=new THREE.OctahedronGeometry(.28);
  const shardMaterial=new THREE.MeshStandardMaterial({color:'#a3b1c4',roughness:.35,metalness:.1,transparent:true,opacity:.6});
  for(let i=0;i<30;i++){
    const shard=new THREE.Mesh(shardGeometry,shardMaterial);
    shard.position.set(Math.sin(i*7.8)*11,Math.cos(i*3.2)*5+2,-(i*1.9)%32);
    shard.scale.set(1.8,.75,.15);shard.rotation.set(i,i*.4,i*.7);
    shard.userData.baseY=shard.position.y;debris.push(shard);world.add(shard);
  }
  loadReferenceGallery(sceneRenderer).then(room=>{
    galleryRoom=room;world.clear();world.add(room.group);
    world.background=new THREE.Color('#dedde0');world.fog=new THREE.Fog('#dedde0',500,4500);
    room.resize(innerWidth);worldDirty=true;
  }).catch(error=>console.warn('Reference gallery model unavailable',error));
  imageRenderer = makeRenderer('water-images',document.body);
  imageRenderer.autoClear=false;
  if(!matchMedia('(pointer:coarse)').matches)fluid=createReferenceFluid(imageRenderer);
  imageRenderer.domElement.dataset.effect='unseen-project-bend-ripple';
  surfaceScene = new THREE.Scene(); surfaceCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,2); surfaceCamera.position.z=1;
  galleryTarget=new THREE.WebGLRenderTarget(1,1);
  // The display canvas already has antialiasing. The refracted transition
  // target needs one sample, avoiding an extra full-size multisample resolve.
  entryTarget=new THREE.WebGLRenderTarget(1,1);
  screenScene=new THREE.Scene();
  screenMaterial=new THREE.ShaderMaterial({uniforms:{tDiffuse:{value:galleryTarget.texture},u_time:{value:0},u_noiseOnly:{value:0},u_maxDistort:{value:.4},u_bendAmount:{value:-.15},u_vignetteStrength:{value:.05}},vertexShader,fragmentShader:screenFragment.replace('vec4 baseColor;','vec4 baseColor=vec4(0.);').replace('vec4 screenFx;','vec4 screenFx=vec4(0.);').replace(' + noise;',';\n#include <colorspace_fragment>\ngl_FragColor+=noise;')});
  screenScene.add(new THREE.Mesh(geometry,screenMaterial));
  roomTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true});
  roomScene=new THREE.Scene();
  roomMaterial=new THREE.ShaderMaterial({uniforms:{uMap:{value:roomTarget.texture},uTime:{value:0},uSpeed:{value:0}},vertexShader,fragmentShader:`
    varying vec2 vUv;uniform sampler2D uMap;uniform float uTime,uSpeed;
    void main(){
      vec2 uv=vUv;
      vec2 flow=vec2(sin(uv.y*8.+uTime*.5+sin(uv.x*7.-uTime*.2)),cos(uv.x*9.-uTime*.35));
      uv+=flow*(.0035+abs(uSpeed)*.00002);
      vec3 color=texture2D(uMap,clamp(uv,.001,.999)).rgb;
      color.r=texture2D(uMap,clamp(uv+flow*.0006,.001,.999)).r;
      color.b=texture2D(uMap,clamp(uv-flow*.0006,.001,.999)).b;
      gl_FragColor=vec4(color,1.);
      #include <colorspace_fragment>
    }`});
  roomScene.add(new THREE.Mesh(geometry,roomMaterial));
  transitionRenderer = makeRenderer('water-transition', document.body);
  transitionScene = new THREE.Scene();
  transitionMaterial = new THREE.ShaderMaterial({transparent:true,depthTest:false,uniforms:{
    uMap:{value:null},uProgress:{value:0},uAspect:{value:1},uImageAspect:{value:1},
    uOrigin:{value:new THREE.Vector2(.5,.5)},uBounds:{value:new THREE.Vector4(0,0,1,1)},uHasImage:{value:0},
  },vertexShader,fragmentShader:`
    precision highp float;
    varying vec2 vUv; uniform sampler2D uMap;
    uniform float uProgress,uAspect,uImageAspect,uHasImage;
    uniform vec2 uOrigin; uniform vec4 uBounds;
    void main(){
      float p=uProgress;
      vec2 delta=(vUv-uOrigin)*vec2(uAspect,1.);
      float r=length(delta);
      float swell=sin(r*24.-p*18.)*exp(-r*1.5)*sin(p*3.14159);
      vec2 uv=vUv+normalize(delta+vec2(.0001))*swell*.035;
      float expand=smoothstep(0.,.48,p);
      vec4 bounds=mix(uBounds,vec4(0.,0.,1.,1.),expand);
      vec2 local=(uv-bounds.xy)/bounds.zw;
      vec2 fit=vec2(min(1.,bounds.z/bounds.w*uAspect/uImageAspect),min(1.,uImageAspect/(bounds.z/bounds.w*uAspect)));
      local=(local-.5)*fit+.5;
      float inside=step(bounds.x,uv.x)*step(uv.x,bounds.x+bounds.z)*step(bounds.y,uv.y)*step(uv.y,bounds.y+bounds.w);
      vec3 image=texture2D(uMap,clamp(local,.002,.998)).rgb;
      float fog=smoothstep(.22,.48,p);
      vec3 mist=mix(vec3(.66,.71,.8),vec3(.9,.91,.94),vUv.y);
      vec3 color=mix(mix(mist,image,uHasImage),mist,fog);
      float ray=pow(max(0.,sin(vUv.x*16.+vUv.y*4.+p*2.)),14.);
      color+=vec3(.08,.12,.12)*ray*sin(p*3.14159);
      float cover=smoothstep(0.,.18,p);
      float fade=1.-smoothstep(.51,1.,p);
      float alpha=mix(cover,1.,inside*uHasImage)*fade;
      gl_FragColor=vec4(color,alpha);
      #include <colorspace_fragment>
    }`});
  transitionScene.add(new THREE.Mesh(geometry,transitionMaterial));
  immersionMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:false,uniforms:{
    u_fromScene:{value:null},u_toScene:{value:null},u_progress:{value:0},u_time:{value:0},u_noise:{value:entryNoise},
  // Both captured canvases are display-sRGB textures. Three.js decodes them
  // before the blend; encode the result once for the display framebuffer.
  },vertexShader,fragmentShader:entryFragment.replace(
    'gl_FragColor = mix(fromColor, toColor, intpl);',
    'gl_FragColor = mix(fromColor, toColor, intpl);\n#include <colorspace_fragment>'
  )});
} catch(error) {
  console.warn('Water effects unavailable; native images remain available.',error);
  sceneRenderer?.dispose(); imageRenderer?.dispose(); transitionRenderer?.dispose();
  roomTarget?.dispose();
  document.querySelectorAll('.aquatic-world,.water-images,.water-transition').forEach(el=>el.remove());
  sceneRenderer=imageRenderer=transitionRenderer=null;
}

const imageObserver = new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)visible.add(e.target);else visible.delete(e.target);}}, {rootMargin:'60px'});

function hydrate() {
  for(const [img,s] of surfaces){if(!img.isConnected){imageObserver.unobserve(img);visible.delete(img);s.texture?.dispose();s.material.dispose();surfaces.delete(img);}}
  document.querySelectorAll('.project-image > img').forEach(img=>{
    if(surfaces.has(img)||!imageRenderer||reduced.matches)return;
    const material = new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,defines:fluid?{FLUID:1}:{},uniforms:{
      uTexture:{value:null},u_time:{value:0},u_random:{value:1},u_fluidTex:{value:null},
      u_imageSize:{value:new THREE.Vector2(1,1)},u_meshSize:{value:new THREE.Vector2(1,1)},
      u_innerScale:{value:1},u_heightOffset:{value:1},u_bendPoint:{value:new THREE.Vector2(100,700)},u_opacity:{value:1},
      fogColor:{value:new THREE.Color('#dedde0')},fogNear:{value:1250},fogFar:{value:3000},
    },vertexShader:sheetVertex.replace('normalize(fluidColor.rgb)','normalize(fluidColor.rgb+vec3(.000001))'),fragmentShader:projectFragment
      .replace('uniform float u_innerScale;','uniform float u_innerScale;\nuniform float u_heightOffset;')
      .replace('uv = vec2(vec2(uv - scaleOrigin) / u_innerScale + scaleOrigin);',`
        // The atlas also contains the project title, category and page count.
        // Zoom only the cover rectangle, around its own centre; metadata UVs
        // remain untouched, including their original position and scale.
        float coverHeight = clamp(u_heightOffset, .0001, 1.);
        float coverBottom = 1. - coverHeight;
        if (uv.y >= coverBottom) {
          vec2 coverCentre = vec2(.5, coverBottom + coverHeight * .5);
          uv = (uv - coverCentre) / u_innerScale + coverCentre;
        }
      `)
      .replaceAll('luminance','referenceLuminance')
      .replace('imageColor.rgb += smoothstep(0., 10., zPos * 0.3) * 0.3;','')
      .replace('imageColor.rgb += lum * 0.15;','')
      .replace('gl_FragColor.a *= u_opacity;','gl_FragColor.a *= u_opacity;\n#include <colorspace_fragment>')});
    const s={material,texture:null,mesh:new THREE.Mesh(sheetGeometry,material),hover:0};s.mesh.frustumCulled=false;
    surfaces.set(img,s); imageObserver.observe(img);
    // Always use the full design asset for the curved surface, even when the DOM
    // selected a small responsive thumbnail for its native fallback.
    const load=()=>{if(!img.isConnected)return;const texture=loader.load(img.src,()=>{if(!img.isConnected||surfaces.get(img)!==s){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;s.sourceImage=texture.image;s.texture=texture;material.uniforms.uTexture.value=texture;material.uniforms.u_imageSize.value.set(texture.image.naturalWidth,texture.image.naturalHeight);});};
    if(img.complete&&img.naturalWidth)load();else img.addEventListener('load',load,{once:true});
    img.closest('.project-button,.detail-page').addEventListener('pointerenter',()=>{s.hover=1;});
    img.closest('.project-button,.detail-page').addEventListener('pointerleave',()=>{s.hover=0;});
  });
}

function sync() {
  if(stage.parentElement!==document.body)document.body.prepend(stage);
  const imageParent=isProject()?dialog:work;
  if(imageRenderer&&imageRenderer.domElement.parentElement!==imageParent)imageParent.append(imageRenderer.domElement);
  stage.classList.toggle('in-detail',isProject());
  sheets=[...document.querySelectorAll('.project-card')];
  for(const sheet of sheets){
    if(sheet.dataset.waterBound)continue;sheet.dataset.waterBound='true';
    sheet.addEventListener('pointerenter',()=>sheet.dataset.hover='true');
    sheet.addEventListener('pointerleave',()=>sheet.dataset.hover='false');
  }
  previousScroll=window.scrollY;scrollVelocity=0;
  scrollTarget=window.scrollY;inertia=false;
  hydrate();
}
document.addEventListener('portfolio:content',sync);
document.addEventListener('pointermove',e=>{if(!reduced.matches&&e.pointerType!=='touch')pointer.set(e.clientX/innerWidth,e.clientY/innerHeight);},{passive:true});
document.addEventListener('pointerleave',()=>pointer.set(.5,.5));
const stopInertia=()=>{inertia=false;scrollTarget=window.scrollY;};
document.addEventListener('wheel',event=>{
  if(enteringProjects&&!event.ctrlKey&&event.cancelable){event.preventDefault();return;}
  if(innerWidth<700||reduced.matches||busy||document.body.classList.contains('locked')||document.documentElement.dataset.page!=='projects'||event.ctrlKey||!event.cancelable||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
  const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
  const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);
  scrollTarget=THREE.MathUtils.clamp((inertia?scrollTarget:window.scrollY)+event.deltaY*unit,0,max);
  inertia=true;event.preventDefault();
},{passive:false});
document.addEventListener('pointerdown',stopInertia,{passive:true});
document.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)){if(enteringProjects)event.preventDefault();stopInertia();}});
window.addEventListener('blur',stopInertia);
reduced.addEventListener('change',()=>{pointer.set(.5,.5);worldDirty=true;document.querySelectorAll('.water-ready').forEach(el=>el.classList.remove('water-ready'));document.querySelectorAll('.surface-ready').forEach(el=>el.classList.remove('surface-ready'));for(const sheet of sheets){sheet.firstElementChild.style.transform='';sheet.firstElementChild.style.opacity='';sheet.style.zIndex='';sheet.querySelector('.project-meta,.detail-page>span')?.style.removeProperty('opacity');}hydrate();});

function resize() {
  if(lastWidth===innerWidth&&lastHeight===innerHeight)return;
  lastWidth=innerWidth;lastHeight=innerHeight;worldDirty=true;
  for(const renderer of [sceneRenderer,imageRenderer,transitionRenderer])renderer?.setSize(innerWidth,innerHeight);
  roomTarget?.setSize(Math.round(innerWidth*Math.min(devicePixelRatio,1.2)),Math.round(innerHeight*Math.min(devicePixelRatio,1.2)));
  // The atmospheric background has its own resolution budget. Foreground work
  // renders directly into the antialiased display framebuffer at up to 2x DPR.
  galleryTarget?.setSize(Math.round(innerWidth*Math.min(devicePixelRatio,1.4)),Math.round(innerHeight*Math.min(devicePixelRatio,1.4)));
  entryTarget?.setSize(Math.round(innerWidth*imageRenderer.getPixelRatio()),Math.round(innerHeight*imageRenderer.getPixelRatio()));
  galleryCamera.aspect=innerWidth/innerHeight;
  galleryCamera.fov=2*Math.atan(innerHeight/4000)*180/Math.PI;galleryCamera.updateProjectionMatrix();galleryRoom?.resize(innerWidth);
  if(camera){camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<600?62:48;camera.updateProjectionMatrix();}
}

function referencePoint(x,y,time,imageHeight=0){
  const worldX=(x-innerWidth*.5)*.5,worldY=(innerHeight*.5-y)*.5;
  const lower=innerWidth<700?100:100*innerHeight/1100,upper=innerWidth<700?500:700*innerHeight/1100;
  const bend=THREE.MathUtils.smoothstep(worldY,lower,upper);
  const noise=Math.sin((worldX-worldY*.1)*.03-time*1.1+Math.cos(40)*10)*50;
  const ripple=Math.sin((worldX-worldY)*.02-time*2)*12;
  const z=1000+ripple-(1200+noise)*bend;
  const noise2=Math.sin((worldX+worldY*.1)*.01-time*.4)*.5;
  const curvedY=worldY-(1.5-noise2)*THREE.MathUtils.smoothstep(worldY,lower*1.1,upper*.7)*imageHeight*.5;
  const distance=galleryCamera.position.z-z,scale=2000/Math.max(100,distance);
  const projected=new THREE.Vector3(worldX,curvedY,z).project(galleryCamera);
  return {x:(projected.x*.5+.5)*innerWidth,y:(.5-projected.y*.5)*innerHeight,depth:distance-1000};
}
function rollSheets(measure=true){
  if(!active||reduced.matches)return;
  const time=performance.now()/1000;
  galleryCamera.position.set(0,0,2000);
  // Original mouse camera orbit around the project plane (z=1000).
  galleryCamera.rotation.set((.5-smoothPointer.y)*.07,(.5-smoothPointer.x)*.1,0);
  galleryCamera.position.x=Math.sin(galleryCamera.rotation.y)*1000;
  galleryCamera.position.y=-Math.sin(galleryCamera.rotation.x)*1000+entryYOffset;
  galleryCamera.updateMatrixWorld();
  if(!measure)return;
  for(const sheet of sheets){
    if(sheet.hidden||Boolean(sheet.closest('#project-dialog'))!==isProject())continue;
    const rect=sheet.getBoundingClientRect();if(!rect.width)continue;
    const button=sheet.firstElementChild,height=button.offsetHeight;
    const center=referencePoint(rect.left+rect.width*.5,rect.top+height*.5,time,sheet.querySelector('img').offsetHeight);
    // Native link hit areas follow the projected card center; visual curvature stays in WebGL.
    const scale=1000/Math.max(100,1000+center.depth);
    button.style.transform=`translate(${center.x-rect.left-rect.width*.5}px,${center.y-rect.top-height*.5}px) scale(${scale})`;
    button.style.opacity='1';sheet.style.zIndex='2';sheet.dataset.depth=String(Math.round(center.depth));
    layouts.set(sheet,{left:rect.left,top:rect.top,width:rect.width,height,depth:center.depth});
  }
}

function surfaceTexture(s,img,layout){
  const key=`${Math.round(layout.width)}:${Math.round(layout.height)}:${fontRevision}`;
  if(s.textureKey===key||!s.sourceImage)return;
  const button=img.closest('.project-button,.detail-page');
  const canvas=document.createElement('canvas');
  const width=Math.min(1920,Math.max(960,s.sourceImage.naturalWidth||s.sourceImage.width));
  const ratio=width/layout.width;
  canvas.width=width;canvas.height=Math.ceil(layout.height*ratio);
  const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.scale(ratio,ratio);
  const imageHeight=img.offsetHeight;
  ctx.drawImage(s.sourceImage,0,0,layout.width,imageHeight);
  const offset=element=>{let x=0,y=0;for(let el=element;el&&el!==button;el=el.offsetParent){x+=el.offsetLeft;y+=el.offsetTop;}return{x,y};};
  const text=(element,align='left')=>{
    if(!element)return;const style=getComputedStyle(element),pos=offset(element);
    ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=style.color;ctx.textBaseline='top';ctx.textAlign=align;
    ctx.fillText(element.textContent,align==='right'?layout.width:pos.x,pos.y+2,align==='right'?layout.width*.35:element.offsetWidth);
  };
  if(button.classList.contains('project-button')){
    text(button.querySelector('h3'));text(button.querySelector('.project-meta p'));text(button.querySelector('.project-index'),'right');
  }else text(button.querySelector(':scope > span'));
  ctx.strokeStyle='rgba(34,34,34,.3)';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(0,layout.height-1);ctx.lineTo(layout.width,layout.height-1);ctx.stroke();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(16,imageRenderer.capabilities.getMaxAnisotropy());
  s.texture?.dispose();s.texture=texture;s.textureKey=key;
  s.material.uniforms.uTexture.value=texture;
  s.material.uniforms.u_imageSize.value.set(layout.width,layout.height);
  button.classList.add('surface-ready');
}

function drawImages(time,target=null) {
  if(!imageRenderer)return;
  if(!active||isProject()){imageRenderer.setRenderTarget(null);imageRenderer.clear();return;}
  fluid?.update();
  // Keep spectral blur and film grain on the room, away from portfolio content.
  // setRenderTarget uses the target's physical viewport; setViewport here would
  // apply display DPR a second time on high-density screens.
  imageRenderer.setScissorTest(false);imageRenderer.setRenderTarget(galleryTarget);imageRenderer.clear();
  if(galleryRoom)imageRenderer.render(world,galleryCamera);
  imageRenderer.setRenderTarget(target);if(!target)imageRenderer.setViewport(0,0,innerWidth,innerHeight);imageRenderer.clear();
  screenMaterial.uniforms.u_time.value=time;
  imageRenderer.render(screenScene,surfaceCamera);
  for(const [img,s] of surfaces){
    if(!s.texture||img.closest('[hidden]')||Boolean(img.closest('#project-dialog'))!==isProject())continue;
    const sheet=img.closest('.project-card,.detail-sheet'),layout=layouts.get(sheet);if(!layout)continue;
    if(layout.top>innerHeight+80||layout.top+layout.height < -innerHeight*2)continue;
    surfaceTexture(s,img,layout);
    const u=s.material.uniforms;
    u.u_time.value=time;u.u_meshSize.value.set(layout.width,layout.height);
    if(fluid)u.u_fluidTex.value=fluid.texture;
    u.u_innerScale.value+=(1+s.hover*.05-u.u_innerScale.value)*.1;
    u.u_heightOffset.value=img.offsetHeight/layout.height;
    u.u_bendPoint.value.set(innerWidth<700?100:100*innerHeight/1100,innerWidth<700?500:700*innerHeight/1100);
    // Original plane z=1000, camera z=2000; DOM pixels convert to half-size world units.
    s.mesh.scale.set(layout.width*.5,layout.height*.5,1);
    s.mesh.position.set((layout.left+layout.width*.5-innerWidth*.5)*.5,(innerHeight*.5-layout.top-layout.height*.5)*.5,1000);
    surfaceScene.add(s.mesh);imageRenderer.render(surfaceScene,galleryCamera);surfaceScene.remove(s.mesh);
    img.parentElement.classList.add('water-ready');
  }
  imageRenderer.setScissorTest(false);
}

function renderRoom(t){
  if(galleryRoom){
    galleryRoom.scroll(window.scrollY*.35);
    sceneRenderer.setRenderTarget(roomTarget);sceneRenderer.render(world,galleryCamera);sceneRenderer.setRenderTarget(null);
    roomMaterial.uniforms.uTime.value=t;roomMaterial.uniforms.uSpeed.value=scrollVelocity;
    sceneRenderer.render(roomScene,surfaceCamera);worldDirty=false;return;
  }
    const travel=Math.min(3.8,window.scrollY*.0012);
    camera.position.set((smoothPointer.x-.5)*.9,1.4+(smoothPointer.y-.5)*.3+entryDepth*.0012,(innerWidth<600?18:12)-travel+entryDepth*.002);
    camera.lookAt((smoothPointer.x-.5)*.35,2.4,-15);for(const shader of worldMaterials)shader.uniforms.waterTime.value=t;
    motes.rotation.y=Math.sin(t*.08)*.035;motes.position.y=Math.sin(t*.2)*.16;
    for(let i=0;i<debris.length;i++){const shard=debris[i];shard.position.y=shard.userData.baseY+Math.sin(t*.3+i)*.22;shard.rotation.z=Math.sin(t*.2+i)*.4+i;}
    sceneRenderer.setRenderTarget(roomTarget);sceneRenderer.render(world,camera);sceneRenderer.setRenderTarget(null);
    roomMaterial.uniforms.uTime.value=t;roomMaterial.uniforms.uSpeed.value=scrollVelocity;
    sceneRenderer.render(roomScene,surfaceCamera);worldDirty=false;
}

function frame(now) {
  requestAnimationFrame(frame);if(document.hidden||now-lastTime<(innerWidth<600?32:16))return;
  // Entry owns the gallery render. Never draw the same scene on two RAF clocks.
  if(enteringProjects)return;
  const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;resize();
  if(inertia&&!busy){const next=THREE.MathUtils.lerp(window.scrollY,scrollTarget,1-Math.exp(-dt*3.08));window.scrollTo({top:Math.abs(next-scrollTarget)<3?scrollTarget:next,behavior:'instant'});if(Math.abs(window.scrollY-scrollTarget)<1)inertia=false;}
  const delta=window.scrollY-previousScroll;previousScroll=window.scrollY;
  smoothPointer.lerp(pointer,.075);
  scrollVelocity+=(THREE.MathUtils.clamp(delta,-100,100)-scrollVelocity)*.18;
  const rect=work.getBoundingClientRect();const nextActive=isProject()||(rect.top<innerHeight&&rect.bottom>0);
  if(nextActive!==active)worldDirty=true;active=nextActive;
  stage.classList.toggle('active',active&&!isProject());
  document.body.classList.toggle('in-water',active&&!isProject());
  rollSheets();
  if(sceneRenderer&&active&&!isProject()&&!document.body.classList.contains('immersing')&&(!reduced.matches||worldDirty)&&(now-lastRoomFrame>32||worldDirty)){
    lastRoomFrame=now;
    const t=reduced.matches?0:now*.001;
    renderRoom(t);
  }
  if(!reduced.matches)drawImages(now*.001);
  else if(imageRenderer){imageRenderer.setScissorTest(false);imageRenderer.clear();}
}

async function prepareCourtyard(){
  const host=document.querySelector('#world');
  await import('./original-hero.js?v=20261027-mobile-loading');
  if(!['ready','fallback'].includes(host.dataset.sceneState)){
    const status=document.createElement('div');status.className='surface-preparing';status.setAttribute('role','status');status.textContent='正在准备水面…';document.body.append(status);
    await new Promise(resolve=>{
      const finish=()=>{clearTimeout(timeout);document.removeEventListener('portfolio:scene-settled',finish);resolve();};
      const timeout=setTimeout(()=>{document.dispatchEvent(new Event('portfolio:scene-fallback'));finish();},12000);
      document.addEventListener('portfolio:scene-settled',finish);
    });
    status.remove();
  }
  return document.querySelector('.original-scene')?.contentWindow?.unseenScene;
}

async function immerse(change,{returning=false}={}){
  if(busy)return false;
  busy=true;enteringProjects=true;inertia=false;
  const canvas=imageRenderer.domElement;
  let engine=document.querySelector('.original-scene')?.contentWindow?.unseenScene;
  const state={progress:returning?1:0,cameraYOffset:returning?0:2*innerHeight};
  const attribute=returning?'data-project-return':'data-project-entry';
  const controls=[work.querySelector('.work-heading'),work.querySelector('.work-toolbar')];
  let sourceTexture=null,changed=false;
  const trace=traceTransitions;
  let motionStart=0;
  const motionFrames=[];
  const mesh=transitionScene.children[0];mesh.material=immersionMaterial;
  const setSource=source=>{
    if(!sourceTexture){sourceTexture=new THREE.CanvasTexture(source);sourceTexture.colorSpace=THREE.SRGBColorSpace;immersionMaterial.uniforms.u_fromScene.value=sourceTexture;}
    sourceTexture.image=source;sourceTexture.needsUpdate=true;
  };
  const setControls=()=>{
    for(const element of controls){element.style.transform=`translate3d(0,${(returning?2.4:2)*innerHeight*(1-state.progress)}px,0)`;element.style.opacity=String(state.progress);}
    if(returning)document.body.style.setProperty('--surface-progress',state.progress);
  };
  try{
    // Lay out the incoming page without navigating or removing the live home.
    // Its native links stay inert until the original three-second transition ends.
    document.documentElement.setAttribute(attribute,'');
    work.inert=true;
    document.body.classList.add('diving','immersing');
    if(returning)document.body.classList.add('resurfacing');
    document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:true}}));
    if(returning){engine=await prepareCourtyard();await engine?.setView('home',{instant:true});}
    const profile=homeImmersionProfile({viewportHeight:innerHeight,clearance:engine?.immersionMetrics?.().clearance,returning});
    sync();document.body.append(canvas);canvas.classList.add('project-entry-canvas');
    active=true;resize();entryYOffset=state.cameraYOffset;setControls();
    stage.classList.add('active');
    rollSheets();drawImages(performance.now()/1000,entryTarget);
    // Decode and upload covers, and compile both passes before the visible clock starts.
    const images=[...work.querySelectorAll('.project-card:not([hidden]) img')].slice(0,4);
    if(!returning)await Promise.all(images.map(img=>img.decode().catch(()=>{})));
    if(!returning)await Promise.all([...surfaces.values()].slice(0,4).map(s=>new Promise(resolve=>{
      if(s.texture)return resolve();
      let frames=0;const check=()=>s.texture||++frames>120?resolve():requestAnimationFrame(check);check();
    })));
    rollSheets();drawImages(performance.now()/1000,entryTarget);
    immersionMaterial.uniforms.u_toScene.value=entryTarget.texture;
    if(engine)setSource(engine.capture());
    else{
      const img=document.querySelector('.hero-fallback img'),copy=document.createElement('canvas');
      copy.width=innerWidth;copy.height=innerHeight;
      const ctx=copy.getContext('2d');
      if(img?.complete&&img.naturalWidth){const scale=Math.max(innerWidth/img.naturalWidth,innerHeight/img.naturalHeight);ctx.filter=getComputedStyle(img).filter;ctx.drawImage(img,(innerWidth-img.naturalWidth*scale)/2,(innerHeight-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);}
      setSource(copy);
    }
    const draw=source=>{
      if(trace&&motionStart)motionFrames.push([performance.now()-motionStart,state.progress]);
      if(source)setSource(source);
      const viewportChanged=lastWidth!==innerWidth||lastHeight!==innerHeight;
      resize();
      const now=performance.now()/1000;
      entryYOffset=state.cameraYOffset;
      smoothPointer.lerp(pointer,.075);
      // Links are inert and scrolling is locked during this flight. Keep the
      // measured layout and animate the camera without forcing DOM layout again.
      if(!returning||state.progress>.04){rollSheets(viewportChanged);drawImages(now,entryTarget);}
      immersionMaterial.uniforms.u_progress.value=state.progress;immersionMaterial.uniforms.u_time.value=now;
      imageRenderer.setRenderTarget(null);imageRenderer.setViewport(0,0,innerWidth,innerHeight);imageRenderer.clear();
      imageRenderer.render(transitionScene,surfaceCamera);
      setControls();canvas.dataset.progress=state.progress.toFixed(3);
    };
    draw();
    motionStart=performance.now();
    if(engine?.projectsTransition)await engine.projectsTransition(state,draw,{returning,runTimeline:runTransitionTimeline,surfaceOffset:profile.offset,duration:profile.duration,ease:profile.ease});
    else await new Promise(resolve=>{
      const start=performance.now();
      const tick=now=>{
        const p=Math.min(1,(now-start)/(profile.duration*1000));
        const eased=immersionEase(p,returning);
        state.progress=returning?1-eased:eased;state.cameraYOffset=2*innerHeight*(1-state.progress);draw();
        if(p<1)requestAnimationFrame(tick);else resolve();
      };
      requestAnimationFrame(tick);
    });
    // Commit the real URL and focus only after both scenes finish, as on UNSEEN.
    change();changed=true;
  }catch(error){
    console.warn('Project entry fell back to the native page.',error);
    if(!changed){change();changed=true;}
  }finally{
    if(trace)canvas.dataset.transitionStats=JSON.stringify({returning,duration:performance.now()-motionStart,frames:motionFrames});
    entryYOffset=0;entryDepth=0;
    document.documentElement.removeAttribute(attribute);
    for(const element of controls){element.style.removeProperty('transform');element.style.removeProperty('opacity');}
    canvas.classList.remove('project-entry-canvas');delete canvas.dataset.progress;
    sync();active=!returning;stage.classList.toggle('active',active);document.body.classList.toggle('in-water',active);rollSheets();drawImages(performance.now()/1000);
    mesh.material=transitionMaterial;sourceTexture?.dispose();
    document.dispatchEvent(new CustomEvent('portfolio:submerge',{detail:{end:true}}));
    document.body.classList.remove('diving','immersing','resurfacing');document.body.style.removeProperty('--surface-progress');
    document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:false}}));
    enteringProjects=false;busy=false;worldDirty=true;
    if(returning)document.querySelector('#hero-title')?.focus({preventScroll:true});
  }
  return true;
}

async function dive(change,{image,origin,to}={}) {
  if(document.documentElement.dataset.page==='home'&&(/^\/projects\/?$/.test(to||''))&&!reduced.matches&&transitionRenderer&&sceneRenderer&&imageRenderer)return immerse(change);
  if(document.documentElement.dataset.page==='projects'&&(/^\/(?:#home)?$/.test(to||''))&&!reduced.matches&&transitionRenderer&&sceneRenderer&&imageRenderer)return immerse(change,{returning:true});
  if(busy)return false;
  busy=true;
  if(reduced.matches){try{await change();}finally{busy=false;}return true;}
  const veil=document.createElement('div');veil.className='dive-fallback';veil.setAttribute('aria-hidden','true');
  let texture=null;
  const renderer=transitionRenderer;
  const parent=document.body;
  const canvas=renderer?.domElement||veil;parent.append(canvas);canvas.classList.add('active');
  document.body.classList.add('diving');
  document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:true}}));
  if(renderer){
    resize();
    const u=transitionMaterial.uniforms;u.uHasImage.value=0;u.uBounds.value.set(0,0,1,1);u.uAspect.value=innerWidth/innerHeight;
    u.uOrigin.value.set(origin?.x/innerWidth||.5,1-(origin?.y/innerHeight||.5));
    if(image?.complete&&image.naturalWidth){
      texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      const r=image.getBoundingClientRect();u.uBounds.value.set(r.left/innerWidth,1-r.bottom/innerHeight,r.width/innerWidth,r.height/innerHeight);
      u.uImageAspect.value=image.naturalWidth/image.naturalHeight;u.uHasImage.value=1;
    }else if(!isProject()&&document.querySelector('.hero').getBoundingClientRect().bottom>0){
      document.dispatchEvent(new CustomEvent('portfolio:capture',{detail:{capture:source=>{
        const copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;copy.getContext('2d').drawImage(source,0,0);
        texture=new THREE.CanvasTexture(copy);texture.colorSpace=THREE.SRGBColorSpace;
        u.uImageAspect.value=copy.width/copy.height;u.uHasImage.value=1;
      }}}));
    }
    u.uMap.value=texture;
  }
  try{
    await new Promise((resolve,reject)=>{
      const start=performance.now();let changed=false;
      const tick=now=>{
        const p=Math.min(1,(now-start)/1450);
        if(p>=.48&&!changed){
          changed=true;
          try{change();sync();document.body.append(canvas);}catch(error){reject(error);return;}
        }
        if(renderer){transitionMaterial.uniforms.uProgress.value=p;renderer.render(transitionScene,surfaceCamera);}
        else veil.style.opacity=String(Math.sin(p*Math.PI));
        if(p<1)requestAnimationFrame(tick);else resolve();
      };requestAnimationFrame(tick);
    });
  }finally{
    canvas.classList.remove('active');if(!renderer)veil.remove();else{renderer.clear();document.body.append(canvas);}
    texture?.dispose();document.body.classList.remove('diving');busy=false;
    document.dispatchEvent(new CustomEvent('portfolio:dive',{detail:{active:false}}));
  }
  return true;
}

// The sky owns this flight clock and composites these live gallery frames
// beneath the cloud volume. Keep the destination camera moving until handoff.
async function prepareSkyArrival(){
  if(!imageRenderer||reduced.matches)return null;
  enteringProjects=true;inertia=false;
  const root=document.documentElement;
  root.setAttribute('data-project-entry','');work.inert=true;
  const controls=[work.querySelector('.work-heading'),work.querySelector('.work-toolbar')];
  const layout=()=>{sync();active=true;resize();rollSheets();};
  const finish=()=>{
    entryYOffset=0;root.removeAttribute('data-project-entry');
    for(const element of controls){element.style.removeProperty('transform');element.style.removeProperty('opacity');}
    enteringProjects=false;sync();active=document.documentElement.dataset.page==='projects';
    stage.classList.toggle('active',active);document.body.classList.toggle('in-water',active);
    worldDirty=true;rollSheets();drawImages(performance.now()/1000);
  };
  try{
    layout();
    const images=[...work.querySelectorAll('.project-card:not([hidden]) img')].slice(0,4);
    await Promise.all(images.map(img=>img.decode().catch(()=>{})));
    await new Promise(resolve=>{let frames=0;const check=()=>images.every(img=>surfaces.get(img)?.texture)||++frames>120?resolve():requestAnimationFrame(check);check();});
    return{
      layout,finish,
      render(elevation){
        entryYOffset=innerHeight*1.25*elevation;
        const opacity=1-THREE.MathUtils.smoothstep(elevation,0,.18);
        for(const element of controls){element.style.transform=`translate3d(0,${entryYOffset*.2}px,0)`;element.style.opacity=String(opacity);}
        const viewportChanged=lastWidth!==innerWidth||lastHeight!==innerHeight;
        resize();rollSheets(viewportChanged);drawImages(performance.now()/1000);
        return imageRenderer.domElement;
      },
    };
  }catch(error){finish();console.warn('Gallery arrival uses the native layout.',error);return null;}
}
window.portfolioWater={dive,prepareSkyArrival,get busy(){return busy;}};
imageRenderer?.domElement.addEventListener('webglcontextlost',()=>{
  document.querySelectorAll('.water-ready').forEach(el=>el.classList.remove('water-ready'));
  document.querySelectorAll('.surface-ready').forEach(el=>el.classList.remove('surface-ready'));
  imageRenderer.domElement.remove();imageRenderer=null;
});
sync();resize();requestAnimationFrame(frame);
