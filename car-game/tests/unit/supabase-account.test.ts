import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';
import type { ProfileRow, RaceStatsRow } from '../../client/account/database';
import type { AccountSnapshot } from '../../client/account/types';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

const user = {
  id: '62fcfc0b-f47d-43dc-b1d8-d8763506f04d',
  email: 'pilot@example.com',
  user_metadata: { nickname: '云端车手' },
} as unknown as User;
const session = { user } as Session;

interface FakeTableQuery {
  error: null;
  select: () => FakeTableQuery;
  eq: () => FakeTableQuery;
  update: (values: Record<string, unknown>) => FakeTableQuery;
  upsert: (values: Record<string, unknown>) => FakeTableQuery;
  maybeSingle: () => Promise<{ data: ProfileRow | RaceStatsRow | null; error: null }>;
  single: () => Promise<{ data: ProfileRow; error: null }>;
}

function createFakeClient() {
  let profile: ProfileRow = {
    user_id: user.id,
    nickname: '云端车手',
    avatar_url: null,
    created_at: '2026-09-10T00:00:00.000Z',
  };
  let stats: RaceStatsRow = {
    user_id: user.id,
    races: 2,
    wins: 1,
    best_finish: 1,
    updated_at: '2026-09-10T00:00:00.000Z',
  };
  let selectedTable = '';
  const query: FakeTableQuery = {
    error: null,
    select: () => query,
    eq: () => query,
    update: values => {
      if (selectedTable === 'profiles') profile = { ...profile, ...values } as ProfileRow;
      return query;
    },
    upsert: values => {
      profile = { ...profile, ...values } as ProfileRow;
      return query;
    },
    maybeSingle: async () => ({ data: selectedTable === 'profiles' ? profile : stats, error: null }),
    single: async () => ({ data: profile, error: null }),
  };
  const signUp = vi.fn(async () => ({ data: { session: null }, error: null }));
  const upload = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async (_name: string, args: { finish_position: number }) => {
    stats = {
      ...stats,
      races: stats.races + 1,
      wins: stats.wins + (args.finish_position === 1 ? 1 : 0),
      best_finish: Math.min(stats.best_finish ?? 6, args.finish_position),
    };
    return { error: null };
  });
  return {
    client: {
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        signInWithPassword: vi.fn(async () => ({ data: { session }, error: null })),
        signUp,
        signOut: vi.fn(async () => ({ error: null })),
      },
      from: vi.fn((table: string) => { selectedTable = table; return query; }),
      storage: { from: vi.fn(() => ({
        upload,
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://paper.supabase.co/storage/v1/object/public/avatars/pilot/avatar.png' } })),
      })) },
      rpc,
    },
    readProfile: () => profile,
    readStats: () => stats,
    signUp,
    upload,
    rpc,
  };
}

describe('Supabase account service', () => {
  beforeEach(() => createClientMock.mockReset());

  test('loads profile, persists avatar and records only the finish position', async () => {
    const fake = createFakeClient();
    createClientMock.mockReturnValue(fake.client);
    const { SupabaseAccountService } = await import('../../client/account/SupabaseAccountService');
    const service = new SupabaseAccountService({ url: 'https://paper.supabase.co', publishableKey: 'sb_publishable_test' });
    const snapshots: AccountSnapshot[] = [];
    const dispose = await service.initialize(next => snapshots.push(next));
    expect(snapshots.at(-1)?.status).toBe('guest');

    await service.signIn('pilot@example.com', 'paper123');
    expect(snapshots.at(-1)?.profile?.nickname).toBe('云端车手');
    expect(snapshots.at(-1)?.stats?.races).toBe(2);

    await service.updateNickname('  新车手  ');
    expect(fake.readProfile().nickname).toBe('新车手');

    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    await service.uploadAvatar(png);
    expect(fake.upload).toHaveBeenCalledWith(`${user.id}/avatar.png`, expect.any(Blob), expect.objectContaining({ upsert: true }));
    expect(fake.readProfile().avatar_url).toMatch(/^https:\/\/paper\.supabase\.co\/.*\?v=\d+$/);

    await service.recordRaceResult(2);
    expect(fake.rpc).toHaveBeenCalledWith('record_race_result', { finish_position: 2 });
    expect(fake.readStats().races).toBe(3);

    // A second client signing in to the same backend receives the same profile,
    // which is the cross-device boundary required by Stage 04.
    const secondDevice = new SupabaseAccountService({ url: 'https://paper.supabase.co', publishableKey: 'sb_publishable_test' });
    const secondSnapshots: AccountSnapshot[] = [];
    const disposeSecond = await secondDevice.initialize(next => secondSnapshots.push(next));
    await secondDevice.signIn('pilot@example.com', 'paper123');
    expect(secondSnapshots.at(-1)?.profile?.nickname).toBe('新车手');
    expect(secondSnapshots.at(-1)?.profile?.avatarUrl).toMatch(/avatar\.png\?v=/);
    expect(secondSnapshots.at(-1)?.stats?.races).toBe(3);

    await service.signOut();
    expect(snapshots.at(-1)?.status).toBe('guest');
    expect((await service.signUp('new@example.com', 'paper123', '新玩家')).confirmationRequired).toBe(true);
    expect(fake.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { data: { nickname: '新玩家' } } }));
    disposeSecond();
    dispose();
  });
});
