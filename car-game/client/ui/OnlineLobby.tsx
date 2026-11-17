import { useState } from 'react';
import type { OnlineLobbySnapshot } from '../network/types';
import { isAvatarImageSource } from '../avatar/source';

function PlayerAvatar({ avatar, name }: { avatar: string; name: string }) {
  if (isAvatarImageSource(avatar)) return <img src={avatar} alt={`${name}的头像`} />;
  return <span aria-hidden="true">{name.slice(0, 1) || 'P'}</span>;
}

export function OnlineLobby({
  lobby,
  onReady,
  onStart,
  onLeave,
}: {
  lobby: OnlineLobbySnapshot;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const local = lobby.players.find(player => player.sessionId === lobby.localSessionId);
  const connected = lobby.players.filter(player => player.connected);
  const allReady = connected.length >= 2 && connected.every(player => player.ready);
  const isHost = lobby.hostId === lobby.localSessionId;
  const slots = Array.from({ length: 6 }, (_, index) => lobby.players[index]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return <section className="lobby-backdrop" aria-label="联机房间大厅">
    <div className="lobby-card">
      <header className="lobby-heading">
        <div>
          <span className="micro-label">PAPER PIT / 纸片维修区</span>
          <h2>等朋友来，再一起出发。</h2>
        </div>
        <button className="text-button lobby-leave" type="button" onClick={onLeave}>退出房间</button>
      </header>

      <div className="room-ticket">
        <span>房间码</span>
        <strong data-testid="room-code">{lobby.roomCode || '····'}</strong>
        <button type="button" onClick={() => void copyCode()}>{copied ? '已复制' : '复制给朋友'}</button>
      </div>

      <div className="lobby-status-line" aria-live="polite">
        <span className={`connection-dot is-${lobby.status}`} />
        {lobby.status === 'reconnecting' ? '正在重新连接…' : lobby.status === 'disconnected' ? '连接已断开' : `${connected.length} / 6 位真人已入场`}
      </div>

      <div className="lobby-grid" aria-label="房间成员">
        {slots.map((player, index) => <article className={`lobby-slot ${player ? 'is-filled' : ''}`} key={player?.sessionId ?? `empty-${index}`}>
          <span className="slot-number">{String(index + 1).padStart(2, '0')}</span>
          {player ? <>
            <div className="lobby-avatar"><PlayerAvatar avatar={player.avatar} name={player.nickname} /></div>
            <div className="lobby-player-copy">
              <strong>{player.nickname}{player.sessionId === lobby.localSessionId ? '（你）' : ''}</strong>
              <span>{player.host ? '房主' : player.connected ? '车手' : '暂时离线'}</span>
            </div>
            <span className={`ready-stamp ${player.ready ? 'is-ready' : ''}`}>{player.ready ? 'READY' : 'WAIT'}</span>
          </> : <><div className="empty-avatar">＋</div><span className="empty-copy">等待车手</span></>}
        </article>)}
      </div>

      <footer className="lobby-actions">
        <div>
          <strong>{isHost ? '你是房主' : '等待房主发车'}</strong>
          <span>{connected.length < 2 ? '至少需要 2 位真人' : allReady ? '所有人准备完毕' : '请等待所有车手准备'}</span>
        </div>
        <button className={`ready-button ${local?.ready ? 'is-ready' : ''}`} type="button" disabled={!local?.connected} onClick={() => onReady(!local?.ready)}>
          {local?.ready ? '取消准备' : '我准备好了'}
        </button>
        {isHost ? <button className="start-button lobby-start" type="button" disabled={!allReady} onClick={onStart}>开始比赛 <span aria-hidden="true">↗</span></button> : null}
      </footer>
      {lobby.error ? <p className="online-error lobby-error" role="alert">{lobby.error}</p> : null}
    </div>
  </section>;
}
