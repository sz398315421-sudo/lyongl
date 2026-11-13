import {Matrix4, Quaternion, Vector3, MathUtils} from 'three';

export function createHudCamera(world, settings) {
  const {camera} = world;
  const {degToRad} = MathUtils;
  const renderedPosition = new Vector3();
  const renderedAim = new Vector3();
  const inverse = new Quaternion();
  const rotation = new Quaternion();
  const translation = new Vector3();
  const transform = new Matrix4();
  const untransform = new Matrix4();
  const reflection = new Matrix4();
  const waterReflection = new Matrix4();
  let anchor;

  function lock(pose) {
    const car = world.car;
    anchor = {
      root: world.root, car: car.position.clone(), heading: car.quaternion.clone(),
      position: (pose?.position ?? camera.position).clone(), orientation: (pose?.quaternion ?? camera.quaternion).clone(),
      aim: (pose?.aim ?? world.cameraAim).clone(), offset: [pose?.offset.x ?? camera.view?.offsetX ?? 0, pose?.offset.y ?? camera.view?.offsetY ?? 0],
      width: world.frameWidth
    };
    if (pose) {
      anchor.car.copy(pose.carPosition);
      anchor.heading.copy(pose.carQuaternion);
    }
  }

  function customView() {
    const {yaw, pitch, distance, fov, ahead} = settings.view;
    const h = degToRad(pitch), a = degToRad(yaw), radius = distance * Math.cos(h);
    const heading = anchor?.heading ?? (settings.preset === 'carpet' && world.roadGuidePath?.kind === 'hud-right-pass' ? world.hudPlayback?.basePose?.carQuaternion : null) ?? world.car.quaternion;
    const car = anchor?.car ?? world.car.position;
    renderedAim.set(0, .85, -ahead).applyQuaternion(heading).add(car);
    renderedPosition.set(radius * Math.sin(a), distance * Math.sin(h) + .85, radius * Math.cos(a)).applyQuaternion(heading).add(car);
    camera.position.copy(renderedPosition);
    camera.lookAt(renderedAim);
    camera.fov = fov;
    camera.clearViewOffset();
  }

  function withView(draw) {
    if (!world.root || !anchor && !settings.customCamera) return draw();
    const savedPosition = camera.position.clone(), savedOrientation = camera.quaternion.clone();
    const savedFov = camera.fov, savedView = camera.view ? {...camera.view} : null;
    const savedAim = world.cameraAim.clone();
    const transformed = [];

    try {
      if (anchor) {
        const car = world.car;
        inverse.copy(car.quaternion).invert();
        if (settings.preset === 'carpet' && world.roadGuidePath?.kind === 'hud-right-pass') rotation.identity();
        else rotation.copy(anchor.heading).multiply(inverse);
        translation.copy(car.position).applyQuaternion(rotation).negate().add(anchor.car);
        transform.makeRotationFromQuaternion(rotation).setPosition(translation);
        untransform.copy(transform).invert();

        for (const object of [world.root, car, world.roadGuidance.mesh, world.traffic?.group, world.hudPresetTraffic, world.egoContact, world.tailReflection, world.sun, world.sun.target, world.fill]) {
          if (!object) continue;
          transformed.push([object, object.position.clone(), object.quaternion.clone()]);
          object.position.applyMatrix4(transform);
          object.quaternion.premultiply(rotation);
        }

        // Keep the reflection coordinates in the source road frame.
        reflection.copy(world.reflectionMatrix.value);
        waterReflection.copy(world.waterReflectionMatrix.value);
        world.reflectionMatrix.value.multiply(untransform);
        world.waterReflectionMatrix.value.multiply(untransform);

        camera.position.copy(anchor.position);
        camera.quaternion.copy(anchor.orientation);
        renderedAim.copy(anchor.aim);
        camera.setViewOffset(world.frameWidth, world.frameHeight, anchor.offset[0] * world.frameWidth / anchor.width, anchor.offset[1], world.frameWidth, world.frameHeight);
      } else {
        renderedAim.copy(savedAim);
      }

      if (settings.customCamera) customView();
      world.cameraAim.copy(renderedAim);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return draw();
    } finally {
      for (const [object, position, quaternion] of transformed) {
        object.position.copy(position);
        object.quaternion.copy(quaternion);
        object.updateMatrixWorld(true);
      }
      if (anchor) {
        world.reflectionMatrix.value.copy(reflection);
        world.waterReflectionMatrix.value.copy(waterReflection);
      }
      world.cameraAim.copy(savedAim);
      camera.position.copy(savedPosition);
      camera.quaternion.copy(savedOrientation);
      camera.fov = savedFov;
      camera.view = savedView;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
    }
  }

  return {
    withView,
    sync(followPlayback, origin) {
      if (!settings.follow || !followPlayback) anchor = null;
      else if (world.root && anchor?.root !== world.root) lock(origin);
    },
    reset() { anchor = null; }
  };
}
