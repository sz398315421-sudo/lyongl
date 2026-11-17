import { describe, expect, it } from 'vitest';
import { createTrack, distanceFromRoad, sampleTrack } from '../../game-core/track';
import {
  buildDecorationLayout,
  buildRoadSamples,
  buildRoadStripGeometry,
  TRACK_VISUAL_LAYOUT,
} from '../../client/game/track-layout';

interface Point { x: number; z: number }

function turnDifference(a: number, b: number): number {
  return ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < -1e-8 && cdA * cdB < -1e-8;
}

describe('redrawn circuit geometry', () => {
  const track = createTrack();
  const samples = buildRoadSamples(track);

  it('is closed, distance-uniform and has safe separation between remote sections', () => {
    const start = sampleTrack(track, 0);
    const finish = sampleTrack(track, Math.PI * 2);
    expect(Math.hypot(start.x - finish.x, start.z - finish.z)).toBeLessThan(0.001);

    const lengths = samples.map((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      return Math.hypot(next.x - sample.x, next.z - sample.z);
    });
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.08);

    let minimumRemoteDistance = Number.POSITIVE_INFINITY;
    for (let a = 0; a < samples.length; a++) {
      for (let b = a + 1; b < samples.length; b++) {
        const indexDistance = Math.min(b - a, samples.length - (b - a));
        if (indexDistance < 34) continue;
        minimumRemoteDistance = Math.min(minimumRemoteDistance, Math.hypot(samples[a].x - samples[b].x, samples[a].z - samples[b].z));
      }
    }
    expect(minimumRemoteDistance).toBeGreaterThan(18);
  });

  it('keeps curvature wider than the paper cutout and never flips the road mesh', () => {
    let minimumRadius = Number.POSITIVE_INFINITY;
    for (let index = 0; index < samples.length; index++) {
      const previous = samples[(index + samples.length - 1) % samples.length];
      const current = samples[index];
      const next = samples[(index + 1) % samples.length];
      const arc = Math.hypot(current.x - previous.x, current.z - previous.z)
        + Math.hypot(next.x - current.x, next.z - current.z);
      const turn = Math.abs(turnDifference(next.heading, previous.heading));
      if (turn > 0.0001) minimumRadius = Math.min(minimumRadius, arc / turn);
    }
    expect(minimumRadius).toBeGreaterThan(7.5);

    const geometry = buildRoadStripGeometry(
      samples,
      -TRACK_VISUAL_LAYOUT.cutoutHalfWidth,
      TRACK_VISUAL_LAYOUT.cutoutHalfWidth,
      0,
    );
    for (let index = 0; index < geometry.indices.length; index += 3) {
      const ia = geometry.indices[index] * 3;
      const ib = geometry.indices[index + 1] * 3;
      const ic = geometry.indices[index + 2] * 3;
      const ax = geometry.positions[ia], az = geometry.positions[ia + 2];
      const bx = geometry.positions[ib], bz = geometry.positions[ib + 2];
      const cx = geometry.positions[ic], cz = geometry.positions[ic + 2];
      const upFacingArea = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      expect(upFacingArea).toBeGreaterThan(0.001);
    }
  });

  it('has no self-intersections on either paper edge or among guardrails', () => {
    for (const offset of [-TRACK_VISUAL_LAYOUT.cutoutHalfWidth, TRACK_VISUAL_LAYOUT.cutoutHalfWidth]) {
      const edge = samples.map(sample => ({
        x: sample.x + sample.normalX * offset,
        z: sample.z + sample.normalZ * offset,
      }));
      for (let a = 0; a < edge.length; a++) {
        for (let b = a + 2; b < edge.length; b++) {
          if (a === 0 && b === edge.length - 1) continue;
          expect(segmentsCross(edge[a], edge[(a + 1) % edge.length], edge[b], edge[(b + 1) % edge.length])).toBe(false);
        }
      }
    }
    for (let a = 0; a < track.walls.length; a++) {
      for (let b = a + 1; b < track.walls.length; b++) {
        expect(segmentsCross(track.walls[a].a, track.walls[a].b, track.walls[b].a, track.walls[b].b)).toBe(false);
      }
    }
  });
});

describe('validated scenery placement', () => {
  const track = createTrack();
  const placements = buildDecorationLayout(track);

  it('creates the balanced decoration set', () => {
    const count = (kind: typeof placements[number]['kind']) => placements.filter(item => item.kind === kind).length;
    expect(count('tree')).toBe(14);
    expect(count('house')).toBe(2);
    expect(count('pond')).toBe(1);
    expect(count('sign')).toBe(6);
    expect(count('flower')).toBe(10);
  });

  it('keeps every decoration inside the tray and clear of road, rails and peers', () => {
    for (const placement of placements) {
      expect(Math.abs(placement.x) + placement.radius).toBeLessThanOrEqual(TRACK_VISUAL_LAYOUT.meadowWidth / 2 - 2);
      expect(Math.abs(placement.z) + placement.radius).toBeLessThanOrEqual(TRACK_VISUAL_LAYOUT.meadowDepth / 2 - 2);
      const roadClearance = Math.max(
        TRACK_VISUAL_LAYOUT.cutoutHalfWidth + placement.radius + TRACK_VISUAL_LAYOUT.roadDecorationGap,
        TRACK_VISUAL_LAYOUT.railOffset + placement.radius + 0.95,
      );
      expect(distanceFromRoad(track, placement)).toBeGreaterThanOrEqual(roadClearance - 0.02);
    }
    for (let a = 0; a < placements.length; a++) {
      for (let b = a + 1; b < placements.length; b++) {
        const distance = Math.hypot(placements[a].x - placements[b].x, placements[a].z - placements[b].z);
        expect(distance).toBeGreaterThanOrEqual(
          placements[a].radius + placements[b].radius + TRACK_VISUAL_LAYOUT.decorationGap - 0.001,
        );
      }
    }
  });
});
