import type { Checkpoint, TrackDefinition, Vec2 } from '../shared/types';

const TAU = Math.PI * 2;
const ARC_TABLE_STEPS = 4096;
const NEAREST_SEGMENTS = 512;
const RAIL_SEGMENTS = 160;
const RAIL_OFFSET = 7.75;

type TrackShape = Pick<TrackDefinition, 'radiusX' | 'radiusZ' | 'halfWidth'>;

interface CurveSample {
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
}

interface BezierSegment {
  p0: Vec2;
  c1: Vec2;
  c2: Vec2;
  p3: Vec2;
}

interface ArcTableEntry {
  raw: number;
  distance: number;
}

/**
 * A single non-crossing paper circuit: right straight, rounded right-angle
 * turn, double S, broad left C return, bottom straight and final corner.
 * Adjacent controls share their tangent direction so wide offset ribbons do
 * not kink or fold at segment boundaries.
 */
const TRACK_SEGMENTS: readonly BezierSegment[] = [
  { p0: { x: 58, z: -26 }, c1: { x: 58, z: -10 }, c2: { x: 58, z: 5 }, p3: { x: 58, z: 17 } },
  { p0: { x: 58, z: 17 }, c1: { x: 58, z: 26 }, c2: { x: 54, z: 32 }, p3: { x: 45, z: 32 } },
  { p0: { x: 45, z: 32 }, c1: { x: 42, z: 32 }, c2: { x: 38, z: 32 }, p3: { x: 35, z: 32 } },
  { p0: { x: 35, z: 32 }, c1: { x: 27, z: 32 }, c2: { x: 23, z: 20 }, p3: { x: 15, z: 20 } },
  { p0: { x: 15, z: 20 }, c1: { x: 7, z: 20 }, c2: { x: -2, z: 32 }, p3: { x: -10, z: 32 } },
  { p0: { x: -10, z: 32 }, c1: { x: -18, z: 32 }, c2: { x: -24, z: 25 }, p3: { x: -32, z: 25 } },
  { p0: { x: -32, z: 25 }, c1: { x: -34, z: 25 }, c2: { x: -36, z: 25 }, p3: { x: -38, z: 25 } },
  { p0: { x: -38, z: 25 }, c1: { x: -48, z: 25 }, c2: { x: -56, z: 21 }, p3: { x: -56, z: 11 } },
  { p0: { x: -56, z: 11 }, c1: { x: -56, z: 2 }, c2: { x: -56, z: -8 }, p3: { x: -56, z: -16 } },
  { p0: { x: -56, z: -16 }, c1: { x: -56, z: -30 }, c2: { x: -49, z: -39 }, p3: { x: -37, z: -39 } },
  { p0: { x: -37, z: -39 }, c1: { x: -16, z: -39 }, c2: { x: 10, z: -39 }, p3: { x: 32, z: -39 } },
  { p0: { x: 32, z: -39 }, c1: { x: 46, z: -39 }, c2: { x: 58, z: -36 }, p3: { x: 58, z: -26 } },
];

function bezierSample(segment: BezierSegment, t: number): CurveSample {
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const tSquared = t * t;
  return {
    x: oneMinusTSquared * oneMinusT * segment.p0.x
      + 3 * oneMinusTSquared * t * segment.c1.x
      + 3 * oneMinusT * tSquared * segment.c2.x
      + tSquared * t * segment.p3.x,
    z: oneMinusTSquared * oneMinusT * segment.p0.z
      + 3 * oneMinusTSquared * t * segment.c1.z
      + 3 * oneMinusT * tSquared * segment.c2.z
      + tSquared * t * segment.p3.z,
    tangentX: 3 * (
      oneMinusTSquared * (segment.c1.x - segment.p0.x)
      + 2 * oneMinusT * t * (segment.c2.x - segment.c1.x)
      + tSquared * (segment.p3.x - segment.c2.x)
    ),
    tangentZ: 3 * (
      oneMinusTSquared * (segment.c1.z - segment.p0.z)
      + 2 * oneMinusT * t * (segment.c2.z - segment.c1.z)
      + tSquared * (segment.p3.z - segment.c2.z)
    ),
  };
}

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function wrapAngle(angle: number): number {
  return wrap(angle, TAU);
}

function rawCurveAt(raw: number): CurveSample {
  const normalized = wrap(raw, TRACK_SEGMENTS.length);
  const index = Math.min(TRACK_SEGMENTS.length - 1, Math.floor(normalized));
  return bezierSample(TRACK_SEGMENTS[index], normalized - index);
}

function buildArcTable(): ArcTableEntry[] {
  const table: ArcTableEntry[] = [{ raw: 0, distance: 0 }];
  let previous = rawCurveAt(0);
  let distance = 0;
  for (let index = 1; index <= ARC_TABLE_STEPS; index++) {
    const raw = index / ARC_TABLE_STEPS * TRACK_SEGMENTS.length;
    const point = rawCurveAt(raw);
    distance += Math.hypot(point.x - previous.x, point.z - previous.z);
    table.push({ raw, distance });
    previous = point;
  }
  return table;
}

const ARC_TABLE = buildArcTable();
const TRACK_LENGTH = ARC_TABLE[ARC_TABLE.length - 1].distance;

function rawAtAngle(angle: number): number {
  const target = wrapAngle(angle) / TAU * TRACK_LENGTH;
  let low = 0;
  let high = ARC_TABLE.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (ARC_TABLE[middle].distance <= target) low = middle;
    else high = middle;
  }
  const before = ARC_TABLE[low];
  const after = ARC_TABLE[high];
  const span = after.distance - before.distance;
  const blend = span > 0 ? (target - before.distance) / span : 0;
  return before.raw + (after.raw - before.raw) * blend;
}

function curveAt(angle: number): CurveSample {
  return rawCurveAt(rawAtAngle(angle));
}

interface NearestPoint extends Vec2 { angle: number }

const NEAREST_POINTS: NearestPoint[] = Array.from({ length: NEAREST_SEGMENTS + 1 }, (_, index) => {
  const angle = index / NEAREST_SEGMENTS * TAU;
  const point = curveAt(angle);
  return { x: point.x, z: point.z, angle };
});

/** The same distance-uniform definition drives road rendering, AI and recovery. */
export function sampleTrack(track: TrackShape, angle: number, offset = 0): Checkpoint {
  const curve = curveAt(angle);
  const tangentLength = Math.hypot(curve.tangentX, curve.tangentZ) || 1;
  const normalX = curve.tangentZ / tangentLength;
  const normalZ = -curve.tangentX / tangentLength;
  return {
    x: curve.x + normalX * offset,
    z: curve.z + normalZ * offset,
    heading: Math.atan2(curve.tangentX, curve.tangentZ),
    halfWidth: track.halfWidth,
  };
}

/** Projects onto a dense polyline; linked S bends cannot jump branches. */
export function findNearestTrackAngle(_track: TrackShape, point: Vec2): number {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAngle = 0;
  for (let index = 0; index < NEAREST_SEGMENTS; index++) {
    const a = NEAREST_POINTS[index];
    const b = NEAREST_POINTS[index + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz || 1;
    const blend = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
    const x = a.x + dx * blend;
    const z = a.z + dz * blend;
    const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAngle = a.angle + (b.angle - a.angle) * blend;
    }
  }
  return wrapAngle(bestAngle);
}

function signedAngleDifference(a: number, b: number): number {
  return wrap(a - b + Math.PI, TAU) - Math.PI;
}

function localCurveRadius(track: TrackShape, angle: number): number {
  const delta = TAU / NEAREST_SEGMENTS * 2;
  const previous = sampleTrack(track, angle - delta);
  const next = sampleTrack(track, angle + delta);
  const arcLength = TRACK_LENGTH * delta * 2 / TAU;
  const turn = Math.abs(signedAngleDifference(next.heading, previous.heading));
  return turn < 0.0001 ? Number.POSITIVE_INFINITY : arcLength / turn;
}

export function createTrack(): TrackDefinition {
  const track: TrackDefinition = {
    radiusX: 58,
    radiusZ: 39,
    halfWidth: 6.4,
    shoulder: 0.75,
    checkpoints: [],
    walls: [],
    obstacles: [],
    itemBoxes: [],
    spawn: { x: 58, z: -26, heading: 0, halfWidth: 6.4 },
  };
  track.spawn = sampleTrack(track, 0);
  track.checkpoints = Array.from({ length: 8 }, (_, index) => sampleTrack(track, index / 8 * TAU));

  // Equal-distance rail pieces reserve gaps around every checkpoint and omit
  // inner sections whose curvature would fold a wide offset line.
  for (let index = 0; index < RAIL_SEGMENTS; index++) {
    const checkpointRemainder = index % (RAIL_SEGMENTS / 8);
    const angle = (index + 0.4) / RAIL_SEGMENTS * TAU;
    if (checkpointRemainder <= 1 || checkpointRemainder >= RAIL_SEGMENTS / 8 - 2) continue;
    if (localCurveRadius(track, angle) < RAIL_OFFSET + 1.5) continue;
    for (const side of [-1, 1]) {
      track.walls.push({
        a: sampleTrack(track, index / RAIL_SEGMENTS * TAU, side * RAIL_OFFSET),
        b: sampleTrack(track, (index + 0.76) / RAIL_SEGMENTS * TAU, side * RAIL_OFFSET),
      });
    }
  }

  const crate = sampleTrack(track, 0.64 * TAU, track.halfWidth + 2.45);
  track.obstacles.push({ x: crate.x, z: crate.z, halfX: 0.9, halfZ: 0.9 });

  const itemFractions = [0.1, 0.26, 0.42, 0.58, 0.74, 0.9];
  track.itemBoxes = itemFractions.map((fraction, id) => {
    const box = sampleTrack(track, fraction * TAU, id % 2 === 0 ? -2.0 : 2.0);
    return { id, x: box.x, z: box.z, heading: box.heading };
  });
  return track;
}

export function distanceFromRoad(track: TrackDefinition, point: Vec2): number {
  const angle = findNearestTrackAngle(track, point);
  const center = curveAt(angle);
  return Math.hypot(point.x - center.x, point.z - center.z);
}
