import { useEffect, useRef, useState } from 'react';
import type { GameState, HudSnapshot, MatchState, TrackDefinition } from '../shared/types';
import type { GameRuntime } from './game/runtime';
import { Hud, formatTime } from './ui/Hud';
import { TouchControls } from './ui/TouchControls';
import { AvatarPicker } from './ui/AvatarPicker';
import { MultiplayerPanel } from './ui/MultiplayerPanel';
import { OnlineLobby } from './ui/OnlineLobby';
import { AccountPanel } from './ui/AccountPanel';
import { ItemGuide } from './ui/ItemGuide';
import { useAccount } from './account/useAccount';
import { isAvatarImageSource } from './avatar/source';
import type { OnlineSession } from './network/OnlineSession';
import type { OnlineLobbySnapshot } from './network/types';

declare global {
  interface Window {
    __paperKart?: {
      inspect: () => GameState;
      inspectMatch: () => MatchState;
      inspectOnline: () => OnlineLobbySnapshot | null;
      track: () => TrackDefinition;
      inspectView: () => {
        cameraRight: { x: number; y: number; z: number };
        avatarFaceCount: number;
        avatarTextureSize: { width: number; height: number } | null;
      };
    };
  }
}

const INITIAL: HudSnapshot = {
  phase: 'menu', speed: 0, lap: 1, elapsed: 0, charge: 0, boosting: false,
  offTrack: false, paused: false, nextCheckpoint: 1, resetCount: 0,
  rank: 1, totalRacers: 6, item: null, shieldActive: false, results: [],
};

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<GameRuntime | null>(null);
  const online = useRef<OnlineSession | null>(null);
  const onlineUnsubscribe = useRef<(() => void) | null>(null);
  const onlineStarted = useRef(false);
  const raceRunId = useRef(0);
  const raceAccountId = useRef('');
  const recordedRace = useRef('');
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [avatar, setAvatar] = useState('');
  const [nickname, setNickname] = useState('纸片车手');
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [lobby, setLobby] = useState<OnlineLobbySnapshot | null>(null);
  const [raceSyncStatus, setRaceSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const account = useAccount();
  const accountProfile = account.snapshot.profile;
  const recordRaceResult = account.recordRaceResult;

  useEffect(() => {
    const profile = accountProfile;
    if (!profile) return;
    setNickname(profile.nickname);
    setAvatar(profile.avatarUrl);
    runtime.current?.setPlayerAvatar(profile.avatarUrl || 'default');
  }, [accountProfile]);

  useEffect(() => {
    const userId = accountProfile?.userId ?? '';
    if (snapshot.phase !== 'finished' || !userId || raceAccountId.current !== userId) return;
    const raceKey = `${userId}:${raceRunId.current}`;
    if (recordedRace.current === raceKey) return;
    recordedRace.current = raceKey;
    setRaceSyncStatus('saving');
    void recordRaceResult(snapshot.rank)
      .then(() => setRaceSyncStatus('saved'))
      .catch(cause => {
        recordedRace.current = '';
        setRaceSyncStatus('failed');
        console.warn('Paper Kart race stats sync failed', cause);
      });
  }, [accountProfile?.userId, recordRaceResult, snapshot.phase, snapshot.rank]);

  useEffect(() => {
    let cancelled = false;
    let instance: GameRuntime | undefined;
    import('./game/runtime').then(({ GameRuntime: Runtime }) => {
      if (cancelled || !canvas.current) return;
      instance = new Runtime(canvas.current, setSnapshot);
      runtime.current = instance;
      if (import.meta.env.DEV) {
        window.__paperKart = {
          inspect: instance.inspect,
          inspectMatch: instance.inspectMatch,
          inspectOnline: () => online.current?.inspect() ?? null,
          track: () => structuredClone(instance!.track),
          inspectView: instance.inspectView,
        };
      }
      setReady(true);
    }).catch((cause: unknown) => {
      if (cancelled) return;
      console.error('Paper Kart initialization failed', cause);
      setError('3D 场景加载失败。请使用支持 WebGL 2 的新版浏览器，并开启硬件加速后刷新。');
    });
    return () => {
      cancelled = true;
      onlineUnsubscribe.current?.();
      void online.current?.leave().catch(() => undefined);
      online.current = null;
      instance?.dispose();
      runtime.current = null;
      delete window.__paperKart;
    };
  }, []);

  const markRaceStart = () => {
    raceRunId.current++;
    raceAccountId.current = account.snapshot.profile?.userId ?? '';
    recordedRace.current = '';
    setRaceSyncStatus('idle');
  };
  const start = () => {
    markRaceStart();
    runtime.current?.start(avatar || 'default');
    canvas.current?.focus();
  };
  const menu = () => {
    const session = online.current;
    online.current = null;
    onlineUnsubscribe.current?.();
    onlineUnsubscribe.current = null;
    onlineStarted.current = false;
    setLobby(null);
    setOnlineError('');
    void session?.leave().catch(() => undefined);
    runtime.current?.menu(avatar || 'default');
  };
  const reset = () => runtime.current?.input.requestReset();

  const connectOnline = async (mode: 'create' | 'join', code = '') => {
    if (!ready || onlineBusy) return;
    setOnlineBusy(true);
    setOnlineError('');
    try {
      const { OnlineSession: Session } = await import('./network/OnlineSession');
      const profile = { nickname: nickname.trim() || '纸片车手', avatar: avatar || 'default' };
      const session = mode === 'create' ? await Session.create(profile) : await Session.join(code, profile);
      online.current = session;
      onlineStarted.current = false;
      onlineUnsubscribe.current = session.subscribe(next => {
        setLobby(next);
        if (next.error) setOnlineError(next.error);
        if (next.phase === 'racing' && !onlineStarted.current && runtime.current?.startOnline(session)) {
          onlineStarted.current = true;
          markRaceStart();
          canvas.current?.focus();
        }
      });
    } catch (cause) {
      console.warn('Paper Kart online connection failed', cause);
      const detail = cause instanceof Error ? cause.message : '';
      setOnlineError(detail.includes('seat reservation') || detail.includes('not found')
        ? '没有找到这个房间，请检查房间码。'
        : '暂时无法连接比赛服务器，单人比赛仍可正常游玩。');
    } finally {
      setOnlineBusy(false);
    }
  };

  const changeAvatar = async (nextAvatar: string) => {
    setAvatar(nextAvatar);
    runtime.current?.setPlayerAvatar(nextAvatar);
    if (account.snapshot.status === 'authenticated') await account.uploadAvatar(nextAvatar);
  };

  return <main className={'app phase-' + snapshot.phase}>
    <canvas ref={canvas} className="game-canvas" aria-label="Paper Kart 3D 赛车画面" tabIndex={-1} />
    <div className="paper-grain" aria-hidden="true" />
    {snapshot.phase === 'menu' && !lobby ? <>
      <header className="home-header">
        <div className="wordmark"><span className="brand-mark">P</span>PAPER KART</div>
        <div className="header-tools">
          <div className="edition"><span className="status-dot" /> 小小世界，认真开玩。<span className="edition-number">VOL. 01</span></div>
          <ItemGuide />
          <AccountPanel
            account={account.snapshot}
            busy={account.busy}
            error={account.error}
            onClearError={account.clearError}
            onSignIn={account.signIn}
            onSignUp={account.signUp}
            onSignOut={account.signOut}
            onUpdateNickname={account.updateNickname}
          />
        </div>
      </header>
      <section className="home-copy">
        <span className="eyebrow"><span>THE PAPER CIRCUIT</span><i />一场纸上兜风</span>
        <h1>Paper<br /><em>Kart.</em><span className="title-star" aria-hidden="true">✳</span></h1>
        <h2>把日常，开成赛道。</h2>
        <p>一辆小车，一片纸上的世界。<br />踩下油门，把风留在身后。</p>
        <button className="start-button" onClick={start} disabled={!ready || !!error}>
          <span>{ready ? '开始游戏' : '正在展开纸上世界…'}</span><span aria-hidden="true">↗</span>
        </button>
        <span className="start-caption">无需安装 · 即开即玩 · 单人练习</span>
        <AvatarPicker
          value={avatar}
          onChange={changeAvatar}
          syncLabel={account.snapshot.status === 'authenticated' ? '已贴好 · 云端同步完成' : '已贴好 · 游客数据仅留本页'}
        />
      </section>
      <MultiplayerPanel
        nickname={nickname}
        busy={onlineBusy}
        disabled={!ready || !!error}
        error={onlineError}
        onNicknameChange={setNickname}
        onCreate={() => void connectOnline('create')}
        onJoin={code => void connectOnline('join', code)}
      />
      <aside className="track-label"><span className="label-number">01</span><div><span className="micro-label">YOUR FIRST LITTLE ADVENTURE</span><strong>纸上练习场</strong><span>封闭环线 / 3 圈 / 漂移小喷</span></div><span className="label-arrow">↗</span></aside>
      <footer className="home-footer">
        <span className="touch-legend">多指触控驾驶 · 横屏体验更佳</span>
        <div className="control-legend"><span className="micro-label">HOW TO PLAY</span><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> 驾驶</span><span><kbd>SPACE</kbd> 漂移</span><span><kbd>E</kbd> 道具</span><span><kbd>R</kbd> 重置</span></div>
        <span className="footer-note">MADE OF PAPER. BUILT FOR PLAY.</span>
      </footer>
    </> : <>
      <Hud snapshot={snapshot} onReset={reset} onMenu={menu} />
      {runtime.current && snapshot.phase === 'racing' ? <TouchControls input={runtime.current.input} /> : null}
    </>}
    {lobby?.phase === 'lobby' ? <OnlineLobby
      lobby={lobby}
      onReady={value => online.current?.setReady(value)}
      onStart={() => online.current?.startRace()}
      onLeave={menu}
    /> : null}
    {lobby && lobby.phase !== 'lobby' ? <div className={`network-pill is-${lobby.status}`} aria-live="polite">
      <span /> 房间 {lobby.roomCode} · {lobby.status === 'reconnecting' ? '正在重连' : lobby.status === 'disconnected' ? '连接断开' : '服务器权威比赛'}
    </div> : null}
    {snapshot.phase === 'finished' ? <section className="finish-backdrop" aria-label="比赛完成">
      <div className="finish-card"><span className="eyebrow">THE PAPER FINISH.</span><span className="finish-stamp" aria-hidden="true">✳</span><h2>兜风成功！</h2><p>6 台纸片车，3 圈纸上冒险。</p><strong className="finish-time">{formatTime(snapshot.elapsed)}</strong><span className="micro-label">你的完赛用时 · 第 {snapshot.rank} 名</span><div className="results-list" aria-label="比赛排名">
        {snapshot.results.map(result => <div className={'result-row ' + (result.id === (lobby?.localSessionId ?? 'player') ? 'is-player' : '')} key={result.id}><span className="result-position">{String(result.position).padStart(2, '0')}</span><span className="result-avatar" style={{ background: result.color }}>{isAvatarImageSource(result.avatar) ? <img src={result.avatar} alt="你的头像" /> : result.avatar.replace('ai:', '')}</span><strong>{result.name}</strong><span>{result.time === null ? '—' : formatTime(result.time)}</span></div>)}
      </div><span className="finish-sync-note">{raceAccountId.current
        ? raceSyncStatus === 'saving' ? '正在写入云端战绩…' : raceSyncStatus === 'saved' ? '本局战绩已同步' : raceSyncStatus === 'failed' ? '战绩暂未同步' : '准备同步本局战绩…'
        : '游客比赛不保存战绩'}</span>{lobby ? null : <button className="start-button" onClick={start}>重新开始 <span aria-hidden="true">↗</span></button>}<button className="text-button" onClick={menu}>返回首页</button></div>
    </section> : null}
    {error ? <div className="error-card" role="alert"><strong>纸上世界暂时没有展开</strong><p>{error}</p><button className="small-button" onClick={() => location.reload()}>重新加载</button></div> : null}
  </main>;
}
