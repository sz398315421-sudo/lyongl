// An open road path runs along the approach lane, through a half-turn,
// then leaves along the parallel return lane.
const approach = 8.1;
const radius = 2.55;
const entryZ = -5.4;
const bendZ = entryZ - approach;
const arc = Math.PI * radius;
const exit = 8.1;
export const uTurnLength = approach + arc + exit;
export const uTurnSurfaceY = .04;

export function uTurnPoint(distance) {
  if (distance <= approach) return {x: 0, z: entryZ - distance, dx: 0, dz: -1};
  if (distance >= approach + arc) return {x: -2 * radius, z: bendZ + distance - approach - arc, dx: 0, dz: 1};
  const angle = (distance - approach) / radius;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {x: radius * (cos - 1), z: bendZ - radius * sin, dx: -sin, dz: -cos};
}

export const uTurnAnchor = uTurnPoint(approach + arc / 2);
export const uTurnCueDistances = Object.freeze([2.8, 10, 16.7]);

function ease(start, end, time) {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function uTurnGuideFrame(time) {
  return {
    opacity: ease(1270, 2310, time) * (1 - ease(5600, 6650, time)),
    advance: 3.4 * ease(1720, 6040, time)
  };
}
