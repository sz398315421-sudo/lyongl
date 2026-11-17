import { useState } from 'react';

export function MultiplayerPanel({
  nickname,
  busy,
  disabled,
  error,
  onNicknameChange,
  onCreate,
  onJoin,
}: {
  nickname: string;
  busy: boolean;
  disabled: boolean;
  error: string;
  onNicknameChange: (value: string) => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const normalizedCode = code.trim().toUpperCase();

  return <aside className="multiplayer-entry" aria-label="真人联机">
    <span className="ticket-pin" aria-hidden="true" />
    <span className="micro-label">PLAY TOGETHER / 真人联机</span>
    <h2>和朋友一起兜风</h2>
    <label className="paper-field">
      <span>你的昵称</span>
      <input
        aria-label="你的昵称"
        value={nickname}
        maxLength={12}
        onChange={event => onNicknameChange(event.target.value)}
        autoComplete="nickname"
      />
    </label>
    <button className="online-create-button" type="button" onClick={onCreate} disabled={disabled || busy}>
      <span>{busy ? '正在连线…' : '创建房间'}</span><span aria-hidden="true">＋</span>
    </button>
    <div className="join-rule"><span>已有房间码</span></div>
    <div className="join-row">
      <input
        aria-label="4 位房间码"
        className="room-code-input"
        value={code}
        maxLength={4}
        placeholder="ABCD"
        inputMode="text"
        autoCapitalize="characters"
        onChange={event => setCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
        onKeyDown={event => {
          if (event.key === 'Enter' && normalizedCode.length === 4 && !busy) onJoin(normalizedCode);
        }}
      />
      <button className="small-button" type="button" disabled={disabled || busy || normalizedCode.length !== 4} onClick={() => onJoin(normalizedCode)}>加入</button>
    </div>
    <p className="online-caption">2–6 位真人 · 开赛时 AI 自动补足 6 台</p>
    {error ? <p className="online-error" role="alert">{error}</p> : null}
  </aside>;
}
