import {carpetView} from './hud-camera-view.mjs';

const straight = [.497, .520, 13.21, 0, 22, 0, 0];
export const referenceAspect = 16 / 9;
export const referenceViewScale = Math.tan(carpetView.fov * Math.PI / 360);
const screenHeight = 2 * referenceViewScale;
const screenWidth = screenHeight * referenceAspect;
const degrees = 180 / Math.PI;

function turnAngles(right, up, forward) {
  return [Math.atan2(right, up) * degrees, Math.atan2(Math.hypot(right, up), forward) * degrees];
}

// Counter-roll around the pointing axis so the wings still read upright in
// the reference camera when the row is seen to the left or right.
function turnRoll(x, heading, tilt, direction) {
  const yaw = heading / degrees;
  const angle = tilt / degrees;
  const horizontal = Math.sin(yaw) * Math.cos(angle) + (x - .5) * screenWidth * Math.sin(angle);
  return Math.atan2(Math.cos(yaw) * direction, horizontal * direction) * degrees;
}

// The row is a straight line in camera space, with the model tips as anchors.
// Set the outer screen positions and solve the middle arrow at its own depth.
const rowY = .396;
const turnProfile = [[26.45, 27], [33.26, 27.5], [41.08, 31.5]];
function turnRow(nearX, farX) {
  const [nearDepth] = turnProfile[0];
  const [farDepth] = turnProfile.at(-1);
  const near = (nearX - .5) * nearDepth;
  const far = (farX - .5) * farDepth;
  const run = (far - near) / (farDepth - nearDepth);
  const direction = Math.sign(run);
  const rise = (.5 - rowY) * screenHeight;
  return turnProfile.map(([depth, tilt]) => {
    const x = .5 + (near + run * (depth - nearDepth)) / depth;
    // Keep the original face angle. Adjust its heading only enough for the
    // center ridge to point horizontally at this screen height.
    const slope = Math.tan(tilt / degrees);
    const heading = Math.atan2(direction * Math.sqrt(slope * slope - rise * rise), rise) * degrees;
    return [x, rowY, depth, heading, tilt, 1, turnRoll(x, heading, tilt, direction)];
  });
}
const right = turnRow(.612, .678);
const left = turnRow(2 * straight[0] - .612, 2 * straight[0] - .678);

const standardTiming = {
  durationMs: 7600,
  approach: 950,
  turned: 2700,
  guideStart: 2800,
  guidePreview: 4070,
  recoveryStart: 5050,
  recoveryPreview: 6250,
  straightAgain: 6800,
  followers: [[2390, 3510, 5070, 5660], [2720, 3940, 4900, 5510]]
};

// Poses store a projected anchor, optical depth in meters, heading and tilt
// in degrees, the weight of the tip anchor and roll in degrees.
function makeTurn({id, name, maneuver, poses, bend}) {
  const {durationMs, approach, turned, guideStart, guidePreview, recoveryStart, recoveryPreview, straightAgain, followers} = standardTiming;
  const [lead] = poses;
  const followerTracks = followers.map(([appear, settled, withdraw, hidden], index) => {
    const pose = poses[index + 1];
    // Slide out along the same line from behind the preceding arrow.
    const tucked = poses[index];
    return [[appear, tucked, 0], [settled, pose, 1], [withdraw, pose, 1], [hidden, tucked, 0]];
  });
  return {
    id,
    name,
    durationMs,
    farAnchor: poses.at(-1).slice(0, 2),
    stages: [
      {label: '直行', start: 0, preview: 0, position: 'start'},
      {label: `进入${maneuver}`, start: approach, preview: turned},
      {label: `${maneuver}引导`, start: guideStart, preview: guidePreview, position: 'far'},
      {label: '出弯回正', start: followers.at(-1)[2], preview: recoveryPreview},
      {label: '直行', start: straightAgain}
    ],
    tracks: [
      [[approach, straight, 1, 0], [turned, lead, 1, 1, bend],
        [recoveryStart, lead, 1], [straightAgain, straight, 1, 0, -bend]],
      ...followerTracks
    ]
  };
}

export const rightTurn = {
  ...makeTurn({id: 'right', name: '路口右转', maneuver: '右转', poses: right, bend: .15}),
  guideFlash: standardTiming.followers.at(-1).slice(1, 3)
};
export const uTurnTiming = Object.freeze({
  durationMs: 10800,
  extend: 400,
  turn: 2240,
  peak: 5360,
  straightAgain: 8560,
  retract: 9000,
  singleAgain: 10400
});

export const turnPresets = Object.freeze({
  right: rightTurn,
  left: makeTurn({id: 'left', name: '路口左转', maneuver: '左转', poses: left, bend: -.15}),
  'u-turn': {
    id: 'u-turn',
    name: '左侧掉头',
    durationMs: uTurnTiming.durationMs,
    referenceMotion: true,
    stages: [
      {label: '单箭头直行', start: 0, preview: 0, position: 'start'},
      {label: '延展箭头', start: uTurnTiming.extend, preview: 2000},
      {label: '进入掉头', start: uTurnTiming.turn, preview: 4040},
      {label: '掉头引导', start: uTurnTiming.peak - 560, preview: uTurnTiming.peak, position: 'far'},
      {label: '出弯回正', start: uTurnTiming.peak + 720, preview: 8800},
      {label: '收回箭头', start: uTurnTiming.retract, preview: 9760},
      {label: '单箭头直行', start: uTurnTiming.singleAgain}
    ],
    tracks: []
  }
});

function sampleTrack(track, elapsed) {
  const [firstTime, firstPose, firstOpacity] = track[0];
  if (elapsed <= firstTime) return {pose: firstPose, opacity: firstOpacity};
  for (let index = 1; index < track.length; index++) {
    const [time, pose, opacity, , bend = 0] = track[index];
    if (elapsed > time) continue;
    const [previousTime, previousPose, previousOpacity] = track[index - 1];
    const t = (elapsed - previousTime) / (time - previousTime);
    // A single progress curve synchronizes travel, turn and depth. Velocity
    // and acceleration both reach zero at the stationary endpoints.
    const blend = t * t * t * (10 + t * (6 * t - 15));
    const interpolated = pose.map((value, component) => previousPose[component] + (value - previousPose[component]) * blend);
    if (previousPose[5] === 1 && pose[5] === 1) {
      // Interpolate the projected coordinates in 3D, so the follower stays on
      // the row when the preview camera is moved.
      for (let axis = 0; axis < 2; axis++) {
        interpolated[axis] = (previousPose[axis] * previousPose[2] * (1 - blend) + pose[axis] * pose[2] * blend) / interpolated[2];
      }
    }
    const arc = 4 * bend * blend * (1 - blend);
    interpolated[0] += (pose[1] - previousPose[1]) * arc / referenceAspect;
    interpolated[1] -= (pose[0] - previousPose[0]) * arc * referenceAspect;
    let visibleOpacity = opacity;
    if (previousOpacity !== opacity) {
      // Keep the follower hidden at the overlap, then fade it in as the
      // shapes separate. Reverse the same curve on the way back.
      const spread = opacity > previousOpacity ? blend : 1 - blend;
      const fade = Math.max(0, (spread - .22) / .78);
      visibleOpacity = Math.min(previousOpacity, opacity) + Math.abs(opacity - previousOpacity) * fade * fade * (3 - 2 * fade);
    }
    return {
      pose: interpolated,
      opacity: visibleOpacity
    };
  }
  const [, pose, opacity] = track.at(-1);
  return {pose, opacity};
}

export function sampleArrowMotion(clip, elapsed) {
  return clip.tracks.map(track => sampleTrack(track, elapsed));
}

export function sampleGuideFlash(clip, elapsed, index) {
  const [start, end] = clip.guideFlash;
  if (elapsed <= start || elapsed >= end) return 1;
  // Each arrow reaches full brightness in order on the shared timeline.
  // Ease into and out of the effect while the three arrows are settled.
  const progress = (elapsed - start) / (end - start);
  const distance = Math.abs(progress * clip.tracks.length - index - .5);
  const ease = value => {
    const t = Math.min(1, value);
    return t * t * (3 - 2 * t);
  };
  const fade = ease(Math.min(progress, 1 - progress) / .15);
  return 1 - .76 * fade * ease(distance / .72);
}

// The fourth keyframe value controls the blend from the adjusted starting
// point to the adjusted far end. The turn arrows share the far offset.
export function positionArrowMotion(clip, {start, far}, aspect) {
  const horizontalScale = aspect / referenceAspect / 100;
  const startDepthOffset = start[2] ?? 0;
  const farDepthSetting = far[2] ?? 0;
  const [anchorX, anchorY] = clip.farAnchor ?? straight;
  return {...clip, tracks: clip.tracks.map(track => track.map(([time, [x, y, depth, heading, tilt, tipWeight, roll], opacity, farWeight = 1, bend]) => {
    const startWeight = 1 - farWeight;
    const offsetX = (start[0] * startWeight + far[0] * farWeight) * horizontalScale;
    const offsetY = (start[1] * startWeight + far[1] * farWeight) / 100;
    const farDepthOffset = farDepthSetting * farWeight;
    const offsetDepth = startDepthOffset * startWeight + farDepthOffset;
    // Moving along the far anchor's camera ray changes both apparent size
    // and the spacing of the turn arrows while keeping the anchor in place.
    const perspective = farDepthOffset / (depth + farDepthOffset);
    const moveX = x + (anchorX - x) * perspective + offsetX;
    const moveY = y + (anchorY - y) * perspective + offsetY;
    if (tipWeight === 1) {
      const direction = Math.sign(heading);
      // Compensate for the new projection ray to keep the visible arrow
      // pointing sideways when the group is moved around the image.
      const side = Math.tan(tilt / degrees);
      [heading, tilt] = turnAngles(
        side * Math.sin(heading / degrees) + (moveX - x) * screenWidth,
        side * Math.cos(heading / degrees) - (moveY - y) * screenHeight,
        1
      );
      roll = turnRoll(moveX, heading, tilt, direction);
    }
    return [time, [moveX, moveY, depth + offsetDepth, heading, tilt, tipWeight, roll], opacity, farWeight, bend];
  }))};
}
