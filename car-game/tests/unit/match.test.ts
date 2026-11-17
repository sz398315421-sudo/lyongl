import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT } from '../../game-core/config';
import { createMatch, playerRacer, rankRacers, stepMatch } from '../../game-core/match';
import { angleDifference, clamp } from '../../game-core/math';
import { createTrack, findNearestTrackAngle, sampleTrack } from '../../game-core/track';

function playerPilot(match: ReturnType<typeof createMatch>, track: ReturnType<typeof createTrack>) {
  const kart = playerRacer(match).kart;
  const angle = findNearestTrackAngle(track, kart);
  const target = sampleTrack(track, angle + 0.23);
  const error = angleDifference(Math.atan2(target.x - kart.x, target.z - kart.z), kart.heading);
  return { ...EMPTY_INPUT, throttle: kart.speed < 17 ? 1 : 0, steer: clamp(-error * 2.6, -1, 1) };
}

describe('Stage 02 single-player match', () => {
  it('creates one player and five AI racers with stable starting slots', () => {
    const track = createTrack();
    const match = createMatch(track, 'default', 'racing');
    expect(match.racers).toHaveLength(6);
    expect(match.racers.filter(racer => racer.kind === 'ai')).toHaveLength(5);
    expect(new Set(match.racers.map(racer => `${racer.kart.x}:${racer.kart.z}`)).size).toBe(6);
    expect(match.racers.filter(racer => racer.difficulty === 'easy')).toHaveLength(1);
    expect(match.racers.filter(racer => racer.difficulty === 'normal')).toHaveLength(2);
    expect(match.racers.filter(racer => racer.difficulty === 'hard')).toHaveLength(2);
  });

  it('lets the player and every AI finish the three-lap match', () => {
    const track = createTrack();
    const match = createMatch(track, 'default', 'racing');
    for (let frame = 0; frame < 24000 && match.phase !== 'finished'; frame++) {
      stepMatch(match, playerPilot(match, track), track);
    }
    expect(match.phase).toBe('finished');
    expect(match.racers.every(racer => racer.race.completedLaps === 3)).toBe(true);
    expect(match.results).toHaveLength(6);
    expect(match.results.map(result => result.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ranks by ordered checkpoint progress and applies shield, slow, glue and spring effects', () => {
    const track = createTrack();
    const match = createMatch(track, 'default', 'racing');
    const player = playerRacer(match);
    player.item = 'cardboard-shield';
    stepMatch(match, { ...EMPTY_INPUT, useItem: true }, track);
    expect(player.shieldActive).toBe(true);
    player.item = 'paper-plane';
    const target = rankRacers(match, track).find(racer => racer.id !== player.id)!;
    target.shieldActive = true;
    stepMatch(match, { ...EMPTY_INPUT, useItem: true }, track);
    expect(target.shieldActive).toBe(false);
    expect(target.slowRemaining).toBe(0);
    player.item = 'paper-plane';
    target.shieldActive = false;
    stepMatch(match, { ...EMPTY_INPUT, useItem: true }, track);
    expect(match.racers.some(racer => racer.slowRemaining > 0)).toBe(true);
    player.item = 'glue';
    stepMatch(match, { ...EMPTY_INPUT, useItem: true }, track);
    expect(match.glueTraps).toHaveLength(1);
    const trap = match.glueTraps[0];
    target.kart.x = trap.x;
    target.kart.z = trap.z;
    target.shieldActive = false;
    stepMatch(match, EMPTY_INPUT, track);
    expect(target.slowRemaining).toBeGreaterThan(0);
    player.item = 'spring';
    const speedBefore = player.kart.speed;
    stepMatch(match, { ...EMPTY_INPUT, useItem: true }, track);
    expect(player.kart.boostRemaining).toBeGreaterThan(0);
    expect(player.kart.speed).toBeGreaterThan(speedBefore);
    expect(rankRacers(match, track)).toHaveLength(6);
  });
});
