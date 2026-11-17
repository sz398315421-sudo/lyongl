import type {
  GameState,
  HumanRacerProfile,
  ItemKind,
  KartInput,
  MatchState,
  RaceResult,
  RacerState,
  TrackDefinition,
} from '../shared/types';
import { aiAvatarLabel, aiColors, aiDifficulties, aiInput, aiNames } from './ai';
import { EMPTY_INPUT, KART } from './config';
import { clamp } from './math';
import { createKart, resetKart, stepGame } from './simulation';
import { findNearestTrackAngle } from './track';

const TAU = Math.PI * 2;
const ITEM_KINDS: ItemKind[] = ['paper-plane', 'glue', 'cardboard-shield', 'spring'];
const PLAYER_COLOR = '#eb7156';
const HUMAN_COLORS = ['#eb7156', '#5baec2', '#70a972', '#e3b849', '#ad7db8', '#e38b62'];
const ITEM_PICKUP_RADIUS = 2.2;
const GLUE_RADIUS = 1.35;

function racerRace(phase: MatchState['phase']): RacerState['race'] {
  return {
    phase: phase === 'menu' ? 'menu' : 'racing',
    completedLaps: 0,
    totalLaps: 3,
    nextCheckpoint: 1,
    lastCheckpoint: -1,
    elapsed: 0,
  };
}

function createRacer(
  track: TrackDefinition,
  id: string,
  kind: RacerState['kind'],
  name: string,
  color: string,
  avatar: string,
  phase: MatchState['phase'],
  difficulty?: RacerState['difficulty'],
  slot = 0,
): RacerState {
  const kart = createKart(track);
  if (slot > 0) {
    const row = Math.floor((slot - 1) / 2);
    const lateral = slot % 2 === 0 ? 1.8 : -1.8;
    const sample = { x: track.spawn.x, z: track.spawn.z, heading: track.spawn.heading };
    // The start straight is nearly vertical; keeping the stagger close to the
    // authored spawn avoids accidentally crossing the finish line at launch.
    sample.x += lateral;
    sample.z -= row * 2.0 + (slot % 2 === 0 ? 0.4 : 0);
    kart.x = sample.x;
    kart.z = sample.z;
    kart.heading = sample.heading;
  }
  return {
    id, name, kind, difficulty, color, avatar, kart, race: racerRace(phase),
    item: null, slowRemaining: 0, stuckTime: 0, shieldActive: false, finishTime: null, finishPosition: null,
  };
}

export function createMatch(track: TrackDefinition, playerAvatar = 'default', phase: MatchState['phase'] = 'menu'): MatchState {
  const names = aiNames();
  const difficulties = aiDifficulties();
  const colors = aiColors();
  const racers: RacerState[] = [createRacer(track, 'player', 'player', '你', PLAYER_COLOR, playerAvatar, phase)];
  for (let i = 0; i < 5; i++) {
    racers.push(createRacer(track, 'ai-' + i, 'ai', names[i], colors[i], aiAvatarLabel(i), phase, difficulties[i], i + 1));
  }
  return {
    phase,
    elapsed: 0,
    racers,
    itemBoxCooldowns: track.itemBoxes.map(() => 0),
    glueTraps: [],
    results: [],
    nextTrapId: 1,
    randomSeed: 0x2f4a7c15,
  };
}

/** Creates the authoritative six-kart roster used by multiplayer rooms. */
export function createRosterMatch(
  track: TrackDefinition,
  profiles: readonly HumanRacerProfile[],
  phase: MatchState['phase'] = 'racing',
): MatchState {
  const humans = profiles.slice(0, 6);
  const names = aiNames();
  const difficulties = aiDifficulties();
  const colors = aiColors();
  const racers = humans.map((profile, slot) => createRacer(
    track,
    profile.id,
    'player',
    profile.name,
    profile.color ?? HUMAN_COLORS[slot % HUMAN_COLORS.length],
    profile.avatar || 'default',
    phase,
    undefined,
    slot,
  ));
  for (let slot = humans.length; slot < 6; slot++) {
    const aiIndex = slot - humans.length;
    racers.push(createRacer(
      track,
      `ai-fill-${aiIndex}`,
      'ai',
      names[aiIndex % names.length],
      colors[aiIndex % colors.length],
      aiAvatarLabel(aiIndex),
      phase,
      difficulties[aiIndex % difficulties.length],
      slot,
    ));
  }
  return {
    phase,
    elapsed: 0,
    racers,
    itemBoxCooldowns: track.itemBoxes.map(() => 0),
    glueTraps: [],
    results: [],
    nextTrapId: 1,
    randomSeed: 0x2f4a7c15,
  };
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nextRandom(match: MatchState): number {
  match.randomSeed = (match.randomSeed * 1664525 + 1013904223) >>> 0;
  return match.randomSeed / 4294967296;
}

function progressFor(racer: RacerState, track: TrackDefinition): number {
  const checkpointCount = track.checkpoints.length;
  const segmentStart = racer.race.lastCheckpoint < 0 ? 0 : racer.race.lastCheckpoint;
  const segmentEnd = racer.race.nextCheckpoint;
  const startAngle = segmentStart / checkpointCount * TAU;
  let endAngle = segmentEnd / checkpointCount * TAU;
  if (endAngle <= startAngle) endAngle += TAU;
  let angle = findNearestTrackAngle(track, racer.kart);
  if (racer.race.lastCheckpoint < 0 && angle > endAngle + 0.45) angle -= TAU;
  if (angle < startAngle) angle += TAU;
  const fraction = clamp((angle - startAngle) / (endAngle - startAngle), 0, 1);
  return racer.race.completedLaps * checkpointCount + segmentStart + fraction;
}

export function rankRacers(match: MatchState, track: TrackDefinition): RacerState[] {
  return [...match.racers].sort((a, b) => {
    const progress = progressFor(b, track) - progressFor(a, track);
    if (Math.abs(progress) > 0.0001) return progress;
    if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
    return a.id.localeCompare(b.id);
  });
}

function targetAhead(match: MatchState, racer: RacerState, track: TrackDefinition): RacerState | undefined {
  const ordered = rankRacers(match, track);
  const index = ordered.findIndex(candidate => candidate.id === racer.id);
  return ordered.slice(0, Math.max(0, index)).find(candidate => candidate.id !== racer.id && candidate.race.phase !== 'finished');
}

function activateItem(match: MatchState, racer: RacerState, track: TrackDefinition): void {
  const item = racer.item;
  if (!item) return;
  racer.item = null;
  if (item === 'paper-plane') {
    const target = targetAhead(match, racer, track);
    if (!target) return;
    if (target.shieldActive) target.shieldActive = false;
    else target.slowRemaining = Math.max(target.slowRemaining, 1.65);
    return;
  }
  if (item === 'glue') {
    match.glueTraps.push({
      id: match.nextTrapId++, ownerId: racer.id,
      x: racer.kart.x - Math.sin(racer.kart.heading) * 1.65,
      z: racer.kart.z - Math.cos(racer.kart.heading) * 1.65,
      heading: racer.kart.heading,
      remaining: 12,
    });
    return;
  }
  if (item === 'cardboard-shield') {
    racer.shieldActive = true;
    return;
  }
  racer.kart.boostRemaining = Math.max(racer.kart.boostRemaining, KART.boostDuration * 1.1);
  racer.kart.speed = Math.min(KART.maxSpeed * KART.boostMultiplier, racer.kart.speed + 8);
}

function collectItems(match: MatchState, racer: RacerState, track: TrackDefinition): void {
  if (!racer.item) {
    for (let i = 0; i < track.itemBoxes.length; i++) {
      if (match.itemBoxCooldowns[i] > 0) continue;
      if (distance(racer.kart, track.itemBoxes[i]) > ITEM_PICKUP_RADIUS) continue;
      racer.item = ITEM_KINDS[Math.floor(nextRandom(match) * ITEM_KINDS.length)];
      match.itemBoxCooldowns[i] = 6;
      break;
    }
  }
}

function applyGlue(match: MatchState, racer: RacerState): void {
  for (const trap of match.glueTraps) {
    if (trap.ownerId === racer.id || distance(racer.kart, trap) > GLUE_RADIUS) continue;
    if (racer.shieldActive) racer.shieldActive = false;
    else racer.slowRemaining = Math.max(racer.slowRemaining, 1.35);
  }
}

function updateResults(match: MatchState, track: TrackDefinition): void {
  const ordered = rankRacers(match, track);
  const finished = ordered
    .filter(racer => racer.finishTime !== null)
    .sort((a, b) => (a.finishTime! - b.finishTime!) || a.id.localeCompare(b.id));
  finished.forEach((racer, index) => { racer.finishPosition = index + 1; });
  match.results = ordered.map((racer, index): RaceResult => ({
    id: racer.id, name: racer.name, kind: racer.kind, position: racer.finishPosition ?? index + 1,
    time: racer.finishTime, avatar: racer.avatar, color: racer.color,
  })).sort((a, b) => a.position - b.position);
}

function inputForRacer(
  inputs: ReadonlyMap<string, KartInput> | Readonly<Record<string, KartInput>>,
  racerId: string,
): KartInput {
  if (inputs instanceof Map) return inputs.get(racerId) ?? EMPTY_INPUT;
  return (inputs as Readonly<Record<string, KartInput>>)[racerId] ?? EMPTY_INPUT;
}

export function stepMatchWithInputs(
  match: MatchState,
  inputs: ReadonlyMap<string, KartInput> | Readonly<Record<string, KartInput>>,
  track: TrackDefinition,
  dt = KART.fixedDt,
): void {
  if (match.phase !== 'racing') return;
  match.elapsed += dt;
  for (let i = 0; i < match.itemBoxCooldowns.length; i++) match.itemBoxCooldowns[i] = Math.max(0, match.itemBoxCooldowns[i] - dt);
  match.glueTraps = match.glueTraps.filter(trap => (trap.remaining -= dt) > 0);

  for (const racer of match.racers) {
    racer.slowRemaining = Math.max(0, racer.slowRemaining - dt);
    const input = racer.kind === 'player' ? inputForRacer(inputs, racer.id) : aiInput(racer, track);
    if (input.useItem) activateItem(match, racer, track);
    const racerGame: GameState = { kart: racer.kart, race: racer.race };
    stepGame(racerGame, { ...input, useItem: false }, track, dt, racer.slowRemaining > 0 ? 0.58 : 1);
    racer.kart = racerGame.kart;
    racer.race = racerGame.race;
    if (racer.kind === 'ai' && racer.race.phase === 'racing') {
      racer.stuckTime = racer.kart.speed < 0.75 ? racer.stuckTime + dt : 0;
      if (racer.stuckTime > 0.65) {
        resetKart(racerGame, track);
        racer.kart = racerGame.kart;
        racer.stuckTime = 0;
      }
    }
    collectItems(match, racer, track);
    applyGlue(match, racer);
    if (racer.race.phase === 'finished' && racer.finishTime === null) racer.finishTime = match.elapsed;
  }

  updateResults(match, track);
  if (match.racers.every(racer => racer.race.phase === 'finished')) match.phase = 'finished';
}

export function stepMatch(match: MatchState, playerInput = EMPTY_INPUT, track: TrackDefinition, dt = KART.fixedDt): void {
  stepMatchWithInputs(match, { player: playerInput }, track, dt);
}

export function playerRacer(match: MatchState, playerId = 'player'): RacerState {
  return match.racers.find(racer => racer.id === playerId) ?? match.racers[0];
}

export function playerRank(match: MatchState, track: TrackDefinition, playerId = 'player'): number {
  return rankRacers(match, track).findIndex(racer => racer.id === playerId) + 1;
}
