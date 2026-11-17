import { describe, expect, it } from 'vitest';
import { createGame, resetKart, stepGame } from '../../game-core/simulation';
import { createTrack, sampleTrack, distanceFromRoad, findNearestTrackAngle } from '../../game-core/track';
import { EMPTY_INPUT, KART } from '../../game-core/config';
import { clamp, angleDifference } from '../../game-core/math';
import { crossedGate, updateRace } from '../../game-core/race';
import { resolveCollisions } from '../../game-core/collision';
import type { KartInput, RaceState, TrackDefinition } from '../../shared/types';

function sandbox(): TrackDefinition {
  return { ...createTrack(), walls: [], obstacles: [], halfWidth: 100 };
}

describe('Arcade movement', () => {
  it('accelerates, coasts and brakes to a stop', () => {
    const track = sandbox(), game = createGame(track, 'racing');
    for (let i = 0; i < 60; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(game.kart.speed).toBeGreaterThan(10);
    expect(game.kart.z).toBeGreaterThan(track.spawn.z);
    const speed = game.kart.speed;
    for (let i = 0; i < 30; i++) stepGame(game, EMPTY_INPUT, track);
    expect(game.kart.speed).toBeLessThan(speed);
    for (let i = 0; i < 60 && game.kart.speed > 0; i++) stepGame(game, { ...EMPTY_INPUT, brake: 1 }, track);
    expect(game.kart.speed).toBe(0);
  });

  it('reverses with S after stopping and releases reverse with W', () => {
    const track = sandbox(), game = createGame(track, 'racing');
    for (let i = 0; i < 20; i++) stepGame(game, { ...EMPTY_INPUT, brake: 1 }, track);
    expect(game.kart.speed).toBeLessThan(0);
    const z = game.kart.z;
    for (let i = 0; i < 12; i++) stepGame(game, { ...EMPTY_INPUT, brake: 1 }, track);
    expect(game.kart.z).toBeLessThan(z);
    for (let i = 0; i < 30; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(game.kart.speed).toBeGreaterThanOrEqual(0);
  });

  it('steers while moving but does not rotate at a standstill', () => {
    const track = sandbox(), game = createGame(track, 'racing');
    stepGame(game, { ...EMPTY_INPUT, steer: -1 }, track);
    expect(game.kart.heading).toBe(0);
    for (let i = 0; i < 45; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer: -1 }, track);
    expect(game.kart.heading).toBeGreaterThan(0.2);
    expect(game.kart.x).toBeGreaterThan(track.spawn.x);
  });

  it('charges a drift and releases a finite boost', () => {
    const track = sandbox(), game = createGame(track, 'racing');
    game.kart.speed = 15;
    game.kart.velocity.z = 15;
    for (let i = 0; i < 61; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer: -0.4, drift: true }, track);
    expect(game.kart.driftCharge).toBe(KART.driftChargeTime);
    stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(game.kart.boostRemaining).toBeGreaterThan(0);
    for (let i = 0; i < 80; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(game.kart.boostRemaining).toBe(0);
  });

  it('does not give a boost for a short or stationary drift', () => {
    const track = sandbox(), game = createGame(track, 'racing');
    for (let i = 0; i < 15; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer: 1, drift: true }, track);
    stepGame(game, EMPTY_INPUT, track);
    expect(game.kart.boostRemaining).toBe(0);
  });

  it('replays identical inputs deterministically', () => {
    const track = createTrack(), a = createGame(track, 'racing'), b = createGame(track, 'racing');
    for (let i = 0; i < 1000; i++) {
      const input = { ...EMPTY_INPUT, throttle: 1, steer: Math.sin(i / 50), reset: i === 600 };
      stepGame(a, input, track);
      stepGame(b, input, track);
    }
    expect(a).toEqual(b);
  });
});

describe('Track and recovery', () => {
  it('measures the ribbon consistently with its generated samples', () => {
    const track = createTrack();
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      expect(distanceFromRoad(track, sampleTrack(track, a))).toBeCloseTo(0, 4);
      const shoulderDistance = distanceFromRoad(track, sampleTrack(track, a, 5));
      // Tight Bézier corners find the true nearest point slightly inside the
      // authored normal, so assert the expected road-width band instead of an
      // oval-only exact distance.
      expect(shoulderDistance).toBeGreaterThan(4);
      expect(shoulderDistance).toBeLessThan(5.5);
    }
  });

  it('slows on the shoulder and automatically returns after sustained runoff', () => {
    const track = createTrack(), game = createGame(track, 'racing');
    game.kart.x = track.radiusX + track.halfWidth + 1;
    game.kart.speed = 25;
    game.kart.velocity.z = 25;
    stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(game.kart.speed).toBeLessThan(25);
    game.kart.x = 200;
    game.kart.speed = 0;
    game.kart.velocity = { x: 0, z: 0 };
    for (let i = 0; i < 90; i++) stepGame(game, EMPTY_INPUT, track);
    expect(game.kart.resetCount).toBe(1);
    expect(game.kart.x).toBe(track.spawn.x);
    expect(game.kart.speed).toBe(0);
  });

  it('resets to the last checkpoint without changing race progress', () => {
    const track = createTrack(), game = createGame(track, 'racing');
    game.race.lastCheckpoint = 4;
    game.race.nextCheckpoint = 5;
    game.kart.driftCharge = 0.8;
    game.kart.boostRemaining = 0.5;
    const race = { ...game.race };
    resetKart(game, track);
    expect(game.race).toEqual(race);
    expect(game.kart.x).toBe(track.checkpoints[4].x);
    expect(game.kart.z).toBe(track.checkpoints[4].z);
    expect(game.kart.speed + game.kart.driftCharge + game.kart.boostRemaining).toBe(0);
  });

  it('pushes a moving kart away from a rail and removes inward velocity', () => {
    const track = sandbox(), game = createGame(track, 'racing');
    track.walls = [{ a: { x: 0, z: -5 }, b: { x: 0, z: 5 } }];
    Object.assign(game.kart, { x: -0.5, z: 0, velocity: { x: 15, z: 3 }, speed: 16 });
    resolveCollisions(game.kart, track);
    expect(game.kart.x).toBeLessThan(-KART.radius);
    expect(game.kart.velocity.x).toBe(0);
    expect(game.kart.speed).toBeLessThan(16);
    expect(game.kart.collisionCount).toBe(1);
  });

  it('resolves a kart inside a rectangular obstacle', () => {
    const track = sandbox(), game = createGame(track, 'racing');
    track.obstacles = [{ x: 0, z: 0, halfX: 1, halfZ: 1 }];
    Object.assign(game.kart, { x: 0, z: 0 });
    resolveCollisions(game.kart, track);
    expect(Math.hypot(game.kart.x, game.kart.z)).toBeGreaterThan(1 + KART.radius);
  });
});

describe('Checkpoints and the three-lap race', () => {
  const track = createTrack();
  const cross = (race: RaceState, index: number, direction = 1) => {
    const gate = track.checkpoints[index];
    const dx = Math.sin(gate.heading) * direction, dz = Math.cos(gate.heading) * direction;
    updateRace(race, { x: gate.x - dx, z: gate.z - dz }, { x: gate.x + dx, z: gate.z + dz }, track);
  };

  it('rejects reverse crossings and crossings outside the gate width', () => {
    const gate = { x: 0, z: 0, heading: 0, halfWidth: 6 };
    expect(crossedGate({ x: 0, z: 1 }, { x: 0, z: -1 }, gate)).toBe(false);
    expect(crossedGate({ x: 7, z: -1 }, { x: 7, z: 1 }, gate)).toBe(false);
  });

  it('does not count the starting line or skip checkpoints', () => {
    const { race } = createGame(track, 'racing');
    cross(race, 0);
    cross(race, 3);
    cross(race, 1, -1);
    expect(race.completedLaps).toBe(0);
    expect(race.nextCheckpoint).toBe(1);
  });

  it('finishes exactly three ordered laps and freezes progress afterwards', () => {
    const { race } = createGame(track, 'racing');
    for (let lap = 0; lap < 3; lap++) {
      for (let i = 1; i <= 8; i++) cross(race, i % 8);
      expect(race.completedLaps).toBe(lap + 1);
    }
    expect(race.phase).toBe('finished');
    cross(race, 1);
    expect(race.nextCheckpoint).toBe(1);
  });

  it('can drive the real track for three laps using only control inputs', () => {
    const game = createGame(track, 'racing');
    // Test driver only: no AI runtime, teleports or direct lap writes.
    for (let i = 0; i < 12000 && game.race.phase === 'racing'; i++) {
      const kart = game.kart;
      const angle = findNearestTrackAngle(track, kart);
      const target = sampleTrack(track, angle + 0.23);
      const error = angleDifference(Math.atan2(target.x - kart.x, target.z - kart.z), kart.heading);
      const input: KartInput = {
        ...EMPTY_INPUT, throttle: kart.speed < 17 ? 1 : 0,
        steer: clamp(-error * 2.6, -1, 1),
      };
      stepGame(game, input, track);
    }
    expect(game.race.phase).toBe('finished');
    expect(game.race.completedLaps).toBe(3);
    expect(game.kart.resetCount).toBe(0);
    expect(game.kart.collisionCount).toBe(0);
  });
});
