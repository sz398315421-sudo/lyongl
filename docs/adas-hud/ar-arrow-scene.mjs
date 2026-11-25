import {MathUtils, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {positionArrowMotion, referenceAspect, sampleArrowMotion} from './ar-arrow-motion.mjs';
import {carpetView, hudCameraPose} from './hud-camera-view.mjs';

const viewScale = Math.tan(MathUtils.degToRad(carpetView.fov / 2));
const spinAxis = new Vector3(0, 0, 1);
const tiltAxis = new Vector3(1, 0, 0);

function playReferenceMotion(data, arrows, reference, placeArrow, setOpacity) {
  const {frames, fps, farAnchor} = data;
  const nextRotation = new Quaternion();
  const refRotation = new Quaternion();
  // Match the Blender mesh axes and keep the replacement fold readable.
  const modelBasis = new Quaternion().setFromAxisAngle(tiltAxis, MathUtils.degToRad(98));
  const zero = [0, 0, 0];
  const {lerp, smoothstep} = MathUtils;
  return (elapsed, {start = zero, far = zero} = {}, aspect) => {
    const step = Math.min(frames.length - 1, elapsed * fps / 1000);
    const frame = Math.floor(step);
    const current = frames[frame];
    const next = frames[Math.min(frame + 1, frames.length - 1)];
    const part = step - frame;
    const turn = smoothstep(elapsed, 600, 2800) * (1 - smoothstep(elapsed, 5700, 7980));
    const offsetX = lerp(start[0], far[0], turn) / 100 * aspect / referenceAspect;
    const offsetY = lerp(start[1], far[1], turn) / 100;
    const offsetDepth = lerp(start[2] ?? 0, far[2] ?? 0, turn);
    const anchorX = lerp(.497, farAnchor[0], turn);
    const anchorY = lerp(.520, farAnchor[1], turn);
    arrows.forEach((instance, index) => {
      const a = current[index];
      const b = next[index];
      const scale = lerp(a[7], b[7], part);
      const {arrow} = instance;
      setOpacity(instance, MathUtils.clamp(scale, 0, 1));
      if (!arrow.visible) return;
      const x = lerp(a[0], b[0], part);
      const y = lerp(a[1], b[1], part);
      const depth = lerp(a[2], b[2], part) + offsetDepth;
      const squeeze = offsetDepth / depth;
      placeArrow(arrow, x + (anchorX - x) * squeeze + offsetX, y + (anchorY - y) * squeeze + offsetY, depth);
      refRotation.fromArray(a, 3).slerp(nextRotation.fromArray(b, 3), part);
      arrow.quaternion.copy(reference.quaternion).multiply(refRotation).multiply(modelBasis);
      arrow.scale.setScalar(.68 * scale);
    });
  };
}

export async function loadArArrow() {
  const url = new URL('./assets/ar-arrow/arrow.glb?v=2', import.meta.url);
  const {scene} = await new GLTFLoader().loadAsync(url.href);
  return scene;
}

export async function loadArArrowMotion() {
  const url = new URL('./assets/ar-arrow/u-turn-motion.json?v=1', import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw Error('无法加载掉头动画。');
  return response.json();
}

export function createArArrowScene(canvas, model, clip, {transparent = false, offsets, view = carpetView, referenceMotion} = {}) {
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
  function addArrow() {
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
    scene.add(arrow);
    return {arrow, materials};
  }
  function setOpacity({arrow, materials}, opacity) {
    arrow.visible = opacity > 0;
    if (!arrow.visible) return;
    for (const material of materials) {
      material.opacity = opacity;
      material.transparent = opacity < 1;
    }
  }

  function placeArrow(arrow, x, y, depth) {
    const span = 2 * depth * viewScale;
    reference.localToWorld(arrow.position.set((x - .5) * span * referenceAspect, (.5 - y) * span, -depth));
  }
  const arrows = (referenceMotion?.frames[0] ?? clip.tracks).map(addArrow);
  const playback = referenceMotion ? playReferenceMotion(referenceMotion, arrows, reference, placeArrow, setOpacity) : null;
  function updateMotion() {
    if (!playback) motion = offsets ? positionArrowMotion(clip, offsets, camera.aspect) : clip;
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
      if (playback) playback(elapsed, offsets, camera.aspect);
      else sampleArrowMotion(motion, elapsed).forEach(({pose: [x, y, depth, heading, tilt], opacity}, index) => {
        const instance = arrows[index];
        const {arrow} = instance;
        setOpacity(instance, opacity);
        if (!arrow.visible) return;
        placeArrow(arrow, x, y, depth);
        spinRotation.setFromAxisAngle(spinAxis, MathUtils.degToRad(-heading));
        tiltRotation.setFromAxisAngle(tiltAxis, MathUtils.degToRad(tilt));
        arrow.quaternion.copy(reference.quaternion).multiply(spinRotation).multiply(tiltRotation);
      });
      renderer.render(scene, camera);
    },
    dispose() {
      for (const {materials} of arrows) materials.forEach(material => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}
