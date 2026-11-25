import {BufferGeometry, Float32BufferAttribute, Group, MathUtils, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {positionArrowMotion, referenceAspect, sampleArrowMotion} from './ar-arrow-motion.mjs';
import {carpetView, hudCameraPose} from './hud-camera-view.mjs';
import {uTurnAnchor, uTurnCueDistances, uTurnGuideFrame, uTurnLength, uTurnPoint, uTurnSurfaceY} from './ar-arrow-u-turn.mjs';

const viewScale = Math.tan(MathUtils.degToRad(carpetView.fov / 2));
const spinAxis = new Vector3(0, 0, 1);
const tiltAxis = new Vector3(1, 0, 0);

function createUTurnGuide(scene, reference, addArrow, setOpacity) {
  const group = new Group();
  scene.add(group);
  const instances = uTurnCueDistances.map(() => addArrow(group));
  const positions = [];
  const indices = [];
  const divisions = 72;
  for (let i = 0; i <= divisions; i++) {
    const distance = i / divisions * uTurnLength;
    const {x, z, dx, dz} = uTurnPoint(distance);
    const width = .30 * Math.min(1, distance / 1.3, (uTurnLength - distance) / 1.3);
    positions.push(x - dz * width, uTurnSurfaceY, z + dx * width,
                   x + dz * width, uTurnSurfaceY, z - dx * width);
    if (i < divisions) {
      const edge = 2 * i;
      indices.push(edge, edge + 2, edge + 1, edge + 1, edge + 2, edge + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const material = new MeshBasicMaterial({color: 0x198be8, transparent: true, depthWrite: false});
  group.add(new Mesh(geometry, material));

  const anchor = new Vector3(uTurnAnchor.x, uTurnSurfaceY, uTurnAnchor.z);
  const projected = reference.worldToLocal(anchor.clone());
  const depth = -projected.z;
  const inverseView = reference.quaternion.clone().invert();
  const cameraPoint = new Vector3();
  const cameraTangent = new Vector3();
  const spin = new Quaternion();
  const tilt = new Quaternion().setFromAxisAngle(tiltAxis, MathUtils.degToRad(26));
  return {
    place([x = 0, y = 0, z = 0] = [], aspect) {
      const nextDepth = depth + z;
      const span = 2 * viewScale * nextDepth;
      group.position.set(projected.x * nextDepth / depth + x / 100 * span * aspect,
                         projected.y * nextDepth / depth - y / 100 * span, -nextDepth);
      reference.localToWorld(group.position).sub(anchor);
    },
    draw(elapsed) {
      const {opacity, advance} = uTurnGuideFrame(elapsed);
      group.visible = opacity > 0;
      if (!group.visible) return;
      material.opacity = .48 * opacity;
      instances.forEach((instance, index) => {
        const {x, z, dx, dz} = uTurnPoint(uTurnCueDistances[index] + advance);
        instance.arrow.position.set(x, uTurnSurfaceY + .045, z);
        // Aim at the projected road tangent and tilt the 3D face enough to
        // stay legible from the low HUD view.
        reference.worldToLocal(cameraPoint.copy(instance.arrow.position).add(group.position));
        cameraTangent.set(dx, 0, dz).applyQuaternion(inverseView);
        const tangentX = cameraTangent.x * -cameraPoint.z + cameraPoint.x * cameraTangent.z;
        const tangentY = cameraTangent.y * -cameraPoint.z + cameraPoint.y * cameraTangent.z;
        spin.setFromAxisAngle(spinAxis, -Math.atan2(tangentX, tangentY));
        instance.arrow.quaternion.copy(reference.quaternion).multiply(spin).multiply(tilt);
        instance.arrow.scale.setScalar(.79);
        setOpacity(instance, opacity);
      });
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}

export async function loadArArrow() {
  const url = new URL('./assets/ar-arrow/arrow.glb?v=2', import.meta.url);
  const {scene} = await new GLTFLoader().loadAsync(url.href);
  return scene;
}

export function createArArrowScene(canvas, model, clip, {transparent = false, offsets, view = carpetView} = {}) {
  const renderer = new WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setClearColor(0x000000, transparent ? 0 : 1);

  const scene = new Scene();
  // Author arrow placement once in the light-carpet view. An adjustable
  // camera observes those same world-space poses from a different angle.
  const reference = new PerspectiveCamera(carpetView.fov, referenceAspect, .1, 150);
  const {position, target} = hudCameraPose(carpetView);
  reference.position.set(...position);
  reference.lookAt(...target);
  reference.updateMatrixWorld(true);
  const camera = reference.clone();
  function setView(nextView) {
    const pose = hudCameraPose(nextView);
    camera.position.set(...pose.position);
    camera.lookAt(...pose.target);
    camera.fov = nextView.fov;
    camera.updateProjectionMatrix();
  }
  setView(view);
  let motion;
  const tiltRotation = new Quaternion();
  const spinRotation = new Quaternion();
  const instances = [];
  const addArrow = parent => {
    const arrow = model.clone(true);
    const materials = [];
    arrow.traverse(object => {
      if (!object.isMesh) return;
      const clone = material => {
        const copy = material.clone();
        materials.push(copy);
        return copy;
      };
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    });
    parent.add(arrow);
    const instance = {arrow, materials};
    instances.push(instance);
    return instance;
  };
  function setOpacity({arrow, materials}, opacity) {
    arrow.visible = opacity > 0;
    if (!arrow.visible) return;
    for (const material of materials) {
      material.opacity = opacity;
      material.transparent = opacity < 1;
    }
  }

  const arrows = clip.tracks.map(() => addArrow(scene));
  const guide = clip.roadGuide === 'u-turn' ? createUTurnGuide(scene, reference, addArrow, setOpacity) : null;
  function updateMotion() {
    motion = offsets ? positionArrowMotion(clip, offsets, camera.aspect) : clip;
    guide?.place(offsets?.far, camera.aspect);
  }
  updateMotion();

  return {
    setView,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      updateMotion();
      renderer.setSize(width, height, false);
    },
    setOffsets(value) {
      offsets = value;
      updateMotion();
    },
    draw(elapsed) {
      sampleArrowMotion(motion, elapsed).forEach(({pose: [x, y, depth, heading, tilt], opacity}, index) => {
        const instance = arrows[index];
        const {arrow} = instance;
        setOpacity(instance, opacity);
        if (!arrow.visible) return;
        const span = 2 * depth * viewScale;
        reference.localToWorld(arrow.position.set((x - .5) * span * referenceAspect, (.5 - y) * span, -depth));
        spinRotation.setFromAxisAngle(spinAxis, MathUtils.degToRad(-heading));
        tiltRotation.setFromAxisAngle(tiltAxis, MathUtils.degToRad(tilt));
        arrow.quaternion.copy(reference.quaternion).multiply(spinRotation).multiply(tiltRotation);
      });
      guide?.draw(elapsed);
      renderer.render(scene, camera);
    },
    dispose() {
      for (const {materials} of instances) materials.forEach(material => material.dispose());
      guide?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
