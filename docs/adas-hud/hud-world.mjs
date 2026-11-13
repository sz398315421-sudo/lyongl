import {Color, Group} from 'three';
import {World as AdasWorld} from '../adas/world.js';
import {hudSnapshots} from './hud-storage.mjs';
import {withHudLayers} from './hud-layers.mjs';
import {createHudControls} from './hud-controls.mjs';
import {createHudCamera} from './hud-camera.mjs';
import {createLaneColors, hudLaneLayout} from './hud-lane-colors.mjs';
import {vehicleFrame} from '../adas/framing.js';
import {guidanceSceneIds, laneWidth} from '../adas/road-assist.js';
import {startLayout} from './hud-start.mjs';
import {prepareTransparentOutput} from './hud-export.mjs';
import {blueRoadPreset, createBlueRoadTraffic} from './hud-blue-road.mjs';
import {createBlueRoadMarkings} from './hud-blue-markings.mjs';
import {isBlueRoad} from './hud-right-pass.mjs';

const background = new Color(0x000000);

export const World = {
  async create(canvas, car, options) {
    const world = await AdasWorld.create(canvas, car, {...options, alpha: true});
    world.hudTransparency = prepareTransparentOutput(world);
    let beforePreset;
    try { beforePreset = JSON.parse(hudSnapshots.getItem('before-blue-road')); } catch {}
    function setEnvironment(enabled) {
      document.documentElement.toggleAttribute('data-hud-environment', enabled);
      environment.setAttribute('aria-pressed', String(enabled));
      try { hudSnapshots.setItem('environment', enabled ? '1' : '0'); } catch {}
    }
    const controls = createHudControls(key => {
      if (!world.state || world.suspended) return;
      if (key === 'blueRoad') {
        if (!beforePreset) {
          beforePreset = {appearance: structuredClone(controls.settings), state: world.hudCapturePresetState(), environment: document.documentElement.hasAttribute('data-hud-environment')};
          try { hudSnapshots.setItem('before-blue-road', JSON.stringify(beforePreset)); } catch {}
        }
        setEnvironment(false);
        controls.applyBlueRoad();
        world.hudApplyBlueRoad(blueRoadPreset.color);
        return;
      }
      if (key === 'restorePreset' && beforePreset) {
        const saved = beforePreset;
        beforePreset = null;
        try { hudSnapshots.setItem('before-blue-road', 'null'); } catch {}
        setEnvironment(saved.environment);
        controls.restoreAppearance(saved.appearance);
        world.hudRestorePresetState(saved.state);
        return;
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
      if (key === 'follow') camera.reset();
      world.renderFrame();
    });
    world.hudSettings = controls.settings;
    const camera = createHudCamera(world, controls.settings);
    world.hudCamera = camera;
    const drawLanes = createLaneColors(world);
    const drawBlueMarkings = createBlueRoadMarkings(world);
    const render = world.composer.render.bind(world.composer);
    let junctionLock;
    const traffic = new Group();
    traffic.visible = false;
    world.hudPresetTraffic = traffic;
    world.scene.add(traffic);
    world.composer.render = (...frame) => {
      const blueRoad = isBlueRoad(world);
      controls.syncPreset(blueRoad, !!beforePreset);
      traffic.visible = blueRoad && (!!world.hudRightPass || !world.traffic?.group.visible);
      if (traffic.visible) {
        if (!traffic.children.length) traffic.add(createBlueRoadTraffic());
        const origin = world.hudPlayback?.basePose?.carPosition ?? world.car.position;
        traffic.position.set(0, 0, origin.z);
        const [left, right] = traffic.children[0].children;
        const pass = world.hudRightPass;
        left.position.x = pass ? pass.leadX : -laneWidth;
        left.position.z = pass ? pass.leadZ - origin.z : -11.5;
        left.rotation.y = pass?.leadYaw ?? 0;
        right.visible = !world.hudRightPass;
      }
      const layout = hudLaneLayout(world);
      controls.syncLanes(layout);
      controls.syncStart(startLayout(world.state.id, world.state.laneCount));
      controls.syncGuide(guidanceSceneIds.includes(world.state.id));
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
      const draw = () => drawLanes(layout, controls.settings.colors, () => camera.withView(() => withHudLayers(world, () => {
        if (world.vehicleDetail.enabled) {
          const frame = controls.settings.customCamera || controls.settings.follow ? vehicleFrame(world.car, world.camera) : world.framing.vehicleFrame;
          world.vehicleDetail.setVehicleFrame(frame, world.car.visible);
        }
        return render(...frame);
      }, background)));
      return blueRoad ? drawBlueMarkings(draw) : draw();
    };

    const shadowRender = world.renderer.shadowMap.render.bind(world.renderer.shadowMap);
    world.renderer.shadowMap.render = (...frame) => {
      const visible = world.car.visible;
      if (!controls.settings.ego) world.car.visible = false;
      try { return shadowRender(...frame); }
      finally { world.car.visible = visible; }
    };

    const environment = document.getElementById('hud-environment');
    environment.setAttribute('aria-pressed', String(document.documentElement.hasAttribute('data-hud-environment')));
    environment.addEventListener('click', () => {
      setEnvironment(!document.documentElement.hasAttribute('data-hud-environment'));
      world.renderFrame();
    });

    return world;
  }
};
