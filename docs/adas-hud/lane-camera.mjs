import {hudPreferences} from './hud-storage.mjs';

const fields = [
  ['yaw', '水平角', -180, 180, 0, '°'],
  ['pitch', '俯角', 4, 88, 23, '°'],
  ['distance', '相机距离', 5, 100, 24, ' m'],
  ['fov', '视野角', 20, 85, 38, '°'],
  ['ahead', '向前看', -10, 35, 7, ' m']
];
const defaults = Object.fromEntries(fields.map(([key, , , , value]) => [key, value]));
const radians = angle => angle * Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = vector => {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function cameraPose({yaw, pitch, distance, fov, ahead}) {
  const radius = distance * Math.cos(radians(pitch));
  const position = [radius * Math.sin(radians(yaw)), .85 + distance * Math.sin(radians(pitch)), radius * Math.cos(radians(yaw))];
  const target = [0, .85, -ahead];
  const forward = unit(target.map((value, index) => value - position[index]));
  const across = cross(forward, [0, 1, 0]);
  const right = Math.hypot(...across) > 1e-9 ? unit(across) : [Math.cos(radians(yaw)), 0, -Math.sin(radians(yaw))];
  const up = cross(right, forward);
  return {position, target, forward, right, up, focal: 165 / Math.tan(radians(fov / 2))};
}

const reference = cameraPose(defaults);

function groundPoint([x, y]) {
  // The original HUD artwork defines how the ground plane looks from the default camera.
  const ray = reference.forward.map((value, index) => value + (x * reference.right[index] - y * reference.up[index]) / reference.focal);
  const distance = -reference.position[1] / ray[1];
  return reference.position.map((value, index) => value + ray[index] * distance);
}

function createView(settings) {
  const pose = cameraPose(settings);
  const isDefault = fields.every(([key]) => settings[key] === defaults[key]);
  const near = .25;
  function project(points) {
    if (isDefault) return points;
    const pointsInView = points.map(point => {
      const offset = groundPoint(point).map((value, index) => value - pose.position[index]);
      return [dot(offset, pose.right), -dot(offset, pose.up), dot(offset, pose.forward)];
    });
    const visible = [];
    let previous = pointsInView.at(-1);
    for (const point of pointsInView) {
      if ((point[2] >= near) !== (previous[2] >= near)) {
        const fraction = (near - previous[2]) / (point[2] - previous[2]);
        visible.push(previous.map((value, index) => value + (point[index] - value) * fraction));
      }
      if (point[2] >= near) visible.push(point);
      previous = point;
    }
    return visible.map(([x, y, depth]) => [x * pose.focal / depth, y * pose.focal / depth]);
  }
  return {project, metadata: {settings: {...settings}, position: pose.position, target: pose.target, worldUnits: 'meters', fovAxis: 'vertical'}};
}

export function initLaneCamera(panel, key, onChange) {
  const storageKey = `lane-camera-${key}-v1`;
  const settings = {...defaults};
  try {
    const saved = JSON.parse(hudPreferences.getItem(storageKey));
    for (const [name, , min, max] of fields) {
      if (Number.isFinite(saved?.[name])) settings[name] = Math.min(max, Math.max(min, Math.round(saved[name])));
    }
  } catch {}
  let view = createView(settings);
  const update = () => {
    view = createView(settings);
    try { hudPreferences.setItem(storageKey, JSON.stringify(settings)); } catch {}
    onChange();
  };
  const reset = panel.querySelector('button');
  const syncFields = fields.map(([name, title, min, max, , unitLabel]) => {
    const row = document.createElement('label');
    const label = document.createElement('span');
    const value = document.createElement('output');
    const input = document.createElement('input');
    row.className = 'traffic-field';
    label.textContent = title;
    input.id = `lane-camera-${name}`;
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.setAttribute('aria-label', title);
    value.htmlFor = input.id;
    const sync = () => {
      input.value = settings[name];
      value.value = `${settings[name]}${unitLabel}`;
      input.setAttribute('aria-valuetext', value.value);
      input.style.setProperty('--range-fill', `${(settings[name] - min) / (max - min) * 100}%`);
    };
    input.addEventListener('input', () => {
      settings[name] = input.valueAsNumber;
      sync();
      update();
    });
    row.append(label, value, input);
    reset.parentElement.before(row);
    sync();
    return sync;
  });
  reset.addEventListener('click', () => {
    Object.assign(settings, defaults);
    syncFields.forEach(sync => sync());
    update();
  });
  return () => view;
}
