import * as THREE from './vendor/three.module.js';

// The flight and the resting page share one three-dimensional density field.
export function createCloudWorld(parent){
 const renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,premultipliedAlpha:false,powerPreference:'low-power',preserveDrawingBuffer:true});
 renderer.setPixelRatio(1);renderer.domElement.setAttribute('aria-hidden','true');parent.append(renderer.domElement);
 const data=new Uint8Array(256*256*4);
 const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const i=(y*256+x)*4;data[i]=Math.floor(random(y*256+x)*255);data[i+1]=Math.floor(random(((y+17)%256)*256+(x+37)%256)*255);data[i+2]=0;data[i+3]=255;
 }
 const noise=new THREE.DataTexture(data,256,256,THREE.RGBAFormat);noise.wrapS=noise.wrapT=THREE.RepeatWrapping;noise.minFilter=noise.magFilter=THREE.LinearFilter;noise.needsUpdate=true;
 const uniforms={uNoise:{value:noise},uAspect:{value:1},uTime:{value:0},uHeight:{value:19},uTilt:{value:-.12},uAdvance:{value:0},uPointer:{value:new THREE.Vector2()},uLook:{value:new THREE.Vector3()},uHover:{value:new THREE.Vector2()},uWind:{value:new THREE.Vector2()},uBreeze:{value:0},uPulses:{value:Array.from({length:3},()=>new THREE.Vector4(0,0,-100,0))}};
 Object.assign(uniforms,{uTransit:{value:0},uBackdrop:{value:1},uRange:{value:320}});
 const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
 precision highp float;
 varying vec2 vUv;
 uniform sampler2D uNoise;
 uniform float uAspect,uTime,uHeight,uTilt,uAdvance;
 uniform float uTransit,uBackdrop,uRange;
 uniform vec2 uPointer;
 uniform vec3 uLook;
 uniform vec2 uHover,uWind;
 uniform float uBreeze;
 uniform vec4 uPulses[3];
 float noise3(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;
  vec2 rg=texture2D(uNoise,(uv+.5)/256.).rg;
  return mix(rg.x,rg.y,f.z);
 }
 float field(vec3 p){
  vec3 flightPoint=p;
  // Local wind advects the density itself, rather than moving a flat image.
  vec2 hoverDelta=p.xz-uHover;
  float breeze=exp(-dot(hoverDelta,hoverDelta)/700.)*uBreeze;
  p.xz-=uWind*breeze*7.;
  p.y+=sin(p.x*.12+p.z*.08-uTime*.8)*breeze*.65;
  float clearing=breeze*.12;
  for(int j=0;j<3;j++){
   vec4 pulse=uPulses[j];float age=uTime-pulse.z;
   if(age>=0.&&age<6.&&pulse.w>0.){
    vec2 delta=p.xz-pulse.xy;float distance=length(delta);
    float envelope=smoothstep(0.,.35,age)*(1.-smoothstep(1.6,6.,age))*pulse.w;
    float radius=4.+age*7.;
    float front=exp(-pow((distance-radius)/6.,2.));
    p.xz+=delta/max(1.,distance)*front*envelope*4.;
    float opening=exp(-dot(delta,delta)/(400.+age*100.))*envelope*.9;
    clearing=max(clearing,opening);
   }
  }
  // Ambient wind keeps the volume drifting and billowing without pointer input.
  p.x+=uTime*.72;p.z+=uTime*.24;
  vec3 q=p*.085;
  q.y+=sin(uTime*.22+p.x*.025+p.z*.02)*.12;
  float n=.5*noise3(q)+.27*noise3(q*2.03)+.15*noise3(q*4.09)+.08*noise3(q*8.11);
  vec2 cell=floor(p.xz/54.);
  float seed=noise3(vec3(cell.x*3.,17.,cell.y*3.));
  vec2 center=(cell+.5)*54.;
  float base=2.+seed*8.;
  vec3 local=(p-vec3(center.x,base,center.y))/vec3(30.,11.+seed*5.,30.);
  float dome=1.-length(local);
  float density=clamp((dome*.8+n*.7-.45)*4.5,0.,1.)*(1.-clamp(clearing,0.,.94));
  // Distant clouds enter with the sky light; the nearby bank supplies the
  // initial three-dimensional occlusion over the courtyard.
  if(uTransit>.5)density*=uBackdrop;
  // A finite cloud bank on the flight path occludes the courtyard in 3D.
  // At the destination this bank is behind the camera, outside the resting view.
  if(uTransit>.5){
   // Rounded overlapping lobes give the near bank a broken silhouette. A
   // single wide, shallow ellipsoid reads as a white horizontal panel.
   float bank=min(
    length((flightPoint-vec3(-23.,7.8,17.))/vec3(22.,6.5,13.)),
    min(length((flightPoint-vec3(0.,6.5,15.))/vec3(18.,7.,12.)),
        length((flightPoint-vec3(22.,9.,12.))/vec3(22.,7.5,12.))));
   float billow=(noise3(flightPoint*.18+vec3(uTime*.03,0.,0.))-.5)*.65;
   float envelope=1.-smoothstep(.35,1.15,bank+billow);
   float erosion=smoothstep(.2,.85,noise3(flightPoint*.3+vec3(4.,2.,7.)));
   density=max(density,envelope*(.65+n)*mix(.2,1.,erosion));
  }
  return density;
 }
 void main(){
  vec2 uv=vUv*2.-1.;uv.x*=uAspect;
  uv=mat2(cos(uLook.z),sin(uLook.z),-sin(uLook.z),cos(uLook.z))*uv;
  vec3 ro=vec3(uPointer.x*2.,uHeight+uPointer.y*.6,uAdvance);
  vec3 rd=normalize(vec3(uv.x*.58+uPointer.x*.025,uv.y*.58+uTilt,-1.));
  rd.yz=mat2(cos(uLook.y),sin(uLook.y),-sin(uLook.y),cos(uLook.y))*rd.yz;
  rd.xz=mat2(cos(uLook.x),sin(uLook.x),-sin(uLook.x),cos(uLook.x))*rd.xz;
  vec3 sun=normalize(vec3(-.65,.68,-.4));
  float skyY=clamp(rd.y*.9+.45,0.,1.);
  vec3 sky=mix(vec3(.96,.97,.98),vec3(.61,.73,.9),pow(skyY,.7));
  sky+=vec3(1.,.86,.66)*pow(max(0.,dot(rd,sun)),16.)*.15;
  vec4 cloud=vec4(0.);
  if(rd.y<-.001||ro.y<26.){
   float rayY=abs(rd.y)<.001?-.001:rd.y;
   float a=(26.-ro.y)/rayY,b=(-6.-ro.y)/rayY;
   float nearT=max(0.,min(a,b)),farT=min(uRange,max(a,b));
   if(farT>nearT){
    // Sample the entire ray with independent pixel offsets. Coarse aligned
    // slices otherwise show up as horizontal rings across the cloud volume.
    float stepSize=max(.1,(farT-nearT)/84.);
    float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
    float distance=nearT+stepSize*jitter;
    for(int i=0;i<84;i++){
     if(distance>farT||cloud.a>.985)break;
     vec3 p=ro+rd*distance;
     float d=field(p);
     if(d>.008){
      float shadow=field(p+sun*4.5);
      float lighting=clamp(.48+(d-shadow)*1.6+p.y*.018,.2,1.);
      bool flightCloud=uTransit>.5&&p.z>0.&&p.z<32.&&p.y<18.;
      if(flightCloud)lighting=clamp(.42+(d-shadow)*.65+noise3(p*.18+vec3(0.,uTime*.05,0.))*.24+rd.y*.08,.28,.92);
      vec3 shadowColor=flightCloud?vec3(.66,.73,.82):vec3(.7,.73,.79);
      vec3 color=mix(shadowColor,vec3(.995,.984,.966),lighting);
      color=mix(color,sky,smoothstep(90.,320.,distance)*.72);
      float alpha=1.-exp(-d*stepSize*.24);
      cloud.rgb+=(1.-cloud.a)*alpha*color;cloud.a+=(1.-cloud.a)*alpha;
     }
     distance+=stepSize;
    }
   }
  }
  if(cloud.a>.985){cloud.rgb/=cloud.a;cloud.a=1.;}
  // Sky light fills gaps continuously while the camera crosses the bank.
  // The old binary transparent/opaque switch exposed the cloud as a solid bar.
  float alpha=cloud.a+(1.-cloud.a)*uBackdrop;
  vec3 composite=cloud.rgb+sky*(1.-cloud.a)*uBackdrop;
  gl_FragColor=vec4(composite/max(.0001,alpha),alpha);
 }
 `});
 const scene=new THREE.Scene(),camera=new THREE.Camera();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
 function resize(){const scale=Math.min(.8,920/innerWidth,620/innerHeight);renderer.setSize(Math.max(1,Math.round(innerWidth*scale)),Math.max(1,Math.round(innerHeight*scale)),false);uniforms.uAspect.value=innerWidth/innerHeight;}
 function projectPoint(uv,{height=19,tilt=-.12,advance=0,x=0,y=0,yaw=0,pitch=0,roll=0}={}){
  const screenX=uv.x*(innerWidth/innerHeight),screenY=uv.y;
  let dx=(Math.cos(roll)*screenX-Math.sin(roll)*screenY)*.58+x*.025;
  let dy=(Math.sin(roll)*screenX+Math.cos(roll)*screenY)*.58+tilt,dz=-1;
  [dy,dz]=[Math.cos(pitch)*dy-Math.sin(pitch)*dz,Math.sin(pitch)*dy+Math.cos(pitch)*dz];
  [dx,dz]=[Math.cos(yaw)*dx-Math.sin(yaw)*dz,Math.sin(yaw)*dx+Math.cos(yaw)*dz];
  const length=Math.hypot(dx,dy,dz);dx/=length;dy/=length;dz/=length;
  const distance=Math.min(160,Math.max(8,(12-height-y*.6)/Math.min(-.045,dy)));
  return{x:x*2+dx*distance,z:advance+dz*distance};
 }
 function render({time=0,height=19,tilt=-.12,advance=0,x=0,y=0,yaw=0,pitch=0,roll=0,interaction,transit=false,cloudOnly=false,backdrop=cloudOnly?0:1,range=320}={}){
  uniforms.uTime.value=time;uniforms.uHeight.value=height;uniforms.uTilt.value=tilt;uniforms.uAdvance.value=advance;uniforms.uPointer.value.set(x,y);
  uniforms.uLook.value.set(yaw,pitch,roll);
  uniforms.uTransit.value=transit?1:0;uniforms.uBackdrop.value=backdrop;uniforms.uRange.value=range;
  uniforms.uBreeze.value=interaction?.energy||0;
  if(interaction){const hit=projectPoint(interaction.pointer,{height,tilt,advance,x,y,yaw,pitch,roll});uniforms.uHover.value.set(hit.x,hit.z);uniforms.uWind.value.set(interaction.wind.x,interaction.wind.y);}
  for(let i=0;i<3;i++){const p=interaction?.pulses[i];uniforms.uPulses.value[i].set(p?.x||0,p?.z||0,p?.time??-100,p?1:0);}
  renderer.render(scene,camera);
 }
 resize();render();return{canvas:renderer.domElement,resize,render,projectPoint};
}
