import { defaultModel, models, identifyModel } from './model-config.js?v=catalog1';
import { createVehicleRig } from './vehicle-rig.js';
import { downloadModel } from './model-download.js';

const button = document.getElementById('change-model');
const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = new URL('./swap.css?v=catalog1', import.meta.url);
document.head.append(style);

const dialog = document.createElement('dialog');
dialog.id = 'model-dialog';
dialog.setAttribute('aria-labelledby', 'model-dialog-title');
dialog.innerHTML = `
  <header><strong id="model-dialog-title">更换车型</strong><button type="button" data-close aria-label="关闭">×</button></header>
  <div class="catalog"></div>
  <input hidden type="file" accept=".glb" aria-label="本地 GLB 车型">
  <div class="actions"><button data-open>打开其他 GLB…</button></div>
  <output role="status" aria-live="polite"></output>`;
document.body.append(dialog);
const input = dialog.querySelector('input');
const status = dialog.querySelector('output');
const controls = document.createElement('div');
controls.id = 'vehicle-controls';
document.querySelector('#toggles').after(controls);
let active = null;
let original = null;
let generation = 0;
let library = null;


async function loadLibrary() {
  if (!library) library = Promise.all([import('three'), import('./vendor/GLTFLoader.js'), import('./vendor/DRACOLoader.js')])
    .catch(error => { library = null; throw error; });
  return library;
}

function disposeModel(model) {
  const resources = new Set();
  model.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of [].concat(object.material || [])) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
    if (object.skeleton) resources.add(object.skeleton);
  });
  for (const resource of resources) resource.dispose();
}

async function readVehicle(buffer, config) {
  const [T, { GLTFLoader }, { DRACOLoader }] = await loadLibrary();
  const manager = new T.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(blob:|data:)/i.test(url)) return url;
    throw new Error('请将材质与纹理嵌入一个 GLB 文件。');
  });
  const decoder = new DRACOLoader().setDecoderPath({
    js:new URL('./vendor/draco/draco_wasm_wrapper.js',import.meta.url).href,
    wasm:new URL('./vendor/draco/draco_decoder.wasm',import.meta.url).href
  }).setWorkerLimit(2);
  let gltf;
  try {
    gltf = await new GLTFLoader(manager).setDRACOLoader(decoder).parseAsync(buffer,'');
  } finally { decoder.dispose(); }
  const { scene, animations } = gltf;
  config = identifyModel(scene) || config;
  const wrapper = new T.Group();
  const orientation = new T.Group();
  orientation.rotation.y = (Number(config.heading) || 0) * Math.PI / 180;
  orientation.add(scene);
  wrapper.add(orientation);
  const box = new T.Box3().setFromObject(wrapper, true);
  const dimensions = box.getSize(new T.Vector3());
  const length = Math.max(dimensions.x, dimensions.y, dimensions.z);
  if (!(length > 0 && Number.isFinite(length))) {
    disposeModel(scene);
    throw new Error('模型缺少可显示的几何体。');
  }
  const scale = (Number(config.length) > 0 ? Number(config.length) : 3.94) / length;
  wrapper.scale.setScalar(scale);
  const center = box.getCenter(new T.Vector3());
  wrapper.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  const rig = createVehicleRig(T, scene, animations, config.kind || 'generic', scale);
  const surfaces = [];
  wrapper.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    surfaces.push([mesh, mesh.material]);
  });
  const wire = new T.MeshBasicMaterial({color:0x36382d, wireframe:true});
  const xray = new T.MeshBasicMaterial({color:0x718270, transparent:true, opacity:.24, depthWrite:false});
  function renderMode(mode) {
    for (const [mesh, material] of surfaces) mesh.material = mode === 'line' ? wire : mode === 'xray' ? xray : material;
  }
  return { wrapper, rig, config, dimensions: dimensions.multiplyScalar(scale), renderMode, dispose() {
    rig.dispose();
    renderMode('shaded');
    wrapper.removeFromParent();
    disposeModel(wrapper);
    wire.dispose();
    xray.dispose();
  }};
}

const unavailable = ['labels', 'dims', 'explode', 'hover'];
function bindSimulation(app) {
  if (original) return;
  const { rover, overlay, panels } = app;
  const group = new rover.body.constructor();
  for (const child of [...rover.body.children]) group.add(child);
  rover.body.add(group);
  overlay.gLeaders.classList.add('er6-leaders');
  const nodes = ['.tb-id .big', '.tb-id .sub', '.foot-id b', '#dim-front-w', '#dim-front-h', '#dim-side-l', '#dim-top-w', '#titlebar .grow', '#help-title'].map(s => document.querySelector(s));
  original = { group, nodes, text: nodes.map(el=>el?.textContent) };
  original.extents = app.minis.views.map(view=>view.ext);
  const writeSettings = app.share.write.bind(app.share);
  app.share.write = () => {
    if (!active) return writeSettings();
    const settings = app.sys;
    app.sys = {...original.settings, overlay:settings.overlay};
    try { writeSettings(); } finally { app.sys = settings; }
  };

  const setSystem = app.setSystem.bind(app);
  app.setSystem = (key, value) => {
    if (!active || key === 'overlay') setSystem(key, value);
  };
  original.setSystem = setSystem;
  const pointTurn = app.pointTurn.bind(app);
  app.pointTurn = () => { if (!active || active.config.pointTurn) pointTurn(); };
  const driveUpdate = app.drive.update.bind(app.drive);
  app.drive.update = (dt, input) => {
    if (active?.mode) {
      const limit = Math.min(input.profile.maxSpeed, active.mode[1]);
      input = {...input, profile:{...input.profile, maxSpeed:limit}};
    }
    driveUpdate(dt, input);
    if (active) {
      active.rig.update(dt, app.drive);
      if (active.playing) updateArm(Math.min(1, active.progress + dt / active.rig.armDuration));
    }
  };
  const setMode = app.setRenderMode.bind(app);
  app.setRenderMode = mode => {
    setMode(mode);
    active?.renderMode(mode);
  };
  const drawMiniatures = app.minis.render.bind(app.minis);
  app.minis.render = () => {
    if (!active) return drawMiniatures();
    active.renderMode('line');
    try { drawMiniatures(); } finally { active.renderMode(app.lib.mode); }
  };
  const extraSpecs = document.createElement('dl');
  extraSpecs.id = 'imported-specs';
  document.querySelector('#specs').after(extraSpecs);
  for (const [key,label] of [['x','车长'],['z','车宽'],['y','车高']]) {
    const row=document.createElement('div'), term=document.createElement('dt'), value=document.createElement('dd');
    term.textContent=label;
    value.dataset.dimension=key;
    row.append(term,value);
    extraSpecs.append(row);
  }
  original.extraSpecs = extraSpecs;
  const layout = document.createElement('div');
  layout.innerHTML = '<dt>行走机构</dt><dd></dd>';
  extraSpecs.prepend(layout);
  original.layout = layout.querySelector('dd');
  const help = document.createElement('div');
  help.className = 'help-body vehicle-help';
  document.querySelector('#help .help-body').after(help);
  original.help = help;
}

function updateArm(progress) {
  active.progress = progress;
  active.rig.setArm(progress);
  controls.querySelector('input').value = Math.round(progress * 100);
  controls.querySelector('output').value = Math.round(progress * 100) + '%';
  if (progress >= 1) active.playing = false;
  controls.querySelector('[data-play]').textContent = active.playing ? '暂停' : '播放动作';
}

function configureControls(model) {
  const {config, rig} = model;
  controls.replaceChildren();
  if (config.modes) {
    const label = document.createElement('label');
    label.textContent = '驾驶模式';
    const select = document.createElement('select');
    for (const [name, speed] of config.modes) select.add(new Option(name + ' · ' + (speed * 3.6).toFixed(1) + ' km/h', name));
    select.onchange = () => { model.mode = config.modes[select.selectedIndex]; };
    model.mode = config.modes[0];
    label.append(select);
    controls.append(label);
  }
  if (rig.hasArm) {
    const arm = document.createElement('div');
    arm.innerHTML = '<label>机械臂行程 <output>0%</output><input type="range" min="0" max="100" value="0"></label><div><button class="mini" data-play>播放动作</button> <button class="mini" data-home>复位</button></div>';
    controls.append(arm);
    arm.querySelector('input').oninput = event => { model.playing = false; updateArm(event.target.value / 100); };
    arm.querySelector('[data-play]').onclick = () => {
      if (model.progress >= 1) updateArm(0);
      model.playing = !model.playing;
      updateArm(model.progress);
    };
    arm.querySelector('[data-home]').onclick = () => { model.playing = false; updateArm(0); };
    updateArm(0);
  }
  controls.onkeydown = e => e.stopPropagation();
  if (!controls.children.length) controls.textContent = '通用车型 · 外观预览';
}

function releaseActive() {
  if (active?.builtIn) {
    active.playing = false;
    active.wrapper.removeFromParent();
  } else {
    active?.dispose();
  }
}

function activate(app, model) {
  if (model === active) return;
  bindSimulation(app);
  if (app.focused >= 0) app.setFocus(-1);
  app.hoverCallout(-1);
  app.setHoverPart(null);
  if (!active) original.settings = {...app.sys};
  app.stop();
  app.drive.v = app.drive.vw = app.drive.omega = 0;
  app.panels.keys.clear();
  releaseActive();
  active = model;
  original.group.visible = false;
  app.rover.body.add(model.wrapper);
  document.body.classList.add('has-imported-model');
  document.body.classList.toggle('can-point-turn', !!model.config.pointTurn);
  app.scoutView.group.visible = false;
  app.tracks.mesh.visible = false;
  for (const [key,value] of Object.entries({solar:false,drone:false,reactor:true,radiators:true,lights:false,lidar:false,thermal:false,labels:false,dims:false,explode:false,hover:false})) {
    original.setSystem(key,value);
  }
  for (const key of unavailable) app.panels.showEls[key].disabled = true;
  const { config, dimensions } = model;
  const dims = [dimensions.z, dimensions.y, dimensions.x].map(n=>Math.round(n*1000));
  const labels = [config.id, config.name, config.id+' ／ '+config.name, '宽 '+dims[0], '高 '+dims[1], '长 '+dims[2], dims[2]+' × '+dims[0],config.name,config.name+' · 操作说明'];
  original.nodes.forEach((el,i)=>{if(el) el.textContent=labels[i]});
  original.layout.textContent = config.layout || '通用底盘';
  original.extraSpecs.querySelectorAll('[data-dimension]').forEach(dd=>dd.textContent=dimensions[dd.dataset.dimension].toFixed(2)+' 米');
  const heights = Math.max(dimensions.y,2.1);
  const extents = [[dimensions.z,heights],[dimensions.x,heights],[dimensions.x,dimensions.z]];
  app.minis.views.forEach((view,i)=>{ view.ext=extents[i]; });
  model.renderMode(app.lib.mode);
  configureControls(model);
  original.help.textContent = 'W/S 加减油门，A/D 转向，空格停车。拖动旋转视角，滚轮缩放。' +
    (config.layout ? config.layout+'。系统面板可切换仿真限速，实际速度受地形影响。' : '此模型使用通用底盘。') +
    (model.rig.hasArm ? '拖动机械臂行程可逐段观察关节，也可播放完整动作。T 键启动原地转向。' : '');
  app.resize();
}

function restore(app) {
  ++generation;
  if (!active) return;
  app.stop();
  releaseActive();
  active=null;
  original.group.visible=true;
  app.minis.views.forEach((view,i)=>{ view.ext=original.extents[i]; });
  document.body.classList.remove('has-imported-model','can-point-turn');
  controls.replaceChildren();
  app.scoutView.group.visible = true;
  app.tracks.mesh.visible = true;
  app.tracks.reset();
  for (const [key,value] of Object.entries(original.settings)) if (key !== 'overlay') original.setSystem(key,value);
  for (const key of unavailable) app.panels.showEls[key].disabled=false;
  original.nodes.forEach((el,i)=>{if(el) el.textContent=original.text[i]});
  status.textContent='';
  app.resize();
}

async function openLocal(app, file) {
  const config = {id:'自选车型',name:file.name.replace(/\.glb$/i,''),length:3.94};

  const token=++generation;
  const show = message => { if (token === generation) status.textContent=message; };
  show('正在读取本地文件…');
  let timer;
  const deadline = ms => {
    clearTimeout(timer);
    timer = setTimeout(()=>{
      if (token !== generation) return;
      show('加载超时，请重新选择车型以重试。');
      ++generation;
    },ms);
  };
  deadline(120000);
  try {
    const [buffer] = await Promise.all([file.arrayBuffer(),loadLibrary()]);
    if (token!==generation) return;
    show('正在解析 '+config.id+' 的模型与关节…');
    deadline(45000);
    await new Promise(resolve=>setTimeout(resolve,0));
    const model=await readVehicle(buffer,config);
    if (token!==generation) return model.dispose();
    activate(app,model);
    status.textContent='';
    dialog.close();
  } catch(error) {
    if(token!==generation)return;
    console.error('车型载入失败',error);
    status.textContent='无法载入车型，请选择内嵌材质和纹理的标准 GLB 文件。';
    if(!dialog.open) dialog.showModal();
  } finally {
    clearTimeout(timer);
  }
}

// One preparation job and one reusable scene per catalog entry, including when
// the user selects a car while its background preparation is still running.
function catalogEntry(app, config, indicator) {
  let task;
  function prepare() {
    if (task) return task;
    const controller = new AbortController();
    const signal = controller.signal;
    const url = new URL(config.url,import.meta.url);
    url.searchParams.set('v','compact1');
    indicator.textContent='准备中';
    let timer;
    async function load() {
      const [buffer] = await Promise.all([downloadModel(url,signal,(loaded,total)=>{
        indicator.textContent='准备中 '+Math.floor(loaded/total*100)+'%';
      }),loadLibrary()]);
      signal.throwIfAborted();
      indicator.textContent='正在组装';
      const model = await readVehicle(buffer,config);
      try {
        signal.throwIfAborted();
        await app.renderer.compileAsync(model.wrapper,app.camera,app.scene);
        signal.throwIfAborted();
        model.builtIn=true;
        indicator.textContent='就绪';
        return model;
      } catch(error) { model.dispose(); throw error; }
    }
    const timeout = new Promise((_,reject)=>{
      timer=setTimeout(()=>{
        controller.abort();
        reject(new Error('车型准备超时'));
      },120000);
    });
    task=Promise.race([load(),timeout]).catch(error=>{
      controller.abort();
      task=null;
      indicator.textContent='点击重试';
      throw error;
    }).finally(()=>clearTimeout(timer));
    return task;
  }
  async function select() {
    const token=++generation;
    status.textContent='车型就绪后将自动切换。';
    try {
      const model=await prepare();
      if (generation!==token) return;
      activate(app,model);
      dialog.close();
    } catch(error) {
      if (generation!==token) return;
      console.error('车型切换失败',error);
      status.textContent='车型准备失败，请点选车型重试。';
    }
  }
  return {prepare,select};
}

async function init() {
  const app=window.app;
  if(!app || !button) return;
  button.disabled=true;
  await app.ready;
  if (!app.panels) return;
  button.disabled=false;
  button.addEventListener('click',()=>{
    app.panels.keys.clear();
    status.textContent=active?'当前车型：'+active.config.name:'当前车型：ER-6 六轮探测车';
    dialog.showModal();
  });
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('close',()=>{++generation;input.value=''});
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-open]').onclick=()=>input.click();
  for (const config of [defaultModel,...models]) {
    const choice = document.createElement('button');
    choice.textContent = config.id+' · '+config.name;
    if (config.url) {
      const indicator=document.createElement('small');
      choice.append('　',indicator);
      const entry=catalogEntry(app,config,indicator);
      choice.onclick=entry.select;
      // Background failures stay on the relevant menu row. Clicking it retries.
      if (config===defaultModel) entry.select();
      else entry.prepare().catch(()=>{});
    } else choice.onclick=()=>{restore(app);dialog.close()};
    dialog.querySelector('.catalog').append(choice);
  }
  input.onchange=()=>{
    const file=input.files[0];
    if(file)openLocal(app,file);
  };
}
init();
