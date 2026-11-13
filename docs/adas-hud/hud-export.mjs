import {Color} from 'three';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {cameraMetadata as adasCameraMetadata, perspectiveSvg as adasPerspectiveSvg, renderDepth as renderAdasDepth} from '../adas/export-scene.js';
import {withHudLayers} from './hud-layers.mjs';

export * from '../adas/export-scene.js';

export function cameraMetadata(world, options) {
  return world.hudCamera.withView(() => {
    const data = adasCameraMetadata(world, options);
    data.scene.hud = structuredClone(world.hudSettings);
    return data;
  });
}

export function perspectiveSvg(world) {
  return world.hudCamera.withView(() => adasPerspectiveSvg(world));
}

export function renderDepth(world) {
  return world.hudCamera.withView(() => withHudLayers(world, () => renderAdasDepth(world)));
}

export function prepareTransparentOutput(world) {
  const pass = world.composer.passes.find(pass => pass instanceof OutputPass);
  const transparency = {value: false};
  pass.uniforms.hudTransparent = transparency;
  // The canvas expects premultiplied alpha, but tone mapping and sRGB encoding operate on straight RGB.
  pass.material.fragmentShader = pass.material.fragmentShader
    .replace('precision highp float;', 'precision highp float;\nuniform bool hudTransparent;')
    .replace('gl_FragColor = texture2D( tDiffuse, vUv );', 'gl_FragColor = texture2D( tDiffuse, vUv );\nif (hudTransparent && gl_FragColor.a > 0.0) gl_FragColor.rgb /= gl_FragColor.a;')
    .replace(/\}\s*$/, 'if (hudTransparent) gl_FragColor.rgb *= gl_FragColor.a;\n}');
  return transparency;
}

export function withTransparentOutput(world, draw) {
  const {renderer} = world;
  const clearColor = renderer.getClearColor(new Color());
  const clearAlpha = renderer.getClearAlpha();
  world.hudTransparency.value = true;
  renderer.setClearColor(0, 0);
  try {
    return draw();
  } finally {
    world.hudTransparency.value = false;
    renderer.setClearColor(clearColor, clearAlpha);
  }
}

export function captureTransparent(world, canvas) {
  withTransparentOutput(world, () => {
    world.renderFrame();
    canvas.getContext('2d').drawImage(world.renderer.domElement, 0, 0);
  });
}
