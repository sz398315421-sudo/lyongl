import { defaultModel } from './model-config.js';

const button = document.getElementById('change-model');
const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = new URL('./swap.css', import.meta.url);
document.head.append(style);

const dialog = document.createElement('dialog');
dialog.id = 'model-dialog';
dialog.setAttribute('aria-labelledby', 'model-dialog-title');
dialog.innerHTML = `
  <header><strong id="model-dialog-title">更换车型</strong><button type="button" data-close aria-label="关闭">×</button></header>
  <p>选择包含贴图的 GLB 文件，在当前地形上预览车辆。文件仅在本机读取。</p>
  <p>驾驶、悬架与导航沿用 ER-6 底盘参数。通用车型支持实体、线框和透视显示。</p>
  <input hidden type="file" accept=".glb" aria-label="本地 GLB 车型">
  <div class="actions"><button data-open>选择本地 GLB</button><button data-reset disabled>恢复 ER-6</button></div>
  <output role="status" aria-live="polite"></output>`;
document.body.append(dialog);
const input = dialog.querySelector('input');
const status = dialog.querySelector('output');
const reset = dialog.querySelector('[data-reset]');
let active = null;
let original = null;
let generation = 0;
let library = null;

async function loadLibrary() {
  if (!library) library = Promise.all([import('three'), import('./vendor/GLTFLoader.js')]);
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
  const [T, { GLTFLoader }] = await loadLibrary();
  const manager = new T.LoadingManager();
  manager.setURLModifier(url => {
    if (/^(blob:|data:)/i.test(url)) return url;
    throw new Error('请将材质与纹理嵌入一个 GLB 文件。');
  });
  const { scene } = await new GLTFLoader(manager).parseAsync(buffer, '');
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
  return { wrapper, config, dimensions: dimensions.multiplyScalar(scale), renderMode, dispose() {
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
  const nodes = ['.tb-id .big', '.tb-id .sub', '.foot-id b', '#dim-front-w', '#dim-front-h', '#dim-side-l', '#dim-top-w'].map(s => document.querySelector(s));
  original = { group, nodes, text: nodes.map(el=>el?.textContent) };

  const setSystem = app.setSystem.bind(app);
  app.setSystem = (key, value) => {
    if (!active || !unavailable.includes(key)) setSystem(key, value);
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
}

function activate(app, model) {
  bindSimulation(app);
  if (app.focused >= 0) app.setFocus(-1);
  app.hoverCallout(-1);
  app.setHoverPart(null);
  active?.dispose();
  active = model;
  original.group.visible = false;
  app.rover.body.add(model.wrapper);
  document.body.classList.add('has-imported-model');
  for (const key of unavailable) app.panels.showEls[key].disabled = true;
  const { config, dimensions } = model;
  const dims = [dimensions.z, dimensions.y, dimensions.x].map(n=>Math.round(n*1000));
  const labels = [config.id, config.name, config.id+' ／ '+config.name, '宽 '+dims[0], '高 '+dims[1], '长 '+dims[2], dims[2]+' × '+dims[0]];
  original.nodes.forEach((el,i)=>{if(el) el.textContent=labels[i]});
  original.extraSpecs.querySelectorAll('dd').forEach(dd=>dd.textContent=dimensions[dd.dataset.dimension].toFixed(2)+' 米');
  model.renderMode(app.lib.mode);
  reset.disabled=false;
  app.resize();
}

function restore(app) {
  ++generation;
  if (!active) return;
  active.dispose();
  active=null;
  original.group.visible=true;
  document.body.classList.remove('has-imported-model');
  for (const key of unavailable) app.panels.showEls[key].disabled=false;
  original.nodes.forEach((el,i)=>{if(el) el.textContent=original.text[i]});
  reset.disabled=true;
  status.textContent='';
  app.resize();
}

async function change(app, getBuffer, config) {
  const token=++generation;
  status.textContent='正在读取车型…';
  try {
    const model=await readVehicle(await getBuffer(),config);
    if (token!==generation) return model.dispose();
    activate(app,model);
    status.textContent='';
    dialog.close();
  } catch(error) {
    if(token!==generation)return;
    console.error('车型载入失败',error);
    status.textContent='无法载入车型，请选择内嵌材质和纹理的标准 GLB 文件。';
    if(!dialog.open) dialog.showModal();
  }
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
  reset.onclick=()=>{restore(app);dialog.close()};
  input.onchange=()=>{
    const file=input.files[0];
    if(file)change(app,()=>file.arrayBuffer(),{id:'自选车型',name:file.name.replace(/\.glb$/i,''),length:3.94});
  };
  if(defaultModel.url) await change(app,async()=>{
    const response=await fetch(defaultModel.url);
    if(!response.ok)throw new Error('车型请求失败');
    return response.arrayBuffer();
  },defaultModel);
}
init();
