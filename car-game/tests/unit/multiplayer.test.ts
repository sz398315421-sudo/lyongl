import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT } from '../../game-core/config';
import { createRosterMatch, stepMatchWithInputs } from '../../game-core/match';
import { angleDifference, clamp } from '../../game-core/math';
import { createTrack, findNearestTrackAngle, sampleTrack } from '../../game-core/track';
import { normalizeAvatar, normalizeNickname } from '../../server/PaperKartRoom';
import { syncRoomMatch } from '../../server/state-sync';
import { PaperKartRoomState } from '../../shared/network-schema';
import type { RacerState, TrackDefinition } from '../../shared/types';

function pilot(racer: RacerState, track: TrackDefinition) {
  const angle = findNearestTrackAngle(track, racer.kart);
  const target = sampleTrack(track, angle + .23);
  const error = angleDifference(Math.atan2(target.x - racer.kart.x, target.z - racer.kart.z), racer.kart.heading);
  return { ...EMPTY_INPUT, throttle: racer.kart.speed < 17 ? 1 : 0, steer: clamp(-error * 2.6, -1, 1) };
}

describe('Stage 03 authoritative multiplayer core', () => {
  it('creates human racers first and fills every remaining slot with AI', () => {
    const track = createTrack();
    const match = createRosterMatch(track, [
      { id: 'host', name: '小红', avatar: 'default' },
      { id: 'guest', name: '小蓝', avatar: 'default' },
    ]);
    expect(match.racers).toHaveLength(6);
    expect(match.racers.slice(0, 2).map(racer => racer.id)).toEqual(['host', 'guest']);
    expect(match.racers.slice(0, 2).every(racer => racer.kind === 'player')).toBe(true);
    expect(match.racers.slice(2).every(racer => racer.kind === 'ai')).toBe(true);
    expect(new Set(match.racers.map(racer => `${racer.kart.x}:${racer.kart.z}`)).size).toBe(6);
  });

  it('applies each human input independently while the server advances AI', () => {
    const track = createTrack();
    const match = createRosterMatch(track, [
      { id: 'host', name: '小红', avatar: 'default' },
      { id: 'guest', name: '小蓝', avatar: 'default' },
    ]);
    for (let frame = 0; frame < 90; frame++) {
      stepMatchWithInputs(match, new Map([
        ['host', { ...EMPTY_INPUT, throttle: 1, steer: .35 }],
        ['guest', { ...EMPTY_INPUT, brake: 1 }],
      ]), track);
    }
    expect(match.racers.find(racer => racer.id === 'host')!.kart.speed).toBeGreaterThan(5);
    expect(match.racers.find(racer => racer.id === 'guest')!.kart.speed).toBeLessThan(0);
    expect(match.racers.filter(racer => racer.kind === 'ai').some(racer => racer.kart.speed > 5)).toBe(true);
  });

  it('sanitizes lobby identity data without introducing persistence', () => {
    expect(normalizeNickname('  纸片   车手  ')).toBe('纸片 车手');
    expect(normalizeNickname('')).toBe('纸片车手');
    expect(normalizeNickname('123456789012345')).toHaveLength(12);
    expect(normalizeAvatar('https://example.com/avatar.png?v=2')).toBe('https://example.com/avatar.png?v=2');
    expect(normalizeAvatar('http://example.com/avatar.png')).toBe('default');
    expect(normalizeAvatar('data:image/png;base64,AA==')).toBe('data:image/png;base64,AA==');
  });

  it('publishes authoritative three-lap results through the room schema', () => {
    const track = createTrack();
    const match = createRosterMatch(track, [
      { id: 'host', name: '小红', avatar: 'default' },
      { id: 'guest', name: '小蓝', avatar: 'default' },
    ]);
    for (let frame = 0; frame < 24_000 && match.phase !== 'finished'; frame++) {
      stepMatchWithInputs(match, new Map(match.racers
        .filter(racer => racer.kind === 'player')
        .map(racer => [racer.id, pilot(racer, track)])), track);
    }
    const network = new PaperKartRoomState();
    syncRoomMatch(network, match, track);
    expect(network.phase).toBe('finished');
    expect(network.racers.size).toBe(6);
    expect(network.results).toHaveLength(6);
    expect(Array.from(network.results).map(result => result.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
