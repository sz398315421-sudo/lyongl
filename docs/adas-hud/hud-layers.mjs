function isMarking(object) {
  return object.isMesh && !object.userData.construction && !object.userData.reflectiveSurface &&
    object.geometry.hasAttribute('paintSize');
}

// Filter the final frame without changing the ADAS geometry, animation or reflections.
export function withHudLayers(world, draw, background) {
  if (!world.root) return draw();
  const transparent = world.hudTransparency?.value;
  const settings = world.hudSettings;
  const beamOnly = settings?.preset === 'carpet' && settings.beamOnly;

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
  scene.background = transparent ? null : background;
  if (originalFog) {
    scene.fog = originalFog.clone();
    scene.fog.color.copy(background);
  }

  try {
    if (beamOnly) {
      for (const object of scene.children) {
        if (object !== world.roadGuidance.mesh) hide(object);
      }
      return draw();
    }
    if (world.hudSettings?.ego === false) {
      for (const object of [world.car, world.egoContact, world.tailReflection]) hide(object);
    }
    for (const object of scene.children) {
      if (!object.isLight && !sceneObjects.includes(object)) hide(object);
    }
    for (const object of root.children) {
      if (object.userData.hudJunctionThreeLaneEdge && !settings?.junction?.threeLanes ||
          !object.userData.hudLaneColor && !isMarking(object)) hide(object);
    }
    return draw();
  } finally {
    for (const object of hidden) object.visible = true;
    scene.background = originalBackground;
    scene.fog = originalFog;
  }
}
