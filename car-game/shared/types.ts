export interface Vec2 { x: number; z: number }

export interface KartInput {
  throttle: number;
  brake: number;
  /** Player-relative input: -1 left, +1 right. World +Z is forward at heading 0. */
  steer: number;
  drift: boolean;
  reset: boolean;
  useItem: boolean;
}

export interface KartState extends Vec2 {
  heading: number;
  steering: number;
  yawRate: number;
  driftDirection: number;
  slipAngle: number;
  driftHeld: boolean;
  velocity: Vec2;
  speed: number;
  drifting: boolean;
  driftCharge: number;
  boostRemaining: number;
  offTrackTime: number;
  resetCount: number;
  collisionCount: number;
}

export interface Checkpoint extends Vec2 {
  heading: number;
  halfWidth: number;
}

export interface Wall { a: Vec2; b: Vec2 }
export interface Obstacle extends Vec2 { halfX: number; halfZ: number }

export type ItemKind = 'paper-plane' | 'glue' | 'cardboard-shield' | 'spring';

export interface ItemBox extends Vec2 {
  id: number;
  heading: number;
}

export interface TrackDefinition {
  radiusX: number;
  radiusZ: number;
  halfWidth: number;
  shoulder: number;
  checkpoints: Checkpoint[];
  walls: Wall[];
  obstacles: Obstacle[];
  itemBoxes: ItemBox[];
  spawn: Checkpoint;
}

export interface RaceState {
  phase: 'menu' | 'racing' | 'finished';
  completedLaps: number;
  totalLaps: number;
  nextCheckpoint: number;
  lastCheckpoint: number;
  elapsed: number;
}

export interface GameState { kart: KartState; race: RaceState }

export type RacerKind = 'player' | 'ai';
export type AiDifficulty = 'easy' | 'normal' | 'hard';

export interface HumanRacerProfile {
  id: string;
  name: string;
  avatar: string;
  color?: string;
}

export interface GlueTrap extends Vec2 {
  id: number;
  ownerId: string;
  heading: number;
  remaining: number;
}

export interface RacerState {
  id: string;
  name: string;
  kind: RacerKind;
  difficulty?: AiDifficulty;
  color: string;
  avatar: string;
  kart: KartState;
  race: RaceState;
  item: ItemKind | null;
  slowRemaining: number;
  stuckTime: number;
  shieldActive: boolean;
  finishTime: number | null;
  finishPosition: number | null;
}

export interface RaceResult {
  id: string;
  name: string;
  kind: RacerKind;
  position: number;
  time: number | null;
  avatar: string;
  color: string;
}

export interface MatchState {
  phase: 'menu' | 'racing' | 'finished';
  elapsed: number;
  racers: RacerState[];
  itemBoxCooldowns: number[];
  glueTraps: GlueTrap[];
  results: RaceResult[];
  nextTrapId: number;
  randomSeed: number;
}

export interface HudSnapshot {
  phase: RaceState['phase'];
  speed: number;
  lap: number;
  elapsed: number;
  charge: number;
  boosting: boolean;
  offTrack: boolean;
  paused: boolean;
  nextCheckpoint: number;
  resetCount: number;
  rank: number;
  totalRacers: number;
  item: ItemKind | null;
  shieldActive: boolean;
  results: RaceResult[];
}
