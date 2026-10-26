import * as THREE from 'three';
import { Reflector } from './vendor/Reflector.js';
import { createHeroInteractions } from './hero-interactions.js';
const host = document.querySelector('#world');
const hero = document.querySelector('.hero');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
createHeroInteractions(hero, reduced);
try {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9cfdf');
  scene.fog = new THREE.Fog('#d9cfdf', 29, 100);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 140);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .98;
  host.appendChild(renderer.domElement);
  const solids = [];
  let seed = 137;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function texture(size, painter) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    painter(canvas.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }
  const plasterTexture = texture(512, (ctx, s) => {
    const pixels = ctx.createImageData(s, s);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const n = 211 + random() * 40;
      pixels.data[i] = n; pixels.data[i + 1] = n; pixels.data[i + 2] = n; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
  });
  plasterTexture.repeat.set(.8, .8);
  const environment = texture(1024, (ctx, s) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, s);
    gradient.addColorStop(0, '#c4d8f1'); gradient.addColorStop(.33, '#f2e9e1');
    gradient.addColorStop(.55, '#d1b6b0'); gradient.addColorStop(.75, '#9e99b4'); gradient.addColorStop(1, '#e1ced1');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fffaf1'; ctx.fillRect(s * .11, s * .15, s * .12, s * .45);
    ctx.fillStyle = '#ecf7ff'; ctx.fillRect(s * .64, s * .12, s * .065, s * .5);
    ctx.fillStyle = '#c7988b'; ctx.fillRect(s * .4, s * .5, s * .13, s * .4);
  });
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromEquirectangular(environment);
  scene.environment = envTarget.texture; scene.environmentIntensity = .65;
  pmrem.dispose(); environment.dispose();
  scene.add(new THREE.HemisphereLight('#e4e4fa', '#a17b7d', 1.05));
  const sun = new THREE.DirectionalLight('#fff1e4', 2.45);
  sun.position.set(-8, 11, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 17, bottom: -12, near: 1, far: 55 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00015; sun.shadow.radius = 3;
  sun.target.position.set(0, 2, -5); scene.add(sun, sun.target);
  const skyFill = new THREE.DirectionalLight('#c5c3f1', .7); skyFill.position.set(-12, 5, -15); scene.add(skyFill);
  const plaster = new THREE.MeshStandardMaterial({ color: '#cba7a3', roughness: .92, bumpMap: plasterTexture, bumpScale: .047 });
  const stepMaterial = new THREE.MeshStandardMaterial({ color: '#dcbdb3', roughness: .82, bumpMap: plasterTexture, bumpScale: .022 });
  const stepRiser = stepMaterial.clone(); stepRiser.color.set('#bda5a1');
  const stepFaces = [stepMaterial, stepMaterial, stepMaterial, stepRiser, stepRiser, stepRiser];
  function box(w, h, d, x, y, z, material = plaster) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); solids.push(mesh); return mesh;
  }
  function arch({ x, z, width, height, radius, spring, depth, rotation = 0 }) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -.15); shape.lineTo(-width / 2, height);
    shape.lineTo(width / 2, height); shape.lineTo(width / 2, -.15);
    shape.lineTo(radius, -.15); shape.lineTo(radius, spring);
    shape.absarc(0, spring, radius, 0, Math.PI, false);
    shape.lineTo(-radius, -.15); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, curveSegments: 64 });
    const mesh = new THREE.Mesh(geometry, plaster); mesh.position.set(x, 0, z); mesh.rotation.y = rotation;
    mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); solids.push(mesh);
    return mesh;
  }
  arch({ x: -9.65, z: .2, width: 4.5, height: 10.4, radius: 1.65, spring: 4.8, depth: .55, rotation: .10 });
  arch({ x: -7.9, z: -3.5, width: 4.3, height: 10.4, radius: 1.65, spring: 5.0, depth: .64, rotation: .10 });
  const wallZ = -7.9, wallD = .72;
  box(6.4, 11, wallD, -4.35, 5.4, wallZ);
  box(2.8, 11, wallD, -.45, 5.4, wallZ);
  box(.58, 11, wallD, 1.24, 5.4, wallZ);
  box(1.9, 3.2, wallD, 2.48, 8.4, wallZ);
  box(.54, 11, wallD, 3.70, 5.4, wallZ);
  box(1.4, 4.5, wallD, 4.67, 2.15, wallZ);
  box(7.3, 11, wallD, 9.02, 5.4, wallZ);
  box(2.0, 3.1, .45, 2.5, 3.25, -9.25);
  box(12, 2.07, 8, 3.75, 1.01, -9.6, stepFaces);
  for (let i = 0; i < 8; i++) {
    const h = .26 * (i + 1);
    box(5.45, h, .57, .34, h / 2, -2.34 - i * .55, stepFaces);
  }
  const terrainGeometry = new THREE.PlaneGeometry(120, 65, 170, 95);
  terrainGeometry.rotateX(-Math.PI / 2);
  const vertices = terrainGeometry.attributes.position;
  const colors = new Float32Array(vertices.count * 3);
  const lowColor = new THREE.Color('#927c9e'), highColor = new THREE.Color('#bca0b5');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i);
    const distance = (z + 32.5) / 65;
    const ridge = Math.sin(x * .12 + z * .14) * 1.9 + Math.sin(x * .28 - z * .09) * .9 + Math.sin(x * .64 + z * .4) * .3;
    const y = Math.max(-.15, (1 - distance) * 5 + ridge * Math.sin((1 - distance) * Math.PI * .7));
    vertices.setY(i, y);
    const col = lowColor.clone().lerp(highColor, Math.min(1, y / 8 + random() * .15));
    colors.set([col.r, col.g, col.b], i * 3);
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  terrain.position.set(-22, -.55, -39); terrain.receiveShadow = true; scene.add(terrain);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.02, 96, 64), new THREE.MeshPhysicalMaterial({
    color: '#f4eee4', metalness: .25, roughness: .12, clearcoat: 1, clearcoatRoughness: .04,
    iridescence: 1, iridescenceIOR: 1.42, iridescenceThicknessRange: [180, 480], envMapIntensity: 1.8,
  }));
  orb.position.set(3.8, 3.35, -5.85); orb.castShadow = true; scene.add(orb); solids.push(orb);
  orb.material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float pearlFacing=abs(dot(normalize(vNormal),normalize(vViewPosition)));
      vec3 pearlTint=.78+.22*cos((1.-pearlFacing)*7.+vec3(0.,2.,4.));
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*pearlTint,.6);
    `);
  };
  function rock(x, z, scale, phase) {
    const geometry = new THREE.SphereGeometry(1, 56, 40); const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 1 + Math.sin(x * 9 + y * 7 + phase) * Math.sin(z * 8 - y * 4) * .09 + Math.sin(x * 21 + z * 15) * .023 + Math.sin(y * 43 + z * 32) * Math.sin(x * 36) * .009;
      pos.setXYZ(i, x * n, y * n, z * n);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: '#ad9a8d', roughness: .98, bumpMap: plasterTexture, bumpScale: .12 });
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, -.08, z); mesh.scale.set(...scale); mesh.rotation.y = phase; mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); solids.push(mesh);
  }
  rock(4.6, -1.2, [1.35, .92, 1.02], 1.2); rock(8.8, 2.0, [2.1, .62, 1.3], 3.1);
  const water = new Reflector(new THREE.PlaneGeometry(220, 220), {
    textureWidth: Math.min(1536, Math.round(innerWidth * 1.2)), textureHeight: Math.min(1024, Math.round(innerHeight * 1.2)),
    color: 0x9194ad, clipBias: .0025, multisample: 2,
  });
  water.rotation.x = -Math.PI / 2; water.position.y = -.035;
  water.material.uniforms.uTime = { value: 0 };
  // Independent origins and birth times preserve a continuous pointer wake.
  const rippleCount = 24;
  const ripples = Array.from({ length: rippleCount }, () => new THREE.Vector4(0, 0, -100, 0));
  water.material.uniforms.uRipples = { value: ripples };
  water.material.vertexShader = water.material.vertexShader.replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec3 vWorld;')
    .replace('vUv = textureMatrix', 'vWorld = (modelMatrix * vec4(position, 1.0)).xyz; vUv = textureMatrix');
  water.material.fragmentShader = `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec4 uRipples[24];
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
    float waves(vec2 p) {
      float t=uTime;
      return sin(p.x*1.8+p.y*2.4-t*.5)*.25 + sin(p.x*3.4-p.y*1.2+t*.65)*.15 + noise(p*3.+t*.07)*.28 + noise(p*7.-t*.1)*.08;
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec2 p=vWorld.xz;
      float a=waves(p), b=waves(p+vec2(.08,0)), c=waves(p+vec2(0,.08));
      vec2 normal=vec2(b-a,c-a);
      float crest=0.;
      for(int i=0;i<24;i++) {
        float age=uTime-uRipples[i].z;
        if(age>0. && age<5.) {
          vec2 direction=p-uRipples[i].xy;
          float radius=length(direction);
          float front=radius-age*1.65;
          float envelope=exp(-front*front*3.2)*exp(-age*.72)*smoothstep(0.,.12,age);
          float wave=sin(front*15.)*envelope*uRipples[i].w;
          normal+=direction/max(radius,.03)*wave*.28;
          crest+=cos(front*15.)*envelope*uRipples[i].w;
        }
      }
      vec4 uv=vUv;
      uv.xy+=normal*.075*uv.w;
      vec3 reflection=texture2DProj(tDiffuse,uv).rgb;
      float fresnel=clamp(length(cameraPosition-vWorld)/35.,.25,.9);
      vec3 tint=vec3(.19,.22,.31);
      vec3 result=mix(reflection,tint,.40+(1.-fresnel)*.12);
      float glint=pow(max(0.,1.-abs(normal.x*.8+normal.y*1.1)),60.);
      result+=vec3(.05,.042,.04)*glint+vec3(.035,.031,.04)*crest;
      gl_FragColor=vec4(result,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  scene.add(water);
  const dustPositions = new Float32Array(65 * 3);
  for (let i = 0; i < 65; i++) dustPositions.set([(random() - .5) * 18, random() * 9, -random() * 15], i * 3);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ffedcf', size: .016, transparent: true, opacity: .55, depthWrite: false })); scene.add(dust);
  let referenceReady = false, animatedOrb = orb, orbBaseY = 3.35;
  const baseCamera = new THREE.Vector3(.25, 2.85, 12.2);
  const baseLook = new THREE.Vector3(.05, 2.9, -5.5);
  const smoothPointer = new THREE.Vector2(), slowPointer = new THREE.Vector2();
  const mouseRotation = new THREE.Euler(), mouseQuaternion = new THREE.Quaternion();
  const proceduralObjects = scene.children.filter(object => object !== water && !object.isLight && object !== sun.target);
  let inView = true, lastFrame = 0, mobile = false, time = 0, pressStart = -1;
  let nextRipple = 0, lastRipple = -1, lastPointerX = 0, lastPointerY = 0, pointerInside = false;
  let pointerMoved = false;
  const lastWaterHit = new THREE.Vector3(1000, 0, 1000);
  const cameraGoal = new THREE.Vector3(), cameraLook = new THREE.Vector3();
  let pressAmount = 0;
  let submergeState=null;
  let dragX = 0, targetDragX = 0, dragging = false, startX = 0, startDragX = 0;
  const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), .035);
  const hit = new THREE.Vector3();
  function waterHit() {
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(waterPlane, hit) || hit.distanceTo(camera.position) > 65) return false;
    const obstruction = raycaster.intersectObjects(solids, false)[0];
    return !obstruction || obstruction.distance > camera.position.distanceTo(hit) + .025;
  }
  function addRipple(strength) {
    if (reduced || !waterHit()) return false;
    ripples[nextRipple].set(hit.x, hit.z, time, strength);
    nextRipple = (nextRipple + 1) % rippleCount;
    lastRipple = time; lastWaterHit.copy(hit);
    return true;
  }
  function resize() {
    const width = host.clientWidth, height = host.clientHeight;
    if(!width||!height)return;
    mobile = width < 600; renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.35 : 1.65));
    renderer.setSize(width, height); camera.aspect = width / height;
    if (referenceReady) camera.setFocalLength(mobile ? 42 : 36);
    else camera.fov = mobile ? 55 : 43;
    camera.updateProjectionMatrix();
    water.getRenderTarget().setSize(Math.min(1536, Math.round(width * 1.2)), Math.min(1024, Math.round(height * 1.2)));
  }
  function render(dt) {
    time += dt;
    const ease = 1 - Math.exp(-dt * 4.8);
    dragX += (targetDragX - dragX) * ease;
    const pressed = pressStart < 0 ? 0 : Math.min(1, (time - pressStart) * .75);
    pressAmount += (pressed - pressAmount) * ease;
    const x = (referenceReady ? baseCamera.x : mobile ? .15 : .25) + (reduced || referenceReady ? 0 : pointer.x * 1.05) + dragX;
    const z = (referenceReady ? baseCamera.z : mobile ? 13.5 : 12.2) - pressAmount * 1.8;
    cameraGoal.set(x, baseCamera.y + (reduced || referenceReady ? 0 : pointer.y * .38), z);
    camera.position.lerp(cameraGoal, ease);
    cameraLook.set(baseLook.x + dragX * .3 + (referenceReady ? 0 : pointer.x * .12), baseLook.y + (referenceReady ? 0 : pointer.y * .07), baseLook.z);
    camera.lookAt(cameraLook);
    if (referenceReady && !reduced && !mobile) {
      smoothPointer.lerp(pointer, 1 - Math.exp(-dt * 4.68));
      slowPointer.lerp(pointer, 1 - Math.exp(-dt * 1.21));
      camera.position.copy(cameraGoal);
      camera.lookAt(cameraLook);
      camera.translateZ(-10);
      mouseRotation.set(smoothPointer.y * .035, -smoothPointer.x * .135, -.05 * (smoothPointer.x - slowPointer.x));
      mouseQuaternion.setFromEuler(mouseRotation); camera.quaternion.multiply(mouseQuaternion);
      camera.translateZ(10);
    }
    if(submergeState){
      const p=submergeState.progress;
      const descent=THREE.MathUtils.smoothstep(p,.04,.96);
      const waterHeight=water.position.y;
      const height=Math.max(.5,Math.abs(submergeState.position.y-waterHeight));
      const forward=submergeState.forward;
      camera.position.copy(submergeState.position).addScaledVector(forward,height*1.45*descent);
      camera.position.y=THREE.MathUtils.lerp(submergeState.position.y,waterHeight-height*.5,descent);
      const target=camera.position.clone().addScaledVector(forward,height*5);
      target.y=camera.position.y-height*Math.sin(p*Math.PI)*.32;
      camera.lookAt(target);camera.fov=submergeState.fov+Math.sin(p*Math.PI)*7;camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    water.material.uniforms.uTime.value = reduced ? 0 : time;
    if (!reduced) {
      animatedOrb.position.y = orbBaseY + Math.sin(time * .55) * (referenceReady ? .00022 : .022);
      dust.rotation.y = Math.sin(time * .04) * .03;
      if (pointerInside && pointerMoved) {
        const overWater = waterHit();
        hero.classList.toggle('over-water', overWater);
        if (overWater && time - lastRipple > .045 && hit.distanceTo(lastWaterHit) > .09) addRipple(dragging ? .9 : .6);
        pointerMoved = false;
      }
    }
    renderer.render(scene, camera);
  }
  function animate(t) {
    requestAnimationFrame(animate);
    if (!inView || submergeState || document.hidden || document.body.classList.contains('intro-pending') || document.body.classList.contains('locked')) { lastFrame = t; return; }
    const elapsed = t - lastFrame;
    if (elapsed < (mobile ? 30 : 15)) return;
    lastFrame = t; render(Math.min(elapsed / 1000, .05));
  }
  function interactiveTarget(e) { return e.target.closest('a,button,nav'); }
  hero.addEventListener('pointermove', e => {
    if (reduced) return;
    const rect = hero.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    pointerInside = !interactiveTarget(e);
    pointerMoved = e.clientX !== lastPointerX || e.clientY !== lastPointerY;
    lastPointerX = e.clientX; lastPointerY = e.clientY;
    if (!pointerInside) hero.classList.remove('over-water');
    if (dragging) targetDragX = THREE.MathUtils.clamp(startDragX + (startX - e.clientX) * .009, -2.1, 2.1);
  }, { passive: true });
  hero.addEventListener('pointerdown', e => {
    if (interactiveTarget(e) || e.button !== 0 || reduced) return;
    const rect = hero.getBoundingClientRect();
    pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    dragging = true; startX = e.clientX; startDragX = targetDragX; pressStart = time;
    hero.classList.add('exploring');
    if (e.pointerType === 'mouse') hero.setPointerCapture(e.pointerId);
    addRipple(1.35);
  });
  function release() { dragging = false; pressStart = -1; hero.classList.remove('exploring'); }
  hero.addEventListener('pointerup', release); hero.addEventListener('pointercancel', release); window.addEventListener('blur', release);
  hero.addEventListener('lostpointercapture', release);
  hero.addEventListener('pointerleave', () => { pointerInside = false; hero.classList.remove('over-water'); if (!dragging) pointer.set(0, 0); });
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; }, { threshold: 0 }).observe(hero);
  window.addEventListener('resize', resize, { passive: true });
  resize(); camera.position.set(mobile ? .15 : .25, 2.85, mobile ? 13.5 : 12.2); camera.lookAt(.05, 2.9, -5.5);
  render(0); host.classList.add('ready'); requestAnimationFrame(animate);
  import('./reference-courtyard.js').then(module => module.loadReferenceCourtyard(renderer)).then(courtyard => {
    for (const object of proceduralObjects) object.visible = false;
    solids.splice(0, solids.length, ...courtyard.solids);
    scene.add(courtyard.group);
    animatedOrb = courtyard.orb; orbBaseY = animatedOrb.position.y;
    baseCamera.copy(courtyard.camera); baseLook.copy(courtyard.target);
    water.position.y = courtyard.waterY; waterPlane.constant = -courtyard.waterY;
    referenceReady = true; camera.far = 200; renderer.shadowMap.enabled = false;
    water.material.toneMapped = false; water.material.needsUpdate = true;
    resize(); camera.position.copy(baseCamera); camera.lookAt(baseLook); scene.updateMatrixWorld(true);
    render(0); host.dataset.scene = 'reference';
  }).catch(error => console.warn('Reference courtyard unavailable; retaining procedural courtyard.', error));
  document.addEventListener('portfolio:capture',e=>{render(0);e.detail.capture(renderer.domElement)});
  document.addEventListener('portfolio:submerge',e=>{
    if(e.detail.end){
      if(submergeState){camera.fov=submergeState.fov;camera.position.copy(submergeState.position);camera.updateProjectionMatrix();}
      submergeState=null;return;
    }
    if(!submergeState){const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();submergeState={position:camera.position.clone(),forward,fov:camera.fov,progress:0};}
    submergeState.progress=e.detail.progress;render(1/60);e.detail.capture(renderer.domElement);
  });
  document.addEventListener('portfolio:dive',e=>hero.classList.toggle('submerging',e.detail.active));
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); host.classList.remove('ready'); });
} catch (error) { console.warn('3D courtyard unavailable; showing the static background.', error); }
