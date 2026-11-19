// The driving simulation reports angular rates for its 0.42 m reference wheels.
// Convert through linear tread speed before applying the displayed wheel radius.
const referenceRadius = 0.42;

function wheelSlot(x, z) {
  const axle = z > 0.5 ? 0 : z < -0.5 ? 2 : 1;
  return (x > 0 ? 0 : 3) + axle;
}

// Wheels_objs contains three indexed material primitives, each spanning all
// six wheels. The six local-space vertex clusters are separated by open gaps.
function splitPrimitive(T, mesh, slots) {
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const indicesByWheel = Array.from({ length: 6 }, () => []);
  for (let i = 0; i < geometry.index.count; i++) {
    const vertex = geometry.index.getX(i);
    const slot = wheelSlot(positions.getX(vertex), positions.getZ(vertex));
    indicesByWheel[slot].push(vertex);
  }
  for (const [slot, indices] of indicesByWheel.entries()) {
    if (!indices.length) continue;
    const vertices = [...new Set(indices)];
    const remap = new Map(vertices.map((vertex, index) => [vertex, index]));
    const part = new T.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      // GLTFLoader may interleave attributes. Read components through its API,
      // including normalized UVs and normals, and store their decoded values.
      const values = new Float32Array(vertices.length * attribute.itemSize);
      for (const [i, vertex] of vertices.entries()) {
        for (let k = 0; k < attribute.itemSize; k++) {
          values[i * attribute.itemSize + k] = attribute.getComponent(vertex, k);
        }
      }
      part.setAttribute(name, new T.BufferAttribute(values, attribute.itemSize));
    }
    part.setIndex(indices.map(vertex => remap.get(vertex)));
    part.computeBoundingBox();
    slots[slot].box.union(part.boundingBox);
    slots[slot].spin.add(new T.Mesh(part, mesh.material));
  }
}

function roverWheels(T, scene, scale) {
  const assembly = scene.getObjectByName('Wheels_objs');
  if (!assembly) return [];
  const meshes = assembly.children.filter(child => child.isMesh);
  if (!meshes.length || meshes.some(mesh => !mesh.geometry.index)) return [];
  const slots = Array.from({ length: 6 }, (_, index) => ({
    index, yaw: new T.Group(), spin: new T.Group(), box: new T.Box3(), sign: 1, steers: true
  }));
  for (const mesh of meshes) {
    splitPrimitive(T, mesh, slots);
    mesh.removeFromParent();
    mesh.geometry.dispose();
  }
  for (const wheel of slots) {
    const { yaw, spin, box } = wheel;
    yaw.name = 'WheelHub_' + wheel.index;
    box.getCenter(yaw.position);
    wheel.radius = (box.max.y - box.min.y) * scale / 2;
    for (const mesh of spin.children) mesh.position.copy(yaw.position).negate();
    assembly.add(yaw);
    yaw.add(spin);
  }
  return slots;
}

function ferrariWheels(T, scene, scale) {
  const wheels = [];
  for (const [name, index] of [['fl', 0], ['fr', 3], ['rl', 2], ['rr', 5]]) {
    const spin = scene.getObjectByName('wheel_' + name);
    if (!spin) continue;
    const box = new T.Box3().setFromObject(spin, true);
    // setFromObject includes all ancestor transforms, including the model scale.
    const worldScale = spin.getWorldScale(new T.Vector3()).y;
    const radius = (box.max.y - box.min.y) * scale / (2 * worldScale);
    const yaw = new T.Group();
    yaw.name = 'WheelHub_' + index;
    yaw.position.copy(spin.position);
    spin.parent.add(yaw);
    spin.position.set(0, 0, 0);
    yaw.add(spin);
    wheels.push({ index, yaw, spin, radius, sign: -1, steers: name.startsWith('f') });
  }
  return wheels;
}

export function createVehicleRig(T, scene, animations, kind, scale) {
  const rover = kind === 'perseverance';
  const wheels = rover ? roverWheels(T, scene, scale) :
    kind === 'ferrari' ? ferrariWheels(T, scene, scale) : [];
  const steeringWheel = kind === 'ferrari' && scene.getObjectByName('steering_wheel');
  const steeringRest = steeringWheel && steeringWheel.quaternion.clone();
  const armClips = rover ? animations.filter(clip =>
    /^(arm(?:\.00[234])?Action|turret_objAction|turret_cam_cover_01|turret\.001Action\.001|hingeAction)$/.test(clip.name)
  ) : [];
  const mixer = armClips.length && new T.AnimationMixer(scene);
  const actions = armClips.map(clip => {
    const action = mixer.clipAction(clip);
    action.setLoop(T.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    action.paused = true;
    return action;
  });
  const armDuration = Math.max(0, ...armClips.map(clip => clip.duration));
  return {
    hasArm: armDuration > 0,
    armDuration,
    setArm(progress) {
      if (!mixer) return;
      const time = Math.min(1, Math.max(0, progress)) * armDuration;
      for (const action of actions) action.time = Math.min(time, action.getClip().duration);
      mixer.update(0);
    },
    update(dt, drive) {
      for (const { index, yaw, spin, sign, radius, steers } of wheels) {
        if (steers) yaw.rotation.y = -drive.steer[index];
        spin.rotateX(sign * drive.wheelRate[index] * dt * referenceRadius / radius);
      }
      if (steeringWheel) {
        steeringWheel.quaternion.copy(steeringRest);
        steeringWheel.rotateY((drive.steer[0] + drive.steer[3]) * 3);
      }
    },
    dispose() {
      if (mixer) {
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
      }
    }
  };
}
