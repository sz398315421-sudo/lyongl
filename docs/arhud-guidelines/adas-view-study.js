(() => {
  'use strict';
  const presets = {
    hud: { yaw: 0, pitch: 18, height: 3.4, back: 10, vfov: 30, cap: 60, aspect: '1.6' },
    cluster: { yaw: 0, pitch: 24, height: 6, back: 7.5, vfov: 40, cap: 75, aspect: '1.7777777778' },
    center: { yaw: 0, pitch: 32, height: 9, back: 9, vfov: 54, cap: 95, aspect: '1.7777777778' },
    branch: { yaw: 16, pitch: 42, height: 10, back: 8, vfov: 58, cap: 55, aspect: '2.3333333333' }
  };
  const byId = id => document.getElementById(id);
  const knobs = Object.keys(presets.hud);
  const controls = Object.fromEntries(knobs.map(key => [key, byId(key)]));
  const preset = byId('camera-preset');
  const canvas = byId('camera-scene');
  const ctx = canvas.getContext('2d');
  const rad = deg => deg * Math.PI / 180;
  const deg = radian => radian * 180 / Math.PI;
  const meters = value => value.toFixed(1).replace('-', '−') + ' m';
  const horizon = 0.12;

  function cameraGeometry(p) {
    const yaw = rad(p.yaw);
    const pitch = rad(p.pitch);
    const halfFov = rad(p.vfov / 2);
    const ground = angle => p.height / Math.tan(angle) * Math.cos(yaw) - p.back;
    return {
      hfov: deg(2 * Math.atan(p.aspect * Math.tan(halfFov))),
      distance: Math.hypot(p.height, p.back),
      look: ground(pitch),
      near: ground(pitch + halfFov),
      far: pitch > halfFov + 1e-10 ? ground(pitch - halfFov) : Infinity
    };
  }

  function render(p) {
    const width = 800;
    const height = Math.round(width / p.aspect);
    canvas.height = height;
    const yaw = rad(p.yaw);
    const pitch = rad(p.pitch);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);
    const focal = height / (2 * Math.tan(rad(p.vfov / 2)));

    function cameraPoint([x, y, z]) {
      const ahead = sy * x + cy * (z + p.back);
      const up = y - p.height;
      return [cy * x - sy * (z + p.back), sp * ahead + cp * up, cp * ahead - sp * up];
    }

    function screenPoint([x, y, z]) {
      return [width / 2 + focal * x / z, height / 2 - focal * y / z];
    }

    function shape(points, fill, stroke, lineWidth = 1) {
      const vertices = points.map(cameraPoint);
      const clipped = [];
      let previous = vertices[vertices.length - 1];
      for (const point of vertices) {
        const enters = point[2] >= horizon;
        const wasInside = previous[2] >= horizon;
        if (enters !== wasInside) {
          const t = (horizon - previous[2]) / (point[2] - previous[2]);
          clipped.push(previous.map((value, index) => value + (point[index] - value) * t));
        }
        if (enters) clipped.push(point);
        previous = point;
      }
      if (!clipped.length) return;
      ctx.beginPath();
      clipped.map(screenPoint).forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      if (fill) {
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }
    }

    function roadStrip(x0, x1, z0, z1, color, elevation = 0) {
      shape([[x0, elevation, z0], [x1, elevation, z0], [x1, elevation, z1], [x0, elevation, z1]], color);
    }

    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#101b2d');
    background.addColorStop(1, '#202f44');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const start = -p.back - 4;
    roadStrip(-5.25, 5.25, start, p.cap, '#263b54');
    roadStrip(-1.75, 1.75, start, p.cap, '#293f5a');
    for (const x of [-5.25, 5.25]) roadStrip(x - .05, x + .05, start, p.cap, '#899cb2');
    for (const x of [-1.75, 1.75]) {
      for (let z = -26; z < p.cap; z += 5) roadStrip(x - .046, x + .046, z, Math.min(z + 2.9, p.cap), '#7f97b3');
    }
    for (const z of [10, 20, 30, 40, 60, 80, 100, 120, 150, 180]) {
      if (z > p.cap) break;
      roadStrip(-5.21, 5.21, z - .05, z, '#54708e');
      const point = cameraPoint([5.6, .05, z]);
      if (point[2] < horizon) continue;
      const [x, y] = screenPoint(point);
      ctx.fillStyle = '#d2e0f5';
      ctx.font = '13px sans-serif';
      ctx.fillText(z + ' m', x, y + 4);
    }

    function car(x, z, ownCar = false) {
      const w = .92;
      const left = x - w;
      const right = x + w;
      const nose = z + 2.2;
      const tail = z - 2.2;
      const edge = ownCar ? '#91c7ff' : '#c6d4e5';
      shape([[left, .12, tail], [right, .12, tail], [right, .82, tail], [left, .82, tail]], ownCar ? '#2566d5' : '#5c7290');
      shape([[left, .12, nose], [left, .12, tail], [left, .82, tail], [left, .82, nose]], ownCar ? '#3276e9' : '#8d9db3');
      shape([[right, .12, nose], [right, .12, tail], [right, .82, tail], [right, .82, nose]], ownCar ? '#2863ce' : '#7d91ae');
      shape([[left, .82, tail], [right, .82, tail], [right, .82, nose], [left, .82, nose]], ownCar ? '#4084f8' : '#98acc6');
      shape([[x - .72, .84, tail + .32], [x + .72, .84, tail + .32], [x + .7, 1.48, z - .7], [x - .7, 1.48, z - .7]], '#2d4566');
      shape([[x - .7, 1.48, z - .7], [x + .7, 1.48, z - .7], [x + .63, 1.48, z + .8], [x - .63, 1.48, z + .8]], edge);
    }

    for (const [x, z] of [[3.5, 98], [0, 67], [-3.5, 47], [3.5, 27], [0, 16]]) {
      if (z + 2.2 <= p.cap) car(x, z);
    }
    car(0, 0, true);
  }

  function update() {
    const values = Object.fromEntries(knobs.map(key => [key, Number(controls[key].value)]));
    for (const key of ['yaw', 'pitch', 'vfov']) byId(key + '-value').value = values[key] + '°';
    for (const key of ['height', 'back', 'cap']) byId(key + '-value').value = meters(values[key]);

    const g = cameraGeometry(values);
    const limit = Math.min(g.far, values.cap);
    byId('metric-hfov').textContent = g.hfov.toFixed(1) + '°';
    byId('metric-distance').textContent = meters(g.distance);
    byId('metric-look').textContent = meters(g.look);
    byId('metric-near').textContent = meters(g.near);
    byId('metric-far').textContent = Number.isFinite(g.far) ? meters(g.far) : '无几何上界';
    byId('metric-visible').textContent = limit > Math.max(g.near, 0) ? meters(limit) : '无前向交集';
    byId('camera-note').textContent = '读数取中心竖切面，并受绘制上限约束。侧边区域和抬高的目标可能越过中心地面交点。' +
      (values.yaw === 0 ? '' : ' 偏航时，该读数的地面点横向偏离自车中心线。');
    if (ctx) render(values);
  }

  preset.addEventListener('change', () => {
    for (const [key, value] of Object.entries(presets[preset.value])) controls[key].value = value;
    update();
  });
  for (const control of Object.values(controls)) control.addEventListener('input', update);
  byId('print').addEventListener('click', () => window.print());
  update();
})();
