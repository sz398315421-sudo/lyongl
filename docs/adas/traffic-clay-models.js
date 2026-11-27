import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {clayVehicleCatalog} from './clay-vehicle-catalog.js';

const shapes={
 sedan:{width:.91,lift:0,roofHeight:1.43,rearRoof:.73,tire:.322,paint:'#d0d9e1'},
 hatchback:{width:.94,lift:.075,roofHeight:1.57,rearRoof:.79,tire:.34,paint:'#d7dde2'},
 suv:{width:.98,lift:.135,roofHeight:1.68,rearRoof:.83,tire:.362,paint:'#cad4dc'}
};
const glass=new THREE.Color('#93a5b3'),trim=new THREE.Color('#a5b1bb');
const {lerp,smoothstep}=THREE.MathUtils;

function section(profile,t){
 const end=profile.findIndex((row,index)=>index>0&&t<=row[0]);
 const a=profile[end-1],b=profile[end],before=profile[end-2],after=profile[end+1];
 const span=b[0]-a[0],u=(t-a[0])/span,u2=u*u,u3=u2*u;
 // Smooth the silhouette between stations without overshooting roof or bumper heights.
 const tangent=(left,right)=>left*right>0?2*left*right/(left+right):0;
 return a.slice(1).map((value,index)=>{
  const j=index+1,delta=b[j]-value,slope=delta/span;
  const start=before?tangent((value-before[j])/(a[0]-before[0]),slope):slope;
  const finish=after?tangent(slope,(after[j]-b[j])/(after[0]-b[0])):slope;
  return value+(3*u2-2*u3)*delta+span*((u3-2*u2+u)*start+(u3-u2)*finish);
 });
}

function shell(ringAt,from,to,length,segments){
 const start=ringAt(from),sides=start.length,positions=[],colors=[],indices=[];
 const add=(x,y,z,color)=>{positions.push(x,y,z);colors.push(color.r,color.g,color.b);};
 for(let i=0;i<=segments;i++){
  const t=lerp(from,to,i/segments),ring=i===0?start:ringAt(t);
  for(const [x,y,color] of ring)add(x,y,(t-.5)*length,color);
  if(i===segments)break;
  for(let j=0;j<sides;j++){
   const a=i*sides+j,b=i*sides+(j+1)%sides;
   indices.push(a,b,a+sides,b,b+sides,a+sides);
  }
 }
 for(const [t,offset] of [[from,0],[to,segments*sides]]){
  const ring=ringAt(t),hub=positions.length/3;
  add(0,ring.reduce((sum,p)=>sum+p[1],0)/sides,(t-.5)*length,ring[0][2]);
  for(let j=0;j<sides;j++){
   const a=offset+j,b=offset+(j+1)%sides;
   indices.push(hub,t===from?b:a,t===from?a:b);
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.setIndex(indices);geometry.computeVertexNormals();
 return geometry;
}

function solid(geometry,color){
 const colors=new Float32Array(geometry.attributes.position.count*3),shade=new THREE.Color(color);
 for(let i=0;i<colors.length;i+=3)shade.toArray(colors,i);
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');
 return geometry;
}

function buildModel(spec,finish){
 const {width,lift,roofHeight,rearRoof,tire,paint:bodyColor}=shapes[spec.id];
 const paint=new THREE.Color(bodyColor),lower=paint.clone().lerp(trim,.26),length=spec.length;
 const frontAxle=.205,rearAxle=.785,parts=[];
 const bodyProfile=[
  [0,.70,.62],[.016,.85,.67],[.06,.96,.73],[.15,1,.78],[.27,1,.85],
  [.38,.978,.91],[.63,.973,.90],[.79,1,.86],[.90,.99,.81],[.975,.91,.75],[1,.77,.68]
 ];
 parts.push(shell(t=>{
  const [wide,top]=section(bodyProfile,t),w=wide*width,h=top+lift;
  const axleDistance=Math.min(Math.abs(t-frontAxle),Math.abs(t-rearAxle))*length;
  const arch=1-smoothstep(axleDistance,tire*.80,tire*1.14);
  const sill=lerp(.28+lift*.25,.51+lift*.25,arch);
  return [
   [0,h,paint],[-w*.72,h-.012,paint],[-w*.94,h-.056,paint],[-w,h-.144,paint],
   [-w*.97,sill+.09,lower],[-w*.91,sill,lower],[-w*.63,.235,trim],
   [w*.63,.235,trim],[w*.91,sill,lower],[w*.97,sill+.09,lower],
   [w,h-.144,paint],[w*.94,h-.056,paint],[w*.72,h-.012,paint]
  ];
 },0,1,length,60));

 const cabinProfile=[
  [.245,.74,.62,.84+lift],[.30,.82,.64,1.02+lift],
  [.40,.82,.66,roofHeight-.035],[.49,.80,.66,roofHeight],[.61,.79,.65,roofHeight-.015],
  [rearRoof-.05,.78,.65,roofHeight-.085],[rearRoof,.76,.61,roofHeight-.26],
  [rearRoof+.065,.71,.59,.80+lift]
 ];
 const topColor=new THREE.Color(),windowColor=new THREE.Color();
 parts.push(shell(t=>{
  const [baseWidth,topWidth,roof]=section(cabinProfile,t);
  const w=baseWidth*width,r=topWidth*width,base=section(bodyProfile,t)[1]+lift-.065;
  const h=Math.max(base+.02,roof);
  const windshield=smoothstep(t,.258,.286)*(1-smoothstep(t,.389,.407));
  const backGlass=smoothstep(t,rearRoof-.102,rearRoof-.079)*(1-smoothstep(t,rearRoof+.044,rearRoof+.062));
  const pillar=1-smoothstep(Math.abs(t-.514),.011,.019);
  const windowStrength=smoothstep(h-base,.07,.24)*(1-.79*pillar);
  topColor.copy(paint).lerp(glass,Math.max(windshield,backGlass));
  windowColor.copy(paint).lerp(glass,windowStrength);
  const edge=(sign,f,color)=>[sign*lerp(w,r,f),lerp(base,h-.057,f),color];
  return [
   [0,h,topColor],[-r*.76,h-.018,topColor],[-r,h-.057,topColor],
   edge(-1,.84,windowColor),edge(-1,.21,windowColor),edge(-1,.055,paint),edge(-1,0,paint),
   edge(1,0,paint),edge(1,.055,paint),edge(1,.21,windowColor),edge(1,.84,windowColor),
   [r,h-.057,topColor],[r*.76,h-.018,topColor]
  ];
 },cabinProfile[0][0],cabinProfile.at(-1)[0],length,50));

 for(const side of [-1,1]){
  for(const axle of [frontAxle,rearAxle]){
   const z=(axle-.5)*length,y=tire+.012;
   parts.push(solid(new THREE.CylinderGeometry(tire,tire,.208,24).rotateZ(Math.PI/2).translate(side*(width-.081),y,z),'#808c98'));
   parts.push(solid(new THREE.CylinderGeometry(tire*.69,tire*.69,.018,24).rotateZ(Math.PI/2).translate(side*(width+.028),y,z),'#aebbc7'));
  }
  for(const direction of [-1,1]){
   const lens=new THREE.SphereGeometry(1,10,6).scale(.15,.037,.048)
    .translate(side*width*.56,.607+lift,direction*(length/2-.014));
   parts.push(solid(lens,direction<0?'#dee8f1':'#b4a9ad'));
  }
 }
 const geometry=mergeGeometries(parts);
 for(const part of parts)part.dispose();
 const root=new THREE.Group();root.name=spec.label;
 const mesh=new THREE.Mesh(geometry,finish);mesh.castShadow=true;
 root.add(mesh);root.userData.vehicleSpec={id:spec.id,length,wheels:[]};
 return {...spec,root};
}

export function loadClayModels(){
 const finish=new THREE.MeshPhysicalMaterial({
  name:'Satin gray traffic exterior',vertexColors:true,roughness:.48,metalness:.05,
  clearcoat:.22,clearcoatRoughness:.42
 });
 return clayVehicleCatalog.map(spec=>buildModel(spec,finish));
}
