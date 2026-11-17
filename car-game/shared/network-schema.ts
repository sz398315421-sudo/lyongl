import { schema, t, type SchemaType } from '@colyseus/schema';

export const NETWORK_ROOM_NAME = 'paper_kart';
export const NETWORK_TICK_RATE = 30;
export const NETWORK_SUBSTEPS = 2;
export const NETWORK_PATCH_RATE = 50;

export interface RoomJoinOptions {
  nickname?: string;
  avatar?: string;
}

export const NetworkKartInput = schema({
  throttle: t.float32().default(0),
  brake: t.float32().default(0),
  steer: t.float32().default(0),
  drift: t.boolean().default(false),
  reset: t.boolean().default(false),
  useItem: t.boolean().default(false),
}, 'PaperKartInput');
export type NetworkKartInput = SchemaType<typeof NetworkKartInput>;

export const LobbyPlayerSchema = schema({
  sessionId: t.string().default(''),
  racerId: t.string().default(''),
  nickname: t.string().default('纸片车手'),
  avatar: t.string().default('default'),
  ready: t.boolean().default(false),
  connected: t.boolean().default(true),
  host: t.boolean().default(false),
}, 'PaperKartLobbyPlayer');
export type LobbyPlayerSchema = SchemaType<typeof LobbyPlayerSchema>;

/** Flat hot-path racer state keeps Colyseus prediction and interpolation cheap. */
export const NetworkRacerSchema = schema({
  id: t.string().default(''),
  name: t.string().default(''),
  kind: t.string().default('ai'),
  difficulty: t.string().default('normal'),
  color: t.string().default('#eb7156'),
  avatar: t.string().default('default'),
  connected: t.boolean().default(true),
  slot: t.uint8().default(0),
  rank: t.uint8().default(1),

  x: t.float32().default(0),
  z: t.float32().default(0),
  heading: t.float32().default(0),
  steering: t.float32().default(0),
  yawRate: t.float32().default(0),
  driftDirection: t.float32().default(0),
  slipAngle: t.float32().default(0),
  velocityX: t.float32().default(0),
  velocityZ: t.float32().default(0),
  speed: t.float32().default(0),
  driftHeld: t.boolean().default(false),
  drifting: t.boolean().default(false),
  driftCharge: t.float32().default(0),
  boostRemaining: t.float32().default(0),
  offTrackTime: t.float32().default(0),
  resetCount: t.uint16().default(0),
  collisionCount: t.uint16().default(0),

  racePhase: t.string().default('racing'),
  completedLaps: t.uint8().default(0),
  totalLaps: t.uint8().default(3),
  nextCheckpoint: t.uint8().default(1),
  lastCheckpoint: t.int8().default(-1),
  raceElapsed: t.float32().default(0),
  item: t.string().default(''),
  slowRemaining: t.float32().default(0),
  stuckTime: t.float32().default(0),
  shieldActive: t.boolean().default(false),
  finishTime: t.float32().default(-1),
  finishPosition: t.int8().default(-1),
}, 'PaperKartRacer');
export type NetworkRacerSchema = SchemaType<typeof NetworkRacerSchema>;

export const NetworkGlueTrapSchema = schema({
  id: t.uint16().default(0),
  ownerId: t.string().default(''),
  x: t.float32().default(0),
  z: t.float32().default(0),
  heading: t.float32().default(0),
  remaining: t.float32().default(0),
}, 'PaperKartGlueTrap');
export type NetworkGlueTrapSchema = SchemaType<typeof NetworkGlueTrapSchema>;

export const NetworkRaceResultSchema = schema({
  id: t.string().default(''),
  name: t.string().default(''),
  kind: t.string().default('ai'),
  position: t.uint8().default(1),
  time: t.float32().default(-1),
  avatar: t.string().default('default'),
  color: t.string().default('#eb7156'),
}, 'PaperKartRaceResult');
export type NetworkRaceResultSchema = SchemaType<typeof NetworkRaceResultSchema>;

export const PaperKartRoomState = schema({
  phase: t.string().default('lobby'),
  roomCode: t.string().default(''),
  hostId: t.string().default(''),
  elapsed: t.float32().default(0),
  serverTick: t.uint32().default(0),
  players: t.map(LobbyPlayerSchema),
  racers: t.map(NetworkRacerSchema),
  itemBoxCooldowns: t.array('float32'),
  glueTraps: t.map(NetworkGlueTrapSchema),
  results: t.array(NetworkRaceResultSchema),
}, 'PaperKartRoomState');
export type PaperKartRoomState = SchemaType<typeof PaperKartRoomState>;
