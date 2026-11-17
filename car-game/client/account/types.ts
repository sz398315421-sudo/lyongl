export interface PlayerProfile {
  userId: string;
  email: string;
  nickname: string;
  avatarUrl: string;
  createdAt: string;
}

export interface RaceStats {
  races: number;
  wins: number;
  bestFinish: number | null;
  updatedAt: string;
}

export interface AccountSnapshot {
  configured: boolean;
  status: 'loading' | 'guest' | 'authenticated';
  profile: PlayerProfile | null;
  stats: RaceStats | null;
}

export interface SignUpResult {
  confirmationRequired: boolean;
}

export interface AccountService {
  initialize(onChange: (snapshot: AccountSnapshot) => void): Promise<() => void>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, nickname: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  updateNickname(nickname: string): Promise<void>;
  uploadAvatar(dataUrl: string): Promise<void>;
  recordRaceResult(position: number): Promise<void>;
}

export const GUEST_ACCOUNT: AccountSnapshot = {
  configured: false,
  status: 'guest',
  profile: null,
  stats: null,
};
