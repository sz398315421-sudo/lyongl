"use strict";

const game = document.querySelector("#game");
const space = document.querySelector("#space");
const sky = document.querySelector("#sky");
const immersive = document.querySelector("#immersive");
const cockpit = document.querySelector(".cockpit-image");
const media = window.spaceMedia;
const measuredRocks = window.asteroidModels;

const focalLength = 1.68;
const cruiseSpeed = 3.15;
const asteroidColors = [
  [0.72, 0.73, 0.76], [0.83, 0.86, 0.90], [0.62, 0.65, 0.68],
  [0.77, 0.76, 0.74], [0.67, 0.69, 0.72], [0.78, 0.79, 0.80],
];

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function unit(vector) {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cross([ax, ay, az], [bx, by, bz]) {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeSphere(subdivisions, variant = -1) {
  const golden = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
    [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
    [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1],
  ].map(unit);
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const data = [];
  const phase = variant * 3.73;

  function shape([x, y, z]) {
    if (variant === -1) return [x, y, z];
    const largeForm = Math.sin(x * 5.1 + z * 2.7 + phase) * Math.cos(y * 4.7 - z * 2.0);
    const ridge = Math.sin(x * 11 - y * 7 + phase) * Math.sin(z * 9 + y * 7);
    const fineRock = Math.cos(x * 23 + y * 14) * Math.sin(z * 18 + x * 3 + phase);
    const depression = Math.sin(x * 3.6 - y * 2.4 + phase) * Math.sin(z * 3.9 + 2.7);
    const radius = 0.96 + largeForm * 0.135 + ridge * 0.046 + fineRock * 0.014 - Math.max(0, depression) ** 3 * 0.15;
    return [x * radius * (1.13 + 0.13 * Math.sin(phase)), y * radius * (0.79 + 0.09 * Math.cos(phase)), z * radius];
  }

  function normalAt(point) {
    if (variant === -1) return point;
    const [x, y, z] = point;
    const tangent = unit(Math.abs(y) > 0.85 ? [y, -x, 0] : [-z, 0, x]);
    const bitangent = cross(point, tangent);
    const slope = direction => {
      const a = shape(unit(point.map((value, index) => value + direction[index] * 0.009)));
      const b = shape(unit(point.map((value, index) => value - direction[index] * 0.009)));
      return a.map((value, index) => value - b[index]);
    };
    return unit(cross(slope(tangent), slope(bitangent)));
  }

  function triangle(a, b, c, level) {
    if (level > 0) {
      const ab = unit(a.map((value, index) => value + b[index]));
      const bc = unit(b.map((value, index) => value + c[index]));
      const ca = unit(c.map((value, index) => value + a[index]));
      triangle(a, ab, ca, level - 1);
      triangle(ab, b, bc, level - 1);
      triangle(ca, bc, c, level - 1);
      triangle(ab, bc, ca, level - 1);
      return;
    }

    for (const point of [a, b, c]) data.push(...shape(point), ...normalAt(point));
  }

  for (const [a, b, c] of faces) triangle(vertices[a], vertices[b], vertices[c], subdivisions);
  return new Float32Array(data);
}

function paintSky(width, height) {
  const context = sky.getContext("2d");
  sky.width = width;
  sky.height = height;
  const random = randomSource(8138);
  context.fillStyle = "#020407";
  context.fillRect(0, 0, width, height);

  // A fixed field of distant light leaves visible parallax to the moving rocks.
  for (let index = 0; index < 14; index++) {
    const x = width * (0.06 + index * 0.075);
    const y = height * (0.87 - index * 0.049 + random() * 0.13);
    const radius = height * (0.13 + random() * 0.25);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, index % 3 === 0 ? "#8b796c11" : "#53607910");
    gradient.addColorStop(1, "#03060b00");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const count = Math.min(2100, Math.max(620, Math.round(width * height / 900)));
  for (let index = 0; index < count; index++) {
    const x = random() * width;
    const y = random() * height;
    const brightness = random() ** 4;
    const radius = 0.26 + brightness * 0.85;
    context.fillStyle = "rgba(218,225,237," + (0.12 + brightness * 0.68) + ")";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    if (brightness > 0.955) {
      const halo = context.createRadialGradient(x, y, 0, x, y, 7);
      halo.addColorStop(0, "#b3d4ff3a");
      halo.addColorStop(1, "#b3d4ff00");
      context.fillStyle = halo;
      context.fillRect(x - 7, y - 7, 14, 14);
    }
  }
}

async function createRenderer() {
  const gl = space.getContext("webgl", { alpha: true, antialias: true, powerPreference: "high-performance" });
  if (!gl) throw new Error("WebGL is unavailable");

  const rotationSource = [
    "vec3 rotate(vec3 point) {",
    "  float cx = cos(uRotation.x), sx = sin(uRotation.x);",
    "  float cy = cos(uRotation.y), sy = sin(uRotation.y);",
    "  vec3 pitch = vec3(point.x, cx * point.y - sx * point.z, sx * point.y + cx * point.z);",
    "  return vec3(cy * pitch.x + sy * pitch.z, pitch.y, -sy * pitch.x + cy * pitch.z);",
    "}",
  ];
  const vertexSource = [
    "attribute vec3 aPosition, aNormal;",
    "attribute vec2 aTexcoord;",
    "attribute vec4 aTangent;",
    "uniform vec3 uCenter;",
    "uniform float uRadius, uAspect, uFocal, uBank;",
    "uniform vec2 uRotation;",
    "varying vec3 vObject, vLocalNormal, vWorld;",
    "varying vec2 vTexcoord;",
    "varying vec4 vTangent;",
    ...rotationSource,
    "void main() {",
    "  vObject = aPosition;",
    "  vLocalNormal = aNormal;",
    "  vTexcoord = aTexcoord;",
    "  vTangent = aTangent;",
    "  vWorld = rotate(aPosition) * uRadius + uCenter;",
    "  float cs = cos(uBank), sn = sin(uBank);",
    "  vec2 screen = mat2(cs, sn, -sn, cs) * vWorld.xy;",
    "  gl_Position = vec4(screen.x * uFocal / uAspect, screen.y * uFocal, vWorld.z * 1.00014 - 0.10001, vWorld.z);",
    "}",
  ].join("\n");

  const fragmentSource = [
    "precision highp float;",
    "uniform vec3 uColor;",
    "uniform float uPlanet, uHasPhoto, uPhotoHasNormal;",
    "uniform vec2 uRotation;",
    "uniform sampler2D uEarthMap, uRockMap, uReliefMap, uPhotoMap, uPhotoNormalMap;",
    "varying vec3 vObject, vLocalNormal, vWorld;",
    "varying vec2 vTexcoord;",
    "varying vec4 vTangent;",
    ...rotationSource,
    "float hash(vec3 p) {",
    "  p = fract(p * 0.3183099 + vec3(0.13, 0.43, 0.71));",
    "  p *= 17.0;",
    "  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));",
    "}",
    "float noise(vec3 p) {",
    "  vec3 i = floor(p), f = fract(p);",
    "  f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),",
    "                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),",
    "             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),",
    "                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);",
    "}",
    "vec2 sphericalUv(vec3 point) {",
    "  vec3 sphere = normalize(point);",
    "  return vec2(atan(sphere.z, sphere.x) * .15915494 + .5, .5 - asin(clamp(sphere.y,-1.0,1.0)) * .31830989);",
    "}",
    "void main() {",
    "  vec3 point = vObject;",
    "  vec3 localNormal = normalize(vLocalNormal);",
    "  vec3 normal = rotate(localNormal);",
    "  vec3 light = normalize(vec3(0.71, 0.47, -0.43));",
    "  vec3 view = normalize(-vWorld);",
    "  if (uPlanet > 0.5) {",
    "    vec3 surface = texture2D(uEarthMap, sphericalUv(point)).rgb;",
    "    float daylight = dot(normal, light);",
    "    float lit = pow(max(0.0,daylight), .55);",
    "    float limb = pow(1.0 - max(0.0,dot(normal,view)), 5.9);",
    "    vec3 air = vec3(.22,.44,.69) * limb * smoothstep(-.26,.8,daylight);",
    "    gl_FragColor = vec4(surface * (.022 + .96 * lit) + air, 1.0);",
    "  } else {",
    "    vec3 blend = pow(abs(localNormal), vec3(5.0));",
    "    blend /= dot(blend, vec3(1.0));",
    "    vec3 p = point * 1.62;",
    "    vec2 side = p.zy + vec2(.19,.11), top = p.xz + vec2(.41,.67), front = p.xy + vec2(.12,.31);",
    "    vec3 stone = texture2D(uRockMap, side).rgb * blend.x + texture2D(uRockMap, top).rgb * blend.y",
    "               + texture2D(uRockMap, front).rgb * blend.z;",
    "    vec2 nx = texture2D(uReliefMap, side).rg * 2.0 - 1.0;",
    "    vec2 ny = texture2D(uReliefMap, top).rg * 2.0 - 1.0;",
    "    vec2 nz = texture2D(uReliefMap, front).rg * 2.0 - 1.0;",
    "    vec3 relief = vec3(0,-nx.y,nx.x) * blend.x + vec3(ny.x,0,-ny.y) * blend.y + vec3(nz.x,-nz.y,0) * blend.z;",
    "    float grain = dot(stone, vec3(.24,.65,.11));",
    "    float rockTone = grain * mix(.56,1.05,noise(point * 10.5 + 4.0));",
    "    float smallRelief = .51;",
    "    float cavity = 1.0;",
    "    if (uHasPhoto > .5) {",
    "      vec2 uv = uHasPhoto > 1.5 ? sphericalUv(point) : vTexcoord;",
    "      vec3 photo = texture2D(uPhotoMap, uv).rgb;",
    "      float photoTone = dot(photo, vec3(.25,.64,.11));",
    "      rockTone = photoTone * mix(.71,1.26,grain);",
    "      smallRelief = .33;",
    "      if (uHasPhoto > 1.5) {",
    "        rockTone = mix(grain * .73, rockTone * .78, smoothstep(.065,.28,photoTone) * .82);",
    "        cavity = mix(.42,1.0,vTexcoord.x);",
    "      }",
    "    }",
    "    if (uPhotoHasNormal > .5) {",
    "      vec3 tangent = normalize(vTangent.xyz - localNormal * dot(localNormal,vTangent.xyz));",
    "      vec3 bitangent = cross(localNormal,tangent) * sign(vTangent.w);",
    "      vec3 bump = texture2D(uPhotoNormalMap, vTexcoord).xyz * 2.0 - 1.0;",
    "      normal = rotate(normalize(tangent * bump.x + bitangent * bump.y + localNormal * max(.25,bump.z)));",
    "    }",
    "    vec3 rough = normalize(normal + rotate(relief) * smallRelief);",
    "    float diffuse = max(0.0,dot(rough,light));",
    "    vec3 base = vec3(rockTone) * uColor;",
    "    float reflected = max(0.0, dot(rough, normalize(vec3(-.5,-.18,-.8))));",
    "    vec3 sunlight = vec3(1.31,1.28,1.23) * pow(diffuse,.88);",
    "    vec3 earthshine = vec3(.067,.093,.14) * reflected + vec3(.041,.047,.055);",
    "    gl_FragColor = vec4(base * (sunlight * mix(.70,1.0,cavity) + earthshine * cavity),1.0);",
    "  }",
    "}",
  ].join("\n");

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const position = gl.getAttribLocation(program, "aPosition");
  const normal = gl.getAttribLocation(program, "aNormal");
  const texcoord = gl.getAttribLocation(program, "aTexcoord");
  const tangent = gl.getAttribLocation(program, "aTangent");
  const uniforms = {};
  for (const name of ["Center", "Radius", "Aspect", "Focal", "Bank", "Rotation", "Color", "Planet",
    "EarthMap", "RockMap", "ReliefMap", "HasPhoto", "PhotoHasNormal", "PhotoMap", "PhotoNormalMap"]) {
    uniforms[name] = gl.getUniformLocation(program, "u" + name);
  }

  async function loadTexture(index, source, fallback, wrap = "repeat") {
    const image = new Image();
    let loaded = false;
    if (source) {
      image.src = source;
      try {
        await image.decode();
        loaded = true;
      } catch (error) {
        console.warn("A surface texture could not be decoded.", error);
      }
    }
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    if (loaded) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      const isPowerOfTwo = length => (length & (length - 1)) === 0;
      if (isPowerOfTwo(image.naturalWidth) && isPowerOfTwo(image.naturalHeight)) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        wrap = "clamp";
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(fallback));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    if (wrap !== "repeat") gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (wrap === "clamp") gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  }

  function bufferMesh(data) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buffer, count: data.length / 6, stride: 24 };
  }

  function fromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  }

  function bufferRock(model, photo, relief) {
    if (!model) return null;
    const buffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    const indices = new Uint16Array(fromBase64(model.indices));
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fromBase64(model.vertices)), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return { buffer, indexBuffer, count: indices.length, stride: model.stride ?? 48, photo, relief };
  }

  const planet = bufferMesh(makeSphere(4));
  const rocks = asteroidColors.map((_, index) => bufferMesh(makeSphere(3, index)));
  rocks[1] = bufferRock(measuredRocks?.bennu, 3) || rocks[1];
  rocks[3] = bufferRock(measuredRocks?.eros, 4, 5) || rocks[3];
  const distantBennu = bufferRock(measuredRocks?.bennuLow, 6) || rocks[1];
  gl.enableVertexAttribArray(position);
  gl.enableVertexAttribArray(normal);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.frontFace(gl.CW);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform1f(uniforms.Focal, focalLength);
  gl.uniform1i(uniforms.EarthMap, 0);
  gl.uniform1i(uniforms.RockMap, 1);
  gl.uniform1i(uniforms.ReliefMap, 2);

  await Promise.all([
    loadTexture(0, media?.earth, [52, 79, 110, 255], "longitude"),
    loadTexture(1, media?.rock, [121, 117, 113, 255]),
    loadTexture(2, media?.relief, [128, 128, 255, 255]),
    loadTexture(3, measuredRocks?.bennu?.color, [111, 109, 105, 255], "longitude"),
    loadTexture(4, measuredRocks?.eros?.color, [129, 127, 122, 255], "clamp"),
    loadTexture(5, measuredRocks?.eros?.normal, [128, 128, 255, 255], "clamp"),
    loadTexture(6, measuredRocks?.bennuLow?.color, [111, 109, 105, 255], "clamp"),
  ]);

  function draw(mesh, x, y, z, radius, pitch, yaw, color, isPlanet) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, mesh.stride, 0);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, mesh.stride, 12);
    if (mesh.indexBuffer) {
      gl.enableVertexAttribArray(texcoord);
      gl.vertexAttribPointer(texcoord, 2, gl.FLOAT, false, mesh.stride, 24);
    } else {
      gl.disableVertexAttribArray(texcoord);
    }
    if (mesh.relief) {
      gl.enableVertexAttribArray(tangent);
      gl.vertexAttribPointer(tangent, 4, gl.FLOAT, false, mesh.stride, 32);
    } else {
      gl.disableVertexAttribArray(tangent);
    }
    gl.uniform3f(uniforms.Center, x, y, z);
    gl.uniform1f(uniforms.Radius, radius);
    gl.uniform2f(uniforms.Rotation, pitch, yaw);
    gl.uniform3fv(uniforms.Color, color);
    gl.uniform1f(uniforms.Planet, isPlanet);
    gl.uniform1f(uniforms.HasPhoto, mesh.stride === 32 ? 2 : Number(Boolean(mesh.photo)));
    gl.uniform1f(uniforms.PhotoHasNormal, Number(Boolean(mesh.relief)));
    gl.uniform1i(uniforms.PhotoMap, mesh.photo ?? 1);
    gl.uniform1i(uniforms.PhotoNormalMap, mesh.relief ?? 2);
    if (mesh.indexBuffer) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    }
  }

  return {
    resize(width, height) {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1820 / width, 1140 / height);
      space.width = Math.round(width * scale);
      space.height = Math.round(height * scale);
      gl.viewport(0, 0, space.width, space.height);
      gl.uniform1f(uniforms.Aspect, width / height);
    },
    frame(asteroids, ship, aspect, bank, time) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uniforms.Bank, bank);
      const planetX = (aspect < 0.9 ? 0.40 : 0.48) * 391 * aspect / focalLength;
      draw(planet, planetX - ship.x * 0.15, 55 - ship.y * 0.15, 391, 119, -0.15, 0.45 + time * 0.0012, asteroidColors[0], 1);

      for (const asteroid of asteroids) {
        const x = asteroid.x - ship.x;
        const y = asteroid.y - ship.y;
        const { z, radius } = asteroid;
        const extent = radius * 1.44;
        if (z < -extent || Math.abs(y) > Math.max(z, 0) / focalLength + extent ||
            Math.abs(x) > Math.max(z, 0) * aspect / focalLength + extent) continue;
        const mesh = asteroid.type === 1 && radius / Math.max(z, 1) < .13 ? distantBennu : rocks[asteroid.type];
        draw(mesh, x, y, z, radius,
          asteroid.pitch + time * asteroid.spin * 0.69,
          asteroid.yaw + time * asteroid.spin,
          asteroidColors[asteroid.type], 0);
      }
    },
  };
}

function createInstruments() {
  const reference = document.querySelector("#flight-reference");
  const dashboard = document.querySelector("#avionics");
  const hud = reference.getContext("2d");
  const panel = dashboard.getContext("2d");
  let width = 1;
  let height = 1;
  let scale = 1;

  function line(context, points, ink, weight = 1) {
    context.strokeStyle = ink;
    context.lineWidth = weight;
    context.beginPath();
    context.moveTo(...points[0]);
    for (const point of points.slice(1)) context.lineTo(...point);
    context.stroke();
  }

  function text(value, x, y, size, ink = "#a6e3e7") {
    panel.font = size + "px Consolas, monospace";
    panel.fillStyle = ink;
    panel.fillText(value, x, y);
  }

  function resize(nextWidth, nextHeight) {
    width = nextWidth;
    height = nextHeight;
    scale = Math.min(window.devicePixelRatio || 1, 1.5);
    for (const canvas of [reference, dashboard]) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
  }

  function frame(ship, camera, asteroids, bank) {
    const ink = "#74bdbf";
    const dimInk = "#41656b";
    hud.setTransform(scale, 0, 0, scale, 0, 0);
    hud.clearRect(0, 0, width, height);
    hud.save();
    hud.translate(width * .5, height * .455);
    hud.rotate(bank);
    const span = Math.min(width * .15, 90);
    line(hud, [[-span, -4], [-span, 0], [-16, 0], [-11, 5]], "#8ed4d650");
    line(hud, [[span, -4], [span, 0], [16, 0], [11, 5]], "#8ed4d650");
    line(hud, [[-3, 0], [3, 0]], "#a8f8ed90");
    hud.restore();

    panel.setTransform(scale, 0, 0, scale, 0, 0);
    panel.clearRect(0, 0, width, height);
    if (cockpit.hidden) return;
    const portrait = width <= height;
    const panelWidth = portrait ? height * cockpit.naturalWidth / cockpit.naturalHeight : width;
    panel.translate((width - panelWidth) / 2, 0);
    panel.scale(panelWidth / 1672, height / 941);

    text("RELATIVE SPEED", 228, 779, 14, ink);
    text(Math.hypot(cruiseSpeed, ship.vx, ship.vy).toFixed(2), 228, 828, 42, "#c8f1ef");
    text("M/S", 340, 827, 14, ink);
    line(panel, [[226, 849], [419, 849]], dimInk);
    text("CRUISE CONTROL", 228, 873, 13, ink);

    const roll = bank * 180 / Math.PI;
    const half = clamp(width * 836 / panelWidth - 22, 90, 243);
    const panelLeft = 837 - half;
    const panelRight = 837 + half;
    const rollLeft = panelRight - 74;
    const horizonSpan = clamp(half - 82, 25, 73);
    text("FLIGHT COMPUTER", panelLeft, 754, 14, ink);
    line(panel, [[panelLeft, 765], [panelRight, 765]], dimInk);
    text("AUTO", panelLeft + 5, 815, 22, "#c8f1ef");
    const mode = half < 223 ? cruiseSpeed.toFixed(2) + " M/S" : "CRUISE";
    text(mode, panelLeft + 5, 839, 13, ink);
    text("ROLL", rollLeft, 798, 13, ink);
    text((roll >= 0 ? "+" : "") + roll.toFixed(1) + "°", rollLeft, 831, 22, "#c8f1ef");
    panel.save();
    panel.translate(836, 824);
    panel.strokeStyle = dimInk;
    panel.lineWidth = 1;
    panel.beginPath();
    panel.arc(0, 0, 47, Math.PI, 2 * Math.PI);
    panel.stroke();
    for (let angle = -60; angle <= 60; angle += 15) {
      const r = angle * Math.PI / 180;
      line(panel, [[43 * Math.sin(r), -43 * Math.cos(r)], [49 * Math.sin(r), -49 * Math.cos(r)]], ink);
    }
    panel.rotate(bank);
    line(panel, [[-horizonSpan, 0], [-18, 0], [-11, 6]], ink, 1.5);
    line(panel, [[horizonSpan, 0], [18, 0], [11, 6]], ink, 1.5);
    line(panel, [[-6, 0], [6, 0]], "#d1ffff", 1.7);
    line(panel, [[-12, 19], [12, 19]], dimInk);
    panel.restore();

    text("PROXIMITY", 1223, 774, 14, ink);
    const scopeX = 1352;
    const scopeY = 872;
    for (const distance of [25, 51, 77]) {
      panel.strokeStyle = dimInk;
      panel.beginPath();
      panel.arc(scopeX, scopeY, distance, Math.PI * 1.15, Math.PI * 1.85);
      panel.stroke();
    }
    line(panel, [[scopeX, scopeY], [scopeX, scopeY - 81]], dimInk);
    let range = 120;
    for (const asteroid of asteroids) {
      const x = asteroid.x - camera.x;
      const y = asteroid.y - camera.y;
      if (asteroid.z <= 0 || asteroid.z > 115 || Math.abs(x) > 46 || Math.abs(x) > .9 * asteroid.z) continue;
      const distance = Math.hypot(x, y, asteroid.z) - asteroid.radius;
      range = Math.min(range, distance);
      panel.fillStyle = asteroid.radius >= 10 ? "#89ddd6" : "#578b92";
      panel.beginPath();
      panel.arc(scopeX + x * 1.28, scopeY - asteroid.z * .73, clamp(asteroid.radius * .19, 1, 3.3), 0, Math.PI * 2);
      panel.fill();
    }
    text(range >= 120 ? ">120 M" : Math.max(0,range).toFixed(1) + " M", 1223, 871, 14);
  }

  return { resize, frame };
}

function startCruise(renderer) {
  const directions = new Map([
    ["KeyW", [0, 1]], ["ArrowUp", [0, 1]],
    ["KeyS", [0, -1]], ["ArrowDown", [0, -1]],
    ["KeyA", [-1, 0]], ["ArrowLeft", [-1, 0]],
    ["KeyD", [1, 0]], ["ArrowRight", [1, 0]],
  ]);
  const keys = new Set();
  const instruments = createInstruments();
  const ship = { x: 0, y: 0, vx: 0, vy: 0 };
  const random = randomSource(341265);
  const asteroids = [];
  const cameraOffset = { x: 0, y: 0 };
  let pointer = null;
  let aspect = 1;
  let sceneTime = 0;
  let lastFrame = 0;

  function rock(x, y, z, radius, type, rotation) {
    const [pitch, yaw] = rotation ?? [random() * Math.PI * 2, random() * Math.PI * 2];
    const spin = (random() - 0.5) * (radius >= 10 ? 0.043 : 0.145);
    return { x, y, z, radius, type, pitch, yaw, spin };
  }

  function resize() {
    const width = Math.max(game.clientWidth, 1);
    const height = Math.max(game.clientHeight, 1);
    aspect = width / height;
    paintSky(width, height);
    renderer.resize(width, height);
    instruments.resize(width, height);
  }

  function distantRock(z) {
    const x = (random() * 2 - 1) * (z * .21 + 8);
    const y = (random() * 2 - 1) * (z * .13 + 5);
    const radius = .38 + random() ** 1.8 * 4.4;
    const fragments = [0, 2, 4, 5];
    return rock(x, y, z, radius, fragments[Math.floor(random() * fragments.length)]);
  }

  function nextFlyby(asteroid) {
    const radius = 12 + random() * 5;
    const side = asteroid.x < 0 ? 1 : -1;
    const x = side * radius * (1.13 + random() * .28);
    const y = (random() - .48) * radius * 1.2;
    return rock(x, y, 137 + random() * 32, radius, asteroid.type);
  }

  function setImmersive(enabled) {
    game.toggleAttribute("data-immersive", enabled);
    immersive.setAttribute("aria-pressed", String(enabled));
    immersive.querySelector("span").textContent = enabled ? "退出全屏" : "全屏观看";
  }

  async function toggleImmersive() {
    const enabled = !game.hasAttribute("data-immersive");
    setImmersive(enabled);
    try {
      if (enabled && document.fullscreenEnabled) await game.requestFullscreen();
      if (!enabled && document.fullscreenElement === game) await document.exitFullscreen();
    } catch {
      // Keep the in-page view when the browser cannot enter native fullscreen.
    }
  }

  function updateCruise(delta) {
    const axes = [0, 0];
    for (const key of keys) {
      const [x, y] = directions.get(key);
      axes[0] += x;
      axes[1] += y;
    }
    if (pointer) {
      axes[0] += clamp((pointer.x - pointer.originX) / 65, -1, 1);
      axes[1] += clamp((pointer.originY - pointer.y) / 65, -1, 1);
    }
    const length = Math.max(1, Math.hypot(...axes));
    const easing = 1 - Math.exp(-delta * 2.9);
    ship.vx += (axes[0] * 2.65 / length - ship.vx) * easing;
    ship.vy += (axes[1] * 2.3 / length - ship.vy) * easing;
    const horizontalLimit = clamp(aspect * 7.2, 4.5, 13);
    ship.x = clamp(ship.x + ship.vx * delta, -horizontalLimit, horizontalLimit);
    ship.y = clamp(ship.y + ship.vy * delta, -6.2, 6.2);

    for (let index = 0; index < asteroids.length; index++) {
      const asteroid = asteroids[index];
      asteroid.z -= delta * cruiseSpeed;
      if (asteroid.z < -asteroid.radius * 3.35) {
        asteroids[index] = asteroid.radius >= 10 ? nextFlyby(asteroid) : distantRock(135 + random() * 52);
      }
    }
  }

  function glidePastRocks(camera, delta) {
    let x = 0;
    let y = 0;
    for (const asteroid of asteroids) {
      const { z, radius } = asteroid;
      if (z > radius * 4.6 || z < -radius * 3.3) continue;
      const dx = camera.x - asteroid.x;
      const dy = camera.y - asteroid.y;
      const distance = Math.hypot(dx, dy);
      const clearance = radius * (radius >= 10 ? 1.18 : 1.42);

      // Commit to the same side for the whole flyby.
      if (!asteroid.pass) {
        if (distance > clearance) continue;
        asteroid.pass = distance > .25 ? [dx / distance, dy / distance] : [-.8, .6];
      }

      const [sx, sy] = asteroid.pass;
      const projected = dx * sx + dy * sy;
      const across = Math.abs(dx * sy - dy * sx);
      const target = Math.sqrt(Math.max(0, clearance ** 2 - across ** 2));
      const weight = (1 - smoothstep(radius * 1.65, radius * 4.6, z)) * smoothstep(-radius * 3.3, -radius * 1.3, z);
      const influence = 1 - smoothstep(clearance, clearance * 1.65, distance);
      const offset = Math.max(0, target - projected) * weight * influence;
      x += sx * offset;
      y += sy * offset;
    }
    const ease = 1 - Math.exp(-delta * 4);
    cameraOffset.x += (x - cameraOffset.x) * ease;
    cameraOffset.y += (y - cameraOffset.y) * ease;
    camera.x += cameraOffset.x;
    camera.y += cameraOffset.y;
  }

  function frame(now) {
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, .08) : 0;
    lastFrame = now;
    sceneTime += delta;
    updateCruise(delta);

    const camera = {
      x: ship.x + Math.sin(sceneTime * .108) * .75,
      y: ship.y + Math.sin(sceneTime * .080) * .42,
    };
    glidePastRocks(camera, delta);
    const bank = ship.vx * .007 + Math.sin(sceneTime * .096) * .007;
    renderer.frame(asteroids, camera, aspect, bank, sceneTime);
    instruments.frame(ship, camera, asteroids, bank);
    requestAnimationFrame(frame);
  }

  immersive.addEventListener("click", toggleImmersive);
  document.addEventListener("fullscreenchange", () => setImmersive(document.fullscreenElement === game));
  window.addEventListener("keydown", event => {
    if (directions.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    } else if (event.code === "KeyF" && !event.repeat) {
      event.preventDefault();
      toggleImmersive();
    } else if (event.code === "Escape" && !document.fullscreenElement) {
      setImmersive(false);
    }
  });
  window.addEventListener("keyup", event => keys.delete(event.code));
  window.addEventListener("blur", () => {
    keys.clear();
    pointer = null;
  });

  game.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" || !event.isPrimary || event.target.closest("button")) return;
    pointer = { id: event.pointerId, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY };
    game.setPointerCapture(event.pointerId);
  });
  game.addEventListener("pointermove", event => {
    if (pointer?.id !== event.pointerId) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    game.addEventListener(eventName, event => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
  }

  asteroids.push(
    rock(-14.5, -.7, 34, 14.1, 1, [0.25, 1.22]),
    rock(19.2, 7.3, 62, 15.9, 3, [-.31, .30]),
    rock(-24.5, 9.4, 103, 12.1, 3, [.8, 2.1]),
    rock(10.4, -4.8, 28, 2.8, 2),
    rock(-.8, .1, 60, 1.35, 4),
    rock(6.1, 6.5, 43, 1.35, 0),
    rock(20, -10, 73, 4.1, 5),
  );
  for (let index = 0; index < 29; index++) asteroids.push(distantRock(54 + random() * 138));

  resize();
  window.addEventListener("resize", resize);
  game.dataset.ready = "true";
  requestAnimationFrame(frame);
}

function showCockpit() {
  if (cockpit.naturalWidth > 0) cockpit.hidden = false;
}

cockpit.addEventListener("load", showCockpit);
showCockpit();

createRenderer().then(startCruise).catch(error => {
  console.error(error);
  document.querySelector("#error").hidden = false;
  document.querySelector("#controls").hidden = true;
  immersive.hidden = true;
});
