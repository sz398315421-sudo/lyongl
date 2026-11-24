import {Matrix4, Vector2, Vector3, Vector4, MathUtils} from 'three';
import {laneWidth, roadLaneState} from '../adas/road-assist.js';
import {createHudDisplayUniforms, hudDisplayColorShader, setHudDisplayColor} from './hud-display-color.mjs';

export function createBlueRoadMarkings(world) {
  const enabled = {value: 0};
  const uniforms = {
    hudMarkingsEnabled: enabled,
    hudMarkingsColor: {value: new Vector3()},
    hudMarkingsBase: {value: new Vector3()},
    hudMarkingsBaseOverride: {value: 0},
    hudMarkingsOpacity: {value: new Vector2(1, 1)},
    hudMarkingsWidth: {value: 1},
    hudMarkingsRoadSpace: {value: new Matrix4()},
    hudMarkingsLanes: {value: new Vector2()},
    hudMarkingsLaneBlend: {value: 0},
    hudMarkingsCrossing: {value: new Vector2()},
    hudMarkingsTurn: {value: new Vector4()},
    hudJunctionPaint: {value: new Vector3(1, 0, 0)},
    ...createHudDisplayUniforms(world)
  };
  const shaderCompilers = new WeakSet();

  function installHighlight(material) {
    const compile = material.onBeforeCompile;
    // New lane materials inherit the lane paint's compiler when the lane count changes.
    if (shaderCompilers.has(compile)) return;
    const cacheKey = material.customProgramCacheKey();
    const yellow = material === world.mat.yellowPaint;
    const crosswalk = material === world.mat.crosswalk;
    const canHighlight = !yellow;
    material.onBeforeCompile = shader => {
      compile.call(material, shader);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'uniform mat4 hudMarkingsRoadSpace;\nvarying vec2 vHudMarkingsPoint;\n' +
        shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vHudMarkingsPoint = (hudMarkingsRoadSpace * modelMatrix * vec4(transformed, 1.0)).xz;`);
      shader.fragmentShader = `
        uniform vec2 hudMarkingsCrossing;
        uniform vec3 hudJunctionPaint;
        varying vec2 vHudMarkingsPoint;
        float hudJunctionAlpha(vec2 point) {
          if (hudJunctionPaint.z > .5 && point.x < 0. &&
              abs(point.y - hudMarkingsCrossing.x) > hudMarkingsCrossing.y) return 0.;
          return point.y < hudJunctionPaint.y ? hudJunctionPaint.x : 1.;
        }
      ` + shader.fragmentShader;
      if (crosswalk) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
          diffuseColor.a *= hudJunctionAlpha(vHudMarkingsPoint);
          #include <alphatest_fragment>`);
        return;
      }
      shader.fragmentShader = `
        uniform float hudMarkingsEnabled, hudMarkingsLaneBlend;
        uniform vec3 hudMarkingsColor;
        uniform vec3 hudMarkingsBase;
        uniform float hudMarkingsBaseOverride, hudMarkingsWidth;
        uniform vec2 hudMarkingsOpacity;
        uniform vec2 hudMarkingsLanes;
        uniform vec4 hudMarkingsTurn;
        ${hudDisplayColorShader}
        float hudLaneEdge(float coord, float center) {
          return 1.0 - smoothstep(.32, .56, abs(abs(coord - center) - ${laneWidth / 2}));
        }
      ` + shader.fragmentShader.replace('vec2 paintA=', `
        vec2 sizes = vPaintSize;
        if (sizes.x < sizes.y) sizes.x *= hudMarkingsWidth;
        else sizes.y *= hudMarkingsWidth;
        vec2 paintA=`).replaceAll('vPaintSize*.5', 'sizes*.5').replace('#include <alphatest_fragment>', `
        vec2 roadPoint = vHudMarkingsPoint;
        float halfWidth = hudMarkingsCrossing.y;
        float crossingZ = hudMarkingsCrossing.x;
        float approach = mix(hudLaneEdge(roadPoint.x, hudMarkingsLanes.x), hudLaneEdge(roadPoint.x, hudMarkingsLanes.y), hudMarkingsLaneBlend);
        if (hudMarkingsTurn.w > 0.0) {
          float turnX = hudMarkingsTurn.x;
          float turnZ = hudMarkingsTurn.y;
          float radius = hudMarkingsTurn.z;
          if (roadPoint.y >= turnZ) {
            approach = hudLaneEdge(roadPoint.x, turnX - radius);
          } else if (roadPoint.x >= turnX) {
            approach = hudLaneEdge(roadPoint.y, turnZ - radius);
          } else {
            // Highlight the inner edge of the turn. The junction geometry
            // leaves the dashed divider absent through this section.
            float innerEdge = radius - ${laneWidth / 2};
            approach = 1.0 - smoothstep(.32, .56, abs(length(roadPoint - vec2(turnX, turnZ)) - innerEdge));
          }
        } else if (halfWidth > 0.0) {
          approach *= step(halfWidth, abs(roadPoint.y - crossingZ));
        }
        float hudTint = ${canHighlight ? 'hudMarkingsEnabled * approach' : '0.0'};
        diffuseColor.a *= mix(hudMarkingsOpacity.x, hudMarkingsOpacity.y, hudTint);
        diffuseColor.a *= hudJunctionAlpha(roadPoint);
        ${yellow ? 'if (hudJunctionPaint.z > .5 && abs(roadPoint.x) < .30) diffuseColor.a = 0.;' : ''}
        #ifdef USE_FOG
          float hudRoadFade = smoothstep(10.5, 17.0, vFogDepth) * (1.0 - smoothstep(36.0, 90.0, vFogDepth));
          diffuseColor.a *= mix(1.0, hudRoadFade, ${canHighlight ? 'hudMarkingsEnabled' : '0.0'});
        #endif
        #include <alphatest_fragment>
      `).replace('#include <premultiplied_alpha_fragment>', `
        if (gl_FragColor.a >= .001) {
          if (hudMarkingsBaseOverride > .5) {
            vec3 displayColor = mix(hudMarkingsBase, hudMarkingsColor, hudTint);
            gl_FragColor.rgb = hudDisplayColor(displayColor, gl_FragColor.a);
          } else if (hudTint > 0.) {
            vec3 displayHighlight = hudDisplayColor(hudMarkingsColor, gl_FragColor.a);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, displayHighlight, hudTint);
          }
        }
        #include <premultiplied_alpha_fragment>`);
    };
    shaderCompilers.add(material.onBeforeCompile);
    material.customProgramCacheKey = () => `${cacheKey}-hud-lane-display-color`;
    material.needsUpdate = true;
  }

  function prepare(layout, style) {
    uniforms.hudMarkingsWidth.value = style.width / 100;
    uniforms.hudDisplayExposure.value = world.renderer.toneMappingExposure;
    uniforms.hudMarkingsBaseOverride.value = style.base ? 1 : 0;
    if (style.base) setHudDisplayColor(uniforms.hudMarkingsBase.value, style.base);
    setHudDisplayColor(uniforms.hudMarkingsColor.value, style.highlight);
    uniforms.hudMarkingsOpacity.value.set(style.baseOpacity / 100, style.highlightOpacity / 100);
    const {centers, index} = roadLaneState(world);
    if (!centers.length) return false;
    const x = world.car.position.x;
    const center = centers[index];
    const neighbor = centers[index + Math.sign(x - center)] ?? center;
    // Both lanes contribute equally as the vehicle crosses the divider.
    const blend = .5 * MathUtils.smoothstep(Math.abs(x - center), laneWidth / 2 - .5, laneWidth / 2);
    const turn = world.roadGuidePath?.rightTurn;
    const junction = world.state.id === '05' && world.junctionDimensions;
    const reveal = junction ? 1 - MathUtils.smoothstep(world.car.position.z - junction.nearCrosswalk, 38, 78) : 1;
    uniforms.hudJunctionPaint.value.set(reveal, junction?.markingEnd ?? 0, junction && world.hudSettings?.junction?.threeLanes ? 1 : 0);
    uniforms.hudMarkingsLanes.value.set(center, neighbor);
    uniforms.hudMarkingsLaneBlend.value = neighbor === center ? 0 : blend;
    uniforms.hudMarkingsCrossing.value.set(layout?.crossingZ ?? 0, (layout?.crossingWidth ?? 0) / 2);
    uniforms.hudMarkingsTurn.value.set(turn ? turn.laneX + turn.radius : 0, turn?.turnZ ?? 0, turn?.radius ?? 0, turn ? 1 : 0);
    installHighlight(world.mat.whitePaint);
    installHighlight(world.mat.yellowPaint);
    installHighlight(world.mat.lanePaint);
    installHighlight(world.mat.crosswalk);
    for (const material of world.laneMaterials.values()) installHighlight(material);
    return true;
  }

  function draw(drawFrame, highlight) {
    // The HUD follow camera can transform the root. Resolve paint coordinates
    // back into the same road space used to find the vehicle's lane.
    world.root.updateMatrix();
    uniforms.hudMarkingsRoadSpace.value.copy(world.root.matrix).invert();
    enabled.value = highlight ? 1 : 0;
    try { return drawFrame(); }
    finally { enabled.value = 0; }
  }

  return {prepare, draw};
}
