import {laneWidth, sampleLanePath} from '../adas/road-assist.js';

const laneChangeDuration = 9200;
const carpetStraightExtension = 1000;
const speed = 7.5;
const laneChangeStart = 4.3;
const turnDuration = 3.6;
const guidePreviewDuration = .65;
const brakeAt = 2.1;
const junctionAt = 3.4;
const cornerSpeed = 4.2;
const cornerRadius = 6;
const cornerLength = cornerRadius * Math.PI / 2;
const cornerEnd = junctionAt + cornerLength / cornerSpeed;
export const junctionDuration = Math.round((cornerEnd + 2.2) * 1000);
const approachDistance = speed * brakeAt + (speed + cornerSpeed) / 2 * (junctionAt - brakeAt);
const junctionDistance = approachDistance + cornerLength + cornerSpeed * (junctionDuration / 1000 - cornerEnd);

export function canTurnAtJunction(world) {
  return world.hudSettings?.preset === 'blueRoad' && world.state?.id === '02' &&
    !world.state.roadworks && !world.state.waterfront;
}

export function isBlueRoad(world) {
  return world.state?.id === '02' && world.state.laneCount === 3;
}

export function presetLaneDuration(direction) {
  return laneChangeDuration + (direction === 'left' ? carpetStraightExtension : 0);
}

export function presetLaneDirection(world, lanes) {
  const preset = world.hudSettings?.preset;
  const direction = preset === 'carpet' && lanes.left ? 'left' : preset === 'blueRoad' && lanes.right ? 'right' : null;
  if (!direction || world.car.position.z - speed * presetLaneDuration(direction) / 1000 < -185) return null;
  return direction;
}

export function createPresetLaneChange(base, lanes, direction) {
  const target = lanes.index + (direction === 'left' ? -1 : 1);
  const durationMs = presetLaneDuration(direction);
  const turnStart = laneChangeStart + (durationMs - laneChangeDuration) / 1000;
  const laneChange = {
    startX: base.carPosition.x, targetX: lanes.centers[target], startZ: base.carPosition.z - speed * turnStart,
    distance: speed * turnDuration, direction, fromLane: lanes.index + 1, toLane: target + 1
  };
  return {hudRightPass: true, durationMs, distance: speed * durationMs / 1000, laneChange, turnStart};
}

export function createPresetRightTurn(world, base) {
  const laneCount = world.state.laneCount === 3 ? 6 : world.state.laneCount;
  const width = laneCount * laneWidth;
  const turnZ = base.carPosition.z - approachDistance;
  const laneX = (width - laneWidth) / 2;
  const rightTurn = {width, turnZ, centerZ: turnZ - cornerRadius - laneX, laneX, radius: cornerRadius};
  return {hudRightPass: true, durationMs: junctionDuration, distance: junctionDistance, rightTurn};
}

export function sampleRightTurnArc(turn, angle, offset = 0) {
  const radius = turn.radius - offset;
  return [turn.laneX + turn.radius - radius * Math.cos(angle), turn.turnZ - radius * Math.sin(angle)];
}

function sampleRightTurn(turn, distance) {
  const angle = Math.min(distance / turn.radius, Math.PI / 2);
  const [x, z] = sampleRightTurnArc(turn, angle);
  return {
    x: x + Math.max(0, distance - cornerLength),
    z,
    yaw: -angle
  };
}

function traveledDistance(seconds, rightTurn) {
  if (!rightTurn || seconds < brakeAt) return speed * seconds;
  if (seconds >= junctionAt) return approachDistance + cornerSpeed * (seconds - junctionAt);
  const elapsed = seconds - brakeAt;
  const duration = junctionAt - brakeAt;
  return speed * seconds + (cornerSpeed - speed) * elapsed ** 2 / (2 * duration);
}

export function sampleRightPassGuidance(plan, distance) {
  if (plan.rightTurn) {
    const turnDistance = plan.startZ - plan.rightTurn.turnZ;
    return distance > turnDistance
      ? sampleRightTurn(plan.rightTurn, distance - turnDistance)
      : {x: plan.rightTurn.laneX, z: plan.startZ - distance, yaw: 0};
  }
  const point = sampleLanePath(plan, distance);
  point.x = plan.startX + (point.x - plan.startX) * plan.preview;
  point.z = plan.startZ - distance;
  point.yaw = -Math.atan(Math.tan(-point.yaw) * plan.preview);
  return point;
}

export function applyRightPassFrame(world, base, trip, elapsedMs) {
  const seconds = elapsedMs / 1000;
  const {rightTurn} = trip;
  const traveled = traveledDistance(seconds, rightTurn);
  const corner = rightTurn && traveled > approachDistance;
  const startZ = base.carPosition.z;
  const laneTravel = rightTurn ? 0 : traveled - speed * trip.turnStart;
  const point = rightTurn
    ? sampleRightPassGuidance({rightTurn, startZ}, traveled)
    : sampleLanePath(trip.laneChange, laneTravel);
  const carPosition = base.carPosition.clone().setX(point.x).setZ(rightTurn ? point.z : startZ - traveled);
  const cameraYaw = corner ? point.yaw : 0;
  const axis = base.carPosition.clone().set(0, 1, 0);
  const shifted = position => position.clone().sub(base.carPosition).applyAxisAngle(axis, cameraYaw).add(carPosition);

  const t = rightTurn ? 0 : Math.min(1, Math.max(0, 1 + (seconds - trip.turnStart) / guidePreviewDuration));
  world.roadGuidePath = rightTurn
    ? {kind: 'hud-right-pass', startZ, rightTurn, travelled: traveled}
    : {...trip.laneChange, kind: 'hud-right-pass', travelled: laneTravel, preview: t * t * (3 - 2 * t)};
  world.roadGuidance.time = seconds;
  const quaternion = base.quaternion.clone().premultiply(base.quaternion.clone().setFromAxisAngle(axis, cameraYaw));
  world.applyCamera({...base, position: shifted(base.position), aim: shifted(base.aim), carPosition, quaternion});
  world.car.quaternion.copy(base.carQuaternion);
  world.car.rotateY(point.yaw);
  world.framing = base.framing;
  world.renderFrame(true);
}
