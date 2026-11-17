import type { HudSnapshot } from '../../shared/types';

const ITEM_NAMES = {
  'paper-plane': '纸飞机',
  glue: '胶水',
  'cardboard-shield': '纸箱护盾',
  spring: '火箭加速',
} as const;

const ITEM_SYMBOLS = {
  'paper-plane': '➤',
  glue: '●',
  'cardboard-shield': '▣',
  spring: '➶',
} as const;

export function formatTime(seconds: number): string {
  return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toFixed(1).padStart(4, '0');
}

export function Hud({ snapshot, onReset, onMenu }: {
  snapshot: HudSnapshot; onReset: () => void; onMenu: () => void;
}) {
  return <>
    <header className="race-header">
      <button className="wordmark compact" onClick={onMenu} aria-label="返回首页"><span className="brand-mark">P</span> PAPER KART<span className="back-label">↗ 返回</span></button>
      <div className="race-actions"><span className="course-name">纸上练习场 <span> / 01</span></span><button className="small-button" onClick={onReset}>重置赛车 <kbd>R</kbd></button></div>
    </header>
    <section className="race-stats" aria-label="比赛状态">
      <div className="stat paper-stat"><span className="micro-label">LAP / 圈数</span><strong><span data-testid="lap">{snapshot.lap}</span><small> / 3</small></strong></div>
      <div className="stat"><span className="micro-label">POSITION / 名次</span><strong>{String(snapshot.rank).padStart(2, '0')}<small> / {String(snapshot.totalRacers).padStart(2, '0')}</small></strong><span className="solo-note">纸上混战</span></div>
      <div className="stat timer-stat"><span className="micro-label">TIME / 用时</span><strong className="timer" data-testid="timer">{formatTime(snapshot.elapsed)}</strong></div>
    </section>
    <div className="speed-dial">
      <span className="micro-label">MAKE A LITTLE WIND.</span>
      <div><strong data-testid="speed">{snapshot.speed}</strong><span>km/h</span></div>
      <div className={'charge-track ' + (snapshot.boosting ? 'boosting' : '')}><span style={{ width: (snapshot.boosting ? 100 : snapshot.charge * 100) + '%' }} /></div>
      <span className="charge-label">{snapshot.boosting ? '小喷加速！' : snapshot.charge >= 1 ? '松开漂移 · 释放小喷' : snapshot.charge > 0 ? '漂移蓄力中…' : '按住 SPACE 转弯 · 蓄力小喷'}</span>
    </div>
    <div className={'item-dial ' + (snapshot.item ? 'has-item item-' + snapshot.item : '')} aria-label="当前道具">
      <span className="item-dial-mark" aria-hidden="true">{snapshot.item ? ITEM_SYMBOLS[snapshot.item] : '✦'}</span>
      <div className="item-dial-copy">
        <span className="micro-label">PAPER POWER / 道具</span>
        <strong>{snapshot.item ? ITEM_NAMES[snapshot.item] : '等待拾取'}</strong>
        <span>{snapshot.shieldActive ? '护盾已展开' : snapshot.item ? '按 E 使用' : '驶过彩色道具盒'}</span>
      </div>
    </div>
    <div className="race-hint" aria-live="polite">
      {snapshot.paused ? '已暂停 · 回到页面继续驾驶' : snapshot.offTrack ? '驶离赛道 · 即将回到检查点' : snapshot.phase === 'racing' && snapshot.lap === 3 && snapshot.rank ? '继续前进 · 其他纸片车正在冲线' : '沿赛道前进，驶过黄色检查点标记'}
    </div>
    <div className="keyboard-help"><kbd>W A S D</kbd><span>驾驶</span><kbd>SPACE</kbd><span>漂移</span><kbd>E</kbd><span>道具</span><kbd>R</kbd><span>重置</span></div>
  </>;
}
