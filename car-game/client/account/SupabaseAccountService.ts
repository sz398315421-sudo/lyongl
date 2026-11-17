import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { Database, ProfileRow, RaceStatsRow } from './database';
import type { AccountService, AccountSnapshot, PlayerProfile, RaceStats, SignUpResult } from './types';
import type { SupabaseBrowserConfig } from './config';
import {
  avatarDataUrlToBlob,
  normalizeProfileNickname,
  validateEmail,
  validateFinishPosition,
  validatePassword,
} from './validation';

function profileFromRow(row: ProfileRow, user: User): PlayerProfile {
  return {
    userId: row.user_id,
    email: user.email ?? '',
    nickname: row.nickname,
    avatarUrl: row.avatar_url ?? '',
    createdAt: row.created_at,
  };
}

function statsFromRow(row: RaceStatsRow): RaceStats {
  return {
    races: row.races,
    wins: row.wins,
    bestFinish: row.best_finish,
    updatedAt: row.updated_at,
  };
}

function versionedPublicUrl(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

export class SupabaseAccountService implements AccountService {
  private readonly client: SupabaseClient<Database>;
  private onChange: ((snapshot: AccountSnapshot) => void) | null = null;
  private currentUser: User | null = null;
  private syncVersion = 0;

  constructor(config: SupabaseBrowserConfig) {
    this.client = createClient<Database>(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { 'X-Client-Info': 'paper-kart-web' } },
    });
  }

  async initialize(onChange: (snapshot: AccountSnapshot) => void): Promise<() => void> {
    this.onChange = onChange;
    this.emit({ configured: true, status: 'loading', profile: null, stats: null });
    const { data: listener } = this.client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        void this.syncSession(session).catch(cause => {
          console.warn('Paper Kart account refresh failed', cause);
        });
      });
    });
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      await this.syncSession(data.session);
    } catch (cause) {
      listener.subscription.unsubscribe();
      this.onChange = null;
      throw cause;
    }
    return () => {
      this.syncVersion++;
      listener.subscription.unsubscribe();
      this.onChange = null;
    };
  }

  async signIn(email: string, password: string): Promise<void> {
    const result = await this.client.auth.signInWithPassword({
      email: validateEmail(email),
      password: validatePassword(password),
    });
    if (result.error) throw result.error;
    await this.syncSession(result.data.session);
  }

  async signUp(email: string, password: string, nickname: string): Promise<SignUpResult> {
    const result = await this.client.auth.signUp({
      email: validateEmail(email),
      password: validatePassword(password),
      options: { data: { nickname: normalizeProfileNickname(nickname) } },
    });
    if (result.error) throw result.error;
    if (result.data.session) await this.syncSession(result.data.session);
    return { confirmationRequired: result.data.session === null };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    await this.syncSession(null);
  }

  async updateNickname(nickname: string): Promise<void> {
    const user = this.requireUser();
    const value = normalizeProfileNickname(nickname);
    const { error } = await this.client.from('profiles').update({ nickname: value }).eq('user_id', user.id);
    if (error) throw error;
    await this.refresh(user);
  }

  async uploadAvatar(dataUrl: string): Promise<void> {
    const user = this.requireUser();
    const blob = await avatarDataUrlToBlob(dataUrl);
    const path = `${user.id}/avatar.png`;
    const { error: uploadError } = await this.client.storage.from('avatars').upload(path, blob, {
      contentType: 'image/png',
      cacheControl: '3600',
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data } = this.client.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = versionedPublicUrl(data.publicUrl);
    const { error: profileError } = await this.client.from('profiles').update({ avatar_url: avatarUrl }).eq('user_id', user.id);
    if (profileError) throw profileError;
    await this.refresh(user);
  }

  async recordRaceResult(position: number): Promise<void> {
    const user = this.requireUser();
    const { error } = await this.client.rpc('record_race_result', {
      finish_position: validateFinishPosition(position),
    });
    if (error) throw error;
    await this.refresh(user);
  }

  private requireUser(): User {
    if (!this.currentUser) throw new Error('请先登录后再同步。');
    return this.currentUser;
  }

  private async syncSession(session: Session | null) {
    const version = ++this.syncVersion;
    this.currentUser = session?.user ?? null;
    if (!session) {
      this.emit({ configured: true, status: 'guest', profile: null, stats: null });
      return;
    }
    const snapshot = await this.loadAccount(session.user);
    if (version === this.syncVersion) this.emit(snapshot);
  }

  private async refresh(user: User) {
    const version = ++this.syncVersion;
    const snapshot = await this.loadAccount(user);
    if (version === this.syncVersion) this.emit(snapshot);
  }

  private async loadAccount(user: User): Promise<AccountSnapshot> {
    const [profileResult, statsResult] = await Promise.all([
      this.client.from('profiles').select('user_id,nickname,avatar_url,created_at').eq('user_id', user.id).maybeSingle(),
      this.client.from('race_stats').select('user_id,races,wins,best_finish,updated_at').eq('user_id', user.id).maybeSingle(),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (statsResult.error) throw statsResult.error;

    let profile = profileResult.data;
    if (!profile) {
      const fallbackNickname = normalizeProfileNickname(String(user.user_metadata.nickname ?? '纸片车手'));
      const inserted = await this.client.from('profiles').upsert({
        user_id: user.id,
        nickname: fallbackNickname,
        avatar_url: null,
      }).select('user_id,nickname,avatar_url,created_at').single();
      if (inserted.error) throw inserted.error;
      if (!inserted.data) throw new Error('云端没有返回新建的车手资料。');
      profile = inserted.data;
    }

    const stats = statsResult.data ?? {
      user_id: user.id,
      races: 0,
      wins: 0,
      best_finish: null,
      updated_at: new Date(0).toISOString(),
    };
    return {
      configured: true,
      status: 'authenticated',
      profile: profileFromRow(profile, user),
      stats: statsFromRow(stats),
    };
  }

  private emit(snapshot: AccountSnapshot) {
    this.onChange?.(snapshot);
  }
}
