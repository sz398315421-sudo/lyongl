import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { isAvatarImageSource } from '../../client/avatar/source';
import {
  avatarDataUrlToBlob,
  normalizeProfileNickname,
  validateEmail,
  validateFinishPosition,
  validatePassword,
} from '../../client/account/validation';

describe('Stage 04 account boundaries', () => {
  test('normalizes and validates account input', () => {
    expect(normalizeProfileNickname('  纸片   车手  ')).toBe('纸片 车手');
    expect(normalizeProfileNickname('')).toBe('纸片车手');
    expect(validateEmail(' PILOT@example.com ')).toBe('pilot@example.com');
    expect(() => validateEmail('pilot')).toThrow('有效');
    expect(validatePassword('paper123')).toBe('paper123');
    expect(() => validatePassword('short')).toThrow('8 个字符');
    expect(validateFinishPosition(6)).toBe(6);
    expect(() => validateFinishPosition(7)).toThrow('1 到 6');
  });

  test('accepts local PNG stickers and HTTPS cloud avatars', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const blob = await avatarDataUrlToBlob(png);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
    expect(isAvatarImageSource(png)).toBe(true);
    expect(isAvatarImageSource('https://project.supabase.co/storage/v1/object/public/avatars/user/avatar.png')).toBe(true);
    expect(isAvatarImageSource('http://unsafe.example/avatar.png')).toBe(false);
  });

  test('migration protects profiles, stats and per-user avatar folders', () => {
    const sql = readFileSync('supabase/migrations/20260910230000_stage04_accounts.sql', 'utf8');
    expect(sql).toContain('create table if not exists public.profiles');
    expect(sql).toContain('create table if not exists public.race_stats');
    expect(sql).toContain('alter table public.profiles enable row level security');
    expect(sql).toContain("(storage.foldername(name))[1] = (select auth.uid()::text)");
    expect(sql).toContain('create or replace function public.record_race_result');
    expect(sql).not.toMatch(/service[_-]role/i);
  });
});
