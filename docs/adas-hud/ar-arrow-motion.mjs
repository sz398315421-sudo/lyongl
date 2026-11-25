const straight = [.497, .520, 13.21, 0, 22];
export const referenceAspect = 16 / 9;
const right = [
  [.598, .394, 26.45, 90, 27],
  [.637, .394, 33.26, 90, 27.5],
  [.667, .394, 41.08, 90, 31.5]
];
const left = right.map(([x, y, depth, heading, tilt]) => [2 * straight[0] - x, y, depth, -heading, tilt]);

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

// Poses are projected centers in the reference 16:9 camera, optical depth
// in meters, and clockwise heading and tilt in degrees.
function makeTurn({id, name, maneuver, poses, bend}) {
  const {durationMs, approach, turned, guideStart, guidePreview, recoveryStart, recoveryPreview, straightAgain, followers} = standardTiming;
  const [lead] = poses;
  const followerTracks = followers.map(([appear, settled, withdraw, hidden], index) => {
    const pose = poses[index + 1];
    // Slide out from behind the preceding arrow at the follower's own depth.
    const tucked = [...poses[index].slice(0, 2), ...pose.slice(2)];
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

export const rightTurn = makeTurn({id: 'right', name: '路口右转', maneuver: '右转', poses: right, bend: .15});
export const turnPresets = Object.freeze({
  right: rightTurn,
  left: makeTurn({id: 'left', name: '路口左转', maneuver: '左转', poses: left, bend: -.15}),
  'u-turn': {
    id: 'u-turn',
    name: '左侧掉头',
    durationMs: 8750,
    referenceMotion: true,
    stages: [
      {label: '直行', start: 0, preview: 0, position: 'start'},
      {label: '进入掉头', start: 520, preview: 1100},
      {label: '掉头引导', start: 1900, preview: 4040, position: 'far'},
      {label: '驶离掉头', start: 5860, preview: 6920},
      {label: '直行', start: 8000}
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

// The fourth keyframe value controls the blend from the adjusted starting
// point to the adjusted far end. The turn arrows share the far offset.
export function positionArrowMotion(clip, {start, far}, aspect) {
  const horizontalScale = aspect / referenceAspect / 100;
  const startDepth = start[2] ?? 0;
  const farDepth = far[2] ?? 0;
  const [anchorX, anchorY] = clip.farAnchor ?? straight;
  return {...clip, tracks: clip.tracks.map(track => track.map(([time, [x, y, depth, heading, tilt], opacity, farWeight = 1, bend]) => {
    const startWeight = 1 - farWeight;
    const offsetX = start[0] * startWeight + far[0] * farWeight;
    const offsetY = start[1] * startWeight + far[1] * farWeight;
    const farDepthOffset = farDepth * farWeight;
    const offsetDepth = startDepth * startWeight + farDepthOffset;
    // Moving along the far anchor's camera ray changes both apparent size
    // and the spacing of the turn arrows while keeping the anchor in place.
    const perspective = farDepthOffset / (depth + farDepthOffset);
    const moveX = x + (anchorX - x) * perspective + offsetX * horizontalScale;
    const moveY = y + (anchorY - y) * perspective + offsetY / 100;
    return [time, [moveX, moveY, depth + offsetDepth, heading, tilt], opacity, farWeight, bend];
  }))};
}
