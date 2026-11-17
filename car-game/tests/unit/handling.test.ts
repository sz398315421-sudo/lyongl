import { describe, expect, it } from 'vitest';
import { createGame, stepGame } from '../../game-core/simulation';
import { createTrack } from '../../game-core/track';
import { KART, EMPTY_INPUT } from '../../game-core/config';

const track = { ...createTrack(), walls: [], obstacles: [], halfWidth: 500 };

describe('Player-relative steering and controllable kart handling', () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const steer of [-1, 1]) {
      it(`turns ${steer < 0 ? 'left' : 'right'} relative to a chase camera at heading ${heading}`, () => {
        const game = createGame(track, 'racing');
        const start = { x: game.kart.x, z: game.kart.z };
        game.kart.heading = heading;
        game.kart.speed = 14;
        game.kart.velocity = { x: Math.sin(heading) * 14, z: Math.cos(heading) * 14 };
        for (let i = 0; i < 30; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer }, track);
        const cameraRight = { x: -Math.cos(heading), z: Math.sin(heading) };
        const screenDirection = (game.kart.x - start.x) * cameraRight.x + (game.kart.z - start.z) * cameraRight.z;
        expect(Math.sign(screenDirection)).toBe(steer);
      });
    }
  }

  it('eases into steering and rapidly centres it on release', () => {
    const game = createGame(track, 'racing');
    game.kart.speed = 20;
    stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer: 1 }, track);
    expect(game.kart.steering).toBeGreaterThan(0);
    expect(game.kart.steering).toBeLessThan(0.2);
    for (let i = 0; i < 30; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer: 1 }, track);
    expect(game.kart.steering).toBeGreaterThan(0.95);
    for (let i = 0; i < 30; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(Math.abs(game.kart.steering)).toBeLessThan(0.01);
    expect(Math.abs(game.kart.yawRate)).toBeLessThan(0.04);
  });

  it('has a stable terminal speed without per-frame oscillation', () => {
    const game = createGame(track, 'racing');
    for (let i = 0; i < 180; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(game.kart.speed).toBe(KART.maxSpeed);
    for (let i = 0; i < 60; i++) {
      stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
      expect(game.kart.speed).toBe(KART.maxSpeed);
    }
  });

  it('holds drift direction while countersteering and regains grip after release', () => {
    const game = createGame(track, 'racing');
    game.kart.speed = 18;
    for (let i = 0; i < 40; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer: 1, drift: true }, track);
    for (let i = 0; i < 30; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1, steer: -0.3, drift: true }, track);
    expect(game.kart.drifting).toBe(true);
    expect(game.kart.driftDirection).toBe(1);
    expect(game.kart.driftCharge).toBe(KART.driftChargeTime);
    stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(game.kart.boostRemaining).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) stepGame(game, { ...EMPTY_INPUT, throttle: 1 }, track);
    expect(Math.abs(game.kart.slipAngle)).toBeLessThan(0.01);
  });

  it('lets braking take priority over boost', () => {
    const game = createGame(track, 'racing');
    game.kart.speed = 35;
    game.kart.boostRemaining = 1;
    for (let i = 0; i < 30; i++) stepGame(game, { ...EMPTY_INPUT, brake: 1 }, track);
    expect(game.kart.boostRemaining).toBe(0);
    expect(game.kart.speed).toBeLessThan(20);
  });
});
