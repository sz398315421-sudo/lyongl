const data = {
  perseverance: {
    source:['NASA','https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/'],
    specs:[['用途','火星地表探测'],['乘员','无人'],['质量','1,025 kg'],['供电','MMRTG'],['驱动','六轮独立电驱'],['转向','四角转向'],['机械臂','2.1 m'],['悬架','摇臂转向架']]
  },
  ferrari: {
    source:['Ferrari','https://asset.moto.it/pricelist/auto/a4b74a3ff227460874ffe8fd45c4acb0/catalogo_458_italia.pdf'],
    specs:[['车身','双座跑车'],['布局','中后置后驱'],['发动机','90° V8'],['排量','4,499 cm³'],['最大功率','570 CV'],['峰值扭矩','540 N·m'],['变速箱','7 速双离合'],['制动','碳陶瓷盘']]
  }
};

function section(parent,title,source) {
  const head=document.createElement('div');
  head.className='vehicle-spec-head seg-label';
  head.textContent=title;
  if(source){
    const link=document.createElement('a');
    [link.textContent,link.href]=source;
    link.target='_blank'; link.rel='noopener noreferrer';
    link.title='查看原车技术资料';
    head.append(link);
  }
  const table=document.createElement('dl');
  table.className='specs';
  parent.append(head,table);
  return table;
}
function row(table,key,text,live=false){
  const item=document.createElement('div'),label=document.createElement('dt'),value=document.createElement('dd');
  label.textContent=key; value.textContent=text;
  if(live)value.className='live';
  item.append(label,value);table.append(item);
  return value;
}
export function buildVehicleSpecs(parent,model,app){
  parent.replaceChildren();
  const profile=data[model.config.kind];
  if(profile){
    const table=section(parent,'原车规格',profile.source);
    for(const [key,value] of profile.specs)row(table,key,value);
  }
  const geometry=section(parent,'模型测量');
  const {dimensions:d,contact:c}=model;
  const meters=n=>n.toFixed(2)+' m';
  for(const [label,n] of [['长度',d.x],['宽度',d.z],['高度',d.y]])row(geometry,label,meters(n));
  if(c){
    for(const [label,n] of [['轴距',c.wheelbase],['轮距',c.track],['车轮直径',2*c.radius],['底盘净空',c.clearance]])row(geometry,label,meters(n));
    row(geometry,'轮数',model.config.kind==='ferrari'?'4':'6');
  }
  const live=section(parent,'行驶状态 · 仿真');
  const limit=row(live,'档位限速','—',true),distance=row(live,'本车里程','—',true);
  const pitch=row(live,'俯仰','—',true),roll=row(live,'横滚','—',true);
  const steer=row(live,'前轮转角','—',true),motion=row(live,'行驶状态','—',true);
  const angle=n=>(n*180/Math.PI).toFixed(1)+'°';
  return ()=>{
    limit.textContent=(Math.min(model.mode?.[1]??Infinity,app.profile.maxSpeed)*3.6).toFixed(1)+' km/h';
    distance.textContent=model.distance.toFixed(1)+' m';
    pitch.textContent=angle(c?.pitch??app.rover.body.rotation.z);
    roll.textContent=angle(c?.roll??app.rover.body.rotation.x);
    steer.textContent=angle((app.drive.steer[0]+app.drive.steer[3])/2);
    motion.textContent=app.drive.parked?'驻车':c?.blocked?'遇阻':app.drive.spin?'原地转向':Math.abs(app.drive.v)<.01?'静止':app.drive.auto?'自主行驶':app.drive.v>0?'前进':'倒车';
  };
}

export function buildControls(panel,model,app,setArm){
  panel.replaceChildren();
  const toggles=document.createElement('div');toggles.className='toggles';
  panel.append(toggles);
  function toggle(key,label,onText,offText,initial,apply){
    const el=document.createElement('button');el.type='button';el.className='toggle';el.dataset.system=key;
    el.innerHTML='<span class="box"></span><span></span><span class="state"></span>';
    el.children[1].textContent=label;
    function sync(on){
      el.classList.toggle('on',on);el.setAttribute('aria-pressed',String(on));
      el.lastElementChild.textContent=on?onText:offText;
      apply(on);
    }
    sync(initial);
    el.onclick=()=>sync(el.getAttribute('aria-pressed')!=='true');
    toggles.append(el);
  }
  for(const t of model.systems.toggles){
    toggle(t.key,t.label,t.onText,t.offText,!!t.defaultOn,on=>model.systems.set(t.key,on,app));
  }
  if(model.config.kind==='ferrari'){
    toggle('parking','驻车制动','锁止','释放',false,on=>{
      app.drive.parked=on;
      if(on){app.stop();app.drive.v=app.drive.vw=app.drive.omega=0;app.drive.wheelRate.fill(0);}
    });
  }
  if(model.config.modes){
    const modes=document.createElement('div');modes.className='seg-row';
    modes.innerHTML='<span class="seg-label">驾驶模式</span><div class="seg"></div>';
    const group=modes.lastElementChild;
    for(const mode of model.config.modes){
      const el=document.createElement('button');el.textContent=mode[0];
      el.title='仿真档位限速 '+(mode[1]*3.6).toFixed(1)+' km/h';
      group.append(el);
      el.onclick=()=>{
        model.mode=mode;
        for(const item of group.children){item.classList.toggle('on',item===el);item.setAttribute('aria-pressed',String(item===el));}
      };
    }
    group.firstElementChild.click();panel.append(modes);
  }
  if(model.rig.hasArm){
    const arm=document.createElement('div');
    arm.innerHTML='<label class="seg-row"><span class="seg-label">机械臂行程</span><input type="range" min="0" max="100" value="0"><output class="seg-label">0%</output></label><div class="seg-row"><span class="seg-label">机械臂</span><div class="seg"><button data-play>播放动作</button><button data-home>复位</button></div></div>';
    panel.append(arm);
    arm.querySelector('input').oninput=e=>{model.playing=false;setArm(e.target.value/100)};
    arm.querySelector('[data-play]').onclick=()=>{
      if(model.progress>=1)setArm(0);
      model.playing=!model.playing;setArm(model.progress);
    };
    arm.querySelector('[data-home]').onclick=()=>{model.playing=false;setArm(0)};
    setArm(0);
  }
  if(!model.config.kind)panel.textContent='通用车型 · 外观预览';
}

const parts = {
  perseverance:[
    ['Mastcam_Z_cams','桅杆相机','巡扫时观察相机朝向。',[1,.45,-1]],
    ['turret_obj','机械臂转塔','拖动行程，观察转塔与取芯钻。',[1,.4,1]],
    ['WheelHub_0','前轮轮组','原地转向时观察轮组偏转。',[.65,.35,-1]]
  ],
  ferrari:[
    ['lights','前照灯组','打开前照灯，观察夜间照明。',[1,.35,1]],
    ['steering_wheel','驾驶舱','手动转弯时观察方向盘联动。',[-.35,.55,-1]],
    ['WheelHub_0','前轮轮组','观察轮毂滚动与前轮转向。',[.55,.3,-1]]
  ]
};
export function buildPartViews(container,model,app){
  container.replaceChildren();
  for(const [name,title,detail,direction] of parts[model.config.kind]||[]){
    const node=model.wrapper.getObjectByName(name);
    if(!node)continue;
    const button=document.createElement('button');
    button.className='callout';button.type='button';
    button.innerHTML='<span class="num"></span><span><h3></h3><p></p></span>';
    button.querySelector('.num').textContent=String(container.childElementCount+1).padStart(2,'0');
    button.querySelector('h3').textContent=title;
    button.querySelector('p').textContent=detail;
    button.onclick=()=>{
      const label='部件详图 · '+title;
      if(app.viewName.textContent===label){app.setView('iso');return;}
      const point=model.partCenter(node);
      const ray=point.clone().set(...direction).normalize();
      app.freeView();
      app.closeDrawers();
      app.tweenTo(point.clone().addScaledVector(ray,Math.max(2.6,model.dimensions.x*.65)),point,.8);
      app.viewName.textContent=label;
    };
    container.append(button);
  }
}
