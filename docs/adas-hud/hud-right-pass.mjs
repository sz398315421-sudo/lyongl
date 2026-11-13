import {laneWidth, sampleLanePath} from '../adas/road-assist.js';

const laneChangeDuration = 9200;
const speed = 7.5;
const turnAt = 4.3;
const turnDuration = 3.6;
const guidePreviewDuration = .65;
const brakeAt = 9.35;
const junctionAt = 10.65;
const cornerSpeed = 4.2;
const cornerRadius = 6;
const cornerLength = cornerRadius * Math.PI / 2;
const cornerEnd = junctionAt + cornerLength / cornerSpeed;
const junctionDuration = Math.round((cornerEnd + 2.2) * 1000);
const approachDistance = speed * brakeAt + (speed + cornerSpeed) / 2 * (junctionAt - brakeAt);
const junctionDistance = approachDistance + cornerLength + cornerSpeed * (junctionDuration / 1000 - cornerEnd);

function canTurnAtJunction(world) {
  return world.state?.id === '02' && !world.state.waterfront &&
    world.car.position.z - approachDistance >= -222;
}

export function isBlueRoad(world) {
  return world.state?.id === '02' && world.state.laneCount === 3;
}

export function presetLaneDirection(world, lanes) {
  const preset = world.hudSettings?.preset;
  if (preset === 'blueRoad' && lanes.right && canTurnAtJunction(world)) return 'right';
  if (world.car.position.z - speed * laneChangeDuration / 1000 < -185) return null;
  if (preset === 'carpet' && lanes.left) return 'left';
  if (preset === 'blueRoad' && lanes.right) return 'right';
  return null;
}

export function hasPresetRightTurn(world, direction) {
  return direction === 'right' && canTurnAtJunction(world);
}

export function presetLaneDuration(world, direction) {
  return hasPresetRightTurn(world, direction) ? junctionDuration : laneChangeDuration;
}

export function createPresetLaneChange(world, base, lanes, direction) {
  const turnsAtJunction = hasPresetRightTurn(world, direction);
  const target = turnsAtJunction ? lanes.count - 1 : lanes.index + (direction === 'left' ? -1 : 1);
  const changeSeconds = turnDuration + .65 * Math.max(0, target - lanes.index - 1);
  const laneChange = {
    startX: base.carPosition.x, targetX: lanes.centers[target], startZ: base.carPosition.z - speed * turnAt,
    distance: speed * changeSeconds, direction, fromLane: lanes.index + 1, toLane: target + 1
  };
  const width = world.state.laneCount * laneWidth;
  const turnZ = base.carPosition.z - approachDistance;
  const rightTurn = turnsAtJunction ? {width, turnZ, centerZ: turnZ - cornerRadius - (width - laneWidth) / 2} : null;
  const durationMs = presetLaneDuration(world, direction);
  return {hudRightPass: true, durationMs, distance: rightTurn ? junctionDistance : speed * durationMs / 1000, laneChange, rightTurn};
}

function sampleRightTurn(turn, x, distance) {
  const angle = Math.min(distance / cornerRadius, Math.PI / 2);
  return {
    x: x + cornerRadius * (1 - Math.cos(angle)) + Math.max(0, distance - cornerLength),
    z: turn.turnZ - cornerRadius * Math.sin(angle),
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
    if (distance > turnDistance) return sampleRightTurn(plan.rightTurn, plan.targetX, distance - turnDistance);
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
  const laneTravel = traveled - speed * turnAt;
  const corner = rightTurn && traveled > approachDistance;
  const point = corner ? sampleRightTurn(rightTurn, trip.laneChange.targetX, traveled - approachDistance) : sampleLanePath(trip.laneChange, laneTravel);
  const carPosition = base.carPosition.clone().setX(point.x).setZ(corner ? point.z : base.carPosition.z - traveled);
  const cameraYaw = corner ? point.yaw : 0;
  const axis = base.carPosition.clone().set(0, 1, 0);
  const shifted = position => position.clone().sub(base.carPosition).applyAxisAngle(axis, cameraYaw).add(carPosition);

  const t = Math.min(1, Math.max(0, 1 + (seconds - turnAt) / guidePreviewDuration));
  world.roadGuidePath = {...trip.laneChange, kind: 'hud-right-pass', travelled: laneTravel, preview: t * t * (3 - 2 * t), rightTurn};
  world.roadGuidance.time = seconds;
  const quaternion = base.quaternion.clone().premultiply(base.quaternion.clone().setFromAxisAngle(axis, cameraYaw));
  world.applyCamera({...base, position: shifted(base.position), aim: shifted(base.aim), carPosition, quaternion});
  world.car.quaternion.copy(base.carQuaternion);
  world.car.rotateY(point.yaw);
  world.framing = base.framing;
  world.renderFrame(true);
}
