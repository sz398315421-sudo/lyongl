import { useRef, useState } from 'react'
import { ArrowsLeftRight, LinkSimple, LinkBreak, Check, ArrowCounterClockwise } from '@phosphor-icons/react'
import { CANVAS_PRESETS, MIN_CANVAS_SIDE, MAX_CANVAS_SIDE, validCanvasSize, type CanvasSettings, type CanvasSize } from './canvas-settings'

export default function CanvasSettingsPanel({ value, size, onApply }: {
  value: CanvasSettings | null
  size: CanvasSize
  onApply: (settings: CanvasSettings | null) => void
}) {
  const [width, setWidth] = useState(String(size.width))
  const [height, setHeight] = useState(String(size.height))
  const [locked, setLocked] = useState(value?.locked || false)
  const [fit, setFit] = useState<CanvasSettings['fit']>(value?.fit || 'contain')
  const [error, setError] = useState('')
  const ratio = useRef(size.width/size.height)

  function changeSide(side: 'width' | 'height', text: string) {
    setError('')
    if (side === 'width') setWidth(text); else setHeight(text)
    const n = Number(text)
    if (locked && text !== '' && Number.isFinite(n) && n > 0) {
      if (side === 'width') setHeight(String(Math.round(n/ratio.current)))
      else setWidth(String(Math.round(n*ratio.current)))
    }
  }
  function chooseSize(w: number, h: number) { setWidth(String(w)); setHeight(String(h)); ratio.current = w/h; setError('') }
  function apply(e: React.FormEvent) {
    e.preventDefault()
    const w = Number(width), h = Number(height)
    if (!validCanvasSize(w,h)) { setError(`宽和高都需要是 ${MIN_CANVAS_SIDE} 至 ${MAX_CANVAS_SIDE} 之间的整数像素。`); return }
    onApply({ width:w, height:h, fit, locked })
  }
  return <form className="canvas-size-form" noValidate onSubmit={apply}>
    <div className="size-fields">
      <label>宽度<span><input aria-label="画布宽度" type="number" inputMode="numeric" min={MIN_CANVAS_SIDE} max={MAX_CANVAS_SIDE} step="1" value={width} onChange={e=>changeSide('width',e.target.value)} aria-invalid={!!error} aria-describedby={error?'canvas-size-error':undefined}/><small>像素</small></span></label>
      <button type="button" className={`size-ratio-lock ${locked?'active':''}`} aria-label={locked?'解锁画布比例':'锁定画布比例'} aria-pressed={locked} onClick={()=>{if(!locked && Number(width)>0 && Number(height)>0)ratio.current=Number(width)/Number(height);setLocked(v=>!v)}}>{locked?<LinkSimple size={20}/>:<LinkBreak size={20}/>}</button>
      <label>高度<span><input aria-label="画布高度" type="number" inputMode="numeric" min={MIN_CANVAS_SIDE} max={MAX_CANVAS_SIDE} step="1" value={height} onChange={e=>changeSide('height',e.target.value)} aria-invalid={!!error} aria-describedby={error?'canvas-size-error':undefined}/><small>像素</small></span></label>
    </div>
    <div className="size-form-tools"><button type="button" onClick={()=>chooseSize(Number(height),Number(width))}><ArrowsLeftRight size={16}/>横竖切换</button></div>
    {error&&<p id="canvas-size-error" role="alert" className="size-error">{error}</p>}
    <label className="field-label size-preset-title">常用尺寸</label>
    <div className="size-preset-grid">{CANVAS_PRESETS.map(p=><button type="button" key={p.name} className={Number(width)===p.width&&Number(height)===p.height?'selected':''} aria-pressed={Number(width)===p.width&&Number(height)===p.height} onClick={()=>chooseSize(p.width,p.height)}><span className="preset-shape" style={{aspectRatio:String(p.width/p.height)}}/><strong>{p.name}<small>{p.ratio}</small></strong><span>{p.width} × {p.height}</span></button>)}</div>
    <label className="select-label size-fit-label">素材适配方式<select aria-label="素材适配方式" value={fit} onChange={e=>setFit(e.target.value as CanvasSettings['fit'])}><option value="contain">完整显示</option><option value="cover">居中裁切</option><option value="stretch">拉伸铺满</option></select></label>
    <div className="size-form-footer"><button type="button" className="button quiet" onClick={()=>onApply(null)}><ArrowCounterClockwise size={16}/>跟随素材</button><button type="submit" className="button primary"><Check size={17}/>应用画布尺寸</button></div>
  </form>
}
