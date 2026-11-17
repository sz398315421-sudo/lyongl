import type { TrackDefinition, Vec2 } from '../../shared/types';
import { distanceFromRoad, sampleTrack } from '../../game-core/track';

const TAU = Math.PI * 2;

export const TRACK_VISUAL_LAYOUT = {
  trayWidth: 172,
  trayDepth: 128,
  meadowWidth: 168,
  meadowDepth: 124,
  roadSampleCount: 384,
  roadHalfWidth: 5,
  shoulderInner: 5.16,
  shoulderOuter: 5.5,
  cutoutHalfWidth: 5.8,
  railOffset: 7.75,
  checkpointOffset: 8.45,
  decorationGap: 0.75,
  roadDecorationGap: 1.5,
} as const;

export interface RoadSample extends Vec2 {
  angle: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  heading: number;
}

export interface RoadStripGeometry {
  positions: number[];
  indices: number[];
}

export type DecorationKind = 'tree' | 'house' | 'pond' | 'sign' | 'flower';

export interface DecorationPlacement extends Vec2 {
  id: string;
  kind: DecorationKind;
  radius: number;
  rotation: number;
  variant: number;
}

interface Candidate extends Vec2 {
  rotation: number;
  radius: number;
  variant: number;
}

interface OccupiedCircle extends Vec2 { radius: number }

export function buildRoadSamples(
  track: TrackDefinition,
  count = TRACK_VISUAL_LAYOUT.roadSampleCount,
): RoadSample[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * TAU;
    const point = sampleTrack(track, angle);
    const tangentX = Math.sin(point.heading);
    const tangentZ = Math.cos(point.heading);
    return {
      x: point.x,
      z: point.z,
      angle,
      tangentX,
      tangentZ,
      normalX: tangentZ,
      normalZ: -tangentX,
      heading: point.heading,
    };
  });
}

export function buildRoadStripGeometry(
  samples: readonly RoadSample[],
  inner: number,
  outer: number,
  y: number,
): RoadStripGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const sample of samples) {
    positions.push(
      sample.x + sample.normalX * outer, y, sample.z + sample.normalZ * outer,
      sample.x + sample.normalX * inner, y, sample.z + sample.normalZ * inner,
    );
  }
  for (let index = 0; index < samples.length; index++) {
    const next = (index + 1) % samples.length;
    const currentVertex = index * 2;
    const nextVertex = next * 2;
    indices.push(currentVertex, currentVertex + 1, nextVertex, currentVertex + 1, nextVertex + 1, nextVertex);
  }
  return { positions, indices };
}

function tracksideCandidates(
  track: TrackDefinition,
  count: number,
  radiusFor: (index: number) => number,
  phase: number,
): Candidate[] {
  return Array.from({ length: count }, (_, index) => {
    const radius = radiusFor(index);
    const angle = (phase + index / count) * TAU;
    const side = index % 3 === 1 ? -1 : 1;
    const offset = side * (TRACK_VISUAL_LAYOUT.railOffset + radius + 1.05);
    const point = sampleTrack(track, angle, offset);
    return {
      x: point.x,
      z: point.z,
      radius,
      rotation: point.heading + (side > 0 ? Math.PI : 0),
      variant: index,
    };
  });
}

/**
 * Produces a stable, validated scenery plan. Large pieces are claimed first;
 * every later piece must clear the road, rails, fixtures and earlier decor.
 */
export function buildDecorationLayout(track: TrackDefinition): DecorationPlacement[] {
  const placements: DecorationPlacement[] = [];
  const occupied: OccupiedCircle[] = [];

  for (let checkpoint = 0; checkpoint < track.checkpoints.length; checkpoint++) {
    const angle = checkpoint / track.checkpoints.length * TAU;
    for (const side of [-1, 1]) {
      const post = sampleTrack(track, angle, side * TRACK_VISUAL_LAYOUT.checkpointOffset);
      occupied.push({ x: post.x, z: post.z, radius: checkpoint === 0 ? 1.8 : 1.25 });
    }
  }
  for (const obstacle of track.obstacles) occupied.push({ x: obstacle.x, z: obstacle.z, radius: 1.5 });

  const isClear = (candidate: Candidate) => {
    const edgeX = TRACK_VISUAL_LAYOUT.meadowWidth / 2 - 2;
    const edgeZ = TRACK_VISUAL_LAYOUT.meadowDepth / 2 - 2;
    if (Math.abs(candidate.x) + candidate.radius > edgeX || Math.abs(candidate.z) + candidate.radius > edgeZ) return false;
    const roadClearance = Math.max(
      TRACK_VISUAL_LAYOUT.cutoutHalfWidth + candidate.radius + TRACK_VISUAL_LAYOUT.roadDecorationGap,
      TRACK_VISUAL_LAYOUT.railOffset + candidate.radius + 0.95,
    );
    if (distanceFromRoad(track, candidate) < roadClearance) return false;
    return occupied.every(item => Math.hypot(candidate.x - item.x, candidate.z - item.z)
      >= candidate.radius + item.radius + TRACK_VISUAL_LAYOUT.decorationGap);
  };

  const fill = (kind: DecorationKind, target: number, candidates: readonly Candidate[]) => {
    for (const candidate of candidates) {
      if (placements.filter(item => item.kind === kind).length >= target) break;
      if (!isClear(candidate)) continue;
      const placement: DecorationPlacement = {
        ...candidate,
        id: `${kind}-${placements.length}`,
        kind,
      };
      placements.push(placement);
      occupied.push(placement);
    }
  };

  fill('pond', 1, [
    { x: 5, z: -13, radius: 6.2, rotation: -0.18, variant: 0 },
    { x: -4, z: -12, radius: 6.2, rotation: 0.12, variant: 1 },
  ]);
  fill('house', 2, [
    { x: -25, z: -8, radius: 4.2, rotation: 0.35, variant: 0 },
    { x: 25, z: 6, radius: 4.2, rotation: -0.55, variant: 1 },
    { x: -18, z: 7, radius: 4.2, rotation: 1.2, variant: 2 },
    { x: 23, z: -12, radius: 4.2, rotation: -0.3, variant: 3 },
  ]);
  fill('sign', 6, tracksideCandidates(track, 32, () => 1.45, 0.035));
  fill('tree', 14, tracksideCandidates(track, 72, index => 2.35 + index % 3 * 0.18, 0.012));
  fill('flower', 10, tracksideCandidates(track, 96, () => 0.55, 0.006));
  return placements;
}
