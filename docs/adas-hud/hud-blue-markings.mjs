import {Color} from 'three';
import {blueRoadColor} from './hud-blue-road.mjs';

export function createBlueRoadMarkings(world) {
  const dash = new Color(blueRoadColor);
  const edge = new Color('#fafcff');
  const fade = {value: 0};
  const shaderMaterials = new WeakSet();

  function installFade(material) {
    if (shaderMaterials.has(material)) return;
    shaderMaterials.add(material);
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    material.onBeforeCompile = shader => {
      compile.call(material, shader);
      shader.uniforms.hudBlueFade = fade;
      shader.fragmentShader = 'uniform float hudBlueFade;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>', `#ifdef USE_FOG
        float hudRoadFade = smoothstep(10.5, 17.0, vFogDepth) * (1.0 - smoothstep(36.0, 90.0, vFogDepth));
        diffuseColor.a *= mix(1.0, hudRoadFade, hudBlueFade);
        #endif
        #include <alphatest_fragment>`);
    };
    material.customProgramCacheKey = () => `${cacheKey}-hud-blue-road`;
    material.needsUpdate = true;
  }

  return function drawMarkings(draw) {
    const materials = new Map();
    for (const mesh of world.root.children) {
      if (!mesh.geometry?.hasAttribute('paintSize') || mesh.userData.construction) continue;
      const color = mesh.userData.laneDash ? dash : mesh.userData.roadEdge ? edge : null;
      if (color) materials.set(mesh.material, color);
    }
    const originals = [];
    fade.value = 1;
    for (const [material, color] of materials) {
      originals.push([material, material.color.clone(), material.emissive.clone()]);
      material.color.copy(color);
      material.emissive.copy(color).multiplyScalar(.45);
      installFade(material);
    }
    try { return draw(); }
    finally {
      for (const [material, color, emissive] of originals) {
        material.color.copy(color);
        material.emissive.copy(emissive);
      }
      fade.value = 0;
    }
  };
}
