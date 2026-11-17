import type { MatchState, RacerState } from '../shared/types.ts';
import {
  NetworkGlueTrapSchema,
  NetworkRaceResultSchema,
  NetworkRacerSchema,
  type PaperKartRoomState,
} from '../shared/network-schema.ts';
import { rankRacers } from '../game-core/match.ts';
import type { TrackDefinition } from '../shared/types.ts';

function syncRacer(target: NetworkRacerSchema, source: RacerState, slot: number, rank: number, connected: boolean) {
  target.id = source.id;
  target.name = source.name;
  target.kind = source.kind;
  target.difficulty = source.difficulty ?? 'normal';
  target.color = source.color;
  target.avatar = source.avatar;
  target.connected = connected;
  target.slot = slot;
  target.rank = rank;
  target.x = source.kart.x;
  target.z = source.kart.z;
  target.heading = source.kart.heading;
  target.steering = source.kart.steering;
  target.yawRate = source.kart.yawRate;
  target.driftDirection = source.kart.driftDirection;
  target.slipAngle = source.kart.slipAngle;
  target.velocityX = source.kart.velocity.x;
  target.velocityZ = source.kart.velocity.z;
  target.speed = source.kart.speed;
  target.driftHeld = source.kart.driftHeld;
  target.drifting = source.kart.drifting;
  target.driftCharge = source.kart.driftCharge;
  target.boostRemaining = source.kart.boostRemaining;
  target.offTrackTime = source.kart.offTrackTime;
  target.resetCount = source.kart.resetCount;
  target.collisionCount = source.kart.collisionCount;
  target.racePhase = source.race.phase;
  target.completedLaps = source.race.completedLaps;
  target.totalLaps = source.race.totalLaps;
  target.nextCheckpoint = source.race.nextCheckpoint;
  target.lastCheckpoint = source.race.lastCheckpoint;
  target.raceElapsed = source.race.elapsed;
  target.item = source.item ?? '';
  target.slowRemaining = source.slowRemaining;
  target.stuckTime = source.stuckTime;
  target.shieldActive = source.shieldActive;
  target.finishTime = source.finishTime ?? -1;
  target.finishPosition = source.finishPosition ?? -1;
}

export function syncRoomMatch(state: PaperKartRoomState, match: MatchState, track: TrackDefinition) {
  state.phase = match.phase;
  state.elapsed = match.elapsed;
  state.serverTick++;

  const ranked = rankRacers(match, track);
  const ranks = new Map(ranked.map((racer, index) => [racer.id, index + 1]));
  const activeRacers = new Set<string>();
  match.racers.forEach((racer, slot) => {
    activeRacers.add(racer.id);
    let target = state.racers.get(racer.id);
    if (!target) {
      target = new NetworkRacerSchema();
      state.racers.set(racer.id, target);
    }
    const lobbyPlayer = state.players.get(racer.id);
    syncRacer(target, racer, slot, ranks.get(racer.id) ?? slot + 1, lobbyPlayer?.connected ?? true);
  });
  for (const id of Array.from(state.racers.keys())) {
    if (!activeRacers.has(id)) state.racers.delete(id);
  }

  while (state.itemBoxCooldowns.length < match.itemBoxCooldowns.length) state.itemBoxCooldowns.push(0);
  while (state.itemBoxCooldowns.length > match.itemBoxCooldowns.length) state.itemBoxCooldowns.pop();
  match.itemBoxCooldowns.forEach((cooldown, index) => { state.itemBoxCooldowns[index] = cooldown; });

  const activeTraps = new Set<string>();
  for (const trap of match.glueTraps) {
    const key = String(trap.id);
    activeTraps.add(key);
    let target = state.glueTraps.get(key);
    if (!target) {
      target = new NetworkGlueTrapSchema();
      state.glueTraps.set(key, target);
    }
    target.id = trap.id;
    target.ownerId = trap.ownerId;
    target.x = trap.x;
    target.z = trap.z;
    target.heading = trap.heading;
    target.remaining = trap.remaining;
  }
  for (const id of Array.from(state.glueTraps.keys())) {
    if (!activeTraps.has(id)) state.glueTraps.delete(id);
  }

  if (match.phase !== 'finished') {
    if (state.results.length) state.results.clear();
    return;
  }
  if (state.results.length === match.results.length) return;
  state.results.clear();
  for (const result of match.results) {
    state.results.push(new NetworkRaceResultSchema({
      id: result.id,
      name: result.name,
      kind: result.kind,
      position: result.position,
      time: result.time ?? -1,
      avatar: result.avatar,
      color: result.color,
    }));
  }
}
