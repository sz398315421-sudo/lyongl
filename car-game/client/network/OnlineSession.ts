import { Client, Predict, type InputHandle, type Reconciler, type Room } from '@colyseus/sdk';
import type { Data } from '@colyseus/schema';
import { stepGame } from '../../game-core/simulation';
import { createTrack } from '../../game-core/track';
import {
  NETWORK_ROOM_NAME,
  NetworkKartInput,
  PaperKartRoomState,
  type NetworkRacerSchema,
} from '../../shared/network-schema';
import type {
  AiDifficulty,
  GameState,
  ItemKind,
  KartInput,
  KartState,
  MatchState,
  RaceResult,
  RaceState,
  RacerKind,
  RacerState,
} from '../../shared/types';
import type { OnlineConnectionStatus, OnlineLobbySnapshot, OnlineProfile } from './types';

type PaperKartClientRoom = Room<unknown, PaperKartRoomState>;
type LobbyListener = (snapshot: OnlineLobbySnapshot) => void;

const TRACK = createTrack();
const ITEMS = new Set<ItemKind>(['paper-plane', 'glue', 'cardboard-shield', 'spring']);
const PREDICTED_FIELDS = [
  'x', 'z', 'heading', 'steering', 'yawRate', 'driftDirection', 'slipAngle',
  'velocityX', 'velocityZ', 'speed', 'driftHeld', 'drifting', 'driftCharge',
  'boostRemaining', 'offTrackTime', 'resetCount', 'collisionCount',
  'completedLaps', 'totalLaps', 'nextCheckpoint', 'lastCheckpoint', 'raceElapsed',
  'slowRemaining',
] as const;

function endpoint(): string {
  const configured = import.meta.env.VITE_COLYSEUS_URL?.trim();
  if (configured) return configured;
  const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${location.hostname}:2567`;
}

function itemKind(value: string): ItemKind | null {
  return ITEMS.has(value as ItemKind) ? value as ItemKind : null;
}

function racerKind(value: string): RacerKind {
  return value === 'player' ? 'player' : 'ai';
}

function difficulty(value: string): AiDifficulty | undefined {
  return value === 'easy' || value === 'normal' || value === 'hard' ? value : undefined;
}

function racePhase(value: string): RaceState['phase'] {
  return value === 'finished' ? 'finished' : 'racing';
}

function roomPhase(value: string): OnlineLobbySnapshot['phase'] {
  return value === 'racing' || value === 'finished' ? value : 'lobby';
}

function raceFromNetwork(source: NetworkRacerSchema): RaceState {
  return {
    phase: racePhase(source.racePhase),
    completedLaps: source.completedLaps,
    totalLaps: source.totalLaps,
    nextCheckpoint: source.nextCheckpoint,
    lastCheckpoint: source.lastCheckpoint,
    elapsed: source.raceElapsed,
  };
}

function kartFromNetwork(source: NetworkRacerSchema, predict: Predict<PaperKartRoomState>): KartState {
  return {
    x: predict.value(source, 'x'),
    z: predict.value(source, 'z'),
    heading: predict.value(source, 'heading'),
    steering: predict.value(source, 'steering'),
    yawRate: source.yawRate,
    driftDirection: source.driftDirection,
    slipAngle: source.slipAngle,
    driftHeld: source.driftHeld,
    velocity: { x: source.velocityX, z: source.velocityZ },
    speed: source.speed,
    drifting: source.drifting,
    driftCharge: source.driftCharge,
    boostRemaining: source.boostRemaining,
    offTrackTime: source.offTrackTime,
    resetCount: source.resetCount,
    collisionCount: source.collisionCount,
  };
}

function applyPredictedKart(target: NetworkRacerSchema, source: KartState) {
  target.x = source.x;
  target.z = source.z;
  target.heading = source.heading;
  target.steering = source.steering;
  target.yawRate = source.yawRate;
  target.driftDirection = source.driftDirection;
  target.slipAngle = source.slipAngle;
  target.velocityX = source.velocity.x;
  target.velocityZ = source.velocity.z;
  target.speed = source.speed;
  target.driftHeld = source.driftHeld;
  target.drifting = source.drifting;
  target.driftCharge = source.driftCharge;
  target.boostRemaining = source.boostRemaining;
  target.offTrackTime = source.offTrackTime;
  target.resetCount = source.resetCount;
  target.collisionCount = source.collisionCount;
}

function applyPredictedRace(target: NetworkRacerSchema, source: RaceState) {
  target.completedLaps = source.completedLaps;
  target.totalLaps = source.totalLaps;
  target.nextCheckpoint = source.nextCheckpoint;
  target.lastCheckpoint = source.lastCheckpoint;
  target.raceElapsed = source.elapsed;
}

function predictStep(
  context: { subSteps: number; subDt: number },
  racer: NetworkRacerSchema,
  command: Data<NetworkKartInput>,
) {
  const state: GameState = { kart: kartFromRawNetwork(racer), race: raceFromNetwork(racer) };
  let input: KartInput = {
    throttle: command.throttle,
    brake: command.brake,
    steer: command.steer,
    drift: command.drift,
    reset: command.reset,
    useItem: false,
  };
  for (let index = 0; index < context.subSteps; index++) {
    stepGame(state, input, TRACK, context.subDt, racer.slowRemaining > 0 ? 0.58 : 1);
    input = { ...input, reset: false };
  }
  applyPredictedKart(racer, state.kart);
  applyPredictedRace(racer, state.race);
}

function kartFromRawNetwork(source: NetworkRacerSchema): KartState {
  return {
    x: source.x,
    z: source.z,
    heading: source.heading,
    steering: source.steering,
    yawRate: source.yawRate,
    driftDirection: source.driftDirection,
    slipAngle: source.slipAngle,
    driftHeld: source.driftHeld,
    velocity: { x: source.velocityX, z: source.velocityZ },
    speed: source.speed,
    drifting: source.drifting,
    driftCharge: source.driftCharge,
    boostRemaining: source.boostRemaining,
    offTrackTime: source.offTrackTime,
    resetCount: source.resetCount,
    collisionCount: source.collisionCount,
  };
}

export class OnlineSession {
  private readonly listeners = new Set<LobbyListener>();
  private status: OnlineConnectionStatus = 'connected';
  private error = '';
  private lastLobbyKey = '';
  private predict: Predict<PaperKartRoomState> | null = null;
  private input: InputHandle<NetworkKartInput> | null = null;
  private reconciler: Reconciler<NetworkRacerSchema, Data<NetworkKartInput>> | null = null;
  private expectedLeave = false;

  private constructor(private readonly room: PaperKartClientRoom) {
    room.onStateChange(this.onStateChange);
    room.onDrop(this.onDrop);
    room.onReconnect(this.onReconnect);
    room.onLeave(this.onLeave);
    room.onError(this.onError);
    this.onStateChange();
  }

  static async create(profile: OnlineProfile): Promise<OnlineSession> {
    const client = new Client(endpoint());
    const room = await client.create<PaperKartRoomState>(NETWORK_ROOM_NAME, profile, PaperKartRoomState);
    return new OnlineSession(room);
  }

  static async join(code: string, profile: OnlineProfile): Promise<OnlineSession> {
    const client = new Client(endpoint());
    const room = await client.joinById<PaperKartRoomState>(code.trim().toUpperCase(), profile, PaperKartRoomState);
    return new OnlineSession(room);
  }

  get sessionId() { return this.room.sessionId; }
  get roomCode() { return this.room.state.roomCode || this.room.roomId; }
  get phase() { return roomPhase(this.room.state.phase); }

  inspect = (): OnlineLobbySnapshot => structuredClone(this.lobbySnapshot());

  subscribe(listener: LobbyListener): () => void {
    this.listeners.add(listener);
    listener(this.lobbySnapshot());
    return () => this.listeners.delete(listener);
  }

  setReady(ready: boolean) {
    this.room.send('ready', { ready });
  }

  startRace() {
    this.room.send('start');
  }

  tick(now: number, readInput: () => KartInput) {
    if (this.phase !== 'racing') return;
    this.ensurePrediction();
    if (!this.predict || !this.input) return;
    const count = this.predict.tick(now);
    for (let index = 0; index < count; index++) {
      const next = readInput();
      this.input.data.throttle = next.throttle;
      this.input.data.brake = next.brake;
      this.input.data.steer = next.steer;
      this.input.data.drift = next.drift;
      this.input.data.reset = next.reset;
      this.input.data.useItem = next.useItem;
      this.input.send();
    }
  }

  matchSnapshot(): MatchState | null {
    if (!this.predict || this.room.state.racers.size === 0) return null;
    const racers = Array.from(this.room.state.racers.values())
      .sort((left, right) => left.slot - right.slot)
      .map((source): RacerState => ({
        id: source.id,
        name: source.name,
        kind: racerKind(source.kind),
        difficulty: difficulty(source.difficulty),
        color: source.color,
        avatar: source.avatar,
        kart: kartFromNetwork(source, this.predict!),
        race: raceFromNetwork(source),
        item: itemKind(source.item),
        slowRemaining: source.slowRemaining,
        stuckTime: source.stuckTime,
        shieldActive: source.shieldActive,
        finishTime: source.finishTime < 0 ? null : source.finishTime,
        finishPosition: source.finishPosition < 0 ? null : source.finishPosition,
      }));
    const results = Array.from(this.room.state.results).map((result): RaceResult => ({
      id: result.id,
      name: result.name,
      kind: racerKind(result.kind),
      position: result.position,
      time: result.time < 0 ? null : result.time,
      avatar: result.avatar,
      color: result.color,
    }));
    const traps = Array.from(this.room.state.glueTraps.values()).map(trap => ({
      id: trap.id,
      ownerId: trap.ownerId,
      x: trap.x,
      z: trap.z,
      heading: trap.heading,
      remaining: trap.remaining,
    }));
    return {
      phase: this.phase === 'lobby' ? 'menu' : this.phase,
      elapsed: this.room.state.elapsed,
      racers,
      itemBoxCooldowns: Array.from(this.room.state.itemBoxCooldowns),
      glueTraps: traps,
      results,
      nextTrapId: traps.reduce((highest, trap) => Math.max(highest, trap.id + 1), 1),
      randomSeed: 0,
    };
  }

  async leave() {
    this.expectedLeave = true;
    this.disposePrediction();
    await this.room.leave();
    this.room.removeAllListeners();
    this.listeners.clear();
  }

  private ensurePrediction() {
    if (!this.predict) {
      this.predict = Predict.get(this.room, { mode: 'lerp', delay: 100, snap: 24 });
      this.predict.attachAll('racers', {
        x: { mode: 'lerp', delay: 100, snap: 20 },
        z: { mode: 'lerp', delay: 100, snap: 20 },
        heading: { mode: 'lerp', delay: 100, snap: Math.PI, angle: true },
        steering: { mode: 'lerp', delay: 100, snap: 1.5 },
      });
      this.input = this.room.input({ type: NetworkKartInput, mode: 'reliable' });
    }
    if (!this.reconciler) {
      const local = this.room.state.racers.get(this.sessionId);
      if (!local || !this.input) return;
      this.reconciler = this.predict.reconciler(local, {
        input: this.input,
        fields: PREDICTED_FIELDS,
        smoothMs: 70,
        step: predictStep,
      });
    }
  }

  private disposePrediction() {
    this.reconciler?.dispose();
    this.reconciler = null;
    this.predict?.dispose();
    this.predict = null;
    this.input = null;
  }

  private onStateChange = () => {
    if (this.phase === 'racing') this.ensurePrediction();
    this.emitLobby();
  };

  private onDrop = () => {
    this.status = 'reconnecting';
    this.emitLobby(true);
  };

  private onReconnect = () => {
    this.status = 'connected';
    this.error = '';
    this.emitLobby(true);
  };

  private onLeave = (_code: number, reason?: string) => {
    this.status = 'disconnected';
    if (!this.expectedLeave) this.error = reason || '与比赛服务器的连接已断开。你仍可返回首页进行单人比赛。';
    this.disposePrediction();
    this.emitLobby(true);
  };

  private onError = (_code: number, message?: string) => {
    this.error = message || '联机服务发生错误。';
    this.emitLobby(true);
  };

  private lobbySnapshot(): OnlineLobbySnapshot {
    return {
      phase: this.phase,
      roomCode: this.roomCode,
      localSessionId: this.sessionId,
      hostId: this.room.state.hostId,
      status: this.status,
      players: Array.from(this.room.state.players.values()).map(player => ({
        sessionId: player.sessionId,
        nickname: player.nickname,
        avatar: player.avatar,
        ready: player.ready,
        connected: player.connected,
        host: player.host,
      })),
      totalRacers: this.room.state.racers.size,
      error: this.error,
    };
  }

  private emitLobby(force = false) {
    const snapshot = this.lobbySnapshot();
    const key = JSON.stringify(snapshot);
    if (!force && key === this.lastLobbyKey) return;
    this.lastLobbyKey = key;
    this.listeners.forEach(listener => listener(snapshot));
  }
}
