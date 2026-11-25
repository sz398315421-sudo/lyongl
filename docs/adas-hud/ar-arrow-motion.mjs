const straight = [.497, .520, 13.21, 0, 22];
export const referenceAspect = 16 / 9;
const right = [
  [.598, .394, 26.45, 90, 27],
  [.637, .394, 33.26, 90, 27.5],
  [.667, .394, 41.08, 90, 31.5]
];

// Coordinates use the center of the arrow in the reference 16:9 camera,
// with optical depth in meters and clockwise rotation and tilt in degrees.
export const rightTurn = {
  name: '路口右转',
  durationMs: 7600,
  farAnchor: right.at(-1).slice(0, 2),
  stages: [
    {label: '直行', start: 0, preview: 0, position: 'start'},
    {label: '进入右转', start: 950, preview: 2700},
    {label: '右转引导', start: 2800, preview: 4070, position: 'far'},
    {label: '出弯回正', start: 4900, preview: 6250},
    {label: '直行', start: 6800}
  ],
  tracks: [
    [
      [950, straight, 1, 0],
      [2700, right[0], 1, 1, .15],
      [5050, right[0], 1],
      [6800, straight, 1, 0, -.15]
    ],
    [
      [2780, [.617, .398, 35, 89, 27.5], 0],
      [3330, right[1], 1],
      [5070, right[1], 1],
      [5620, [.620, .398, 36, 89, 27.5], 0]
    ],
    [
      [3070, [.644, .396, 44, 89, 31.5], 0],
      [3680, right[2], 1],
      [4900, right[2], 1],
      [5450, [.644, .396, 44, 89, 31.5], 0]
    ]
  ]
};

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
    return {
      pose: interpolated,
      opacity: previousOpacity + (opacity - previousOpacity) * blend
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
  const [anchorX, anchorY] = clip.farAnchor;
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
