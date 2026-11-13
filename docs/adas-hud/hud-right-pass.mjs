import {sampleLanePath} from '../adas/road-assist.js';

export const rightPassDuration = 6000;
const speed = 12;
const turnAt = 2.6;
const turnDuration = 2.4;
const leadSpeed = 5;
const approachGap = 9;
const braking = .55;
const acceleration = .9;
const followDuration = .55;
const catchAt = turnAt - followDuration;
const leadStartGap = approachGap + (speed - leadSpeed) * (catchAt - braking / 2);

export function isBlueRoad(world) {
  return world.state?.id === '02' && world.state.laneCount === 3;
}

export function createRightPass(base, lanes) {
  const startX = lanes[1];
  const offset = startX - base.carPosition.x;
  const center = point => point.clone().setX(point.x + offset);
  const pose = {...base, position: center(base.position), aim: center(base.aim), carPosition: center(base.carPosition)};
  const laneChange = {
    startX, targetX: lanes[2], startZ: base.carPosition.z - travelAt(turnAt),
    distance: travelAt(turnAt + turnDuration) - travelAt(turnAt), direction: 'right', fromLane: 2, toLane: 3
  };
  return {pose, trip: {hudRightPass: true, durationMs: rightPassDuration, distance: travelAt(rightPassDuration / 1000), laneChange}};
}

function travelAt(seconds) {
  const brakeTime = Math.min(braking, Math.max(0, seconds - (catchAt - braking)));
  const followTime = Math.min(followDuration, Math.max(0, seconds - catchAt));
  const leaveTime = Math.max(0, seconds - turnAt);
  const accelerateTime = Math.min(acceleration, leaveTime);
  const speedDelta = speed - leadSpeed;
  return speed * seconds - speedDelta * (brakeTime ** 2 / (2 * braking) + followTime + accelerateTime - accelerateTime ** 2 / (2 * acceleration));
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
  const traveled = travelAt(seconds);
  const laneTravel = traveled - travelAt(turnAt);
  const point = sampleLanePath(trip.laneChange, laneTravel);
  const offset = point.x - base.carPosition.x;
  const shifted = position => position.clone().setX(position.x + offset).setZ(position.z - traveled);

  const t = Math.min(1, Math.max(0, (seconds - catchAt) / followDuration));
  world.roadGuidePath = {...trip.laneChange, kind: 'hud-right-pass', travelled: laneTravel, preview: t * t * (3 - 2 * t)};
  world.hudRightPass = {leadX: trip.laneChange.startX, leadZ: base.carPosition.z - leadStartGap - leadSpeed * seconds};
  world.roadGuidance.time = seconds;
  world.applyCamera({...base, position: shifted(base.position), aim: shifted(base.aim), carPosition: shifted(base.carPosition)});
  world.car.quaternion.copy(base.carQuaternion);
  world.car.rotateY(point.yaw);
  world.framing = base.framing;
  world.renderFrame(true);
}
