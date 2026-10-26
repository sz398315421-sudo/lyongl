// Procedural underwater scene. No photograph, image texture or video is loaded.
const ocean=document.createElement('div');ocean.className='project-ocean';ocean.setAttribute('aria-hidden','true');
const canvas=document.createElement('canvas');ocean.append(canvas);document.body.prepend(ocean);
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
let width=innerWidth,height=innerHeight,raf=0,last=0,elapsed=0,previous=0,lost=false;
const pointer={x:.5,y:.5},smooth={x:.5,y:.5};
const fragment=`
precision highp float;
uniform vec2 uResolution,uPointer;
uniform float uTime;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.,a=.5;mat2 r=mat2(.8,-.6,.6,.8);for(int i=0;i<4;i++){n+=a*noise(p);p=r*p*2.04+7.3;a*=.5;}return n;}
float sea(vec2 p,float t){
 p+=vec2(sin(p.y*.33+t*.17),cos(p.x*.24-t*.13))*.35;
 return sin(p.x*.83+p.y*.34+t*.48)*.12+sin(p.x*-.45+p.y*1.38-t*.34)*.075+sin(p.x*2.6+p.y*1.1+t*.6)*.024+sin(p.x*5.3-p.y*3.4-t*.5)*.009;
}
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution;float aspect=uResolution.x/uResolution.y,t=uTime;
 vec2 view=uv;view.x+=(uPointer.x-.5)*.009;view.y+=(uPointer.y-.5)*.005;
 // Beer-Lambert-like depth falloff, with an off-centre patch of sunlight above.
 float height=pow(uv.y,2.8),centre=exp(-pow((uv.x-.53)*1.55,2.));
 vec3 color=mix(vec3(.8,.81,.85),vec3(.9,.92,.95),height*centre);
 float depth=1.-uv.y;
 float angle=(view.x-.56)/(1.27-view.y);
 float turbulence=fbm(vec2(angle*9.,view.y*2.-t*.055));
 float shafts=fbm(vec2(angle*27.+t*.025,view.y*.6+t*.035)+turbulence*.7);
 shafts=pow(smoothstep(.28,.79,shafts),1.7);
 float light=shafts*pow(uv.y,2.1)*exp(-abs(angle)*1.3);
 color+=vec3(.035,.042,.05)*light;
 float halo=exp(-length(vec2((view.x-.56)*1.15,(view.y-1.12)*1.5))*2.8);
 color+=vec3(.035,.04,.045)*halo*halo;
 // Ray from a submerged camera to a moving height field at the water surface.
 vec3 ray=normalize(vec3((view.x-.5)*aspect,(view.y-.77)*1.2,-1.));
 if(ray.y>.018){
  float travel=2.2/ray.y;vec2 p=ray.xz*travel;
  for(int i=0;i<3;i++){float h=sea(p,t);travel=(2.2+h)/ray.y;p=ray.xz*travel;}
  float e=.065;float dx=(sea(p+vec2(e,0),t)-sea(p-vec2(e,0),t))/(2.*e);
  float dz=(sea(p+vec2(0,e),t)-sea(p-vec2(0,e),t))/(2.*e);
  vec3 normal=normalize(vec3(-dx,1.,-dz));
  vec3 reflection=reflect(ray,normal);
  vec2 warped=p*.65+normal.xz*2.3;
  float ripples=fbm(warped+vec2(t*.045,-t*.025));
  float ripple=abs(sin(p.x*3.7+p.y*1.3+fbm(p*1.5)*7.+t*.6));
  float glint=pow(1.-smoothstep(0.,.18,ripple),3.)*smoothstep(.46,.72,fbm(warped*1.1+vec2(t*.035,0)));
  float sky=pow(fbm(reflection.xz*6.+p*.12+vec2(t*.04,0)),5.);
  float sun=exp(-pow((uv.x-.58)*3.5,2.));
  float crest=pow(clamp(normal.x*.9+normal.z*.7+.4,0.,1.),5.);
  vec3 surface=mix(vec3(.58,.65,.74),vec3(.8,.85,.91),ripples);
  surface+=vec3(.035,.045,.055)*crest;
  surface+=vec3(.08,.09,.1)*(glint*.95+sky*3.2)*sun;
  float distanceFade=exp(-travel*.012);
  surface=mix(vec3(.73,.78,.85),surface,distanceFade);
  float edge=smoothstep(.018,.10,ray.y);
  color=mix(color,surface,edge*.93);
 }
 // Tiny suspended particles at two depths, carried slowly by the water.
 for(int i=0;i<2;i++){
  float layer=float(i);vec2 grid=vec2(uv.x*aspect,uv.y)*vec2(60.+layer*29.);
  grid+=vec2(t*.025*(1.+layer),t*.12*(1.+layer));
  vec2 cell=floor(grid),f=fract(grid),point=vec2(hash(cell+layer*17.),hash(cell+41.+layer));
  float speck=(1.-smoothstep(.018,.06,length(f-point)))*step(.976,hash(cell+82.));
  color+=vec3(.12,.14,.17)*speck*(.2+.4*uv.y);
 }
 float vignette=1.-.07*pow(abs(uv.x-.5)*1.8,2.);
 color*=vignette;
 color+=vec3((hash(gl_FragCoord.xy+fract(t))-.5)*.002);
 gl_FragColor=vec4(max(color,vec3(0.)),1.);
}`;
let program,timeUniform,resolutionUniform,pointerUniform,draw;
if(gl){
 try{
  const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message);}return shader;};
  const vertex=compile(gl.VERTEX_SHADER,'attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}');
  const pixel=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,pixel);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(pixel);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  timeUniform=gl.getUniformLocation(program,'uTime');resolutionUniform=gl.getUniformLocation(program,'uResolution');pointerUniform=gl.getUniformLocation(program,'uPointer');
  draw=()=>{gl.uniform1f(timeUniform,reduced.matches?0:elapsed);gl.uniform2f(resolutionUniform,canvas.width,canvas.height);gl.uniform2f(pointerUniform,smooth.x,smooth.y);gl.drawArrays(gl.TRIANGLES,0,6);};
  ocean.dataset.renderer='webgl';
 }catch(error){console.warn('Ocean shader unavailable; using the animated fallback.',error);}
}
function createFallback(){
 // Graceful animated fallback on devices without a usable WebGL context.
 const fallback=document.createElement('canvas');canvas.replaceWith(fallback);const ctx=fallback.getContext('2d');ocean.dataset.renderer='canvas';
 return ()=>{if(!ctx)return;fallback.width=canvas.width;fallback.height=canvas.height;ctx.scale(fallback.width/width,fallback.height/height);const t=reduced.matches?0:elapsed;
  const sea=ctx.createLinearGradient(0,0,0,height);sea.addColorStop(0,'#cbd2dc');sea.addColorStop(.35,'#c1c9d4');sea.addColorStop(1,'#b7c0cd');ctx.fillStyle=sea;ctx.fillRect(0,0,width,height);
  for(let row=0;row<22;row++){const y=row*row*.45;ctx.beginPath();for(let x=0;x<=width;x+=8){const yy=y+Math.sin(x*.019+t*.4+row)*4+Math.sin(x*.033-t*.2+row*.4)*2;if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);}ctx.strokeStyle='rgba(237,241,248,'+(.14*(1-row/24))+')';ctx.lineWidth=1+row*.09;ctx.stroke();}
  const glow=ctx.createRadialGradient(width*.55,0,0,width*.55,0,height*.85);glow.addColorStop(0,'#f9f8f13b');glow.addColorStop(1,'#d3d9e000');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
 };
}
if(!draw)draw=createFallback();
function visible(){return document.documentElement.dataset.page==='project'&&!document.hidden&&!document.body.classList.contains('locked')&&!lost;}
function frame(now){raf=0;if(!visible()){previous=0;return;}if(now-last>32){elapsed+=previous?Math.min(.08,(now-previous)/1000):0;previous=now;last=now;smooth.x+=(pointer.x-smooth.x)*.035;smooth.y+=(pointer.y-smooth.y)*.035;draw();}raf=requestAnimationFrame(frame);}
function sync(){if(raf){cancelAnimationFrame(raf);raf=0;}previous=0;if(!visible())return;draw();if(!reduced.matches)raf=requestAnimationFrame(frame);}
function resize(){width=innerWidth;height=innerHeight;const ratio=Math.min(devicePixelRatio,1.5,Math.sqrt(850000/(width*height)));canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);gl?.viewport(0,0,canvas.width,canvas.height);sync();}
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();draw=createFallback();lost=false;sync();});
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-page']});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
document.addEventListener('pointermove',event=>{if(event.pointerType!=='touch'&&!reduced.matches){pointer.x=event.clientX/width;pointer.y=event.clientY/height;}},{passive:true});
document.addEventListener('visibilitychange',sync);document.addEventListener('portfolio:content',sync);reduced.addEventListener('change',sync);window.addEventListener('resize',resize,{passive:true});resize();
