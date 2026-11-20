export function createVehicleSystems(T,scene,config,wrapper,animations){
  const toggles=[],effects=[];
  function register(key,label,onText,offText,apply,defaultOn=false){
    toggles.push({key,label,onText,offText,defaultOn});
    effects.push({key,apply,on:defaultOn});
  }
  let elapsed=0,previousSpeed=0,mixer;
  if(config.kind==='perseverance'){
    const mastClip=animations.find(clip=>clip.name==='topAction');
    if(mastClip){
      mixer=new T.AnimationMixer(scene);
      const action=mixer.clipAction(mastClip);
      register('mast','相机桅杆巡扫','巡扫中','待机',(on,dt)=>{
        if(on){if(!action.isRunning())action.reset().play();mixer.update(dt)}
        else if(action.isRunning())action.stop();
      });
    }
    const antenna=scene.getObjectByName('antenna_hg');
    if(antenna){
      const rest=antenna.rotation.y;
      register('antenna','高增益天线','指向中','归位',(on,dt)=>{
        const target=rest + (on ? 0.85 : 0);
        antenna.rotation.y+=Math.sign(target-antenna.rotation.y)*Math.min(Math.abs(target-antenna.rotation.y),dt*.9);
      });
    }
    const drill=scene.getObjectByName('corring_drill');
    if(drill){const rest=drill.rotation.z;
      register('drill','转塔取芯钻','旋转中','停止',(on,dt)=>{drill.rotation.z=on?drill.rotation.z+dt*8:rest});
    }
  }
  const lamps=[];
  if(config.kind==='ferrari'){
    function lampsOn(name,color){
      const materials=new Set();
      scene.getObjectByName(name)?.traverse(mesh=>{
        for(const mat of [].concat(mesh.material||[]))if(mat.emissive)materials.add(mat);
      });
      return value=>{for(const mat of materials){mat.emissive.setHex(color);mat.emissiveIntensity=value}};
    }
    const headlights=lampsOn('lights',0xffeaca),hazards=lampsOn('leds',0xff891a),brakes=lampsOn('lights_red',0xe7160c);
    const node=scene.getObjectByName('lights');
    if(node){
      wrapper.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(node,true);
      for(const z of [box.min.z,box.max.z]){
        const light=new T.SpotLight(0xffedcf,0,10,.45,.55);
        const pos=box.getCenter(new T.Vector3());pos.z=z;
        light.position.copy(wrapper.worldToLocal(pos.clone()));
        pos.x+=7;pos.y-=.45;
        light.target.position.copy(wrapper.worldToLocal(pos));
        wrapper.add(light,light.target);lamps.push(light);
      }
      register('headlights','前照灯','照明中','关闭',on=>{
        headlights(on?4:0);for(const light of lamps)light.intensity=on?22:0;
      });
    }
    if(scene.getObjectByName('leds'))register('hazards','危险警告灯','双闪中','关闭',on=>hazards(on&&elapsed%1<.5?5:0));
    if(scene.getObjectByName('lights_red'))register('brakeLights','制动灯联动','自动','关闭',(on,dt,drive)=>{
      if(!drive)return brakes(0);
      const speed=Math.abs(drive.v);
      brakes(on&&(drive.parked||speed<previousSpeed-dt*.09)?3.5:0);
    },true);
  }
  return {
    toggles,
    set(key,on,app){
      const effect=effects.find(e=>e.key===key);
      if(effect){effect.on=on;effect.apply(on,0,app.drive)}
    },
    update(dt,drive){elapsed+=dt;for(const e of effects)e.apply(e.on,dt,drive);previousSpeed=Math.abs(drive.v)},
    reset(app){for(const e of effects){e.on=false;e.apply(false,10,app.drive)}elapsed=previousSpeed=0},
    dispose(){if(mixer){mixer.stopAllAction();mixer.uncacheRoot(scene)}for(const light of lamps){light.removeFromParent();light.target.removeFromParent();light.dispose()}}
  };
}
