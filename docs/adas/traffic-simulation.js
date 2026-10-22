// Distances are metres; settings use km/h. All cars travel towards -Z.
export const trafficDefaults=Object.freeze({enabled:false,density:45,speed:60,overtake:30,gap:18,variation:15});
export const trafficLimits=Object.freeze({density:[0,100],speed:[0,140],overtake:[0,100],gap:[4,60],variation:[0,40]});
export const trafficScenes=Object.freeze(['road','elevated','ramp']);
export const trafficVehicleLength=5.2;
export const maxTrafficVehicles=36;
export function normalizeTrafficSettings(value={},fallback=trafficDefaults){
 const result={enabled:typeof value.enabled==='boolean'?value.enabled:fallback.enabled};
 for(const [key,[min,max]]of Object.entries(trafficLimits)){
  const number=value[key]===null||value[key]===''?NaN:Number(value[key]);
  result[key]=Number.isFinite(number)?Math.max(min,Math.min(max,Math.round(number))):fallback[key];
 }
 return result;
}
export function readTrafficSettings(query,storage){
 let saved={};try{saved=JSON.parse(storage?.getItem('sr-traffic')||'{}')||{};}catch{}
 const settings=normalizeTrafficSettings({...saved,enabled:false});
 if(query.has('traffic'))settings.enabled=query.get('traffic')==='1';
 for(const key of Object.keys(trafficLimits))if(query.has('traffic'+key))settings[key]=query.get('traffic'+key);
 return normalizeTrafficSettings(settings);
}
export function writeTrafficQuery(query,settings){
 query.set('traffic',settings.enabled?'1':'0');
 for(const key of Object.keys(trafficLimits))query.set('traffic'+key,String(settings[key]));
}
const smooth=t=>t*t*t*(t*(t*6-15)+10);
export function createTrafficSimulation({settings=trafficDefaults,random=Math.random}={}){
 let config=normalizeTrafficSettings(settings),cars=[],context=null,time=0,nextId=1,changes=0,serial=0;
 const clearance=()=>config.gap+trafficVehicleLength;
 const occupies=(car,lane)=>car.lane===lane||car.change?.to===lane;
 const egoLanes=()=>context.centers.map((x,i)=>Math.abs(x-context.ego.x)<2.8?i:-1).filter(i=>i>=0);
 const obstacles=lane=>{
  const list=[];
  if(egoLanes().includes(lane))list.push({z:context.ego.z,length:context.ego.length||5.2,speed:0});
  if(context.closure&&context.centers[lane]+1.05>=context.closure.left&&context.centers[lane]-1.05<=context.closure.right)
   list.push({z:context.closure.front,length:0,speed:0,closure:true});
  return list;
 };
 function free(lane,z,ignore=null,margin=clearance()){
  if(context.closure&&context.centers[lane]+1.05>=context.closure.left&&context.centers[lane]-1.05<=context.closure.right&&z<context.closure.front+margin&&z>context.closure.back-margin)return false;
  return !cars.some(car=>car!==ignore&&occupies(car,lane)&&Math.abs(car.z-z)<margin)&&
   !obstacles(lane).some(car=>Math.abs(car.z-z)<config.gap+(trafficVehicleLength+car.length)/2);
 }
 function capacity(){
  if(!context?.centers.length||config.density===0)return 0;
  const perLane=Math.min(12,Math.floor((context.maxZ-context.minZ)/clearance()));
  return Math.round(Math.min(maxTrafficVehicles,perLane*context.centers.length)*config.density/100);
 }
 function spawn(lane,z){
  const bias=random()*2-1;
  cars.push({id:nextId++,lane,x:context.centers[lane],z,speed:config.speed===0?0:Math.max(0,config.speed+bias*config.variation)/3.6,bias,
   change:null,cooldown:1+random()*4,braking:false,yaw:0});
 }
 function populate(){
  const target=capacity(),lanes=context.centers.length,span=context.maxZ-context.minZ;
  // Start with visible cars, then distribute the rest across the authored road.
  const slots=Math.max(1,Math.ceil(target/lanes)),spacing=span/slots;
  for(let row=0;row<slots&&cars.length<target;row++)for(let lane=0;lane<lanes&&cars.length<target;lane++){
   const z=context.maxZ-((row+.45+(lane%2)*.22)*spacing)%span;
   if(free(lane,z))spawn(lane,z);
  }
  for(let i=0;i<target*80&&cars.length<target;i++){
   const lane=Math.floor(random()*lanes),z=context.minZ+random()*span;
   if(free(lane,z))spawn(lane,z);
  }
 }
 function reset(nextContext=context){context=nextContext;cars=[];time=0;changes=0;serial++;if(context)populate();}
 function configure(value){
  const next=normalizeTrafficSettings({...config,...value}),reseed=next.density!==config.density||next.gap!==config.gap;
  config=next;if(reseed&&context)reset();return {...config};
 }
 function leader(car,lane){
  let best=null,distance=Infinity;
  for(const other of [...cars.filter(other=>other!==car&&occupies(other,lane)),...obstacles(lane)]){
   // Closure is a segment; cars already past its far edge may continue.
   if(other.closure&&car.z<context.closure.back)continue;
   const gap=car.z-other.z-(trafficVehicleLength+(other.length??trafficVehicleLength))/2;
   if(other.z<=car.z&&gap<distance){distance=gap;best={...other,gap};}
  }
  return best;
 }
 function canChange(car,lane){
  if(lane<0||lane>=context.centers.length||!free(lane,car.z,car))return false;
  // Reserve both lanes for the full manoeuvre, including the approaching rear car.
  return !cars.some(other=>other!==car&&occupies(other,lane)&&
   Math.abs((other.z-other.speed*2.8)-(car.z-car.speed*2.8))<clearance());
 }
 function step(dt,nextContext=context){
  if(!nextContext)return;context=nextContext;
  // Fixed bounded substeps keep gap checks valid even after a slow frame.
  let remaining=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.25));
  while(remaining>1e-8){const delta=Math.min(remaining,1/30);remaining-=delta;time+=delta;
   for(const car of cars){
    car.cooldown-=delta;
    const desired=config.speed===0?0:Math.max(0,config.speed+car.bias*config.variation)/3.6;
    const front=leader(car,car.lane),impeded=front&&front.gap<config.gap+desired*2.4&&front.speed<desired-.4;
    if(!car.change&&car.cooldown<=0){
     car.cooldown=3+random()*4;
     if(impeded&&random()<config.overtake/100){
      for(const target of [car.lane-1,car.lane+1]){
       const ahead=target>=0&&target<context.centers.length?leader(car,target):null;
       if(canChange(car,target)&&(!ahead||ahead.gap>front.gap+4)){
        car.change={from:car.lane,to:target,elapsed:0,duration:2.8};changes++;break;
       }
      }
     }
    }
    let available=Infinity,targetSpeed=desired;
    for(const lane of car.change?[car.lane,car.change.to]:[car.lane]){
     const ahead=leader(car,lane);if(!ahead)continue;
     available=Math.min(available,Math.max(0,ahead.gap-config.gap));
     targetSpeed=Math.min(targetSpeed,Math.max(0,ahead.speed+(ahead.gap-config.gap)/1.8));
    }
    const oldSpeed=car.speed;
    car.speed=Math.max(0,Math.min(targetSpeed,car.speed+2.2*delta));
    const travel=Math.min(available,car.speed*delta);car.speed=Math.min(car.speed,travel/delta);car.z-=travel;car.braking=car.speed<oldSpeed-.02;
    if(car.change){
     const change=car.change;change.elapsed=Math.min(change.duration,change.elapsed+delta);
     const t=change.elapsed/change.duration,dx=context.centers[change.to]-context.centers[change.from];
     car.x=context.centers[change.from]+dx*smooth(t);
     car.yaw=-Math.atan2(dx*30*t*t*(1-t)*(1-t)/change.duration,Math.max(car.speed,2));
     if(t===1){car.lane=change.to;car.change=null;car.yaw=0;}
    }
   }
   cars=cars.filter(car=>car.z>=context.minZ);
   const target=capacity();
   for(let attempt=0;attempt<context.centers.length&&cars.length<target;attempt++){
    const lane=Math.floor(random()*context.centers.length),z=context.maxZ;
    if(free(lane,z))spawn(lane,z);
   }
  }
 }
 return {configure,reset,step,capacity,updateContext(value){context=value;},get cars(){return cars;},get time(){return time;},get settings(){return {...config};},
  snapshot(){return {count:cars.length,target:capacity(),time,changes,serial,cars:cars.map(car=>({...car,change:car.change?{...car.change}:null}))};},
  capture(){return {cars:cars.map(car=>({...car,change:car.change?{...car.change}:null})),time,changes,serial,nextId};},
  restore(value){cars=value.cars.map(car=>({...car,change:car.change?{...car.change}:null}));({time,changes,serial,nextId}=value);}
 };
}
