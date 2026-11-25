import {MathUtils, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {positionArrowMotion, referenceAspect, sampleArrowMotion} from './ar-arrow-motion.mjs';
import {carpetView, hudCameraPose} from './hud-camera-view.mjs';

const viewScale = Math.tan(MathUtils.degToRad(carpetView.fov / 2));
const spinAxis = new Vector3(0, 0, 1);
const tiltAxis = new Vector3(1, 0, 0);

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
  let motion = offsets ? positionArrowMotion(clip, offsets, camera.aspect) : clip;

  const tiltRotation = new Quaternion();
  const spinRotation = new Quaternion();
  const arrows = clip.tracks.map(() => {
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
  });

  return {
    setView,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (offsets) motion = positionArrowMotion(clip, offsets, camera.aspect);
      renderer.setSize(width, height, false);
    },
    setOffsets(value) {
      offsets = value;
      motion = positionArrowMotion(clip, offsets, camera.aspect);
    },
    draw(elapsed) {
      sampleArrowMotion(motion, elapsed).forEach(({pose: [x, y, depth, heading, tilt], opacity}, index) => {
        const {arrow, materials} = arrows[index];
        arrow.visible = opacity > 0;
        if (!arrow.visible) return;
        const span = 2 * depth * viewScale;
        reference.localToWorld(arrow.position.set((x - .5) * span * referenceAspect, (.5 - y) * span, -depth));
        spinRotation.setFromAxisAngle(spinAxis, MathUtils.degToRad(-heading));
        tiltRotation.setFromAxisAngle(tiltAxis, MathUtils.degToRad(tilt));
        arrow.quaternion.copy(reference.quaternion).multiply(spinRotation).multiply(tiltRotation);
        for (const material of materials) {
          material.opacity = opacity;
          material.transparent = opacity < 1;
        }
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
