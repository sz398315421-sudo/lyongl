import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseConfig } from './config';
import { GUEST_ACCOUNT, type AccountService, type AccountSnapshot, type SignUpResult } from './types';

export function useAccount() {
  const [config] = useState(getSupabaseConfig);
  const service = useRef<AccountService | null>(null);
  const [snapshot, setSnapshot] = useState<AccountSnapshot>(() => ({
    ...GUEST_ACCOUNT,
    configured: Boolean(config),
    status: config ? 'loading' : 'guest',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!config) return;
    let active = true;
    let dispose: (() => void) | undefined;
    import('./SupabaseAccountService').then(({ SupabaseAccountService }) => {
      if (!active) return;
      const nextService = new SupabaseAccountService(config);
      service.current = nextService;
      return nextService.initialize(next => { if (active) setSnapshot(next); });
    }).then(cleanup => {
      if (!active) cleanup?.();
      else dispose = cleanup;
    }).catch((cause: unknown) => {
      if (!active) return;
      service.current = null;
      setSnapshot(GUEST_ACCOUNT);
      setError(cause instanceof Error ? cause.message : '云端账号服务初始化失败。');
    });
    return () => {
      active = false;
      dispose?.();
      service.current = null;
    };
  }, [config]);

  const run = useCallback(async <T,>(action: (target: AccountService) => Promise<T>): Promise<T> => {
    const target = service.current;
    if (!target) throw new Error(config ? '账号服务仍在加载，请稍候。' : '当前未配置云端账号，游客模式仍可正常游玩。');
    setBusy(true);
    setError('');
    try {
      return await action(target);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '云端同步失败，请稍后重试。';
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [config]);

  return {
    snapshot,
    busy,
    error,
    clearError: useCallback(() => setError(''), []),
    signIn: useCallback((email: string, password: string) => run(target => target.signIn(email, password)), [run]),
    signUp: useCallback((email: string, password: string, nickname: string): Promise<SignUpResult> => run(target => target.signUp(email, password, nickname)), [run]),
    signOut: useCallback(() => run(target => target.signOut()), [run]),
    updateNickname: useCallback((nickname: string) => run(target => target.updateNickname(nickname)), [run]),
    uploadAvatar: useCallback((dataUrl: string) => run(target => target.uploadAvatar(dataUrl)), [run]),
    recordRaceResult: useCallback((position: number) => run(target => target.recordRaceResult(position)), [run]),
  };
}
