import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const ITEMS = [
  {
    id: 'paper-plane',
    number: '01',
    symbol: '➤',
    name: '纸飞机',
    english: 'PAPER PLANE',
    effect: '自动锁定前方赛车，让对手短暂减速。对方有护盾时会先击碎护盾。',
    tip: '落后时使用，越靠近前车越直观。',
  },
  {
    id: 'glue',
    number: '02',
    symbol: '●',
    name: '胶水',
    english: 'PAPER GLUE',
    effect: '在赛车后方留下胶水陷阱，其他车碾过后会减速；陷阱约存在 12 秒。',
    tip: '弯心或窄路出口最容易命中。',
  },
  {
    id: 'cardboard-shield',
    number: '03',
    symbol: '▣',
    name: '纸箱护盾',
    english: 'BOX SHIELD',
    effect: '展开一次性防护，抵挡下一次纸飞机攻击或胶水减速。',
    tip: '领先或进入混战前提前展开。',
  },
  {
    id: 'spring',
    number: '04',
    symbol: '➶',
    name: '火箭加速',
    english: 'ROCKET BOOST',
    effect: '像纸火箭一样向前冲刺，获得一段明显的短时加速。',
    tip: '出弯或驶入大直线时收益最高。',
  },
] as const;

export function ItemGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return <>
    <button className="item-guide-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="打开道具图鉴">
      <span className="guide-trigger-mark" aria-hidden="true">✦</span>
      <span><strong>道具图鉴</strong><small>ITEM MANUAL</small></span>
    </button>

    {open ? createPortal(<div className="item-guide-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="item-guide-book" role="dialog" aria-modal="true" aria-labelledby="item-guide-title">
        <button className="item-guide-close" type="button" aria-label="关闭道具图鉴" onClick={() => setOpen(false)}>×</button>
        <header className="item-guide-heading">
          <div>
            <span className="micro-label">PAPER POWER FIELD NOTES / 纸上赛事实用手册</span>
            <h2 id="item-guide-title">四件小道具，<em>四种翻盘方式。</em></h2>
          </div>
          <span className="guide-edition">ISSUE<br /><strong>04</strong></span>
        </header>

        <div className="item-guide-steps" aria-label="道具使用方法">
          <span><i>1</i> 驶过彩色道具盒随机拾取</span>
          <span><i>2</i> 每次只能携带一件</span>
          <span><i>3</i> 电脑按 <kbd>E</kbd> 使用</span>
          <span><i>4</i> 手机点“道具”按钮</span>
        </div>

        <div className="item-guide-grid">
          {ITEMS.map(item => <article className={`item-guide-card is-${item.id}`} key={item.id}>
            <span className="item-card-number">{item.number}</span>
            <div className="item-card-icon" aria-hidden="true"><span>{item.symbol}</span></div>
            <div className="item-card-copy">
              <span className="micro-label">{item.english}</span>
              <h3>{item.name}</h3>
              <p>{item.effect}</p>
              <small><b>使用时机</b>{item.tip}</small>
            </div>
          </article>)}
        </div>

        <footer className="item-guide-footer">
          <span>HUD 左下角会显示当前道具</span>
          <strong>看准时机，再按下去。</strong>
        </footer>
      </section>
    </div>, document.body) : null}
  </>;
}
