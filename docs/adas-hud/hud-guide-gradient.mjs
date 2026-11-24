import {BufferAttribute, DynamicDrawUsage, Matrix4, Vector2, Vector3, Vector4} from 'three';
import {createHudDisplayUniforms, hudDisplayColorShader, setHudDisplayColor} from './hud-display-color.mjs';

const vertexShader = `
  attribute float hudGuideProgress;
  varying vec2 vUv;
  varying float vGuideProgress;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    // Cancel perspective-correct interpolation for a display-space ramp.
    vGuideProgress = hudGuideProgress * gl_Position.w;
  }`;

const fragmentShader = `
  uniform float dark, guideGradient, displayOpacity;
  uniform vec3 guideColor, guideFar;
  uniform vec2 guideOpacity, guideStops;
  varying vec2 vUv;
  varying float vGuideProgress;

  ${hudDisplayColorShader}

  void main() {
    float progress = clamp(vGuideProgress * gl_FragCoord.w, 0., 1.);
    float blend = clamp((progress - guideStops.x) / (guideStops.y - guideStops.x), 0., 1.) * guideGradient;
    vec3 color = mix(guideColor, guideFar, blend);
    float side = abs(vUv.x - .5) * 2.;
    float cap = 1. - smoothstep(.79, 1., progress);
    float alpha;
    if (displayOpacity > 1.5) {
      float aa = min(fwidth(side) * .5, .012);
      float outline = smoothstep(.956 - aa, .956 + aa, side);
      color = mix(color, vec3(.56,.96,1.), outline * .53 * (1. - blend));
      float fade = mix(1. - smoothstep(.30, 1., vUv.y), cap, guideGradient);
      alpha = smoothstep(0., .032, vUv.y) * fade;
    } else if (displayOpacity > 1.) {
      float fade = mix(1. - smoothstep(.74, 1., vUv.y), cap, guideGradient);
      alpha = (1. - smoothstep(.90, .99, side)) * smoothstep(0., .014, vUv.y) * fade;
    } else {
      float body = 1. - smoothstep(.69, .94, side);
      float glow = exp(-side * side * 3.8) * (1. - smoothstep(.88, 1., side));
      float fade = mix(1. - smoothstep(.42, 1., vUv.y), cap, guideGradient);
      alpha = (body * .76 + glow * .10) * smoothstep(0., .025, vUv.y) * fade * mix(.96, 1., dark);
    }
    alpha *= mix(guideOpacity.x, guideOpacity.y, blend);
    if (alpha < .001) discard;

    gl_FragColor = vec4(hudDisplayColor(color, alpha), alpha);
  }`;

export function installHudGuideGradient(world) {
  const {mesh} = world.roadGuidance;
  const {geometry, material} = mesh;
  const {position, uv} = geometry.attributes;
  const values = new Float32Array(position.count);
  const progress = new BufferAttribute(values, 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute('hudGuideProgress', progress);
  const uniforms = material.uniforms;
  Object.assign(uniforms, {
    guideFar: {value: new Vector3()},
    guideGradient: {value: 0},
    guideOpacity: {value: new Vector2(1, 1)},
    guideStops: {value: new Vector2(0, 1)},
    ...createHudDisplayUniforms(world)
  });
  material.vertexShader = vertexShader;
  material.fragmentShader = fragmentShader;
  material.needsUpdate = true;

  const clip = new Vector4();
  const matrix = new Matrix4();
  let farColor;

  return function updateGuideGradient(guide, preset) {
    if (!mesh.visible) return;
    uniforms.guideGradient.value = guide.gradient ? 1 : 0;
    uniforms.displayOpacity.value = preset === 'carpet' ? 2 : preset === 'blueRoad' ? 1.13 : 1;
    uniforms.hudDisplayExposure.value = world.renderer.toneMappingExposure;
    uniforms.guideOpacity.value.set(guide.nearOpacity / 100, guide.farOpacity / 100);
    uniforms.guideStops.value.set(guide.nearPosition / 100, guide.farPosition / 100);
    if (farColor !== guide.far) {
      farColor = guide.far;
      setHudDisplayColor(uniforms.guideFar.value, farColor);
    }
    if (!guide.gradient) return;

    const {camera} = world;
    camera.updateMatrixWorld();
    mesh.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
    let previousX, previousY, distance = 0;
    for (let i = 0; i < position.count; i += 2) {
      clip.set(
        (position.getX(i) + position.getX(i + 1)) / 2,
        (position.getY(i) + position.getY(i + 1)) / 2,
        (position.getZ(i) + position.getZ(i + 1)) / 2, 1
      ).applyMatrix4(matrix);
      if (clip.w <= camera.near) {
        distance = 0;
        break;
      }
      const x = clip.x / clip.w * camera.aspect, y = clip.y / clip.w;
      if (i) distance += Math.hypot(x - previousX, y - previousY);
      values[i] = values[i + 1] = distance;
      previousX = x;
      previousY = y;
    }
    // Fall back to the path coordinate if the ribbon crosses the near plane.
    for (let i = 0; i < values.length; i++) values[i] = distance > .00001 ? values[i] / distance : uv.getY(i);
    progress.needsUpdate = true;
  };
}
