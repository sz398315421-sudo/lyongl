import {createRequire} from 'node:module';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const require = createRequire(process.env.HMI_BUILD_PACKAGE || import.meta.url);
const {build} = require('esbuild');
const docs = fileURLToPath(new URL('../docs/', import.meta.url));
const adas = path.join(docs, 'adas');
const hud = path.join(docs, process.env.HMI_HUD_DIRECTORY || 'hud');
const hasEditor = await readFile(path.join(hud, 'studio.html')).then(() => true, () => false);

function replace(source, original, replacement) {
  const found = typeof original === 'string' ? source.includes(original) : original.test(source);
  if (!found) throw Error(`ADAS source is missing ${original}`);
  return source.replaceAll(original, replacement);
}

// Keep resource URLs relative to the HUD page so history links stay on /hud/.
let html = (await readFile(path.join(adas, 'index.html'), 'utf8')).replaceAll('\r\n', '\n');
html = replace(html, '<title>自动驾驶道路场景</title>', '<title>HUD</title>');
html = replace(html, '<body>', '<body class="hud-workspace">');
html = replace(html, 'href="./">自动驾驶道路场景</a>', 'href="./">HUD</a>');
html = html.replace(/<span class="site-version"[^>]*>[^<]+<\/span>/, '');
const editorLink = hasEditor ? '<a class="studio-tool-link" href="./studio.html">HUD 编辑器</a>' : '';
html = replace(html, /<div class="control-group appearance-control">(?:<a class="studio-tool-link" href="\.\.\/hud\/">HUD 生成器 ↗<\/a>)?/g, `<div class="control-group appearance-control">${editorLink}<a class="studio-tool-link" href="../adas/">返回 ADAS</a>`);
html = html.replace('<link rel="stylesheet" href="tool-links.css">', '');
html = html.replace(/href="((?!https?:|data:|#|\.\/|\.\.\/)[^"]+)"/g, 'href="../adas/$1"');
html = replace(html, 'let poster=`assets/', 'let poster=`../adas/assets/');
html = replace(html, 'preloadAsset("./', 'preloadAsset("../adas/');
html = replace(html, 'localStorage.getItem("sr-theme")', 'localStorage.getItem("hud:sr-theme")');
html = replace(html, "localStorage.getItem('sr-screen-format')", "localStorage.getItem('hud:sr-screen-format')");
html = replace(html, "sessionStorage.getItem('drivescene-preview-v10')", "sessionStorage.getItem('hud:drivescene-preview-v10')");
html = replace(html, '||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")', '||"dark"');
const editorRedirect = hasEditor ? "const hudQuery=new URLSearchParams(location.search);if(hudQuery.has('projection')||hudQuery.has('preset'))location.replace('./studio.html'+location.search+location.hash);" : '';
html = replace(html, 'let saved;try', `${editorRedirect}
try{document.documentElement.toggleAttribute('data-hud-environment',sessionStorage.getItem('hud:environment')==='1')}catch{}
let saved;try`);
html = replace(html, '["2","4","6"].includes(q.get("lanes"))', '["2","3","4","6"].includes(q.get("lanes"))');
html = replace(html, '${posterScene}-${lanes}-${view}', '${posterScene}-${lanes==="3"?"4":lanes}-${view}');
html = replace(html, '<button type="button" data-road="laneCount" data-value="4"', '<button type="button" data-road="laneCount" data-value="3" aria-label="3 车道" aria-pressed="false">3</button><button type="button" data-road="laneCount" data-value="4"');
html = replace(html, '</head>', '<link rel="stylesheet" href="./hud.css"></head>');
const controls = await readFile(path.join(hud, 'hud-controls.html'), 'utf8');
html = replace(html, '<div class="preview-settings"><div class="scene-options">', `<div class="preview-settings">\n${controls}<div class="scene-options">`);
html = replace(html, '</button></div></div><div class="preview-settings">', `</button></div>
  <div class="hud-preview-actions">
    <button type="button" id="hud-environment" aria-pressed="false" disabled>场景环境</button>
    <button type="button" id="hud-immersive" aria-haspopup="dialog" aria-controls="hud-immersive-dialog" disabled>沉浸预览</button>
  </div>
</div><div class="preview-settings">`);
html = replace(html, '<div class="preview-settings">', '<div class="preview-settings" role="region" aria-label="HUD 场景设置" tabindex="0">');
html = replace(html, '<p id="status" role="status"></p>', '');
html = replace(html, '</div><div class="preview-settings" role=', '<p id="status" role="status"></p></div><div class="preview-settings" role=');
html = replace(html, /<script src="startup\.js[^"]*"><\/script>(?:<script type="module">[^<]*<\/script>)?<\/body>/g, `<dialog id="hud-immersive-dialog" aria-label="HUD 沉浸预览，按 Esc 或点击画面退出"></dialog>
<script type="module" src="./hud.mjs"></script><script src="./hud-startup.js"></script></body>`);

const startup = (await readFile(path.join(adas, 'startup.js'), 'utf8')).replaceAll('\r\n', '\n');

await build({
  entryPoints: [path.join(adas, 'app.js')],
  outfile: path.join(hud, 'hud-scene.bundle.mjs'),
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['chrome110', 'safari17', 'firefox115'],
  nodePaths: [path.resolve(path.dirname(require.resolve('three')), '../..')],
  plugins: [{name: 'hud-adas-entry', setup(builder) {
    builder.onResolve({filter: /^\.\/(world|export-scene)\.js$/}, args => {
      if (args.importer !== path.join(adas, 'app.js')) return;
      return {path: path.join(hud, args.path === './world.js' ? 'hud-world.mjs' : 'hud-export.mjs')};
    });
    builder.onLoad({filter: /\.js(?:\?.*)?$/}, async args => {
      if (!args.path.startsWith(adas + path.sep)) return;
      const relative = path.relative(hud, args.path).replaceAll(path.sep, '/');
      let contents = await readFile(args.path, 'utf8');
      contents = contents.replaceAll('import.meta.url', `new URL(${JSON.stringify(relative)},import.meta.url).href`);
      if (args.path === path.join(adas, 'app.js')) {
        contents = `import {hudPreferences as localStorage, hudSnapshots as sessionStorage} from '../hud/hud-storage.mjs';\nimport {transparentVideoFormat} from '../hud/hud-video.mjs';\nimport {renderPngSequence} from '../hud/hud-png-sequence.mjs';\n${contents}`;
        contents = replace(contents, 'cameraMetadata,perspectiveSvg,renderDepth,exportSize,exportReadmeForSize', 'cameraMetadata,perspectiveSvg,renderDepth,exportSize,exportReadmeForSize,captureTransparent,withTransparentOutput');
        contents = replace(contents, `||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')`, `||'dark'`);
        contents = replace(contents, '`assets/', '`../adas/assets/');
        contents = replace(contents, "['2','4','6'].includes(query.get('lanes'))", "['2','3','4','6'].includes(query.get('lanes'))");
        contents = replace(contents, "const posterMask=selectedVehicle==='x6'", "const posterLanes=lanes===3?4:lanes;const posterMask=selectedVehicle==='x6'");
        contents = replace(contents, 'states/${st.id}-${lanes}-${view}', 'states/${st.id}-${posterLanes}-${view}');
        contents = replace(contents, "'鸣谢与授权 · 自动驾驶道路场景':'自动驾驶道路场景'", "'鸣谢与授权 · HUD':'HUD'");
        contents = replace(contents, 'const sceneMotionControls=initScenePlaybackControls', `world.hudPlayback=scenePlayback;
world.hudRefreshStart=()=>{
 if(selected==='junction')preferences.get(selected).junctionPosition='approaching';
 render(false);rememberPreview();
};
const sceneMotionControls=initScenePlaybackControls`);
        contents = replace(contents, 'function syncScenePlayback(snapshot=scenePlayback.snapshot()){', `world.hudCaptureGuidance=()=>({enabled:roadGuidanceEnabled,color:roadGuidanceColor});
world.hudSetPresetGuidance=({enabled=true,color=defaultGuidanceColor}={})=>{
 if(scenePlayback.active&&scenePlayback.snapshot().presetDirection)scenePlayback.reset({render:false});
 roadGuidanceEnabled=enabled;world.roadGuidance.enabled=enabled;
 roadGuidanceColor=world.roadGuidance.setColor(color);
 roadAssistControls.setGuideAppearance(roadGuidanceEnabled,roadGuidanceColor);
 try{localStorage.setItem('sr-guidance-color',roadGuidanceColor);}catch{}
 world.renderFrame();syncScenePlayback();updateURL();rememberPreview();
};
function syncScenePlayback(snapshot=scenePlayback.snapshot()){`);
        contents = replace(contents, ' sceneMotionControls.sync(selected,ready,snapshot);', ' world.hudSyncLaneDemo(selected,snapshot);sceneMotionControls.sync(selected,ready,snapshot);');
        contents = replace(contents, "if(['parking','outdoor'].includes(selected)&&pose)", "if(!transparent&&document.documentElement.hasAttribute('data-hud-environment')&&['parking','outdoor'].includes(selected)&&pose)");
        contents = replace(contents, 'async function exportAnimation(){', 'async function exportAnimation(transparent, sequence){');
        contents = replace(contents, 'if(!videoFormat())throw', 'if(!transparent&&!videoFormat())throw');
        contents = replace(contents, "const context=canvas.getContext('2d',{alpha:false});", "const context=canvas.getContext('2d',{alpha:transparent});");
        contents = replace(contents, /  world\.setResolution\(exportSize\.width,exportSize\.height\);\r?\n  let durationMs,sample;/g, '  const recordingFormat=transparent&&!sequence?await transparentVideoFormat(controller.signal):undefined;\n  world.setResolution(exportSize.width,exportSize.height);\n  let durationMs,sample;');
        contents = replace(contents, 'const result=await recordCanvasVideo({canvas,durationMs,signal:', 'const renderAnimation=sequence?renderPngSequence:recordCanvasVideo;\n  const result=await renderAnimation({canvas,durationMs,options:sequence,format:recordingFormat,signal:');
        contents = replace(contents, 'sample(elapsed);context.drawImage(currentFrame(),0,0,canvas.width,canvas.height);', `if(transparent){
    withTransparentOutput(world,()=>{
     sample(elapsed);context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(currentFrame(),0,0);
    });
   }else{sample(elapsed);context.drawImage(currentFrame(),0,0,canvas.width,canvas.height);}`);
        contents = replace(contents, "name+'-demo.'+result.extension);exportControls.announce('演示动画已下载。');", "name+(sequence?'-png-sequence.':transparent?'-transparent.':'-demo.')+result.extension);exportControls.announce(sequence?'透明 PNG 序列已下载。':transparent?'透明 WebM 已下载。':'演示动画已下载。');");
        contents = replace(contents, "async function exportAssets(format='image'){", "async function exportAssets(format='image',sequence){");
        contents = replace(contents, "if(format==='video'){await exportAnimation();return;}", "if(['video','transparent-video','png-sequence'].includes(format)){await exportAnimation(format!=='video',sequence);return;}");
        contents = replace(contents, "format==='video'?error.message:", "['video','transparent-video','png-sequence'].includes(format)?error.message:");
        contents = replace(contents, "if(format==='image'||format==='kit')canvas.getContext('2d').drawImage(currentFrame(),0,0);", "if(format==='transparent')captureTransparent(world,canvas);\n   else if(format==='image'||format==='kit')canvas.getContext('2d').drawImage(currentFrame(),0,0);");
        contents = replace(contents, "filename=captured.name+'.png';", "filename=captured.name+(format==='transparent'?'-transparent':'')+'.png';");
        contents = replace(contents, "'PNG 图片已下载。');", "format==='transparent'?'透明 PNG 已下载。':'PNG 图片已下载。');");
        contents = replace(contents, "offset=cached?.viewOffset;if(previewSnapshotSearch", "offset=cached?.viewOffset;if(!world.hudHasStartOverride(requested.id)&&previewSnapshotSearch");
      }
      if (args.path === path.join(adas, 'world.js')) {
        contents = `import {applyStartPose, hasStartOverride, resetStartPose} from '../hud/hud-start.mjs';\n${contents}`;
        contents = replace(contents, ' configureCamera(id,options){', ` hudHasStartOverride(id){return hasStartOverride(this,id);}
 configureCamera(id,options){
  if(this.hudSettings)resetStartPose(this,id,options.laneCount);`);
        contents = replace(contents, 'const cached=road&&this.roadCameraCache.get(key);', 'const cached=road&&!this.hudSettings&&this.roadCameraCache.get(key);');
        contents = replace(contents, '  this.framing=anchorVehicle(this.car,this.camera,', '  if(this.hudSettings)applyStartPose(this,id,options);\n  this.framing=anchorVehicle(this.car,this.camera,');
        contents = replace(contents, 'if(road)this.roadCameraCache.set(key,this.captureCamera());', 'if(road&&!this.hudSettings)this.roadCameraCache.set(key,this.captureCamera());');
        contents = replace(contents, 'createRoadGuidance();this.scene.add(this.roadGuidance.mesh)', 'createRoadGuidance(()=>this.hudSettings?.guide);this.scene.add(this.roadGuidance.mesh)');
        contents = replace(contents, "id==='02'||id==='04'||id==='09',id!=='03'", "options.laneCount!==3&&(id==='02'||id==='04'||id==='09'),id!=='03'");
        contents = replace(contents, "if(edges)for(const side of [-1,1]){this.line(side*(w/2-.25),z0,z1,y);", "const blueRoad=this.hudSettings&&this.current==='02'&&Math.round(w/lane)===3;\n  if(edges)for(const side of [-1,1]){this.line(side*(w/2-.25),z0,z1,y,'white',blueRoad?.17:.13);");
        contents = replace(contents, "this.line(x,z,end,y);this.root.children.at(-1).userData.laneDash", "this.line(x,z,end,y,'white',this.hudSettings&&this.current==='02'&&this.options.laneCount===3?.24:.13);this.root.children.at(-1).userData.laneDash");
      }
      if (args.path === path.join(adas, 'road-assist.js')) {
        contents = `import {bindHexColor} from '../hud/hud-hex.mjs';\nimport {sampleRightPassGuidance} from '../hud/hud-right-pass.mjs';\n${contents}`;
        contents = replace(contents, 'export function createRoadGuidance(){', 'export function createRoadGuidance(getEffect){');
        contents = replace(contents, "if(plan.kind==='ramp-exit')return sampleRampExit(plan,distance);", "if(plan.kind==='hud-right-pass')return sampleRightPassGuidance(plan,distance);\n  if(plan.kind==='ramp-exit')return sampleRampExit(plan,distance);");
        contents = replace(contents, 'displayOpacity:{value:1}', 'displayOpacity:{value:1},guideFar:{value:new THREE.Vector3()},guideGradient:{value:0}');
        contents = replace(contents, 'uniform vec3 guideColor;uniform float displayOpacity;', 'uniform vec3 guideColor;uniform vec3 guideFar;uniform float guideGradient;uniform float displayOpacity;');
        contents = replace(contents, 'vec3 color=mix(guideColor,mix(guideColor,vec3(1.),.12),.28*(1.-side));', 'vec3 hue=mix(guideColor,guideFar,smoothstep(0.,.80,vUv.y)*guideGradient);\n    vec3 color=mix(hue,mix(hue,vec3(1.),.12),.28*(1.-side));');
        contents = replace(contents, 'gl_FragColor=vec4(color,alpha*displayOpacity);', `if(displayOpacity>1.0){
     vec3 tint=mix(guideColor,guideFar,smoothstep(.06,1.,vUv.y)*guideGradient);
     color=mix(tint/12.92,pow((tint+.055)/1.055,vec3(2.4)),step(vec3(.04045),tint));
     if(displayOpacity>1.5){
      // Keep the mesh boundary sharp and antialias only the inner edge of the outline.
      float aa=min(fwidth(side)*.5,.012);
      float outline=smoothstep(.956-aa,.956+aa,side);
      color=mix(color,mix(color,vec3(.56,.96,1.0),.53),outline);
      alpha=smoothstep(0.,.032,vUv.y)*(1.-smoothstep(.30,1.,vUv.y));
     }else alpha=(1.-smoothstep(.90,.99,side))*smoothstep(0.,.014,vUv.y)*(1.-smoothstep(.74,1.,vUv.y));
     gl_FragColor=vec4(color,alpha);
    }else gl_FragColor=vec4(color,alpha*displayOpacity);`);
        contents = replace(contents, 'const near=(car.userData.vehicleSpec.length||4.85)*.40;let far=34;', `const effect=getEffect?.(),near=(car.userData.vehicleSpec.length||4.85)*.40;let far=effect?near+effect.length:34;
  material.uniforms.guideGradient.value=effect?.gradient?1:0;
  if(effect?.gradient&&material.userData.far!==effect.far){material.uniforms.guideFar.value.copy(guidanceColorVector(effect.far));material.userData.far=effect.far;}`);
        contents = replace(contents, 'dz=-Math.sin(point.yaw),width=.70;', 'dz=-Math.sin(point.yaw),width=(effect?.width??1.4)*.5;');
        contents = replace(contents, 'function syncColor(){custom.value=selectedColor;', 'const syncHex=bindHexColor(document.getElementById(\'hud-guide-near-hex\'),chooseColor);\n function syncColor(){syncHex(selectedColor);custom.value=selectedColor;');
        contents = replace(contents, 'custom.disabled=!ready;', "document.getElementById('hud-guide-near-hex').disabled=custom.disabled=!ready;");
        contents = replace(contents, 'return {sync(scene,ready,snapshot,world){', 'return {setGuideAppearance(enabled,color){input.checked=enabled;selectedColor=color;syncColor();},sync(scene,ready,snapshot,world){');
        contents = replace(contents, "const scene=drivingSceneKey(world.state?.id),centered=['elevated','ramp'].includes(scene);", "const scene=drivingSceneKey(world.state?.id),blueRoad=scene==='road'&&world.state?.laneCount===3,centered=blueRoad||['elevated','ramp'].includes(scene);");
        contents = replace(contents, "if(effect?.gradient&&material.userData.far!==effect.far)", "const preset=world.hudSettings?.preset;material.uniforms.displayOpacity.value=preset==='carpet'?2:preset==='blueRoad'?1.13:1;\n  if(effect?.gradient&&material.userData.far!==effect.far)");
      }
      if (args.path === path.join(adas, 'export-controls.js')) {
        contents = `import {supportsHudWebm} from '../hud/hud-video.mjs';\nimport {createSequenceFields} from '../hud/hud-png-sequence.mjs';\n${contents}`;
        contents = replace(contents, "['image','PNG 图片','场景图像','PNG'],", "['image','PNG 图片','场景图像','PNG'],['transparent','透明 PNG','车辆、道路标线和引导线','PNG'],");
        contents = replace(contents, "['kit','透视套件'", "['transparent-video','透明视频（WebM）',supportsHudWebm()?'保留透明背景和引导线渐变':'此浏览器暂不支持透明 WebM','WebM'],['png-sequence','透明 PNG 序列（AE）','逐帧透明 PNG · 可设置帧率和总帧数','ZIP'],['kit','透视套件'");
        contents = replace(contents, "if(format==='video'&&!video)input.disabled=true;", "if(format==='video'&&!video||format==='transparent-video'&&!supportsHudWebm())input.disabled=true;");
        contents = replace(contents, ' const video=videoFormat();', ' const video=videoFormat();\n const sequence=createSequenceFields();');
        contents = replace(contents, "if(input.checked){submit.textContent=", "if(input.checked){sequence.fields.hidden=format!=='png-sequence';submit.textContent=");
        contents = replace(contents, "const sized=format==='image'||format==='video'", "const sized=['image','transparent','video','transparent-video','png-sequence'].includes(format)");
        contents = replace(contents, 'dialog.append(header,size,choices,submit);', 'dialog.append(header,size,choices,sequence.fields,submit);');
        contents = replace(contents, 'await close();onExport(format);', "const sequenceOptions=format==='png-sequence'?sequence.read():undefined;if(sequenceOptions===null)return;await close();onExport(format,sequenceOptions);");
      }
      if (args.path === path.join(adas, 'export-files.js')) {
        contents = replace(contents, 'export async function zipFiles(files){', 'export async function zipFiles(files,signal){');
        contents = replace(contents, ' for(const [name,content]of files){', ' for(const [name,content]of files){\n  signal?.throwIfAborted();');
        contents = replace(contents, 'localParts.push(local,data);', "localParts.push(local,typeof content==='string'?data:content);");
        contents = replace(contents, '  const local=new Uint8Array(30+filename.length)', "  if(offset+30+filename.length+data.length>0xffffffff)throw new Error('ZIP 超过容量上限，请减少帧数。');\n  const local=new Uint8Array(30+filename.length)");
        contents = replace(contents, ' const end=new Uint8Array(22)', " if(offset+centralSize+22>0xffffffff)throw new Error('ZIP 超过容量上限，请减少帧数。');\n const end=new Uint8Array(22)");
      }
      if (args.path === path.join(adas, 'video-export.js')) {
        contents = replace(contents, 'onProgress=()=>{},signal}){', 'onProgress=()=>{},signal,format=videoFormat()}){');
        contents = replace(contents, ' const format=videoFormat();if(!format)', ' if(!format)');
        contents = replace(contents, / signal\?\.throwIfAborted\(\);\r?\n const stream=/g, ' signal?.throwIfAborted();\n renderFrame(0);\n const stream=');
        contents = replace(contents, 'renderFrame(0);recorder.start();started=true;capture(0);', 'recorder.start();started=true;capture(0);');
      }
      if (args.path === path.join(adas, 'scene-playback.js')) {
        contents = `import {applyRightPassFrame, createPresetLaneChange, presetLaneDirection, rightPassDuration} from '../hud/hud-right-pass.mjs';\n${contents}`;
        contents = replace(contents, 'const snapshot=()=>({scene,status,', `const presetDirection=()=>world.hudSettings?.preset&&!world.state?.roadworks?presetLaneDirection(world,roadLaneState(world)):null;
 const snapshot=()=>{const direction=trip?.hudRightPass?trip.laneChange.direction:!trip?presetDirection():null;return {scene,status,presetDirection:direction,`);
        contents = replace(contents, 'durationMs:trip?.durationMs||sceneTripDurationMs', 'durationMs:trip?.durationMs||(direction?rightPassDuration:sceneTripDurationMs)');
        contents = replace(contents, 'toLane:trip.laneChange.toLane}:null});', 'toLane:trip.laneChange.toLane}:null};};');
        contents = replace(contents, 'function apply(){', 'function apply(){\n  if(trip.hudRightPass){applyRightPassFrame(world,base,trip,elapsedMs);return;}');
        contents = replace(contents, /origin=base;\r?\n   \/\//g, `origin=base;
   const direction=presetDirection();
   if(direction)trip=createPresetLaneChange(base,roadLaneState(world),direction);
   //`);
        contents = replace(contents, 'if(trip.parking)apply();notify();frame=', 'if(trip.parking||trip.hudRightPass)apply();notify();frame=');
        contents = replace(contents, "heading.textContent=parking?'自动泊车动画':'场景动画';", "heading.textContent=parking?'自动泊车动画':state.presetDirection==='left'?'左变道演示':state.presetDirection==='right'?'右变道演示':'场景动画';");
        contents = replace(contents, 'seek,snapshot,get active()', 'seek,snapshot,get status(){return status;},get basePose(){return base;},get active()');
      }
      if (args.path === path.join(adas, 'vehicle-selector.js')) {
        contents = replace(contents, "'vehicle-previews/", "'../adas/vehicle-previews/");
        contents = `import {bindHexColor} from '../hud/hud-hex.mjs';\n${contents}`;
        contents = replace(contents, "colorValue=element('span','vehicle-color-value');", "colorValue=element('input','vehicle-color-value hud-hex');colorValue.type='text';colorValue.maxLength=7;colorValue.spellcheck=false;colorValue.placeholder='#FFFFFF';colorValue.setAttribute('aria-label','车漆颜色 HEX');const syncPaintHex=bindHexColor(colorValue,value=>changeSetting('paint',value));");
        contents = replace(contents, 'colorInputs.push(color);', 'colorInputs.push(color,colorValue);');
        contents = replace(contents, "colorValue.textContent=appearance.paint==='original'?'原厂':appearance.paint.toUpperCase();", "syncPaintHex(appearance.paint==='original'?'#edf0f4':appearance.paint);");
      }
      contents = contents.replaceAll("'../hud/", `'../${path.basename(hud)}/`);
      return {contents, loader: 'js', resolveDir: path.dirname(args.path)};
    });
  }}]
});

const bundlePath = path.join(hud, 'hud-scene.bundle.mjs');
const bundle = (await readFile(bundlePath, 'utf8')).replace(/[\t ]+$/gm, '');
const version = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
const startupVersion = replace(startup, /\.\/app\.bundle\.js[^']*/g, `./hud-scene.bundle.mjs?v=${version}`);
html = replace(html, 'src="./hud-startup.js"', `src="./hud-startup.js?v=${version}"`);
const cssVersion = createHash('sha256').update(await readFile(path.join(hud, 'hud.css'))).digest('hex').slice(0, 12);
html = replace(html, 'href="./hud.css"', `href="./hud.css?v=${cssVersion}"`);
await Promise.all([
  writeFile(bundlePath, bundle),
  writeFile(path.join(hud, 'index.html'), html.replace('<!doctype html>', '<!doctype html>\n<!-- Generated from the ADAS page by scripts/build-hud-preview.mjs. -->')),
  writeFile(path.join(hud, 'hud-startup.js'), startupVersion)
]);

console.log('Built the HUD page and renderer from the shared ADAS controls');
