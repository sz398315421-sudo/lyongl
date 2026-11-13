import {isBlueRoad} from './hud-right-pass.mjs';

function isMarking(object, world) {
  if (!object.isMesh || object.userData.construction || object.userData.reflectiveSurface) return false;
  if (object.geometry.hasAttribute('paintSize')) return true;
  return !!world.parkingTone && object.material.uniforms?.tone === world.parkingTone &&
    !!object.material.uniforms.study;
}

// Filter the final frame without changing the ADAS geometry, animation or reflections.
export function withHudLayers(world, draw, background) {
  if (!world.root) return draw();
  const transparent = world.hudTransparency?.value;
  const carpet = world.hudSettings?.carpet && isBlueRoad(world);
  const minimal = carpet || transparent || !document.documentElement.hasAttribute('data-hud-environment');

  const {scene, root} = world;
  const sceneObjects = [world.car, root, world.roadGuidance.mesh, world.traffic?.group, world.hudPresetTraffic];
  const hidden = [];
  const hide = object => {
    if (!object.visible) return;
    object.visible = false;
    hidden.push(object);
  };

  const originalBackground = scene.background;
  const originalFog = scene.fog;
  if (minimal && background) {
    scene.background = transparent ? null : background;
    if (originalFog) {
      scene.fog = originalFog.clone();
      scene.fog.color.copy(background);
    }
  }

  try {
    if (carpet) {
      for (const object of scene.children) {
        if (object !== world.roadGuidance.mesh) hide(object);
      }
      return draw();
    }
    if (world.hudRightPass && world.traffic?.group) hide(world.traffic.group);
    if (world.hudSettings?.ego === false) {
      for (const object of [world.car, world.egoContact, world.tailReflection]) hide(object);
    }
    if (minimal) {
      for (const object of scene.children) {
        if (!object.isLight && !sceneObjects.includes(object)) hide(object);
      }
      for (const object of root.children) {
        if (object !== world.parkedVehicleGroup && object.name !== 'Automatic parking guidance' && !object.userData.hudLaneColor && !isMarking(object, world)) hide(object);
      }
    }
    return draw();
  } finally {
    for (const object of hidden) object.visible = true;
    scene.background = originalBackground;
    scene.fog = originalFog;
  }
}
