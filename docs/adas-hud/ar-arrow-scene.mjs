import {MathUtils, PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {sampleArrowMotion} from './ar-arrow-motion.mjs';
import {carpetView, hudCameraPose} from './hud-camera-view.mjs';

const referenceAspect = 16 / 9;
const viewScale = Math.tan(MathUtils.degToRad(carpetView.fov / 2));
const spinAxis = new Vector3(0, 0, 1);
const tiltAxis = new Vector3(1, 0, 0);

export async function loadArArrow() {
  const url = new URL('./assets/ar-arrow/arrow.glb', import.meta.url);
  const {scene} = await new GLTFLoader().loadAsync(url.href);
  return scene;
}

export function createArArrowScene(canvas, model, clip, {transparent = false} = {}) {
  const renderer = new WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setClearColor(0x000000, transparent ? 0 : 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(carpetView.fov, referenceAspect, .1, 150);
  const {position, target} = hudCameraPose(carpetView);
  camera.position.set(...position);
  camera.lookAt(...target);
  camera.updateMatrixWorld(true);

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
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    },
    draw(elapsed) {
      sampleArrowMotion(clip, elapsed).forEach(({pose: [x, y, depth, heading, tilt], opacity}, index) => {
        const {arrow, materials} = arrows[index];
        arrow.visible = opacity > 0;
        if (!arrow.visible) return;
        const span = 2 * depth * viewScale;
        camera.localToWorld(arrow.position.set((x - .5) * span * referenceAspect, (.5 - y) * span, -depth));
        spinRotation.setFromAxisAngle(spinAxis, MathUtils.degToRad(-heading));
        tiltRotation.setFromAxisAngle(tiltAxis, MathUtils.degToRad(tilt));
        arrow.quaternion.copy(camera.quaternion).multiply(spinRotation).multiply(tiltRotation);
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
