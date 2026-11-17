export type OnlineConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface OnlineLobbyPlayer {
  sessionId: string;
  nickname: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  host: boolean;
}

export interface OnlineLobbySnapshot {
  phase: 'lobby' | 'racing' | 'finished';
  roomCode: string;
  localSessionId: string;
  hostId: string;
  status: OnlineConnectionStatus;
  players: OnlineLobbyPlayer[];
  totalRacers: number;
  error: string;
}

export interface OnlineProfile {
  nickname: string;
  avatar: string;
}
