import {Color, Matrix4, Vector2, MathUtils} from 'three';
import {laneWidth, roadLaneState} from '../adas/road-assist.js';
import {blueRoadColor} from './hud-blue-road.mjs';

export function createBlueRoadMarkings(world) {
  const enabled = {value: 0};
  const uniforms = {
    hudMarkingsEnabled: enabled,
    hudMarkingsColor: {value: new Color(blueRoadColor)},
    hudMarkingsRoadSpace: {value: new Matrix4()},
    hudMarkingsLanes: {value: new Vector2()},
    hudMarkingsLaneBlend: {value: 0},
    hudMarkingsCrossing: {value: new Vector2()},
    hudMarkingsTurnBlend: {value: 0}
  };
  const shaderMaterials = new WeakSet();

  function installHighlight(material) {
    if (shaderMaterials.has(material)) return;
    shaderMaterials.add(material);
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey();
    material.onBeforeCompile = shader => {
      compile.call(material, shader);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'uniform mat4 hudMarkingsRoadSpace;\nvarying vec2 vHudMarkingsPoint;\n' +
        shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vHudMarkingsPoint = (hudMarkingsRoadSpace * modelMatrix * vec4(transformed, 1.0)).xz;`);
      shader.fragmentShader = `
        uniform float hudMarkingsEnabled, hudMarkingsLaneBlend, hudMarkingsTurnBlend;
        uniform vec3 hudMarkingsColor;
        uniform vec2 hudMarkingsLanes, hudMarkingsCrossing;
        varying vec2 vHudMarkingsPoint;
        float hudLaneEdge(float coord, float center) {
          return 1.0 - smoothstep(.32, .56, abs(abs(coord - center) - ${laneWidth / 2}));
        }
      ` + shader.fragmentShader.replace('#include <alphatest_fragment>', `
        vec2 roadPoint = vHudMarkingsPoint;
        float halfWidth = hudMarkingsCrossing.y;
        float crossingZ = hudMarkingsCrossing.x;
        float approach = mix(hudLaneEdge(roadPoint.x, hudMarkingsLanes.x), hudLaneEdge(roadPoint.x, hudMarkingsLanes.y), hudMarkingsLaneBlend);
        float exitLane = 0.0;
        if (halfWidth > 0.0) {
          approach *= step(halfWidth, abs(roadPoint.y - crossingZ));
        }
        if (hudMarkingsTurnBlend > 0.0) {
          exitLane = step(halfWidth, roadPoint.x) * hudLaneEdge(roadPoint.y, crossingZ + halfWidth - ${laneWidth / 2});
        }
        float hudTint = hudMarkingsEnabled * mix(approach, exitLane, hudMarkingsTurnBlend);
        diffuseColor.rgb = mix(diffuseColor.rgb, hudMarkingsColor, hudTint);
        #ifdef USE_FOG
          float hudRoadFade = smoothstep(10.5, 17.0, vFogDepth) * (1.0 - smoothstep(36.0, 90.0, vFogDepth));
          diffuseColor.a *= mix(1.0, hudRoadFade, hudMarkingsEnabled);
        #endif
        #include <alphatest_fragment>
      `).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = mix(totalEmissiveRadiance, hudMarkingsColor * .45, hudTint);`);
    };
    material.customProgramCacheKey = () => `${cacheKey}-hud-lane-highlight`;
    material.needsUpdate = true;
  }

  function prepare(layout) {
    const {centers, index} = roadLaneState(world);
    if (!centers.length) return false;
    const x = world.car.position.x;
    const center = centers[index];
    const neighbor = centers[index + Math.sign(x - center)] ?? center;
    // Both lanes contribute equally as the vehicle crosses the divider.
    const blend = .5 * MathUtils.smoothstep(Math.abs(x - center), laneWidth / 2 - .5, laneWidth / 2);
    const turn = world.roadGuidePath?.rightTurn;
    uniforms.hudMarkingsLanes.value.set(center, neighbor);
    uniforms.hudMarkingsLaneBlend.value = neighbor === center ? 0 : blend;
    uniforms.hudMarkingsCrossing.value.set(layout?.crossingZ ?? 0, (layout?.crossingWidth ?? 0) / 2);
    uniforms.hudMarkingsTurnBlend.value = turn ? MathUtils.smoothstep(
      turn.turnZ - world.car.position.z, 0, turn.turnZ - (turn.centerZ + (turn.width - laneWidth) / 2)
    ) : 0;
    installHighlight(world.mat.whitePaint);
    installHighlight(world.mat.lanePaint);
    for (const material of world.laneMaterials.values()) installHighlight(material);
    return true;
  }

  function draw(drawFrame) {
    // The HUD follow camera can transform the root. Resolve paint coordinates
    // back into the same road space used to find the vehicle's lane.
    world.root.updateMatrix();
    uniforms.hudMarkingsRoadSpace.value.copy(world.root.matrix).invert();
    enabled.value = 1;
    try { return drawFrame(); }
    finally { enabled.value = 0; }
  }

  return {prepare, draw};
}
