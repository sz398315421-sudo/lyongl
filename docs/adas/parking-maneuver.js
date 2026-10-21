import * as THREE from 'three';
import {parkingBaySize} from './parking-layout.js';
import {createGuidanceMaterial} from './road-assist.js';

export const parkingDurationMs=18000;
export const parkingDetectionMs=4000;
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
// Rearward quarter circle with tangent-continuous entry and exit. Heading is
// derived from travel direction; reversing never turns the vehicle nose first.
export function sampleParkingPose(plan,elapsedMs){
 const t=Math.max(0,Math.min(parkingDurationMs,elapsedMs))/1000;
 const {startX,startZ,targetX,targetZ,radius}=plan;
 const setupZ=targetZ-radius;
 let x=startX,z=startZ,yaw=0,gear='D',phase='search',title='寻找车位',speed=0,remaining=targetX-startX-radius+radius*Math.PI/2;
 // Search happens while driving; detection does not interrupt forward motion.
 if(t<6){const q=t/6;z=startZ+(setupZ-startZ)*smooth(q);speed=Math.abs(setupZ-startZ)*6*q*(1-q)/6*3.6;}
 if(t>=parkingDetectionMs/1000){phase='found';title='发现车位';}
 if(t>=6){z=setupZ;phase='shift';gear='R';title='准备泊入';}
 if(t>=7&&t<14){const q=smooth((t-7)/7),a=q*Math.PI/2;x=startX+radius*(1-Math.cos(a));z=setupZ+radius*Math.sin(a);yaw=a;phase='reverse';title='倒车入库';speed=radius*Math.PI/2*6*((t-7)/7)*(1-(t-7)/7)/7*3.6;remaining=(1-q)*radius*Math.PI/2+targetX-startX-radius;}
 if(t>=14){const q=smooth((t-14)/3);x=startX+radius+(targetX-startX-radius)*q;z=targetZ;yaw=Math.PI/2;phase='align';title='调整位置';speed=t<17?(targetX-startX-radius)*6*((t-14)/3)*(1-(t-14)/3)/3*3.6:0;remaining=targetX-x;}
 if(t>=17){x=targetX;gear='P';phase='complete';title='泊车完成';speed=0;remaining=0;}
 return {x,z,yaw,gear,phase,title,speed,detected:elapsedMs>=parkingDetectionMs,remaining:Math.max(0,remaining),progress:clamp(t/18)};
}

function reversePathPoint(plan,distance){
 const arc=plan.radius*Math.PI/2;
 if(distance<=arc){const a=distance/plan.radius;return {x:plan.startX+plan.radius*(1-Math.cos(a)),z:plan.targetZ-plan.radius+plan.radius*Math.sin(a),yaw:a};}
 return {x:plan.startX+plan.radius+distance-arc,z:plan.targetZ,yaw:Math.PI/2};
}

function createRadarTexture(){
 const size=256,pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),edge=1-smooth((r-.82)/.18);
  const band=Math.exp(-Math.pow((r-.73)/.16,2));
  const alpha=r>=1?0:band*edge*smooth((r-.30)/.25)*.72;
  const light=.30+band*.28,k=(y*size+x)*4;
  pixels[k]=Math.round(66+light*146);pixels[k+1]=Math.round(166+light*77);pixels[k+2]=255;pixels[k+3]=Math.round(alpha*255);
 }
 const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}

export function planParking(world){
 if(!world.parkingBays?.length)return null;
 const bay=world.parkingBays.find(b=>b.x>0&&Math.abs(b.z-world.car.position.z)<.1)||world.parkingBays.find(b=>b.x>0&&b.z<=world.car.position.z);
 if(!bay)return null;
 return {startX:world.car.position.x,startZ:world.car.position.z,targetX:bay.x,targetZ:bay.z,radius:4.8,bay:'A-08'};
}

export function createParkingGraphics(world,plan){
 const group=new THREE.Group();group.name='Automatic parking guidance';world.root.add(group);
 const target=new THREE.Group();target.name='Detected parking bay';target.visible=false;group.add(target);
 const material=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,opacity,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 const cyan=material('#248cff'),fill=material('#248cff',.12);
 const rect=(w,h,x,z,mat)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.065,z);mesh.renderOrder=5;target.add(mesh);return mesh;};
 const {length,width}=parkingBaySize;
 rect(length,width,plan.targetX,plan.targetZ,fill);
 for(const sx of [-1,1])for(const sz of [-1,1]){
  rect(.65,.055,plan.targetX+sx*(length/2-.325),plan.targetZ+sz*width/2,cyan);
  rect(.055,.55,plan.targetX+sx*length/2,plan.targetZ+sz*(width/2-.275),cyan);
 }
 // Floor-mounted P marker remains in the same world coordinate system as bays.
 const mx=plan.targetX,mz=plan.targetZ;
 rect(.07,.7,mx-.18,mz,cyan);rect(.42,.07,mx,mz-.32,cyan);rect(.07,.32,mx+.18,mz-.16,cyan);rect(.42,.07,mx,mz,cyan);
 const count=96,positions=new Float32Array((count+1)*6),uv=new Float32Array((count+1)*4),indices=[];
 for(let i=0;i<=count;i++){
  uv.set([0,i/count,1,i/count],i*4);
  if(i<count){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setIndex(indices);
 const guidanceMaterial=createGuidanceMaterial(),line=new THREE.Mesh(geometry,guidanceMaterial);line.name='Parking guidance ribbon';line.frustumCulled=false;line.renderOrder=6;group.add(line);
 const daytimeGuideColor=guidanceMaterial.uniforms.guideColor.value.clone();
 // Circular gradient sheets live in the vehicle's ground plane. Their world
 // radius is identical along X and Z; the camera supplies all foreshortening.
 const scan=new THREE.Group();scan.name='Parking sensor sweep';scan.position.y=.085;group.add(scan);
 const radarGeometry=new THREE.CircleGeometry(1,128),radarTexture=createRadarTexture();
 const waves=Array.from({length:2},(_,i)=>{
  const mat=material('#ffffff');mat.map=radarTexture;
  const mesh=new THREE.Mesh(radarGeometry,mat);mesh.name=`Radar expanding gradient ${i+1}`;mesh.rotation.x=-Math.PI/2;mesh.renderOrder=4;scan.add(mesh);return mesh;
 });
 group.traverse(o=>{if(o.isMesh)o.userData.displayOverlay=true;});
 return {update(ms){
  const pose=sampleParkingPose(plan,ms),finished=pose.phase==='complete',dark=world.state?.mode==='dark';
  target.visible=pose.detected;const reveal=smooth((ms-parkingDetectionMs)/450);fill.opacity=(finished?(dark?.09:.17):(dark?.065:.12))*reveal;cyan.opacity=reveal*(dark?.72:1);
  cyan.color.set(dark?(finished?'#408e77':'#427eb2'):(finished?'#2bd5a2':'#248cff'));fill.color.copy(cyan.color);
  line.visible=!finished;guidanceMaterial.uniforms.dark.value=dark?1:0;
  guidanceMaterial.uniforms.displayOpacity.value=dark?.52:1;
  guidanceMaterial.uniforms.guideColor.value.copy(daytimeGuideColor).multiplyScalar(dark?.62:1);
  const reverse=ms>=6000,near=(world.car.userData.vehicleSpec?.length||4.85)*.4,total=plan.radius*Math.PI/2+plan.targetX-plan.startX-plan.radius,travelled=total-pose.remaining;
  for(let i=0;i<=count;i++){
   const f=i/count,point=reverse?reversePathPoint(plan,travelled+near+pose.remaining*f):{x:pose.x,z:pose.z-near-9*f,yaw:0};
   const nx=Math.cos(point.yaw),nz=-Math.sin(point.yaw);
   for(let edge=0;edge<2;edge++){const k=i*6+edge*3,s=edge?1:-1;positions[k]=point.x+nx*.70*s;positions[k+1]=.075;positions[k+2]=point.z+nz*.70*s;}
  }
  geometry.attributes.position.needsUpdate=true;
  const scanFade=1-smooth((ms-parkingDetectionMs)/450);
  scan.visible=scanFade>0;scan.position.set(pose.x,world.car.position.y+.04,pose.z);
  // Ground geometry follows the vehicle, so every camera sees the same physical
  // footprint and the car naturally occludes the scan beneath its body.
  scan.quaternion.copy(world.car.quaternion);
  if(scan.visible)for(let w=0;w<waves.length;w++){
   const wave=waves[w],phase=(ms/2200+w/2)%1,radius=(world.car.userData.vehicleSpec?.length||4.85)*.83;
   const strength=smooth(ms/350)*scanFade*(dark?.42:.82);
   // Every sheet expands and reaches zero opacity before wrapping to its origin.
   // The hollow texture leaves no permanent filled blue disc beneath the waves.
   wave.scale.setScalar(radius*(.5+phase*.70));
   wave.material.color.set(dark?'#7396b8':'#ffffff');
   wave.material.opacity=strength*smooth(phase/.12)*(1-smooth((phase-.32)/.68))*.88;
  }
 },dispose(){group.removeFromParent();const geometries=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});for(const geometry of geometries)geometry.dispose();for(const mat of new Set([cyan,fill,guidanceMaterial,...waves.map(w=>w.material)]))mat.dispose();radarTexture.dispose();}};
}

export function initParkingHmi(preview){
 const hud=document.createElement('div');hud.className='parking-hmi';hud.hidden=true;
 hud.innerHTML='<div class="parking-hmi-heading"><strong class="parking-hmi-title">智能泊车</strong></div>';
 preview.append(hud);
 const $=s=>hud.querySelector(s);let previousTitle='';
 $('.parking-hmi-title').setAttribute('role','status');$('.parking-hmi-title').setAttribute('aria-live','polite');
 return {sync(scene,snapshot){
  const parking=['parking','outdoor'].includes(scene);hud.hidden=!parking;if(!parking)return;
  const pose=snapshot.parking,idle=snapshot.status==='idle',paused=snapshot.status==='paused';
  hud.dataset.phase=pose?.phase||'idle';hud.dataset.paused=String(paused);
  const title=idle?'智能泊车':paused?'已暂停':pose?.title||'智能泊车';
  if(title!==previousTitle){$('.parking-hmi-title').textContent=title;previousTitle=title;}
 }};
}
