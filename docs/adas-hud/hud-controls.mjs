import {hudPreferences, readHudLastSettings} from './hud-storage.mjs';
import {bindHexColor, normalizeOpacity} from './hud-hex.mjs';
import {blueRoadColor} from './hud-blue-road.mjs';

const cameraFields = [
  ['yaw', '水平角', -180, 180, 0, '°'],
  ['pitch', '俯角', 4, 88, 23, '°'],
  ['distance', '相机距离', 5, 100, 24, ' m'],
  ['fov', '视野角', 20, 85, 38, '°'],
  ['ahead', '向前看', -10, 35, 7, ' m']
];
const defaultView = Object.fromEntries(cameraFields.map(([key, , , , value]) => [key, value]));
const guideFields = [
  ['width', '宽度', .2, 3.6, 1.4, ' m', .1],
  ['length', '长度', 4, 110, 32, ' m', 1]
];
const opacityField = (key, name) => [key, name, 0, 100, 100, '%', 1, '不透明度'];
const defaultGuide = {width: 1.4, length: 32, gradient: false, far: '#72eaff', nearOpacity: 100, farOpacity: 100};
const defaultLaneColor = '#48a9ff';
const defaultLaneOpacity = 38;
const defaultMarking = {base: null, highlight: blueRoadColor, width: 100, baseOpacity: 100, highlightOpacity: 100};
const isHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

function readSettings() {
  const last = readHudLastSettings();
  let saved = last?.controls;
  if (!saved) {
    try { saved = JSON.parse(hudPreferences.getItem('preview-controls')); } catch {}
  }
  const query = new URLSearchParams(location.search);
  const lastQuery = new URLSearchParams(last?.query);
  const linkedView = last && query.has('view') &&
    (query.get('view') !== lastQuery.get('view') || query.has('scene') && query.get('scene') !== lastQuery.get('scene'));
  const view = {...defaultView};
  for (const [key, , min, max] of cameraFields) {
    const value = saved?.view?.[key];
    if (Number.isFinite(value)) view[key] = Math.min(max, Math.max(min, value));
  }
  const colors = {};
  const laneOpacity = {};
  for (const [key, value] of Object.entries(saved?.colors ?? {})) {
    if (!/^\d{2}:\d:[0-5]$/.test(key) || !isHex(value)) continue;
    colors[key] = value;
    laneOpacity[key] = normalizeOpacity(saved?.laneOpacity?.[key], defaultLaneOpacity);
  }
  const marking = {
    base: isHex(saved?.marking?.base) ? saved.marking.base : null,
    highlight: isHex(saved?.marking?.highlight) ? saved.marking.highlight : blueRoadColor,
    width: Number.isFinite(saved?.marking?.width) ? Math.min(300, Math.max(25, saved.marking.width)) : defaultMarking.width,
    baseOpacity: normalizeOpacity(saved?.marking?.baseOpacity),
    highlightOpacity: normalizeOpacity(saved?.marking?.highlightOpacity)
  };
  const guide = {...defaultGuide, gradient: saved?.guide?.gradient === true,
    nearOpacity: normalizeOpacity(saved?.guide?.nearOpacity), farOpacity: normalizeOpacity(saved?.guide?.farOpacity)};
  for (const [key, , min, max] of guideFields) {
    const value = saved?.guide?.[key];
    if (Number.isFinite(value)) guide[key] = Math.min(max, Math.max(min, value));
  }
  if (typeof saved?.guide?.far === 'string' && /^#[\da-f]{6}$/i.test(saved.guide.far)) guide.far = saved.guide.far;
  const starts = {};
  for (const key of ['road', 'elevated', 'ramp', 'junction', 'parking']) {
    const start = saved?.starts?.[key];
    if (start && Number.isFinite(start.distance)) {
      starts[key] = {distance: Math.round(start.distance), lane: Number.isInteger(start.lane) && start.lane >= 0 ? start.lane : null};
    }
  }
  const preset = ['blueRoad', 'carpet'].includes(saved?.preset) ? saved.preset : saved?.carpet === true ? 'carpet' : null;
  return {ego: saved?.ego !== false, follow: saved?.follow === true, customCamera: saved?.customCamera === true && !linkedView, preset, beamOnly: saved?.beamOnly === true, colors, laneOpacity, marking, view, guide, starts};
}

function slider([key, name, min, max, , unit, step = 1, labelText = name], values, prefix, change) {
  const label = document.createElement('label');
  const title = document.createElement('span');
  const input = document.createElement('input');
  const value = document.createElement('output');
  label.className = 'traffic-field';
  title.textContent = labelText;
  input.type = 'range';
  input.id = `${prefix}-${key}`;
  input.setAttribute('aria-label', name);
  input.min = min;
  input.max = max;
  input.step = step;
  value.htmlFor = input.id;
  const sync = () => {
    input.value = values[key];
    input.style.setProperty('--range-fill', `${(input.valueAsNumber - min) / (max - min) * 100}%`);
    value.value = `${values[key]}${unit}`;
    input.setAttribute('aria-valuetext', value.value);
  };
  input.addEventListener('input', () => {
    values[key] = input.valueAsNumber;
    sync();
    change();
  });
  label.append(title, value, input);
  sync();
  return {label, sync};
}

export function createHudControls(onChange, onSave) {
  const byId = id => document.getElementById(id);
  const settings = readSettings();
  const panel = byId('hud-camera-controls');
  const lanePanel = byId('hud-lane-controls');
  const laneSelect = byId('hud-lane');
  const laneColor = byId('hud-lane-color');
  const laneReset = byId('hud-lane-reset');
  const cameraReset = byId('hud-camera-reset');
  const guidePanel = byId('hud-guide-controls');
  const gradient = byId('hud-guide-gradient');
  const farColor = byId('hud-guide-far');
  const farRow = byId('hud-guide-far-row');
  const startPanel = byId('hud-start-controls');
  const startLane = byId('hud-start-lane');
  const startDistance = byId('hud-start-distance');
  let laneGroup;
  let startLayout;

  const change = key => {
    onChange(key);
    onSave();
  };

  function syncPreset() {
    byId('hud-ego').checked = settings.ego;
    byId('hud-beam-only').closest('label').hidden = settings.preset !== 'carpet';
    byId('hud-marking-highlight-row').hidden = settings.preset !== 'blueRoad';
  }
  function syncLaneDemo({scene, presetDirection, presetRightTurn, status}, roadworks) {
    const note = byId('hud-lane-demo-note');
    const show = settings.preset && ['road', 'elevated', 'ramp'].includes(scene) && status === 'idle' && !presetDirection && !presetRightTurn;
    note.hidden = !show;
    if (show) {
      const side = settings.preset === 'carpet' ? '左' : '右';
      const message = roadworks ? '当前道路施工，播放原场景动画。' : `变道演示需要起始车道的${side}侧有可用车道。`;
      if (note.textContent !== message) note.textContent = message;
    }
  }

  const controls = [['hud-ego', 'ego'], ['hud-follow', 'follow'], ['hud-camera', 'customCamera'], ['hud-beam-only', 'beamOnly']];
  for (const [id, key] of controls) {
    const input = byId(id);
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      panel.hidden = !settings.customCamera;
      change(key);
    });
  }
  panel.hidden = !settings.customCamera;

  const cameraSliders = cameraFields.map(field => slider(field, settings.view, 'hud-camera', () => change('view')));
  cameraReset.before(...cameraSliders.map(control => control.label));
  byId('hud-preset-camera').addEventListener('click', () => change('presetCamera'));

  cameraReset.addEventListener('click', () => {
    Object.assign(settings.view, defaultView);
    cameraSliders.forEach(control => control.sync());
    change('view');
  });

  const selectedLane = () => `${laneGroup}:${laneSelect.value}`;
  const laneValues = {opacity: defaultLaneOpacity};
  const laneOpacity = slider(opacityField('opacity', '车道填色不透明度'), laneValues, 'hud-lane', () => {
    const key = selectedLane();
    settings.colors[key] ??= defaultLaneColor;
    settings.laneOpacity[key] = laneValues.opacity;
    syncColor();
    change('colors');
  });
  byId('hud-lane-color-setting').append(laneOpacity.label);
  const updateLaneColor = color => {
    settings.colors[selectedLane()] = color;
    syncColor();
    change('colors');
  };
  const syncLaneHex = bindHexColor(byId('hud-lane-hex'), updateLaneColor);
  const syncColor = () => {
    const color = settings.colors[selectedLane()];
    laneColor.value = color ?? defaultLaneColor;
    syncLaneHex(laneColor.value);
    laneReset.disabled = !color;
    laneValues.opacity = settings.laneOpacity[selectedLane()] ?? defaultLaneOpacity;
    laneOpacity.sync();
  };
  laneSelect.addEventListener('change', syncColor);
  laneColor.addEventListener('input', () => updateLaneColor(laneColor.value));
  laneReset.addEventListener('click', () => {
    delete settings.colors[selectedLane()];
    delete settings.laneOpacity[selectedLane()];
    syncColor();
    change('colors');
  });

  const marking = settings.marking;
  const markingColors = ['base', 'highlight'].map(key => {
    const picker = byId(`hud-marking-${key}-color`);
    const update = color => { marking[key] = color; picker.value = color; syncHex(color); change('marking'); };
    const syncHex = bindHexColor(byId(`hud-marking-${key}-hex`), update);
    picker.addEventListener('input', () => update(picker.value));
    return () => { picker.value = marking[key] ?? '#fafcff'; syncHex(picker.value); };
  });
  const markingWidth = slider(['width', '标线粗细', 25, 300, 100, '%', 5], marking, 'hud-marking', () => change('marking'));
  byId('hud-marking-values').append(markingWidth.label);
  const markingOpacity = [['base', '普通标线'], ['highlight', '高亮标线']].map(([key, title]) => {
    const control = slider(opacityField(`${key}Opacity`, `${title}不透明度`), marking, 'hud-marking', () => change('marking'));
    byId(`hud-marking-${key}-row`).append(control.label);
    return control;
  });
  markingColors.forEach(sync => sync());
  byId('hud-marking-reset').addEventListener('click', () => {
    Object.assign(marking, defaultMarking);
    markingColors.forEach(sync => sync());
    markingWidth.sync();
    markingOpacity.forEach(control => control.sync());
    change('marking');
  });

  const guideSliders = guideFields.map(field => slider(field, settings.guide, 'hud-guide', () => change('guide')));
  byId('hud-guide-values').append(...guideSliders.map(control => control.label));
  for (const [end, title] of [['near', '近端'], ['far', '远端']]) {
    const control = slider(opacityField(`${end}Opacity`, `${title}不透明度`), settings.guide, 'hud-guide', () => change('guide'));
    const row = byId(`hud-guide-${end}-row`);
    row.querySelector('.hud-color-field').after(control.label);
    guideSliders.push(control);
  }
  const updateFarColor = color => {
    settings.guide.far = color;
    farColor.value = color;
    syncFarHex(color);
    change('guide');
  };
  const syncFarHex = bindHexColor(byId('hud-guide-far-hex'), updateFarColor);
  const syncGradient = () => {
    farRow.hidden = !settings.guide.gradient;
    byId('hud-guide-near-label').textContent = settings.guide.gradient ? '近端颜色' : '引导线颜色';
    byId('hud-guide-nearOpacity').setAttribute('aria-label', settings.guide.gradient ? '近端不透明度' : '引导线不透明度');
  };
  const syncGuide = () => {
    gradient.checked = settings.guide.gradient;
    syncGradient();
    farColor.value = settings.guide.far;
    syncFarHex(settings.guide.far);
    guideSliders.forEach(control => control.sync());
  };
  syncGuide();
  gradient.addEventListener('change', () => {
    settings.guide.gradient = gradient.checked;
    syncGradient();
    change('guide');
  });
  farColor.addEventListener('input', () => updateFarColor(farColor.value));
  byId('hud-guide-reset').addEventListener('click', () => {
    Object.assign(settings.guide, defaultGuide);
    syncGuide();
    change('guide');
  });

  const syncStart = () => {
    const start = settings.starts[startLayout.key];
    startDistance.value = Math.min(startLayout.max, Math.max(startLayout.min, start?.distance ?? 0));
    if (startLayout.count) startLane.value = Math.min(start?.lane ?? startLayout.defaultLane, startLayout.count - 1);
  };
  const applyStart = () => {
    if (!startLayout || !startDistance.reportValidity() || !Number.isFinite(startDistance.valueAsNumber)) return;
    settings.starts[startLayout.key] = {distance: startDistance.valueAsNumber, lane: startLayout.count ? Number(startLane.value) : null};
    change('start');
  };
  byId('hud-start-apply').addEventListener('click', applyStart);
  startDistance.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); applyStart(); }
  });
  byId('hud-start-reset').addEventListener('click', () => {
    if (!startLayout) return;
    delete settings.starts[startLayout.key];
    syncStart();
    change('start');
  });

  syncPreset();
  return {settings, syncLaneDemo,
  showSceneLayers() {
    if (!settings.beamOnly || settings.preset !== 'carpet') return;
    byId('hud-beam-only').checked = settings.beamOnly = false;
  },
  usePresetCamera(view) {
    Object.assign(settings.view, view);
    cameraSliders.forEach(control => control.sync());
    byId('hud-camera').checked = settings.customCamera = true;
    panel.hidden = false;
  }, useSceneCamera() {
    const input = byId('hud-camera');
    if (!input.checked) return;
    input.checked = false;
    settings.customCamera = false;
    panel.hidden = true;
    onSave();
  },
  applyRoadPreset(key, guide) {
    settings.preset = key;
    Object.assign(settings.guide, guide);
    syncGuide();
    syncPreset();
  }, syncGuide(supported) { guidePanel.hidden = !supported; }, syncStart(layout) {
    if (layout?.key === startLayout?.key && layout?.count === startLayout?.count && layout?.max === startLayout?.max) return;
    startLayout = layout;
    startPanel.hidden = !layout;
    if (!layout) return;
    byId('hud-start-lane-row').hidden = !layout.count;
    byId('hud-start-note').textContent = layout.key === 'junction' ? '从接近路口的位置算起，正值向前。' : '正值向前，负值向后。';
    startDistance.min = layout.min;
    startDistance.max = layout.max;
    startLane.replaceChildren(...Array.from({length: layout.count ?? 0}, (_, i) => new Option(`第 ${i + 1} 车道（行驶方向）`, i)));
    syncStart();
  }, syncLanes(layout) {
    if (laneGroup === layout?.key) return;
    laneGroup = layout?.key;
    lanePanel.hidden = !layout;
    if (!layout) return;
    const previous = Number(laneSelect.value || 0);
    laneSelect.replaceChildren(...Array.from({length: layout.count}, (_, i) => new Option(`第 ${i + 1} 车道${i === 0 ? '（最左）' : ''}`, i)));
    laneSelect.value = Math.min(previous, layout.count - 1);
    syncColor();
  }};
}
