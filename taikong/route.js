"use strict";

const routeHalfWidth = 4.15;
const routeBends = [[12, .073], [-8, .041], [4, .121]];
const pitchCos = .9992;
const pitchSin = .03999;

function routeCenter(distance) {
  return routeBends.reduce((center, [width, frequency]) =>
    center + width * (1 - Math.cos(distance * frequency)), 0);
}

function routeGradient(distance) {
  return routeBends.reduce((gradient, [width, frequency]) =>
    gradient + width * frequency * Math.sin(distance * frequency), 0);
}

const sceneProjection = [
  "uniform vec2 uView;",
  "uniform float uAspect, uFocal;",
  "vec3 cameraSpace(vec3 point) {",
  "  float x = uView.x * point.x - uView.y * point.z;",
  "  float z = uView.y * point.x + uView.x * point.z;",
  "  return vec3(x, point.y * " + pitchCos + " + z * " + pitchSin +
    ", z * " + pitchCos + " - point.y * " + pitchSin + ");",
  "}",
  "vec4 projectScene(vec3 view) {",
  "  return vec4(view.x * uFocal / uAspect, view.y * uFocal, view.z * 1.00010 - .100005, view.z);",
  "}",
].join("\n");

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

function createRouteRenderer(canvas) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The road requires a 2D canvas.");
  const samples = Array.from({length: 334}, (_, index) => .7 + 225 * (index / 333) ** 1.78);
  const bands = [
    { lane: 0, width: 1.01, color: "11,17,29", opacity: .36 },
    { lane: 1, width: .236, color: "232,104,19", opacity: .085 },
    { lane: 1, width: .106, color: "253,118,27", opacity: .19 },
    { lane: 1, width: .051, color: "255,149,47", opacity: .37 },
    { lane: 1, width: .025, color: "255,186,87", opacity: .88 },
    { lane: 1, width: .009, color: "255,240,192", opacity: .98 },
    { lane: 1.105, width: .0045, color: "255,176,70", opacity: .47 },
    { lane: 1.205, width: .0033, color: "255,167,63", opacity: .24 },
  ];
  const random = randomSource(75159);
  const sparks = Array.from({length: 285}, () => ({
    lane: (random() * 2 - 1) * .98,
    phase: random() * 101,
    length: .15 + random() ** 2.8 * 1.4,
    glow: Math.floor(random() * 3),
  }));
  let gradients = [];

  function resize(width, height) {
    canvas.width = width;
    canvas.height = height;
    gradients = bands.map(({color, opacity}) => {
      const gradient = context.createLinearGradient(0, height * .471, 0, height * .95);
      gradient.addColorStop(0, "rgba(" + color + ",0)");
      gradient.addColorStop(.046, "rgba(" + color + "," + opacity * .23 + ")");
      gradient.addColorStop(.18, "rgba(" + color + "," + opacity * .86 + ")");
      gradient.addColorStop(1, "rgba(" + color + "," + opacity + ")");
      return gradient;
    });
  }

  function draw(camera, focalLength) {
    const width = canvas.width;
    const height = canvas.height;
    const lens = height * .5 * focalLength;
    context.clearRect(0, 0, width, height);

    function section(relative) {
      const station = camera.distance + relative;
      const center = routeCenter(station) - camera.x;
      const slope = routeGradient(station);
      const half = routeHalfWidth / Math.hypot(1, slope);
      return {
        depth: camera.sin * center + camera.cos * relative,
        side: camera.cos * center - camera.sin * relative,
        depthShift: half * (camera.sin - camera.cos * slope),
        sideShift: half * (camera.cos + camera.sin * slope),
      };
    }

    function project(row, lane) {
      const depth = row.depth + row.depthShift * lane;
      const z = depth * pitchCos + camera.y * pitchSin;
      if (z <= .12) return null;
      const x = row.side + row.sideShift * lane;
      const y = -camera.y * pitchCos + depth * pitchSin;
      return [width * .5 + x * lens / z, height * .5 - y * lens / z];
    }

    const sections = samples.map(section).filter(row => row.depth - Math.abs(row.depthShift) * 1.42 >= .35);
    if (sections.length < 2) return;
    const reversed = [...sections].reverse();

    function ribbon(path, lane, width) {
      path.moveTo(...project(sections[0], lane - width));
      for (const row of sections) path.lineTo(...project(row, lane - width));
      for (const row of reversed) path.lineTo(...project(row, lane + width));
      path.closePath();
    }

    bands.forEach(({lane, width}, index) => {
      const shape = new Path2D();
      ribbon(shape, lane, width);
      if (lane) ribbon(shape, -lane, width);
      context.fillStyle = gradients[index];
      context.fill(shape);
    });

    const trails = [new Path2D(), new Path2D(), new Path2D()];
    const scroll = camera.distance * 1.2 % 101;
    for (const {lane, phase, length, glow} of sparks) {
      const z = (phase - scroll + 101) % 101;
      if (z < 4 || z > 66) continue;
      const start = project(section(z), lane);
      const end = project(section(z + length), lane);
      if (!start || !end) continue;
      trails[glow].moveTo(...start);
      trails[glow].lineTo(...end);
    }

    trails.forEach((trail, index) => {
      context.strokeStyle = "rgba(244,167,78," + (.14 + index * .11) + ")";
      context.lineWidth = .48 + index * .27;
      context.stroke(trail);
    });

    const center = new Path2D();
    const phase = camera.distance % 7.7;
    for (let offset = 7.7 - phase; offset < 54; offset += 7.7) {
      if (offset < 2.1) continue;
      const start = project(section(offset), 0);
      const end = project(section(offset + 2.1), 0);
      if (!start || !end) continue;
      center.moveTo(...start);
      center.lineTo(...end);
    }
    context.strokeStyle = "#ffc47565";
    context.lineWidth = .85;
    context.stroke(center);
  }

  return { resize, draw };
}
