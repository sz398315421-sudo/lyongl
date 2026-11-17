import { Room, type Client } from '@colyseus/core';
import { EMPTY_INPUT } from '../game-core/config.ts';
import { createRosterMatch, stepMatchWithInputs } from '../game-core/match.ts';
import { createTrack } from '../game-core/track.ts';
import {
  LobbyPlayerSchema,
  NETWORK_PATCH_RATE,
  NETWORK_SUBSTEPS,
  NETWORK_TICK_RATE,
  NetworkKartInput,
  PaperKartRoomState,
  type RoomJoinOptions,
} from '../shared/network-schema.ts';
import type { HumanRacerProfile, KartInput, MatchState } from '../shared/types.ts';
import { syncRoomMatch } from './state-sync.ts';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_CHANNEL = '$paper-kart-room-codes';
const MAX_AVATAR_LENGTH = 900_000;

export function normalizeNickname(value: unknown): string {
  if (typeof value !== 'string') return '纸片车手';
  const compact = value.trim().replace(/\s+/g, ' ').slice(0, 12);
  return compact || '纸片车手';
}

export function normalizeAvatar(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_AVATAR_LENGTH) return 'default';
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)) return value;
  if (value.length <= 2048 && /^https:\/\/[^\s]+$/i.test(value)) return value;
  return 'default';
}

function toKartInput(input: NetworkKartInput | undefined): KartInput {
  if (!input) return { ...EMPTY_INPUT };
  return {
    throttle: input.throttle,
    brake: input.brake,
    steer: input.steer,
    drift: input.drift,
    reset: input.reset,
    useItem: input.useItem,
  };
}

export class PaperKartRoom extends Room<{ state: PaperKartRoomState; input: NetworkKartInput }> {
  state = new PaperKartRoomState();
  inputs = this.defineInput(NetworkKartInput, {
    bufferMaxSize: 64,
    sanitize: { throttle: [0, 1], brake: [0, 1], steer: [-1, 1] },
  });
  private readonly track = createTrack();
  private match: MatchState | null = null;

  async onCreate() {
    this.maxClients = 6;
    this.patchRate = NETWORK_PATCH_RATE;
    this.roomId = await this.reserveRoomCode();
    this.state.roomCode = this.roomId;
    this.metadata = { roomCode: this.roomId };
    this.onMessage<{ ready?: unknown }>('ready', (client, message) => {
      if (this.state.phase !== 'lobby') return;
      const player = this.state.players.get(client.sessionId);
      if (player) player.ready = message?.ready === true;
    });
    this.onMessage('start', client => {
      if (client.sessionId === this.state.hostId) this.startRace();
    });
    this.setFixedTimestep(context => this.step(context.subSteps, context.subDt), NETWORK_TICK_RATE, {
      subSteps: NETWORK_SUBSTEPS,
    });
  }

  onJoin(client: Client, options: RoomJoinOptions = {}) {
    if (this.state.phase !== 'lobby') throw new Error('比赛已经开始。');
    const firstPlayer = this.state.players.size === 0;
    const player = new LobbyPlayerSchema({
      sessionId: client.sessionId,
      racerId: client.sessionId,
      nickname: normalizeNickname(options.nickname),
      avatar: normalizeAvatar(options.avatar),
      ready: false,
      connected: true,
      host: firstPlayer,
    });
    this.state.players.set(client.sessionId, player);
    if (firstPlayer) this.state.hostId = client.sessionId;
  }

  onDrop(client: Client) {
    this.setConnection(client.sessionId, false);
    void this.allowReconnection(client, 10).catch(() => undefined);
  }

  onReconnect(client: Client) {
    this.setConnection(client.sessionId, true);
  }

  onLeave(client: Client) {
    this.setConnection(client.sessionId, false);
    if (this.state.phase === 'lobby') {
      const wasHost = this.state.hostId === client.sessionId;
      this.state.players.delete(client.sessionId);
      if (wasHost) this.transferHost();
    }
  }

  async onDispose() {
    await this.presence.srem(ROOM_CODE_CHANNEL, this.roomId);
  }

  private async reserveRoomCode(): Promise<string> {
    const current = await this.presence.smembers(ROOM_CODE_CHANNEL);
    let code: string;
    do {
      code = Array.from({ length: 4 }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join('');
    } while (current.includes(code));
    await this.presence.sadd(ROOM_CODE_CHANNEL, code);
    return code;
  }

  private transferHost() {
    const nextHost = Array.from(this.state.players.values()).find(player => player.connected);
    this.state.hostId = nextHost?.sessionId ?? '';
    this.state.players.forEach(player => { player.host = player.sessionId === this.state.hostId; });
  }

  private setConnection(sessionId: string, connected: boolean) {
    const player = this.state.players.get(sessionId);
    if (player) {
      player.connected = connected;
      if (!connected) player.ready = false;
    }
    const racer = this.match?.racers.find(candidate => candidate.id === sessionId);
    if (racer) {
      racer.kind = connected ? 'player' : 'ai';
      racer.difficulty = connected ? undefined : 'normal';
      if (!connected && !racer.name.endsWith(' · AI')) racer.name += ' · AI';
      if (connected) racer.name = player?.nickname ?? racer.name.replace(/ · AI$/, '');
    }
    if (this.match) syncRoomMatch(this.state, this.match, this.track);
  }

  private canStart(): boolean {
    const players = Array.from(this.state.players.values()).filter(player => player.connected);
    return players.length >= 2 && players.every(player => player.ready);
  }

  private startRace() {
    if (!this.canStart() || this.match) return;
    const profiles: HumanRacerProfile[] = Array.from(this.state.players.values())
      .filter(player => player.connected)
      .map(player => ({ id: player.racerId, name: player.nickname, avatar: player.avatar }));
    this.match = createRosterMatch(this.track, profiles, 'racing');
    this.lock();
    syncRoomMatch(this.state, this.match, this.track);
  }

  private step(subSteps: number, subDt: number) {
    if (!this.match || this.match.phase !== 'racing') return;
    let inputs = new Map<string, KartInput>();
    this.state.players.forEach(player => {
      if (!player.connected) return;
      inputs.set(player.racerId, toKartInput(this.inputs.get(player.sessionId).next()));
    });
    for (let subStep = 0; subStep < subSteps; subStep++) {
      stepMatchWithInputs(this.match, inputs, this.track, subDt);
      if (subStep === 0) {
        inputs = new Map(Array.from(inputs, ([id, input]) => [id, { ...input, reset: false, useItem: false }]));
      }
    }
    syncRoomMatch(this.state, this.match, this.track);
  }
}
