"use strict";

const game = document.querySelector("#game");
const space = document.querySelector("#space");
const sky = document.querySelector("#sky");
const immersive = document.querySelector("#immersive");
const nebula = document.querySelector("#nebula");
const media = window.spaceMedia;
const measuredRocks = window.asteroidModels;

const focalLength = 1.47;
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
  const gl = space.getContext("webgl", { alpha: true, antialias: false, powerPreference: "high-performance" });
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
    "uniform float uRadius;",
    "uniform vec2 uRotation;",
    "varying vec3 vObject, vLocalNormal, vWorld;",
    "varying vec2 vTexcoord;",
    "varying vec4 vTangent;",
    ...rotationSource,
    sceneProjection,
    "void main() {",
    "  vObject = aPosition;",
    "  vLocalNormal = aNormal;",
    "  vTexcoord = aTexcoord;",
    "  vTangent = aTangent;",
    "  vWorld = rotate(aPosition) * uRadius + uCenter;",
    "  gl_Position = projectScene(cameraSpace(vWorld));",
    "}",
  ].join("\n");

  const fragmentSource = [
    "precision highp float;",
    "uniform vec3 uColor;",
    "uniform float uHasPhoto, uPhotoHasNormal;",
    "uniform vec3 uGuide;",
    "uniform vec2 uRotation;",
    "uniform sampler2D uRockMap, uReliefMap, uPhotoMap, uPhotoNormalMap;",
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
    "  vec3 light = normalize(vec3(.60,.66,.38));",
    "  vec3 view = normalize(-vWorld);",
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
    "    float rim = pow(1.0 - max(0.0,dot(normal,view)),2.7);",
    "    vec3 cloudLight = vec3(.71,.96,1.31) * pow(diffuse,.73);",
    "    float proximity = 1.0 - smoothstep(9.0,43.0,length(uGuide));",
    "    float reflected = max(0.0,dot(rough,normalize(uGuide)));",
    "    vec3 roadLight = vec3(1.07,.51,.17) * reflected * proximity * .78;",
    "    vec3 ambient = vec3(.115,.155,.24) + vec3(.105,.16,.27) * rim;",
    "    vec3 shaded = base * ((cloudLight + roadLight) * mix(.72,1.0,cavity) + ambient*cavity);",
    "    float haze = smoothstep(41.0,210.0,length(vWorld)) * .54;",
    "    gl_FragColor = vec4(mix(shaded,vec3(.074,.136,.213),haze),1.0);",
    "}",
  ].join("\n");

  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const position = gl.getAttribLocation(program, "aPosition");
  const normal = gl.getAttribLocation(program, "aNormal");
  const texcoord = gl.getAttribLocation(program, "aTexcoord");
  const tangent = gl.getAttribLocation(program, "aTangent");
  const uniforms = {};
  for (const name of ["Center", "Radius", "Aspect", "Focal", "View", "Rotation", "Color", "Guide",
    "RockMap", "ReliefMap", "HasPhoto", "PhotoHasNormal", "PhotoMap", "PhotoNormalMap"]) {
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

  const rocks = asteroidColors.map((_, index) => bufferMesh(makeSphere(3, index)));
  const fragments = asteroidColors.map((_, index) => bufferMesh(makeSphere(1, index)));
  rocks[1] = bufferRock(measuredRocks?.bennu, 3) || rocks[1];
  rocks[3] = bufferRock(measuredRocks?.eros, 4, 5) || rocks[3];
  const distantBennu = bufferRock(measuredRocks?.bennuLow, 6) || rocks[1];
  const route = createRouteRenderer(document.querySelector("#route"));
  gl.enableVertexAttribArray(position);
  gl.enableVertexAttribArray(normal);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.frontFace(gl.CW);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform1f(uniforms.Focal, focalLength);
  gl.uniform1i(uniforms.RockMap, 1);
  gl.uniform1i(uniforms.ReliefMap, 2);

  await Promise.all([
    loadTexture(1, media?.rock, [121, 117, 113, 255]),
    loadTexture(2, media?.relief, [128, 128, 255, 255]),
    loadTexture(3, measuredRocks?.bennu?.color, [111, 109, 105, 255], "longitude"),
    loadTexture(4, measuredRocks?.eros?.color, [129, 127, 122, 255], "clamp"),
    loadTexture(5, measuredRocks?.eros?.normal, [128, 128, 255, 255], "clamp"),
    loadTexture(6, measuredRocks?.bennuLow?.color, [111, 109, 105, 255], "clamp"),
  ]);

  function draw(mesh, x, y, z, asteroid, time) {
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
    gl.uniform1f(uniforms.Radius, asteroid.radius);
    gl.uniform2f(uniforms.Rotation, asteroid.pitch + time * asteroid.spin * .69, asteroid.yaw + time * asteroid.spin);
    gl.uniform3fv(uniforms.Color, asteroidColors[asteroid.type]);
    gl.uniform3f(uniforms.Guide, -asteroid.offset, -asteroid.y, .5);
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
      const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1820 / width, 1140 / height,
        Math.sqrt(1_100_000 / (width * height)));
      space.width = Math.round(width * scale);
      space.height = Math.round(height * scale);
      gl.viewport(0, 0, space.width, space.height);
      route.resize(Math.round(width), Math.round(height));
    },
    frame(asteroids, camera, aspect, time) {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform1f(uniforms.Aspect, aspect);
      gl.uniform2f(uniforms.View, camera.cos, camera.sin);

      let detailedBennu = false;
      for (const asteroid of asteroids) {
        const x = asteroid.x - camera.x;
        const y = asteroid.y - camera.y;
        const z = asteroid.distance - camera.distance;
        const depth = x * camera.sin + z * camera.cos;
        const lateral = x * camera.cos - z * camera.sin;
        const extent = asteroid.radius * 1.48;
        if (depth < -extent || Math.abs(y) > Math.max(depth, 0) / focalLength + extent + 4 ||
            Math.abs(lateral) > Math.max(depth, 0) * aspect / focalLength + extent) continue;
        const apparent = asteroid.radius / Math.max(depth, 1);
        let mesh = apparent < .029 ? fragments[asteroid.type] : rocks[asteroid.type];
        if (asteroid.type === 1) {
          if (detailedBennu || apparent < .16) mesh = distantBennu;
          else detailedBennu = true;
        }
        draw(mesh, x, y, z, asteroid, time);
      }
      route.draw(camera, focalLength);
    },
  };
}

function startCruise(renderer) {
  const random = randomSource(341265);
  const asteroids = [];
  let aspect = 1;
  let eyeHeight = 3.1;
  let distance = 0;
  let sceneTime = 0;
  let lastFrame = null;
  let skyPan;

  function rock(side, station, y, radius, margin, type, rotation) {
    const center = routeCenter(station);
    const clearance = radius * 1.17 + routeHalfWidth + margin;
    let offset = side * clearance;
    // Keep the entire rock clear of both edges, including on the inside of a bend.
    for (let relative = -clearance; relative <= clearance; relative += .65) {
      const reach = Math.sqrt(clearance * clearance - relative * relative);
      const edge = routeCenter(station + relative) - center + side * reach;
      offset = side > 0 ? Math.max(offset, edge) : Math.min(offset, edge);
    }
    const [pitch, yaw] = rotation ?? [random() * Math.PI * 2, random() * Math.PI * 2];
    const spin = (random() - .5) * (radius >= 7 ? .049 : .157);
    return { x: center + offset, y, distance: station, offset, radius, type, pitch, yaw, spin };
  }

  function fragment(station) {
    const side = random() < .5 ? -1 : 1;
    const radius = .19 + random() ** 2.25 * 3.9;
    const y = (random() - .40) * (21 + .09 * (station - distance));
    const margin = 1 + random() ** 1.6 * (20 + .19 * (station - distance));
    const types = [0, 2, 4, 5];
    return rock(side, station, y, radius, margin, types[Math.floor(random() * types.length)]);
  }

  function nextFlyby(asteroid) {
    const side = asteroid.offset < 0 ? 1 : -1;
    const radius = 7 + random() * 8;
    return rock(side, distance + 115 + random() * 55, (random() - .34) * 24,
      radius, 1.6 + random() * 7, asteroid.type);
  }

  function resize() {
    const width = Math.max(game.clientWidth, 1);
    const height = Math.max(game.clientHeight, 1);
    aspect = width / height;
    eyeHeight = clamp(5.9 / aspect, 3.0, 10.8);
    paintSky(width, height);
    renderer.resize(width, height);
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
      // In an embedded browser the in-page immersive view is still available.
    }
  }

  function frame(now) {
    const delta = lastFrame === null ? 0 : Math.min((now - lastFrame) / 1000, .08);
    lastFrame = now;
    sceneTime += delta;
    distance += cruiseSpeed * delta / Math.hypot(1, routeGradient(distance));

    for (let index = 0; index < asteroids.length; index++) {
      const asteroid = asteroids[index];
      if (asteroid.distance < distance - asteroid.radius * 2 - 23) {
        asteroids[index] = asteroid.radius >= 7 ? nextFlyby(asteroid) : fragment(distance + 135 + random() * 96);
      }
    }

    const lookAhead = Math.max(9, eyeHeight * focalLength);
    const lookBack = aspect < 1 ? 0 : 4;
    const heading = Math.atan2(
      routeCenter(distance + lookAhead) - routeCenter(distance - lookBack),
      lookAhead + lookBack,
    );
    const camera = {
      x: routeCenter(distance),
      y: eyeHeight,
      distance,
      cos: Math.cos(heading),
      sin: Math.sin(heading),
    };
    const pan = Math.round(-heading * 58) / 10;
    if (pan !== skyPan) {
      skyPan = pan;
      nebula.style.setProperty("--sky-pan", pan + "%");
    }
    renderer.frame(asteroids, camera, aspect, sceneTime);
    requestAnimationFrame(frame);
  }

  immersive.addEventListener("click", toggleImmersive);
  document.addEventListener("fullscreenchange", () => setImmersive(document.fullscreenElement === game));
  window.addEventListener("keydown", event => {
    if (event.code === "KeyF" && !event.repeat) {
      event.preventDefault();
      toggleImmersive();
    } else if (event.code === "Escape" && !document.fullscreenElement) {
      setImmersive(false);
    }
  });

  asteroids.push(
    rock(-1, 15, 2.4, 13.8, 5.0, 1, [.32, 1.22]),
    rock(1, 23, 4.2, 14.3, .3, 1, [1.17, 2.42]),
    rock(-1, 39, 9.5, 8.9, 12, 3, [-.5, .25]),
    rock(1, 64, 11.4, 10.1, 4, 3, [.82, -.8]),
    rock(-1, 86, 1.1, 7.8, 4.2, 1, [-1.17, .23]),
    rock(1, 125, -4.9, 12.5, 3, 1, [.81, 1.6]),
    rock(-1, 154, 12.5, 10.5, 6, 3, [1.27, .6]),
  );
  for (let index = 0; index < 104; index++) asteroids.push(fragment(28 + random() * 218));

  resize();
  window.addEventListener("resize", resize);
  game.dataset.ready = "true";
  requestAnimationFrame(frame);
}

function showNebula() {
  if (nebula.naturalWidth > 0) nebula.hidden = false;
}

nebula.addEventListener("load", showNebula);
showNebula();

createRenderer().then(startCruise).catch(error => {
  console.error(error);
  document.querySelector("#error").hidden = false;
  document.querySelector("#controls").hidden = true;
  immersive.hidden = true;
});
