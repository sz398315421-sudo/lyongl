import type { Checkpoint, RaceState, TrackDefinition, Vec2 } from '../shared/types';

export function crossedGate(from: Vec2, to: Vec2, gate: Checkpoint): boolean {
  const fx = Math.sin(gate.heading), fz = Math.cos(gate.heading);
  const before = (from.x - gate.x) * fx + (from.z - gate.z) * fz;
  const after = (to.x - gate.x) * fx + (to.z - gate.z) * fz;
  if (before >= 0 || after < 0) return false;
  const t = -before / (after - before);
  const x = from.x + (to.x - from.x) * t - gate.x;
  const z = from.z + (to.z - from.z) * t - gate.z;
  return Math.abs(x * fz - z * fx) <= gate.halfWidth;
}

export function updateRace(race: RaceState, from: Vec2, to: Vec2, track: TrackDefinition): void {
  if (race.phase !== 'racing') return;
  const next = race.nextCheckpoint;
  if (!crossedGate(from, to, track.checkpoints[next])) return;
  race.lastCheckpoint = next;
  race.nextCheckpoint = (next + 1) % track.checkpoints.length;
  if (next === 0) {
    race.completedLaps++;
    if (race.completedLaps === race.totalLaps) race.phase = 'finished';
  }
}
