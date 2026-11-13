import {sampleLanePath} from '../adas/road-assist.js';

export const rightPassDuration = 9200;
const speed = 7.5;
const turnAt = 4.3;
const turnDuration = 3.6;
const guidePreviewDuration = .65;

export function isBlueRoad(world) {
  return world.state?.id === '02' && world.state.laneCount === 3;
}

export function presetLaneDirection(world, lanes) {
  if (world.car.position.z - speed * rightPassDuration / 1000 < -185) return null;
  const preset = world.hudSettings?.preset;
  if (preset === 'carpet' && lanes.left) return 'left';
  if (preset === 'blueRoad' && lanes.right) return 'right';
  return null;
}

export function createPresetLaneChange(base, lanes, direction) {
  const target = lanes.index + (direction === 'left' ? -1 : 1);
  const laneChange = {
    startX: base.carPosition.x, targetX: lanes.centers[target], startZ: base.carPosition.z - speed * turnAt,
    distance: speed * turnDuration, direction, fromLane: lanes.index + 1, toLane: target + 1
  };
  return {hudRightPass: true, durationMs: rightPassDuration, distance: speed * rightPassDuration / 1000, laneChange};
}

export function sampleRightPassGuidance(plan, distance) {
  const point = sampleLanePath(plan, distance);
  point.x = plan.startX + (point.x - plan.startX) * plan.preview;
  point.z = plan.startZ - distance;
  point.yaw = -Math.atan(Math.tan(-point.yaw) * plan.preview);
  return point;
}

export function applyRightPassFrame(world, base, trip, elapsedMs) {
  const seconds = elapsedMs / 1000;
  const traveled = speed * seconds;
  const laneTravel = traveled - speed * turnAt;
  const point = sampleLanePath(trip.laneChange, laneTravel);
  const offset = point.x - base.carPosition.x;
  const shifted = position => position.clone().setX(position.x + offset).setZ(position.z - traveled);

  const t = Math.min(1, Math.max(0, 1 + (seconds - turnAt) / guidePreviewDuration));
  world.roadGuidePath = {...trip.laneChange, kind: 'hud-right-pass', travelled: laneTravel, preview: t * t * (3 - 2 * t)};
  world.roadGuidance.time = seconds;
  world.applyCamera({...base, position: shifted(base.position), aim: shifted(base.aim), carPosition: shifted(base.carPosition)});
  world.car.quaternion.copy(base.carQuaternion);
  world.car.rotateY(point.yaw);
  world.framing = base.framing;
  world.renderFrame(true);
}
