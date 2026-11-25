const straight = [.497, .520, 13.21, 0, 22];
export const referenceAspect = 16 / 9;
const right = [
  [.598, .394, 26.45, 90, 27],
  [.637, .394, 33.26, 90, 27.5],
  [.667, .394, 41.08, 90, 31.5]
];

// Coordinates use the center of the arrow in the reference 16:9 camera,
// with optical depth in meters and clockwise rotation and tilt in degrees.
// Intermediate poses define the path around the intersection.
export const rightTurn = {
  name: '路口右转',
  durationMs: 7600,
  stages: [
    {label: '直行', start: 0, preview: 0, position: 'start'},
    {label: '进入右转', start: 950, preview: 2700},
    {label: '右转引导', start: 2800, preview: 4070, position: 'far'},
    {label: '出弯回正', start: 5100, preview: 6250},
    {label: '直行', start: 6800}
  ],
  tracks: [
    [
      [950, straight, 1, 0],
      [1800, [.539, .425, 19.2, 49, 26], 1, .44],
      [2700, right[0], 1],
      [5580, right[0], 1],
      [6200, [.548, .424, 19.8, 44, 26], 1, .50],
      [6800, straight, 1, 0]
    ],
    [
      [2840, [.617, .398, 35, 89, 27.5], 0],
      [3350, right[1], 1],
      [5260, right[1], 1],
      [5690, [.620, .398, 36, 89, 27.5], 0]
    ],
    [
      [3150, [.644, .396, 44, 89, 31.5], 0],
      [3730, right[2], 1],
      [5100, right[2], 1],
      [5500, [.644, .396, 44, 89, 31.5], 0]
    ]
  ]
};

// Keep velocity continuous at intermediate poses. Clamp the tangent so the
// arrow stops on holds and cannot overshoot size, position, or heading.
function tangent(a, b) {
  return a * b > 0 ? Math.sign(a) * Math.min(Math.abs(a), Math.abs(b)) : 0;
}

function sampleTrack(track, elapsed) {
  const [firstTime, firstPose, firstOpacity] = track[0];
  if (elapsed <= firstTime) return {pose: firstPose, opacity: firstOpacity};
  for (let index = 1; index < track.length; index++) {
    const [time, pose, opacity] = track[index];
    if (elapsed > time) continue;
    const [previousTime, previousPose, previousOpacity] = track[index - 1];
    const duration = time - previousTime;
    const t = (elapsed - previousTime) / duration;
    const blend = t * t * (3 - 2 * t);
    const before = track[index - 2];
    const after = track[index + 1];
    return {
      pose: pose.map((value, component) => {
        const start = previousPose[component];
        const change = value - start;
        const entering = before ? (start - before[1][component]) / (previousTime - before[0]) : 0;
        const leaving = after ? (after[1][component] - value) / (after[0] - time) : 0;
        const startTangent = tangent(entering * duration, change);
        const endTangent = tangent(change, leaving * duration);
        return start + change * blend + t * (1 - t) * ((1 - t) * startTangent - t * endTangent);
      }),
      opacity: previousOpacity + (opacity - previousOpacity) * blend
    };
  }
  const [, pose, opacity] = track.at(-1);
  return {pose, opacity};
}

export function sampleArrowMotion(clip, elapsed) {
  return clip.tracks.map(track => sampleTrack(track, elapsed));
}

// The last keyframe value controls the blend from the adjusted starting
// point to the adjusted far end. The turn arrows share the far offset.
export function positionArrowMotion(clip, {start, far}, aspect) {
  const horizontalScale = aspect / referenceAspect / 100;
  return {...clip, tracks: clip.tracks.map(track => track.map(([time, [x, y, ...pose], opacity, farWeight = 1]) => {
    const offsetX = start[0] * (1 - farWeight) + far[0] * farWeight;
    const offsetY = start[1] * (1 - farWeight) + far[1] * farWeight;
    return [time, [x + offsetX * horizontalScale, y + offsetY / 100, ...pose], opacity];
  }))};
}
