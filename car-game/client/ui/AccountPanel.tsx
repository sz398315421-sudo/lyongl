import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AccountSnapshot, SignUpResult } from '../account/types';
import { isAvatarImageSource } from '../avatar/source';

interface AccountPanelProps {
  account: AccountSnapshot;
  busy: boolean;
  error: string;
  onClearError: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, nickname: string) => Promise<SignUpResult>;
  onSignOut: () => Promise<void>;
  onUpdateNickname: (nickname: string) => Promise<void>;
}

function AccountAvatar({ source, label }: { source: string; label: string }) {
  return isAvatarImageSource(source)
    ? <img src={source} alt={`${label}的云端头像`} />
    : <span aria-hidden="true">{label.slice(0, 1) || 'P'}</span>;
}

export function AccountPanel({
  account,
  busy,
  error,
  onClearError,
  onSignIn,
  onSignUp,
  onSignOut,
  onUpdateNickname,
}: AccountPanelProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('纸片车手');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (account.profile) setNickname(account.profile.nickname);
  }, [account.profile]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const openPanel = () => {
    onClearError();
    setNotice('');
    setOpen(true);
  };

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    try {
      if (mode === 'login') {
        await onSignIn(email, password);
        setNotice('登录成功，资料已从云端装进赛车。');
      } else {
        const result = await onSignUp(email, password, nickname);
        setNotice(result.confirmationRequired
          ? '注册邮件已寄出，请在邮箱中确认后回来登录。'
          : '账号创建成功，纸片车手证已生效。');
      }
      setPassword('');
    } catch {
      // The shared account hook surfaces a concise error below the form.
    }
  };

  const saveNickname = async (event: FormEvent) => {
    event.preventDefault();
    setNotice('');
    try {
      await onUpdateNickname(nickname);
      setNotice('昵称已同步。');
    } catch {
      // The shared account hook surfaces the error.
    }
  };

  const signOut = async () => {
    setNotice('');
    try {
      await onSignOut();
      setNotice('已退出账号；现在以游客身份游玩。');
    } catch {
      // The shared account hook surfaces the error.
    }
  };

  const label = account.status === 'authenticated' && account.profile
    ? account.profile.nickname
    : account.status === 'loading' ? '云端装载中' : '游客 · 登录同步';

  return <>
    <button className={`account-trigger is-${account.status}`} type="button" onClick={openPanel} aria-haspopup="dialog">
      <span className="account-trigger-avatar">
        {account.profile ? <AccountAvatar source={account.profile.avatarUrl} label={account.profile.nickname} /> : 'P'}
      </span>
      <span><strong>{label}</strong><small>{account.status === 'authenticated' ? '车手证已同步' : 'GUEST DRIVER'}</small></span>
    </button>

    {open ? createPortal(<div className="account-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="account-passport" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="account-close" type="button" aria-label="关闭账号面板" onClick={() => setOpen(false)}>×</button>
        <header>
          <span className="micro-label">PAPER DRIVER PASS / 纸片车手证</span>
          <h2 id="account-title">把车手带到每一台设备。</h2>
        </header>

        {!account.configured ? <div className="account-unavailable">
          <span className="passport-stamp">GUEST</span>
          <strong>云存档尚未连接</strong>
          <p>当前仍可正常进行单机和联机比赛，游客头像与战绩不会永久保存。配置 Supabase 后即可注册与跨设备同步。</p>
        </div> : account.status === 'loading' ? <div className="account-loading" aria-live="polite">正在翻找你的纸片车手证…</div>
          : account.status === 'authenticated' && account.profile ? <div className="account-profile">
            <div className="passport-identity">
              <div className="passport-photo"><AccountAvatar source={account.profile.avatarUrl} label={account.profile.nickname} /></div>
              <div><span className="micro-label">SIGNED IN DRIVER</span><strong>{account.profile.nickname}</strong><small>{account.profile.email}</small></div>
              <span className="passport-stamp is-synced">SYNCED</span>
            </div>
            <div className="account-stats" aria-label="云端比赛统计">
              <div><strong>{account.stats?.races ?? 0}</strong><span>参赛</span></div>
              <div><strong>{account.stats?.wins ?? 0}</strong><span>胜场</span></div>
              <div><strong>{account.stats?.bestFinish ? `#${account.stats.bestFinish}` : '—'}</strong><span>最佳名次</span></div>
            </div>
            <form className="nickname-form" onSubmit={event => void saveNickname(event)}>
              <label className="paper-field">云端昵称
                <input value={nickname} onChange={event => setNickname(event.target.value)} maxLength={12} autoComplete="nickname" />
              </label>
              <button className="small-button" type="submit" disabled={busy}>保存昵称</button>
            </form>
            <p className="account-tip">在首页更换头像后，会自动覆盖云端头像；下次登录即可恢复。</p>
            <button className="text-button account-signout" type="button" disabled={busy} onClick={() => void signOut()}>退出账号，切换为游客</button>
          </div> : <>
            <div className="account-tabs" role="tablist" aria-label="账号操作">
              <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); onClearError(); }}>邮箱登录</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); onClearError(); }}>创建账号</button>
            </div>
            <form className="account-form" onSubmit={event => void submitAccount(event)}>
              {mode === 'register' ? <label className="paper-field">车手昵称
                <input value={nickname} onChange={event => setNickname(event.target.value)} maxLength={12} autoComplete="nickname" required />
              </label> : null}
              <label className="paper-field">邮箱
                <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required />
              </label>
              <label className="paper-field">密码
                <input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
              </label>
              <button className="start-button account-submit" type="submit" disabled={busy}>
                <span>{busy ? '正在同步…' : mode === 'login' ? '登录车手证' : '创建车手证'}</span><span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="account-guest-note">不登录也能继续游玩；游客数据只保留在当前页面。</p>
          </>}
        {notice ? <p className="account-notice" role="status">{notice}</p> : null}
        {error ? <p className="account-error" role="alert">{error}</p> : null}
      </section>
    </div>, document.body) : null}
  </>;
}
