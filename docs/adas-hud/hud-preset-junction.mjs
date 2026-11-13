import {Box3, Group} from 'three';

// Reuse the ADAS intersection geometry on the preset route, keeping the live
// scene root and its controls intact for playback, seeking and export.
export function createHudPresetJunction(world) {
  const bounds = new Box3();
  let crossing;

  function build(turn) {
    if (crossing) world.disposeSceneRoot(crossing.group);
    const group = new Group();
    const {root, junctionDimensions, mat, vegetation} = world;
    const edge = turn.width / 2 + 1.6;
    const overlapsCrossing = object => {
      bounds.setFromObject(object);
      return bounds.min.z < turn.centerZ + edge && bounds.max.z > turn.centerZ - edge;
    };
    const replaced = [...root.children, ...vegetation.children].filter(object =>
      [mat.road, mat.curb, mat.pavement].includes(object.material) ||
      object.geometry?.hasAttribute('paintSize') ||
      (object.userData.environmentKey && overlapsCrossing(object))
    );
    world.root = group;
    try {
      world.junction('05', turn.width, {centerZ: turn.centerZ, oneWay: world.state.laneCount === 3});
      group.updateMatrixWorld(true);
      world.batchRoadMarkings();
      crossing = {turn, group, root, objects: [...group.children], replaced};
    } finally {
      world.root = root;
      world.junctionDimensions = junctionDimensions;
    }
  }

  return function drawJunction(draw) {
    const turn = world.roadGuidePath?.rightTurn;
    if (!turn) {
      if (crossing) {
        world.disposeSceneRoot(crossing.group);
        crossing = null;
      }
      return draw();
    }
    const {root} = world;
    if (crossing?.turn !== turn || crossing?.root !== root) build(turn);

    const visible = crossing.replaced.filter(object => object.visible);
    for (const object of visible) object.visible = false;
    root.add(...crossing.objects);
    try { return draw(); }
    finally {
      crossing.group.add(...crossing.objects);
      for (const object of visible) object.visible = true;
    }
  };
}
