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
const restoreScript = (await build({
  stdin: {contents: "import {restoreHudStartup} from './hud-storage.mjs';restoreHudStartup();", resolveDir: hud},
  bundle: true, minify: true, format: 'iife', write: false
})).outputFiles[0].text;
html = replace(html, 'let saved;try', `${editorRedirect}
${restoreScript}
let saved;try`);
html = replace(html, '["2","4","6"].includes(q.get("lanes"))', '["2","3","4","6"].includes(q.get("lanes"))');
html = replace(html, 'known=["01","02","03","05","06","07","08","09","10","12","13","14","16","17","18","19"],scene=aliases[raw]||(known.includes(raw)?raw:"02")', 'known=["01","02","03","05","09","12"],mapped=aliases[raw]||raw,scene=known.includes(mapped)?mapped:"02"');
html = replace(html, 'scene==="09"?"2":"6"', 'scene==="09"?"2":"3"');
html = replace(html, "road:'普通道路',elevated:'高架道路',junction:'交叉路口'", "road:'3车道变道',elevated:'光毯变道',junction:'直行过路口'");
html = replace(html, 'view=junction?(q.get("position")==="approaching"?"low":q.get("position")==="near"?"high":q.get("view")==="low"?"low":"high"):', 'view=junction?"low":');
html = replace(html, "layouts=junction?[['05','十字路口'],['08','丁字路口']]:ramp?", "layouts=ramp?");
html = replace(html, "show('junction-position-control',junction);show('junction-lane-control',junction);", "show('junction-position-control',false);show('junction-lane-control',false);");
html = replace(html, "show('camera-control',!road);document.querySelector('.toolbar').hidden=road;", "show('camera-control',!road&&!junction);document.querySelector('.toolbar').hidden=road||junction;");
html = replace(html, /const available=\{[^\n]+\nconst defaultOn=\{[^\n]+\nconst mask=[^\n]+/g, "const posterMask=q.get('model')&&q.get('model')!=='x6'?0:8;");
html = replace(html, '${posterScene}-${lanes}-${view}', '${junction?"02":posterScene}-${junction?"6":lanes==="3"?"4":lanes}-${view}');
html = replace(html, 'if(snapshotSearch(cached?.search)===snapshotSearch(location.search)', 'if(!junction&&snapshotSearch(cached?.search)===snapshotSearch(location.search)');
html = replace(html, '<button type="button" data-road="laneCount" data-value="4"', '<button type="button" data-road="laneCount" data-value="3" aria-label="3 车道" aria-pressed="false">3</button><button type="button" data-road="laneCount" data-value="4"');
html = replace(html, '</head>', '<link rel="stylesheet" href="./hud.css"></head>');
const laneNavigation = '<section class="scene-group" id="hud-lane-navigation"><h2 class="structure-heading">车道线</h2><div class="structure-items"><a class="scene" href="./lane-departure.html">压线提醒</a><a class="scene" href="./lane-departure.html?scene=curve">弯道模拟</a></div></section>';
html = replace(html, '<nav aria-label="场景列表" id="scenes"></nav>', `<nav aria-label="场景列表" id="scenes">${laneNavigation}</nav>`);
const controls = await readFile(path.join(hud, 'hud-controls.html'), 'utf8');
html = replace(html, /<div class="environment-control" aria-label="场景元素">.*?<\/label><\/div><\/div>(?=<\/div><p id="status")/g, `\n${controls}`);
html = replace(html, /^ const enabled=\{parkedCars:parking,.*\n/gm, '');
html = replace(html, /^ document\.querySelector\('\.environment-control'\)\.hidden=.*\n for\(const \[id,available\]of Object\.entries\(enabled\)\).*\n/gm, '');
html = replace(html, '</button></div></div><div class="preview-settings">', `</button></div>
  <div class="scene-motion-buttons hud-preview-actions">
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
        contents = `import {hudPreferences as localStorage, hudSnapshots as sessionStorage, resetHudSettings, saveHudLastSettings} from '../hud/hud-storage.mjs';\nimport {transparentVideoFormat} from '../hud/hud-video.mjs';\nimport {renderPngSequence} from '../hud/hud-png-sequence.mjs';\n${contents}`;
        contents = replace(contents, 'let vehicleSettings=readVehicleSettings(query);', 'let vehicleSettings=readVehicleSettings(query),lastHudQuery;');
        contents = replace(contents, 'function updateURL(){', 'function updateURL(saveHud=false){');
        contents = replace(contents, "if(roadGuidanceColor!==defaultGuidanceColor)q.set('guideColor',", "q.set('guideColor',");
        contents = replace(contents, 'writeTrafficQuery(q,trafficFlow.settings);', `writeTrafficQuery(q,trafficFlow.settings);
 if(scenePlayback.presetAnimation==='right-turn')q.set('animation','right-turn');
 const hudQuery=q.toString();
 if(saveHud||lastHudQuery!==undefined&&hudQuery!==lastHudQuery)saveHudLastSettings(hudQuery,world.hudSettings);
 lastHudQuery=hudQuery;`);
        contents = replace(contents, 'createScenePlayback(world,{onChange:snapshot=>{', "createScenePlayback(world,{initialPresetAnimation:query.get('animation'),onChange:snapshot=>{");
        contents = replace(contents, 'cameraMetadata,perspectiveSvg,renderDepth,exportSize,exportReadmeForSize', 'cameraMetadata,perspectiveSvg,renderDepth,exportSize,exportReadmeForSize,captureTransparent,withTransparentOutput');
        contents = replace(contents, "['paint','material','lighting','intensity'].some", "['paint','paintOpacity','material','lighting','intensity'].some");
        contents = replace(contents, `||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')`, `||'dark'`);
        contents = replace(contents, '`assets/', '`../adas/assets/');
        contents = replace(contents, "['2','4','6'].includes(query.get('lanes'))", "['2','3','4','6'].includes(query.get('lanes'))");
        contents = replace(contents, 'const first=structures.find(s=>s.layouts.some(([id])=>id===initial))||structures[0];', `const hudPresets={road:{key:'blueRoad',name:'3车道变道'},elevated:{key:'carpet',name:'光毯变道'},junction:{key:'blueRoad',name:'直行过路口'}};
const hudSceneGroups=[['open','ADAS场景'],['carpet','HUD光毯']];
const hudScenes=structures.filter(s=>Object.hasOwn(hudPresets,s.key)).map(s=>({
 ...s,name:hudPresets[s.key].name,group:s.key==='elevated'?'carpet':s.group,layouts:s.key==='junction'?s.layouts.slice(0,1):s.layouts
}));
const first=hudScenes.find(s=>s.layouts.some(([id])=>id===initial))||hudScenes[0];`);
        contents = replace(contents, 'function active(){return structures.find(s=>s.key===selected);}', 'function active(){return hudScenes.find(s=>s.key===selected);}');
        contents = replace(contents, "preferences.get('junction').junctionPosition=query.get('position')==='approaching'||(first.key==='junction'&&query.get('view')==='low'&&!query.has('position'))?'approaching':'near';", "preferences.get('junction').junctionPosition='approaching';");
        contents = replace(contents, "if(first.key==='junction')preferences.get('junction').junctionLanes[initial]=normalizeJunctionLane(initial,query.get('lane'));", '');
        contents = replace(contents, "if(selected==='junction')st.junctionLane=normalizeJunctionLane(st.id,st.junctionLanes[st.id]);", "if(selected==='junction')st.junctionLane='middle';");
        contents = replace(contents, "$('junction-position-control').hidden=!junction;", "$('junction-position-control').hidden=true;");
        contents = replace(contents, "$('junction-lane-control').hidden=!junction;", "$('junction-lane-control').hidden=true;");
        contents = replace(contents, "laneCount:initial==='09'?2:6", "laneCount:initial==='09'?2:3");
        contents = replace(contents, "{id:'02',laneCount:6,cameraView:'low'}", "{id:'02',laneCount:3,cameraView:'low'}");
        contents = replace(contents, '&lanes=6&view=low', '&lanes=3&view=low');
        contents = replace(contents, "['closed',first.group==='closed'?selected:'parking']", "['carpet','elevated']");
        contents = replace(contents, "[['open','行驶'],['closed','泊车']]", "hudSceneGroups");
        contents = replace(contents, "[['open','行驶场景'],['closed','泊车场景']]", "hudSceneGroups");
        contents = replace(contents, 'structures.filter(scene=>scene.group===key)', 'hudScenes.filter(scene=>scene.group===key)');
        contents = replace(contents, "$('scenes').append(section);", "$('scenes').insertBefore(section,$('hud-lane-navigation'));");
        contents = replace(contents, "const environmentIds=optionIds.filter(key=>key!=='vehicle');", "const environmentIds=optionIds.filter(key=>key!=='vehicle');\nfor(const preference of preferences.values())for(const key of environmentIds)preference[key]=false;");
        contents = replace(contents, /^ for\(const key of environmentIds\)\{const available=.*\r?\n.*\$\('buildings'\)\.closest\('\.environment-control'\).*\r?\n/gm, '');
        contents = replace(contents, /^for\(const key of environmentIds\)\$\(key\)\.addEventListener\('change'.*\r?\n/gm, '');
        contents = replace(contents, 'world.roadGuidance.setColor(roadGuidanceColor);', `const presetColor=world.hudApplyPreset(hudPresets[selected].key);
roadGuidanceColor=world.roadGuidance.setColor(query.has('guideColor')?roadGuidanceColor:presetColor??normalizeGuidanceColor(savedGuidanceColor,'#01cff3'));`);
        contents = replace(contents, "const posterMask=selectedVehicle==='x6'", "const posterJunction=selected==='junction',posterLanes=posterJunction?6:lanes===3?4:lanes;const posterMask=selectedVehicle==='x6'");
        contents = replace(contents, 'states/${st.id}-${lanes}-${view}', 'states/${posterJunction?"02":st.id}-${posterLanes}-${view}');
        contents = replace(contents, "'鸣谢与授权 · 自动驾驶道路场景':'自动驾驶道路场景'", "'鸣谢与授权 · HUD':'HUD'");
        contents = replace(contents, 'const sceneMotionControls=initScenePlaybackControls', `world.hudPlayback=scenePlayback;
world.hudSaveScene=()=>updateURL(true);
const resetHudButton=$('hud-reset-settings');
resetHudButton.disabled=false;
resetHudButton.addEventListener('click',resetHudSettings);
world.hudRefreshStart=()=>{
 if(selected==='junction')preferences.get(selected).junctionPosition='approaching';
 render(false);rememberPreview();
};
const sceneMotionControls=initScenePlaybackControls`);
        contents = replace(contents, ' if(!preservePlayback)scenePlayback.reset({render:false});', ` if(!preservePlayback)scenePlayback.reset({render:false});
 const activePreset=hudPresets[selected];
 const nextPresetColor=activePreset&&world.hudApplyPreset(activePreset.key);
 if(nextPresetColor){
  roadGuidanceEnabled=world.roadGuidance.enabled=true;
  roadGuidanceColor=world.roadGuidance.setColor(nextPresetColor);
  roadAssistControls.setGuideAppearance(roadGuidanceEnabled,roadGuidanceColor);
  try{localStorage.setItem('sr-guidance-color',roadGuidanceColor);}catch{}
 }`);
        contents = replace(contents, 'const sceneMotionControls=initScenePlaybackControls({onToggle:()=>{', `const sceneMotionControls=initScenePlaybackControls({onAnimationChange:animation=>{
 if(!scenePlayback.setPresetAnimation(animation))return;
 world.finishLayoutTransition();world.finishCameraMotion();world.finishEnvironmentMotion();world.finishLayoutMotion();
 document.querySelectorAll('.frame-cover').forEach(element=>element.remove());activeCover=null;
 if(!scenePlayback.prepareRightTurnPreview()&&!world.suspended)world.renderFrame();
 updateURL();syncScenePlayback();
},onToggle:()=>{`);
        contents = replace(contents, 'onReset:()=>scenePlayback.reset()', `onReset:()=>{
 scenePlayback.reset();
 scenePlayback.prepareRightTurnPreview();
}`);
        contents = replace(contents, ' if(direction===0)scenePlayback.goStraight();else scenePlayback.changeLane(direction);', ` const previewingTurn=scenePlayback.status==='planned'&&scenePlayback.snapshot().presetRightTurn;
 if(previewingTurn)scenePlayback.reset({render:false});
 const planned=direction===0?scenePlayback.goStraight():scenePlayback.changeLane(direction);
 if(previewingTurn&&!planned)scenePlayback.prepareRightTurnPreview();`);
        contents = replace(contents, 'const revealPlayback=()=>{revealFrame();syncScenePlayback();};', `const revealPlayback=()=>{
 if(revision!==renderRevision)return;
 revealFrame();refreshRightTurnPreview();syncScenePlayback();
};`);
        contents = replace(contents, 'world.onLayoutFrame=moving=>', `function refreshRightTurnPreview(){
 if(selected==='road'&&vehicleFullReady&&preview.dataset.renderPending!=='true'&&!world.cameraMotion&&!world.layoutMotion&&!world.layoutTransition){
  scenePlayback.prepareRightTurnPreview();
 }
}
world.onLayoutFrame=moving=>`);
        contents = replace(contents, "preview.dataset.layoutMoving=String(moving);if(!moving){", "preview.dataset.layoutMoving=String(moving);if(!moving){refreshRightTurnPreview();");
        contents = replace(contents, "preview.dataset.cameraMoving=String(moving);", "preview.dataset.cameraMoving=String(moving);if(!moving)refreshRightTurnPreview();");
        contents = replace(contents, ' sceneMotionControls.sync(selected,ready,snapshot);', ' world.hudSyncLaneDemo(selected,snapshot);sceneMotionControls.sync(selected,ready,snapshot);');
        contents = replace(contents, "if(['parking','outdoor'].includes(selected)&&pose)", "if(!transparent&&['parking','outdoor'].includes(selected)&&pose)");
        contents = replace(contents, 'async function exportAnimation(){', 'async function exportAnimation(transparent, sequence){');
        contents = replace(contents, ' const name=frameName();', ` const animation=original.presetRightTurn?'right-turn':original.presetDirection==='right'?'lane-change':'';
 const name=frameName()+(animation?'-'+animation:'');`);
        contents = replace(contents, 'if(!videoFormat())throw', 'if(!transparent&&!videoFormat())throw');
        contents = replace(contents, "const context=canvas.getContext('2d',{alpha:false});", "const context=canvas.getContext('2d',{alpha:transparent});");
        contents = replace(contents, /  world\.setResolution\(exportSize\.width,exportSize\.height\);\r?\n  let durationMs,sample;/g, '  const recordingFormat=transparent&&!sequence?await transparentVideoFormat(controller.signal):undefined;\n  world.setResolution(exportSize.width,exportSize.height);\n  let durationMs,sample;');
        contents = replace(contents, /  if\(selected==='junction'\)\{\r?\n   \/\/ Reuse the exact approach\/lift choreography[^\n]+\r?\n[\s\S]+?\r?\n  \}else\{\r?\n([\s\S]+?)\r?\n  \}/g, (_, body) => body.replace(/^ /gm, ''));
        contents = replace(contents, 'const preference=preferences.get(selected),originalPreference={...preference},controller=new AbortController();', 'const controller=new AbortController();');
        contents = replace(contents, "  if(selected==='junction'){world.stopCameraMotion();Object.assign(preference,originalPreference);world.update(state());}", '');
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
        contents = `import {applyStartPose, hasStartOverride, resetStartPose, straightJunctionRoute} from '../hud/hud-start.mjs';\n${contents}`;
        contents = replace(contents, ' configureCamera(id,options){', ` hudHasStartOverride(id){return hasStartOverride(this,id);}
 configureCamera(id,options){
  if(this.hudSettings)resetStartPose(this,id,options.laneCount);`);
        contents = replace(contents, 'const cached=road&&this.roadCameraCache.get(key);', 'const cached=road&&!this.hudSettings&&this.roadCameraCache.get(key);');
        contents = replace(contents, '  this.framing=anchorVehicle(this.car,this.camera,', '  if(this.hudSettings)applyStartPose(this,id,options);\n  this.framing=anchorVehicle(this.car,this.camera,');
        contents = replace(contents, 'if(road)this.roadCameraCache.set(key,this.captureCamera());', 'if(road&&!this.hudSettings)this.roadCameraCache.set(key,this.captureCamera());');
        contents = replace(contents, "this.car.position.z=options.junctionPosition==='approaching'?14:-20.5;", "this.car.position.z=options.junctionPosition==='approaching'?(id==='05'?straightJunctionRoute.startZ:14):-20.5;");
        contents = replace(contents, 'createRoadGuidance();this.scene.add(this.roadGuidance.mesh)', 'createRoadGuidance(()=>this.hudSettings?.guide);this.scene.add(this.roadGuidance.mesh)');
        contents = replace(contents, "id==='02'||id==='04'||id==='09',id!=='03'", "options.laneCount!==3&&(id==='02'||id==='04'||id==='09'),id!=='03'");
        contents = replace(contents, "if(edges)for(const side of [-1,1]){this.line(side*(w/2-.25),z0,z1,y);", "const blueRoad=this.hudSettings&&this.current==='02'&&Math.round(w/lane)===3;\n  if(edges)for(const side of [-1,1]){this.line(side*(w/2-.25),z0,z1,y,'white',blueRoad?.17:.13);");
        contents = replace(contents, "this.line(x,z,end,y);this.root.children.at(-1).userData.laneDash", "this.line(x,z,end,y,'white',this.hudSettings&&(this.current==='05'||this.current==='02'&&this.options.laneCount===3)?.24:.13);this.root.children.at(-1).userData.laneDash");
        contents = replace(contents, '!o.userData.buildingOwned&&!o.userData.construction&&o.geometry.index', '!o.userData.buildingOwned&&!o.userData.construction&&!o.userData.hudJunctionThreeLaneEdge&&o.geometry.index');
        contents = replace(contents, / junction\(id,w\)\{[\s\S]*?(?=\n dividedCarriageway)/g, (source) => {
          return source
            .replace('junction(id,w){', 'junction(id,w,{centerZ=-40,curbRadius=2.4,rightTurnLane=false}={}){')
            .replaceAll('-40', 'centerZ').replace('centerZ=centerZ', 'centerZ=-40')
            .replace('r=2.4,crossroad', 'r=curbRadius,crossroad')
            .replace("crossroad=id==='05';", "crossroad=id==='05',straight=this.current==='05'&&!rightTurnLane;\n  const approachZ=straight?straightJunctionRoute.startZ+80:70,edgeWidth=straight?.17:.13;")
            .replace('this.road(0,w,70,near)', 'this.road(0,w,approachZ,near)')
            .replace('70,-22.55,0,true,false', 'approachZ,near+6.35,0,true,false')
            .replace('-57.45,-260,0,true,false', 'far-6.35,-260,0,true,false')
            .replace('this.line(side*(half-.25),70,near+r);if(crossroad)this.line(side*(half-.25),far-r,-260);', "this.line(side*(half-.25),approachZ,near+r,0,'white',edgeWidth);this.root.children.at(-1).userData.roadEdge=true;if(crossroad){this.line(side*(half-.25),far-r,-260,0,'white',edgeWidth);this.root.children.at(-1).userData.roadEdge=true;}")
            .replace("this.plane(150-start,.13,", "this.plane(150-start,edgeWidth,")
            .replace("this.pathRibbon(paint,.13,.028,'white');", "if(!(rightTurnLane&&side===1&&edge===1))this.pathRibbon(paint,edgeWidth,.028,'white');")
            .replace("  for(let x=-140;", "  if(straight){\n   this.line(.25,approachZ,near+r,0,'white',edgeWidth);this.root.children.at(-1).userData.hudJunctionThreeLaneEdge=true;\n   this.line(.25,far-r,-260,0,'white',edgeWidth);this.root.children.at(-1).userData.hudJunctionThreeLaneEdge=true;\n  }\n  for(let x=-140;")
            .replace('Math.abs(x)<19', 'Math.abs(x)<half+8')
            .replace('[-7.4,-3.7,3.7,7.4]', 'Array.from({length:Math.round(w/3.7)-1},(_,i)=>-half+(i+1)*3.7).filter(offset=>Math.abs(offset)>.01)')
            .replace('this.plane(3.8,.13,x,', 'this.plane(3.8,straight?.24:.13,x,')
            .replace("for(const off of [-.105,.105])this.plane(5,.10,x,centerZ+off,.031,'yellow');}", "if(!rightTurnLane)for(const off of [-.105,.105])this.plane(5,.10,x,centerZ+off,.031,'yellow');}\n  if(rightTurnLane){const length=150-half-3.2;for(const side of [-1,1])for(const off of [-.105,.105])this.plane(length,.10,side*(150-length/2),centerZ+off,.031,'yellow');}")
            .replace('crosswalkCount=14', 'crosswalkCount=Math.floor(w/1.5)')
            .replace('crossroad?[-27,-53]:[-27]', 'crossroad?[near+1.9,far-1.9]:[near+1.9]')
            .replace('[-12.8,12.8]', '[-half-1.7,half+1.7]')
            .replace('this.curbs(w,70,near+r)', 'this.curbs(w,approachZ,near+r)')
            .replace('nearCrosswalk:-27,markingEnd:-22.55', 'nearCrosswalk:near+1.9,markingEnd:near+6.35');
        });
      }
      if (args.path === path.join(adas, 'road-assist.js')) {
        contents = `import {bindHexColor} from '../hud/hud-hex.mjs';\nimport {sampleRightPassGuidance} from '../hud/hud-right-pass.mjs';\n${contents}`;
        contents = replace(contents, 'export function createRoadGuidance(){', 'export function createRoadGuidance(getEffect){');
        contents = replace(contents, "if(plan.kind==='ramp-exit')return sampleRampExit(plan,distance);", "if(plan.kind==='hud-right-pass')return sampleRightPassGuidance(plan,distance);\n  if(plan.kind==='ramp-exit')return sampleRampExit(plan,distance);");
        contents = replace(contents, 'const near=(car.userData.vehicleSpec.length||4.85)*.40;let far=34;', `const effect=getEffect?.(),defaultNear=(car.userData.vehicleSpec.length||4.85)*.40;
  const near=Math.max(0,defaultNear+(effect?.startOffset??0));
  let far=effect?defaultNear+effect.length:34;`);
        contents = replace(contents, 'dz=-Math.sin(point.yaw),width=.70;', 'dz=-Math.sin(point.yaw),width=(effect?.width??1.4)*.5;');
        contents = replace(contents, / const colorRow=document\.createElement\('div'\);[^\n]+\r?\n colorRow\.innerHTML=[^\n]+\r?\n const colors=colorRow\.querySelector\('\.guidance-color-options'\);/g, ` const colors=document.getElementById('hud-guide-swatches');
 colors.classList.add('guidance-color-options');colors.setAttribute('role','group');colors.setAttribute('aria-label','引导线预设颜色');`);
        contents = replace(contents, 'colors.append(custom);block.append(colorRow);', "document.getElementById('hud-guide-near-hex').before(custom);");
        contents = replace(contents, 'function syncColor(){custom.value=selectedColor;', 'const syncHex=bindHexColor(document.getElementById(\'hud-guide-near-hex\'),chooseColor);\n function syncColor(){syncHex(selectedColor);custom.value=selectedColor;');
        contents = replace(contents, 'custom.disabled=!ready;', "document.getElementById('hud-guide-near-hex').disabled=custom.disabled=!ready;");
        contents = replace(contents, 'return {sync(scene,ready,snapshot,world){', 'return {setGuideAppearance(enabled,color){input.checked=enabled;selectedColor=color;syncColor();},sync(scene,ready,snapshot,world){');
        contents = replace(contents, "const scene=drivingSceneKey(world.state?.id),centered=['elevated','ramp'].includes(scene);", "const scene=drivingSceneKey(world.state?.id),blueRoad=scene==='road'&&world.state?.laneCount===3,centered=blueRoad||['elevated','ramp'].includes(scene);");
        contents = replace(contents, 'const info=roadLaneState(world),busy=', "const turnPreview=snapshot.status==='planned'&&snapshot.presetRightTurn&&world.hudPlayback?.basePose;\n  const info=roadLaneState(world,turnPreview?.carPosition),busy=");
        contents = replace(contents, 'export function roadLaneState(world){', 'export function roadLaneState(world,position=world.car.position){');
        contents = replace(contents, / const index=centers\.reduce[^\r\n]+\r?\n const distanceAvailable=[^\r\n]+\r?\n const ended=[^\r\n]+\r?\n const blocked=target=>\{\r?\n  if\(target<0[^\r\n]+\r?\n  const zone=[^\r\n]+/g, source=>source.replaceAll('world.car.position','position'));
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
      if (args.path === path.join(adas, 'scene-playback.js')) {
        contents = `import {applyRightPassFrame, canTurnAtJunction, createPresetLaneChange, createPresetRightTurn, junctionDuration, presetLaneDuration, presetLaneDirection} from '../hud/hud-right-pass.mjs';\nimport {straightJunctionRoute} from '../hud/hud-start.mjs';\n${contents}`;
        contents = replace(contents, 'junction:{distance:24,durationMs:sceneTripDurationMs}', 'junction:{distance:straightJunctionRoute.startZ-straightJunctionRoute.endZ,durationMs:straightJunctionRoute.durationMs}');
        contents = replace(contents, 'sampleLanePath,junctionLaneEndZ', 'sampleLanePath');
        contents = replace(contents, "if(key==='junction'&&['05','08'].includes(world.state?.id))trip.distance=Math.max(0,Math.min(trip.distance,world.car.position.z-junctionLaneEndZ));", `if(key==='junction'){
    // Finish beyond the far crosswalk at the end of the same straight lane.
    trip.distance=Math.max(0,base.carPosition.z-straightJunctionRoute.endZ);
   }`);
        contents = replace(contents, 'onChange=()=>{}}={})', "onChange=()=>{},initialPresetAnimation='lane-change'}={})");
        contents = replace(contents, 'const snapshot=()=>({scene,status,', `let presetAnimation=initialPresetAnimation==='right-turn'?'right-turn':'lane-change';
 const turnAvailable=()=>canTurnAtJunction(world);
 const wantsRightTurn=()=>presetAnimation==='right-turn'&&turnAvailable();
 const presetDirection=()=>world.hudSettings?.preset&&!world.state?.roadworks?presetLaneDirection(world,roadLaneState(world)):null;
 const snapshot=()=>{const rightTurn=trip?!!trip.rightTurn:wantsRightTurn();
  const direction=trip?.hudRightPass?trip.laneChange?.direction:!trip&&!rightTurn?presetDirection():null;
  return {scene,status,presetDirection:direction,presetRightTurn:rightTurn,turnAvailable:turnAvailable(),presetAnimation,`);
        contents = replace(contents, 'durationMs:trip?.durationMs||sceneTripDurationMs', "durationMs:trip?.durationMs||(rightTurn?junctionDuration:direction?presetLaneDuration(direction):world.state?.id==='05'?sceneTrips.junction.durationMs:sceneTripDurationMs)");
        contents = replace(contents, 'toLane:trip.laneChange.toLane}:null});', 'toLane:trip.laneChange.toLane}:null};};');
        contents = replace(contents, 'function apply(){', 'function apply(){\n  if(trip.hudRightPass){applyRightPassFrame(world,base,trip,elapsedMs);return;}');
        contents = replace(contents, '(trip.laneChange||trip.rampExit)', '(trip.laneChange||trip.rampExit||trip.rightTurn)');
        contents = replace(contents, ' function play(key){', ` function captureOrigin(key){
  scene=key;root=world.root;base=world.captureCamera();base.carQuaternion=world.car.quaternion.clone();origin=base;
 }
 function prepareRightTurnPreview(){
  if(status!=='idle'||!wantsRightTurn()||world.suspended)return false;
  captureOrigin('road');trip=createPresetRightTurn(world,base);status='planned';apply();notify();return true;
 }
 function play(key){`);
        contents = replace(contents, 'scene=key;trip={...sceneTrips[key]};root=world.root;base=world.captureCamera();base.carQuaternion=world.car.quaternion.clone();origin=base;', 'captureOrigin(key);trip={...sceneTrips[key]};');
        contents = replace(contents, /trip=\{\.\.\.sceneTrips\[key\]\};\r?\n   \/\//g, `trip={...sceneTrips[key]};
   if(key==='road'&&wantsRightTurn())trip=createPresetRightTurn(world,base);
   else {
    const direction=presetDirection();
    if(direction)trip=createPresetLaneChange(base,roadLaneState(world),direction);
   }
   //`);
        contents = replace(contents, 'if(trip.parking)apply();notify();frame=', 'if(trip.parking||trip.hudRightPass)apply();notify();frame=');
        contents = replace(contents, 'initScenePlaybackControls({onToggle,onReset})', 'initScenePlaybackControls({onToggle,onReset,onAnimationChange})');
        contents = replace(contents, " document.querySelector('.vehicle-entry').before(block);", ` const animationChoices=document.createElement('div');
 animationChoices.className='scene-motion-buttons hud-animation-choices';
 animationChoices.setAttribute('role','group');animationChoices.setAttribute('aria-label','ADAS 动画');
 animationChoices.innerHTML='<button type="button" data-hud-animation="lane-change" aria-pressed="true">向右变道</button><button type="button" data-hud-animation="right-turn" aria-pressed="false">路口右转</button>';
 animationChoices.hidden=true;block.prepend(animationChoices);
 const note=document.createElement('p');note.id='hud-lane-demo-note';note.className='hud-control-note';note.hidden=true;block.append(note);
 const animationButtons=[...animationChoices.querySelectorAll('button')];
 for(const button of animationButtons)button.addEventListener('click',()=>onAnimationChange(button.dataset.hudAnimation));
 document.querySelector('.vehicle-entry').before(block);`);
        contents = replace(contents, "block.hidden=scene==='junction'||!sceneTrips[scene]", 'block.hidden=!sceneTrips[scene]');
        contents = replace(contents, "heading.textContent=parking?'自动泊车动画':'场景动画';", `heading.textContent=parking?'自动泊车动画':scene==='junction'?'直行过路口动画':state.presetRightTurn?'路口右转演示':state.presetDirection==='left'?'左变道演示':state.presetDirection==='right'?'右变道演示':'场景动画';
  animationChoices.hidden=scene!=='road'||!state.turnAvailable;
  for(const button of animationButtons){
   button.disabled=!ready;
   button.setAttribute('aria-pressed',String(button.dataset.hudAnimation===state.presetAnimation));
  }`);
        contents = replace(contents, 'seek,snapshot,get active()', `seek,snapshot,prepareRightTurnPreview,get presetAnimation(){return presetAnimation;},setPresetAnimation(animation){
  if(!turnAvailable()||presetAnimation===animation||!['lane-change','right-turn'].includes(animation))return false;
  presetAnimation=animation;reset({render:false});return true;
 },get status(){return status;},get basePose(){return base;},get active()`);
      }
      if (args.path === path.join(adas, 'vehicle-selector.js')) {
        contents = replace(contents, "'vehicle-previews/", "'../adas/vehicle-previews/");
        contents = `import {bindHexColor} from '../hud/hud-hex.mjs';\n${contents}`;
        contents = replace(contents, "const customRow=element('label','vehicle-custom-paint'),customLabel=element('span','','自定义颜色')", "const colorSetting=element('div','hud-color-setting'),customRow=element('div','hud-color-field'),customLabel=element('label','','自定义颜色')");
        contents = replace(contents, "colorValue=element('span','vehicle-color-value');", "colorValue=element('input','vehicle-color-value hud-hex');colorValue.type='text';colorValue.maxLength=7;colorValue.spellcheck=false;colorValue.placeholder='#FFFFFF';colorValue.setAttribute('aria-label','车漆颜色 HEX');const syncPaintHex=bindHexColor(colorValue,value=>changeSetting('paint',value));");
        contents = replace(contents, 'customRow.append(customLabel,colorValue,color);paint.append(customRow);', `colorValue.id='vehicle-paint-hex';customLabel.htmlFor=colorValue.id;
 const paintInputs=element('div','hud-color-inputs');color.classList.add('guidance-custom-color');
 paintInputs.append(color,colorValue);customRow.append(customLabel,paintInputs);colorSetting.append(customRow);paint.append(colorSetting);`);
        contents = replace(contents, 'colorInputs.push(color);', 'colorInputs.push(color,colorValue);');
        contents = replace(contents, ' const paintHint=', ` const opacityRow=element('label','traffic-field'),opacityLabel=element('span','','不透明度'),opacity=element('input',''),opacityValue=element('output','');
 opacity.type='range';opacity.id='vehicle-paint-opacity';opacity.min='0';opacity.max='100';
 opacity.setAttribute('aria-label','车漆不透明度');opacityValue.htmlFor=opacity.id;
 opacity.addEventListener('input',()=>changeSetting('paintOpacity',opacity.valueAsNumber));
 opacityRow.append(opacityLabel,opacityValue,opacity);colorSetting.append(opacityRow);
 const paintHint=`);
        contents = replace(contents, 'const supported=canCustomize();paintHint.hidden=supported;', `const supported=canCustomize();paintHint.hidden=supported;
  opacity.disabled=switching||!ready||!supported;
  opacity.value=appearance.paintOpacity;opacityValue.value=appearance.paintOpacity+'%';opacity.setAttribute('aria-valuetext',opacityValue.value);
  opacity.style.setProperty('--range-fill',opacityValue.value);`);
        contents = replace(contents, "colorValue.textContent=appearance.paint==='original'?'原厂':appearance.paint.toUpperCase();", "syncPaintHex(appearance.paint==='original'?'#edf0f4':appearance.paint);");
      }
      if (args.path === path.join(adas, 'vehicle-settings.js')) {
        contents = `import {normalizeOpacity} from '../hud/hud-hex.mjs';\n${contents}`;
        contents = replace(contents, "{paint:'original',material:", "{paint:'original',paintOpacity:100,material:");
        contents = replace(contents, 'return {paint:/', 'return {paintOpacity:normalizeOpacity(value.paintOpacity),paint:/');
        contents = replace(contents, "paint:query.get('paint'),", "paint:query.get('paint'),paintOpacity:query.get('paintOpacity'),");
        contents = replace(contents, "['paint','paint'],", "['paint','paint'],['paintOpacity','paintOpacity'],");
      }
      if (args.path === path.join(adas, 'vehicle-appearance.js')) {
        contents = replace(contents, "settings.paint==='original'&&settings.material==='original'", "settings.paint==='original'&&settings.material==='original'&&settings.paintOpacity===100");
        contents = replace(contents, '  const hadClearcoat=', `  const alpha=settings.paintOpacity/100;
  const transparent=original.transparent||alpha<1;
  if(material.transparent!==transparent)material.needsUpdate=true;
  material.transparent=transparent;
  material.depthWrite=original.depthWrite&&alpha===1;
  material.opacity=original.opacity*alpha;
  material.visible=original.visible&&alpha>0;
  const hadClearcoat=`);
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
