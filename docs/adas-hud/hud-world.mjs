import {Color, Group} from 'three';
import {World as AdasWorld} from '../adas/world.js';
import {withHudLayers} from './hud-layers.mjs';
import {createHudControls} from './hud-controls.mjs';
import {createHudCamera} from './hud-camera.mjs';
import {createLaneColors, hudLaneLayout} from './hud-lane-colors.mjs';
import {vehicleFrame} from '../adas/framing.js';
import {guidanceSceneIds} from '../adas/road-assist.js';
import {startLayout} from './hud-start.mjs';
import {prepareTransparentOutput} from './hud-export.mjs';
import {installHudGuideGradient} from './hud-guide-gradient.mjs';
import {blueRoadPreset, carpetPreset, createBlueRoadTraffic, waveguideView} from './hud-blue-road.mjs';
import {createBlueRoadMarkings} from './hud-blue-markings.mjs';
import {createHudPresetJunction} from './hud-preset-junction.mjs';
import {isBlueRoad} from './hud-right-pass.mjs';

const background = new Color(0x000000);

export const World = {
  async create(canvas, car, options) {
    const world = await AdasWorld.create(canvas, car, {...options, alpha: true});
    world.hudTransparency = prepareTransparentOutput(world);
    const updateGuideGradient = installHudGuideGradient(world);
    const controls = createHudControls((key, value) => {
      if (!world.state || world.suspended) return;
      if (key === 'presetCamera') {
        const preset = controls.settings.preset === 'carpet' ? carpetPreset : blueRoadPreset;
        controls.usePresetCamera(value === 'waveguide' ? waveguideView : preset.view);
      }
      if (key === 'start') {
        world.hudPlayback.reset({render: false});
        world.finishLayoutTransition();
        world.finishCameraMotion();
        camera.reset();
        junctionLock = null;
        world.vehicleNeedsFraming = true;
        world.hudRefreshStart();
        return;
      }
      if (key === 'ego') world.renderer.shadowMap.needsUpdate = true;
      if (key === 'colors' || key === 'ego' && controls.settings.ego) controls.showSceneLayers();
      if (key === 'follow' || key === 'presetCamera') camera.reset();
      world.renderFrame();
    }, () => world.hudSaveScene?.());
    world.hudSettings = controls.settings;
    world.hudApplyPreset = key => {
      if (key === controls.settings.preset) return null;
      const preset = key === 'carpet' ? carpetPreset : blueRoadPreset;
      controls.applyRoadPreset(key, preset.guide);
      camera.reset();
      return preset.color;
    };
    world.hudSyncLaneDemo = (scene, snapshot) => controls.syncLaneDemo({...snapshot, scene}, world.state?.roadworks);
    const camera = createHudCamera(world, controls.settings);
    world.hudCamera = camera;
    const drawLanes = createLaneColors(world);
    const blueMarkings = createBlueRoadMarkings(world);
    const drawJunction = createHudPresetJunction(world);
    const renderFrame = world.renderFrame.bind(world);
    world.renderFrame = (...frame) => drawJunction(() => renderFrame(...frame));
    const render = world.composer.render.bind(world.composer);
    let junctionLock;
    const traffic = new Group();
    traffic.visible = false;
    world.hudPresetTraffic = traffic;
    world.scene.add(traffic);
    world.composer.render = (...frame) => {
      const supportsGuidance = guidanceSceneIds.includes(world.state.id);
      const blueRoad = controls.settings.preset === 'blueRoad';
      traffic.visible = blueRoad && isBlueRoad(world) && !world.roadGuidePath?.rightTurn && !world.traffic?.settings.enabled;
      if (traffic.visible) {
        if (!traffic.children.length) traffic.add(createBlueRoadTraffic());
        const origin = world.hudPlayback?.basePose?.carPosition ?? world.car.position;
        traffic.position.set(0, 0, origin.z);
      }
      const layout = hudLaneLayout(world);
      controls.syncLanes(layout);
      controls.syncStart(startLayout(world.state.id, world.state.laneCount));
      controls.syncGuide(supportsGuidance);
      const playback = world.hudPlayback;
      const status = playback?.status;
      const approach = world.cameraMotion?.isJunctionApproach && world.cameraMotion;
      if (!controls.settings.follow || junctionLock?.root !== world.root || junctionLock?.lane !== world.state.junctionLane) junctionLock = null;
      if (approach && controls.settings.follow) {
        if (junctionLock?.motion !== approach) {
          junctionLock = {motion: approach, root: world.root, lane: world.state.junctionLane};
          camera.reset();
        }
      } else if (junctionLock && !world.car.position.equals(junctionLock.motion.to.carPosition)) {
        junctionLock = null;
      }
      camera.sync(['playing', 'paused', 'finished'].includes(status) || !!junctionLock, junctionLock ? null : playback?.basePose);
      const styleMarkings = supportsGuidance && blueMarkings.prepare(layout, controls.settings.marking);
      const draw = () => camera.withView(() => withHudLayers(world, () => {
        updateGuideGradient(controls.settings.guide, controls.settings.preset);
        if (world.vehicleDetail.enabled) {
          const frame = controls.settings.customCamera || controls.settings.follow ? vehicleFrame(world.car, world.camera) : world.framing.vehicleFrame;
          world.vehicleDetail.setVehicleFrame(frame, world.car.visible);
        }
        return styleMarkings ? blueMarkings.draw(() => render(...frame), blueRoad) : render(...frame);
      }, background));
      return drawLanes(layout, controls.settings.colors, controls.settings.laneOpacity, draw);
    };

    const shadowRender = world.renderer.shadowMap.render.bind(world.renderer.shadowMap);
    world.renderer.shadowMap.render = (...frame) => {
      const visible = world.car.visible;
      if (!controls.settings.ego) world.car.visible = false;
      try { return shadowRender(...frame); }
      finally { world.car.visible = visible; }
    };

    document.querySelector('.preview-settings').addEventListener('change', event => {
      if (event.target.matches('#traffic-enabled:checked')) controls.showSceneLayers();
    }, {capture: true});
    document.querySelector('.preview-settings').addEventListener('click', event => {
      const button = event.target.closest('[data-road="cameraView"], [data-ramp-view], [data-junction-view], [data-view]');
      if (button && !button.disabled && controls.settings.customCamera) {
        controls.useSceneCamera();
        camera.reset();
        if (button.getAttribute('aria-pressed') === 'true' && world.state && !world.suspended) world.renderFrame();
      }
    }, {capture: true});

    return world;
  }
};
