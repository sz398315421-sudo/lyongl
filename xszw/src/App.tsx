import React, { useState, useRef, useEffect, useCallback } from 'react'
import { SquaresFour, SlidersHorizontal, TextAa, Waves, Drop, Lightning, UploadSimple, ArrowUpRight, DownloadSimple, BookmarkSimple, ArrowCounterClockwise, Shuffle, Play, Pause, Eye, CornersOut, Minus, Plus, Check, X, Info, Trash, CaretRight, CaretDown, ImageSquare, CheckCircle, Atom } from '@phosphor-icons/react'
import { EFFECTS, DEFAULTS, PRESETS, designStore, type Params, type StylePreset, type SavedDesign } from './studio'
import { makeRenderer, type SourceElement } from './renderer'
import { randomizeAsciiParams } from '@/presets/ascii-presets'
import { randomizeGlitchParams } from '@/presets/glitch-presets'
import { randomizeMarbleParams } from '@/presets/marble-presets'
import { randomizeFlowParams } from '@/presets/flow-presets'
import { randomizeParticleParams } from '@/presets/particle-presets'
import type { EffectType } from '@/types'
import CanvasSettingsPanel from './CanvasSettingsPanel'
import { getCanvasSize, getExportSize, fitWithin, type CanvasSettings } from './canvas-settings'

const icons = { glitch: Lightning, ascii: TextAa, marble: Drop, flow: Waves, particles: Atom }
type Source = { element: SourceElement; url: string; name: string; width: number; height: number; owned?: boolean; video: boolean }
type ModalName = 'export' | 'canvas' | null
const clone = <T,>(value: T): T => structuredClone(value)
function readImage(url: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图片读取失败，请尝试其他文件。')); img.src = url }) }

function Preview({ effect, preset }: { effect: EffectType; preset: StylePreset }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setFailed(false)
    async function draw() {
      try {
        const source = preset.image ? await readImage(import.meta.env.BASE_URL + preset.image.slice(1)) : null
        if (cancelled || !ref.current) return
        const renderer = makeRenderer(ref.current, effect, source)
        try { renderer.draw({ ...DEFAULTS, [effect]: { ...DEFAULTS[effect], ...preset.patch } }, 20) } finally { renderer.destroy() }
      } catch { if (!cancelled) setFailed(true) }
    }
    void draw()
    return () => { cancelled = true }
  }, [effect, preset])
  return failed ? <span className="preview-unavailable"><ImageSquare size={28}/></span> : <canvas ref={ref} width="180" height="180" aria-hidden="true"/>
}

function Range({ label, value, min = 0, max = 100, step = 1, onChange, unit = '' }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; unit?: string }) {
  const decimals = step < 1 ? step < .1 ? 2 : 1 : 0
  return <label className="range-control"><span className="control-label"><span>{label}</span><span className="numeric">{value.toFixed(decimals)}{unit}</span></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} style={{ '--fill': `${(value-min)/(max-min)*100}%` } as React.CSSProperties} onChange={e => onChange(Number(e.target.value))}/></label>
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <div className="toggle-row"><span>{label}</span><button className={`switch ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}><span/></button></div>
}
function Section({ title, children, tag }: { title: string; children: React.ReactNode; tag?: string }) { return <section className="control-section"><h3>{title}</h3>{children}</section> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('button,select,input')?.focus()
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab') {
        const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select,input,a[href]') || [])]
        if (!nodes.length) return
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus() }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}><div className="modal" ref={dialog} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></header>{children}</div></div>
}

export default function App() {
  const [effect, setEffect] = useState<EffectType>('glitch')
  const [params, setParams] = useState<Params>(() => clone(DEFAULTS))
  const [source, setSource] = useState<Source | null>(null)
  const [canvasSettings, setCanvasSettings] = useState<CanvasSettings | null>(null)
  const outputSize = getCanvasSize(canvasSettings, source, effect)
  const [isUploaded, setIsUploaded] = useState(false)
  const [selected, setSelected] = useState('g1')
  const [playing, setPlaying] = useState(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [compare, setCompare] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [panel, setPanel] = useState<'presets' | 'saved'>('presets')
  const [saved, setSaved] = useState<SavedDesign[]>([])
  const [modal, setModal] = useState<ModalName>(null)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [showProperties, setShowProperties] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [time, setTime] = useState(0)
  const [exportFormat, setExportFormat] = useState('PNG')
  const [duration, setDuration] = useState(3)
  const [fps, setFps] = useState(24)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const loadId = useRef(0)
  const frame = useRef(0)
  const isExporting = useRef(false)
  const current = useRef({ params, playing, compare })
  current.current = { params, playing, compare }
  const active = EFFECTS.find(e => e.id === effect)!
  const ActiveIcon = icons[effect]
  const notify = useCallback((text: string) => setToast(text), [])

  const loadSource = useCallback(async (url: string, name: string, video = false, owned = false) => {
    const request = ++loadId.current
    setLoading(true); setError('')
    try {
      let element: SourceElement
      if (video) {
        element = await new Promise<HTMLVideoElement>((resolve,reject) => {
          const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'
          v.onloadeddata = () => resolve(v); v.onerror = () => reject(new Error('视频无法解码，请尝试标准 MP4 文件。')); v.src = url
        })
      } else element = await readImage(url)
      if (request !== loadId.current) { if (owned) URL.revokeObjectURL(url); return }
      const width = element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth
      const height = element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight
      setSource({ element, url, name, width, height, video, owned }); frame.current = 0
    } catch (e) { if (request === loadId.current) setError((e as Error).message); if (owned) URL.revokeObjectURL(url) }
    finally { if (request === loadId.current) setLoading(false) }
  }, [])

  useEffect(() => { void loadSource(import.meta.env.BASE_URL + 'presets/glitch-03.webp', '石膏像.webp'); void designStore('list').then(setSaved).catch(() => notify('此浏览器暂不支持本地收藏，其他功能仍可使用。')) }, [loadSource, notify])
  useEffect(() => () => { if (source?.video) (source.element as HTMLVideoElement).pause(); if (source?.owned) URL.revokeObjectURL(source.url) }, [source])
  useEffect(() => { if (source?.video) { if (playing) void (source.element as HTMLVideoElement).play().catch(() => setPlaying(false)); else (source.element as HTMLVideoElement).pause() } }, [playing, source])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer) }, [toast])
  useEffect(() => { const timer = setInterval(() => setTime(frame.current / 30), 500); return () => clearInterval(timer) }, [])
  useEffect(() => { if (!viewport.current) return; const observer = new ResizeObserver(([entry]) => { const rect = entry.target.getBoundingClientRect(); setSize({ width: rect.width, height: rect.height }) }); observer.observe(viewport.current); return () => observer.disconnect() }, [])

  const handleFile = useCallback((file: File) => {
    const video = ['video/mp4', 'video/webm', 'video/mpeg'].includes(file.type)
    if (!video && !['image/png','image/jpeg','image/webp'].includes(file.type)) { setError('文件格式不支持。请选择 JPG、PNG、WebP 图片，或 MP4、WebM 视频。'); return }
    if (file.size > (video ? 100 : 10) * 1024 * 1024) { setError(`${video ? '视频' : '图片'}过大，请选择小于 ${video ? 100 : 10}MB 的文件。`); return }
    setIsUploaded(true); setSelected(''); setZoom(100)
    void loadSource(URL.createObjectURL(file), file.name, video, true)
  }, [loadSource])
  useEffect(() => {
    function paste(e: ClipboardEvent) { if ((e.target as HTMLElement).matches('input,textarea')) return; const file = e.clipboardData?.files[0]; if (file) handleFile(file) }
    function key(e: KeyboardEvent) { if ((e.target as HTMLElement).matches('input,textarea,select,button') || modal) return; if (e.code === 'Space') { e.preventDefault(); setPlaying(p => !p) } if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); uploadInput.current?.click() } }
    window.addEventListener('paste',paste); window.addEventListener('keydown',key)
    return () => { window.removeEventListener('paste',paste); window.removeEventListener('keydown',key) }
  }, [handleFile, modal])

  useEffect(() => {
    if (!canvas.current || (!source && effect !== 'marble')) return
    const target = canvas.current
    const previewSize = fitWithin(outputSize, 1200)
    target.width = previewSize.width; target.height = previewSize.height
    let renderer: ReturnType<typeof makeRenderer>
    try { renderer = makeRenderer(target, effect, source?.element || null, canvasSettings) } catch (e) { setError((e as Error).message); return }
    let raf = 0, last = 0, previousParams: Params | null = null, previousCompare: boolean | null = null
    const animate = (now: number) => {
      const state = current.current
      if (!isExporting.current && now-last >= 1000/30 && (state.playing || previousParams !== state.params || previousCompare !== state.compare)) {
        if (state.playing) frame.current += last ? Math.min(now-last,100) / 1000 * 30 : 1
        try { renderer.draw(state.params, Math.floor(frame.current),30,state.compare) } catch (e) { setError('效果渲染失败，请重置参数或换一张图片。'); cancelAnimationFrame(raf); return }
        last = now; previousParams = state.params; previousCompare = state.compare
      }
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(raf); renderer.destroy() }
  }, [effect, source, outputSize.width, outputSize.height, canvasSettings])

  function setValue(key: string, value: unknown) { setParams(p => ({ ...p, [effect]: { ...p[effect], [key]: value } })); setSelected('') }
  function choosePreset(preset: StylePreset, targetEffect = effect) {
    setEffect(targetEffect); setSelected(preset.id); setParams(p => ({ ...p, [targetEffect]: { ...DEFAULTS[targetEffect], ...preset.patch } })); frame.current = 0
    if (!isUploaded && preset.image) void loadSource(import.meta.env.BASE_URL + preset.image.slice(1), `${preset.name}.${preset.image.split('.').at(-1)}`)
  }
  function switchEffect(id: EffectType) { if (id === effect) return; setError(''); setCompare(false); choosePreset(PRESETS[id][0], id) }
  function randomize() {
    const randomizers = { glitch: randomizeGlitchParams, ascii: randomizeAsciiParams, marble: randomizeMarbleParams, flow: randomizeFlowParams, particles: randomizeParticleParams }
    setParams(p => ({ ...p, [effect]: randomizers[effect]() })); setSelected(''); notify('已随机')
  }
  function reset() { setParams(p => ({ ...p, [effect]: clone(DEFAULTS[effect]) })); setSelected(''); frame.current = 0; notify('已重置') }
  async function saveDesign() {
    if (!canvas.current || !source) return
    try {
      const thumb = document.createElement('canvas'); thumb.width = 240; thumb.height = Math.round(240*canvas.current.height/canvas.current.width); thumb.getContext('2d')!.drawImage(canvas.current,0,0,thumb.width,thumb.height)
      const input = document.createElement('canvas'); const scale = Math.min(1,1600 / Math.max(source.width,source.height)); input.width = Math.round(source.width*scale); input.height = Math.round(source.height*scale); input.getContext('2d')!.drawImage(source.element,0,0,input.width,input.height)
      const design: SavedDesign = { id: crypto.randomUUID(), name: `${active.name} · ${new Date().toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})}`, effect, params: clone(params), thumbnail: thumb.toDataURL('image/jpeg',.8), source: input.toDataURL('image/jpeg',.94), sourceName: source.name, created: Date.now(), canvasSettings: clone(canvasSettings) }
      setSaved(await designStore('save',design)); notify('已收藏')
    } catch { setError('收藏失败，浏览器存储空间可能不足。你仍可直接导出作品。') }
  }
  function restore(design: SavedDesign) { setParams({ ...clone(DEFAULTS), ...clone(design.params) }); setCanvasSettings(clone(design.canvasSettings || null)); setEffect(design.effect); setSelected(''); setIsUploaded(true); setCompare(false); void loadSource(design.source,design.sourceName); notify('已恢复') }
  async function removeSaved(id: string) { try { setSaved(await designStore('delete',id)); notify('已移除') } catch { notify('移除失败，请重试') } }

  async function doExport() {
    if (!canvas.current || exporting) return
    setExporting(true); setProgress(0); setError(''); isExporting.current = true
    const sourceVideo = source?.video ? source.element as HTMLVideoElement : null
    const wasVideoPlaying = sourceVideo ? !sourceVideo.paused : false
    const oldTime = sourceVideo?.currentTime || 0
    sourceVideo?.pause()
    let renderer: ReturnType<typeof makeRenderer> | undefined
    try {
      const exporter = await import('@/engines/exporter')
      const filename = `像素造物-${active.name}-${Date.now()}`
      const out = document.createElement('canvas')
      const exportSize = getExportSize(outputSize, exportFormat, !!canvasSettings)
      if (exportFormat === 'GIF' && exportSize.width*exportSize.height*duration*15 > 100_000_000) throw new Error('这个尺寸的 GIF 需要较多内存。请缩小画布或缩短时长，也可以改为导出 MP4。')
      out.width = exportSize.width; out.height = exportSize.height
      renderer = makeRenderer(out,effect,source?.element || null,canvasSettings)
      if (['PNG','JPEG','SVG','PDF'].includes(exportFormat)) {
        renderer.draw(params,Math.floor(frame.current))
        if (exportFormat === 'PNG') await exporter.exportPNG(out,filename)
        if (exportFormat === 'JPEG') await exporter.exportJPEG(out,filename)
        if (exportFormat === 'SVG') await exporter.exportSVG(out,filename)
        if (exportFormat === 'PDF') await exporter.exportPDF(out,filename)
      } else {
        const outputFps = exportFormat === 'GIF' ? 15 : fps
        const frameCount = Math.round(duration*outputFps)
        const effectiveParams = clone(params); effectiveParams.ascii.animated = true; effectiveParams.marble.animated = true
        if (exportFormat === 'GIF') {
          const { default: GIF } = await import('gif.js')
          const gif = new GIF({ workers: 2, quality: 10, width: out.width, height: out.height, workerScript: import.meta.env.BASE_URL + 'gif.worker.js' })
          for (let i = 0; i < frameCount; i++) {
            if (sourceVideo) await seekVideo(sourceVideo,(oldTime+i/outputFps) % sourceVideo.duration)
            renderer.draw(effectiveParams, i*30/outputFps)
            gif.addFrame(out,{copy:true,delay:1000/outputFps}); setProgress(i/frameCount*.65)
            if (i%5 === 0) await new Promise(r => setTimeout(r,0))
          }
          await new Promise<void>((resolve,reject) => {
            const timer = setTimeout(() => { gif.abort(); reject(new Error('动图导出超时，请缩短时长后重试。')) },120000)
            gif.on('progress',p => setProgress(.65+p*.35))
            gif.on('finished',blob => { clearTimeout(timer); download(blob,`${filename}.gif`); resolve() })
            gif.on('abort',() => { clearTimeout(timer); reject(new Error('动图导出已停止，请重试。')) })
            gif.render()
          })
        } else {
          if (typeof VideoEncoder === 'undefined') throw new Error('此浏览器不支持 MP4 导出，请使用新版 Chrome 或 Edge，或选择 GIF。')
          // Seek source video before capturing each frame, then encode a bounded, silent clip.
          if (sourceVideo) {
            const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
            const muxer = new Muxer({target:new ArrayBufferTarget(),video:{codec:'avc',width:out.width,height:out.height},fastStart:'in-memory'})
            let encodeError: Error | null = null
            const encoder = new VideoEncoder({output:(chunk,meta) => muxer.addVideoChunk(chunk,meta || undefined),error:e => { encodeError=e }})
            try {
              encoder.configure(await exporter.getMP4EncoderConfig(out.width,out.height,outputFps))
              for (let i=0;i<frameCount;i++) {
                await seekVideo(sourceVideo,(oldTime+i/outputFps)%sourceVideo.duration)
                renderer.draw(effectiveParams,i*30/outputFps)
                const vf = new VideoFrame(out,{timestamp:Math.round(i/outputFps*1e6),duration:Math.round(1e6/outputFps)})
                try { encoder.encode(vf,{keyFrame:i%(outputFps*2)===0}) } finally { vf.close() }
                while(encoder.encodeQueueSize>5) { if(encodeError) throw encodeError; await new Promise(r=>setTimeout(r,1)) }
                setProgress(i/frameCount)
              }
              await encoder.flush(); if(encodeError) throw encodeError; muxer.finalize(); download(new Blob([(muxer.target as InstanceType<typeof ArrayBufferTarget>).buffer],{type:'video/mp4'}),`${filename}.mp4`)
            } finally { if(encoder.state !== 'closed') encoder.close() }
          } else await exporter.exportMP4(out, i => renderer!.draw(effectiveParams,i*30/outputFps), { duration,fps:outputFps,filename,onProgress:setProgress })
        }
      }
      setProgress(1); notify(exportFormat === 'PDF' ? '已打开打印窗口，请选择另存为 PDF' : `${exportFormat} 作品已导出`); setModal(null)
    } catch (e) { setError((e as Error).message || '导出失败，请更换格式后重试。') }
    finally { renderer?.destroy(); if(sourceVideo) { sourceVideo.currentTime=oldTime; if(wasVideoPlaying) void sourceVideo.play().catch(()=>{}); } isExporting.current=false; setExporting(false) }
  }

  const ratio = outputSize.width/outputSize.height
  const exportSize = getExportSize(outputSize,exportFormat,!!canvasSettings)
  const exportNote = exportFormat==='SVG' ? 'SVG 内嵌位图，不含矢量路径。' : exportFormat==='PDF' ? '在打印窗口选择「另存为 PDF」。' : exportFormat==='MP4'&&(exportSize.width!==outputSize.width||exportSize.height!==outputSize.height) ? 'MP4 尺寸已对齐为偶数。' : ''
  const stagePadding = size.width < 500 ? 64 : 112
  const artHeight = Math.max(100,Math.min(size.height-112,(size.width-stagePadding)/ratio)) * zoom/100
  const artWidth = artHeight*ratio
  const range = (key: string, label: string, min: number, max: number, step = 1, unit = '') => <Range key={key} label={label} min={min} max={max} step={step} unit={unit} value={(params[effect] as unknown as Record<string,number>)[key]} onChange={v => setValue(key,v)}/>
  const toggle = (key: string,label: string) => <Toggle key={key} label={label} value={Boolean((params[effect] as unknown as Record<string,unknown>)[key])} onChange={v=>setValue(key,v)}/>
  const color = (key: string,label: string) => <label className="color-row" key={key}><span>{label}</span><span><input aria-label={label} type="color" value={(params[effect] as unknown as Record<string,string>)[key]} onChange={e=>setValue(key,e.target.value)}/><span className="numeric">{(params[effect] as unknown as Record<string,string>)[key].toUpperCase()}</span></span></label>

  return <>
    <a className="skip-link" href="#workspace">跳到创作画布</a>
    <input ref={uploadInput} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/mpeg" aria-label="选择图片或视频" onChange={e => { const file=e.target.files?.[0]; if(file) handleFile(file); e.target.value='' }}/>
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" aria-label="像素造物"><span className="brand-mark" aria-hidden="true"><i/><i/><i/><i/></span><span>像素造物</span></div>
        <div className="header-right"><button className="button quiet save-top" onClick={()=>void saveDesign()} disabled={!source || loading || exporting}><BookmarkSimple size={17}/>收藏作品</button><button className="button primary" onClick={()=>setModal('export')} disabled={!source || loading || exporting}><DownloadSimple size={18}/>导出作品<ArrowUpRight size={16}/></button></div>
      </header>
      <div className="studio-layout">
        <nav className="rail" aria-label="工作台导航"><div className="rail-top"><button className={`rail-button ${panel==='presets'?'active':''}`} onClick={()=>{setPanel('presets');setShowLibrary(s=>!s)}} title="效果预设"><SquaresFour size={23} weight={panel==='presets'?'fill':'regular'}/><span>创作</span></button><button className={`rail-button ${panel==='saved'?'active':''}`} onClick={()=>{setPanel('saved');setShowLibrary(true)}} title="我的收藏"><BookmarkSimple size={23} weight={panel==='saved'?'fill':'regular'}/><span>收藏</span>{saved.length>0&&<i className="saved-dot"/>}</button></div></nav>
        <aside className={`library ${showLibrary?'mobile-visible':''}`} aria-label={panel==='presets'?'效果预设':'我的收藏'}>
          <div className="library-heading"><h1>{panel==='presets'?'效果':'收藏'}{panel==='saved'&&<span>{saved.length}</span>}</h1><button className="icon-button mobile-close" aria-label="关闭素材面板" onClick={()=>setShowLibrary(false)}><X size={20}/></button></div>
          {panel==='presets' ? <>
            <div className="effect-list">{EFFECTS.map(item=>{const Icon=icons[item.id];return <button key={item.id} className={`effect-button ${effect===item.id?'selected':''}`} onClick={()=>switchEffect(item.id)} aria-pressed={effect===item.id}><span className="effect-symbol"><Icon size={20}/></span><span>{item.name}</span>{effect===item.id&&<CaretRight size={13}/>}</button>})}</div>
            <div className="library-section-heading"><h2>预设</h2></div>
            <div className="preset-grid">{PRESETS[effect].map(preset=><button key={preset.id} className={`preset-card ${selected===preset.id?'selected':''}`} onClick={()=>choosePreset(preset)} aria-pressed={selected===preset.id}><div className="preset-art"><Preview effect={effect} preset={preset}/>{selected===preset.id&&<span className="preset-check"><Check size={12} weight="bold"/></span>}</div><strong>{preset.name}</strong></button>)}</div>
          </> : <div className="saved-list">{saved.length ? saved.map(design=><article className="saved-card" key={design.id}><button onClick={()=>restore(design)}><img src={design.thumbnail} alt={design.name}/><strong>{design.name}</strong><span>{new Date(design.created).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></button><button className="icon-button delete-design" aria-label={`移除收藏 ${design.name}`} onClick={()=>void removeSaved(design.id)}><Trash size={17}/></button></article>) : <div className="empty-state"><BookmarkSimple size={36}/><h2>暂无收藏</h2><button className="button quiet" onClick={()=>setPanel('presets')}>开始创作<ArrowUpRight size={16}/></button></div>}</div>}
        </aside>
        <main id="workspace" className="workspace">
          <div className="workspace-bar"><div className="breadcrumb"><strong>{active.name}</strong></div><div className="workspace-actions"><button className={`canvas-size-button ${canvasSettings?'custom':''}`} aria-label="设置画布尺寸" disabled={exporting||loading} onClick={()=>setModal('canvas')}><CornersOut size={16}/><span className="canvas-size-button-label">画布尺寸</span><span className="canvas-dimensions">{outputSize.width} × {outputSize.height}</span><CaretDown size={12}/></button><button className="icon-button mobile-properties" aria-label="打开效果参数" onClick={()=>setShowProperties(true)}><SlidersHorizontal size={20}/></button></div></div>
          <div className="canvas-viewport" ref={viewport} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false)}} onDrop={e=>{e.preventDefault();setDragging(false);const file=e.dataTransfer.files[0];if(file)handleFile(file)}}>
            {compare&&<div className="stage-label">原图</div>}
            <div className={`artboard ${loading?'is-loading':''}`} style={{width:artWidth,height:artHeight}}><canvas ref={canvas} aria-label={`${active.name}效果预览`} role="img"/><span className="corner tl"/><span className="corner tr"/><span className="corner bl"/><span className="corner br"/>{loading&&<div className="canvas-loading"><span/>加载中…</div>}</div>
            {effect!=='marble'&&source&&<div className="source-filename">{source.name}</div>}
            {dragging&&<div className="drop-overlay"><UploadSimple size={40}/><strong>松开上传</strong></div>}
          </div>
          <div className="canvas-toolbar"><div className="playback"><button className={`icon-button play-button ${playing?'playing':''}`} aria-label={playing?'暂停动画':'播放动画'} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={17} weight="fill"/>:<Play size={17} weight="fill"/>}</button><span className="time-code">{String(Math.floor(time/60)).padStart(2,'0')}:{String(Math.floor(time%60)).padStart(2,'0')}</span></div><div className="view-tools"><button aria-label="按住对比原图" className={`compare-button ${compare?'active':''}`} disabled={effect==='marble'} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);setCompare(true)}} onPointerUp={()=>setCompare(false)} onPointerCancel={()=>setCompare(false)} onKeyDown={e=>{if(e.code==='Space'||e.key==='Enter'){e.preventDefault();setCompare(true)}}} onKeyUp={()=>setCompare(false)} onBlur={()=>setCompare(false)}><Eye size={17}/><span>按住对比</span></button><span className="tool-divider"/><button className="icon-button" aria-label="缩小画布" disabled={zoom<=25} onClick={()=>setZoom(z=>Math.max(25,z-25))}><Minus size={16}/></button><button className="zoom-value" aria-label="重置画布缩放" onClick={()=>setZoom(100)}>{zoom}%</button><button className="icon-button" aria-label="放大画布" disabled={zoom>=200} onClick={()=>setZoom(z=>Math.min(200,z+25))}><Plus size={16}/></button><span className="tool-divider"/><button className="icon-button" aria-label="适应画布" onClick={()=>setZoom(100)}><CornersOut size={18}/></button></div></div>
        </main>
        <aside className={`properties ${showProperties?'mobile-visible':''}`} aria-label="效果参数">
          <div className="properties-header"><div><ActiveIcon size={18}/><h2>{active.name}</h2></div><button className="icon-button" aria-label="重置当前效果" onClick={reset}><ArrowCounterClockwise size={17}/></button><button className="icon-button mobile-close" aria-label="关闭参数面板" onClick={()=>setShowProperties(false)}><X size={20}/></button></div>
          <div className="properties-scroll">
            <button className="upload-card" onClick={()=>uploadInput.current?.click()}><div className="upload-card-top"><span><UploadSimple size={20}/></span><ArrowUpRight size={17}/></div><strong>{isUploaded?'替换素材':'上传素材'}</strong><small>图片 ≤ 10MB · 视频 ≤ 100MB</small></button>
            <div className="quick-actions"><button onClick={randomize}><Shuffle size={16}/>随机</button><button onClick={reset}><ArrowCounterClockwise size={16}/>重置</button></div>
            {effect==='glitch'&&<>
              <Section title="色彩分离" tag="01">{range('rgbSplit','分离强度',0,50)}{range('rgbSplitDirection','偏移方向',0,360,1,'°')}{toggle('rgbSplitDirectionAnim','方向自动旋转')}</Section>
              <Section title="动态失真" tag="02">{range('stripeDensity','条纹密度',0,50)}{range('displacement','位移强度',0,20)}{range('verticalSpeed','垂直速度',0,20)}</Section>
              <Section title="质感细节" tag="03">{range('corruption','故障损坏',0,100)}{range('dotSize','网点大小',0,6,.1)}{range('dotOpacity','网点透明度',0,.7,.01)}{toggle('scanlines','复古扫描线')}</Section>
            </>}
            {effect==='ascii'&&<>
              <Section title="字符样式" tag="01"><label className="select-label">字符集<select aria-label="字符集" value={params.ascii.charSet} onChange={e=>setValue('charSet',e.target.value)}>{[['dense','密集字符'],['classic','经典字符'],['binary','二进制数字'],['minimal','极简符号'],['retro','复古方块'],['custom','自定义字符']].map(([v,n])=><option value={v} key={v}>{n}</option>)}</select></label>{params.ascii.charSet==='custom'&&<label className="select-label">自定义内容<input className="text-input" aria-label="自定义字符内容" value={params.ascii.customChars} onChange={e=>setValue('customChars',e.target.value)}/></label>}{range('fontSize','字符大小',6,28,2)}{range('coverage','字符覆盖率',0,100,1,'%')}{range('edgeEmphasis','边缘强化',0,100)}</Section>
              <Section title="画面质感" tag="02">{range('charOpacity','字符透明度',10,100,1,'%')}{range('charBrightness','亮度',-100,100)}{range('charContrast','对比度',-100,100)}{toggle('invert','明暗反转')}{toggle('dotGrid','叠加点网格')}</Section>
              <Section title="背景与色彩" tag="03">{color('bgColor','背景颜色')}{range('bgOpacity','背景透明度',0,100,1,'%')}{range('bgBlur','背景模糊',0,80)}{color('colorTint','叠加颜色')}{range('colorTintOpacity','叠加强度',0,100,1,'%')}</Section>
              <Section title="字符动画" tag="04">{toggle('animated','开启字符动画')}{range('animSpeed','动画速度',.1,5,.1)}{range('animIntensity','动画强度',0,100)}{range('animRandomness','随机程度',0,100)}</Section>
            </>}
            {effect==='marble'&&<>
              <Section title="纹理配色" tag="01">{color('colorMain','主色')}{color('colorLow','暗部颜色')}{color('colorMid','中间颜色')}{color('colorHigh','高光颜色')}{color('veinColor','纹脉颜色')}</Section>
              <Section title="流体形态" tag="02">{range('noiseScale','纹理缩放',.5,3,.01)}{range('warpPower','扭曲强度',0,1,.01)}{range('fbmStrength','层叠强度',.1,3,.01)}{range('blurRadius','柔化程度',.1,3,.01)}</Section>
              <Section title="纹脉与颗粒" tag="03">{range('veinIntensity','纹脉强度',0,1,.01)}{range('veinScale','纹脉缩放',1,10,.1)}{range('grain','颗粒质感',0,100)}{toggle('animated','开启液态动画')}{range('speed','流动速度',.1,3,.1)}</Section>
            </>}
            {effect==='flow'&&<>
              <Section title="波浪形态" tag="01">{range('amplitude','波浪振幅',0,.5,.01)}{range('frequency','波浪频率',1,100)}{range('complexity','波浪复杂度',0,5,.1)}{range('sharpness','波浪锐度',1,20)}{range('waveAngle','流动方向',-180,180,1,'°')}{range('speed','流动速度',0,1,.01)}</Section>
              <Section title="作用区域" tag="02">{range('yStart','覆盖范围',0,1,.01)}{range('maskAngle','区域角度',-180,180,1,'°')}{range('spacerY','间隔带位置',0,1,.01)}{range('spacerSize','间隔带宽度',0,.5,.01)}{range('spacerFeather','边缘羽化',0,.2,.01)}</Section>
            </>}
            {effect==='particles'&&<>
              <Section title="粒子形态" tag="01">{range('density','粒子密度',10,100)}{range('size','粒子大小',.4,3,.1)}{range('threshold','明暗筛选',0,80)}</Section>
              <Section title="光效与连线" tag="02">{range('glow','发光强度',0,100)}{range('connections','连线密度',0,100)}{color('color','粒子颜色')}{toggle('originalColors','保留素材色彩')}{color('bgColor','背景颜色')}</Section>
              <Section title="粒子动态" tag="03">{toggle('animated','开启粒子动画')}{range('speed','流动速度',.1,3,.1)}{range('drift','漂浮幅度',0,100)}{toggle('scan','扫描光带')}{toggle('grid','科技网格')}</Section>
            </>}
            <button className="save-panel button quiet" onClick={()=>void saveDesign()} disabled={!source||loading||exporting}><BookmarkSimple size={17}/>收藏当前作品</button>
          </div>
          <div className="properties-footer"><span className="version-text">版本 0.1</span></div>
        </aside>
      </div>
    </div>
    {error&&<div className="error-toast" role="alert"><Info size={20}/><span>{error}</span><button aria-label="关闭错误提示" onClick={()=>setError('')}><X size={17}/></button></div>}
    {toast&&<div className="toast" role="status"><CheckCircle size={19} weight="fill"/>{toast}</div>}
    {modal==='canvas'&&<Modal title="画布尺寸" onClose={()=>setModal(null)}><CanvasSettingsPanel value={canvasSettings} size={outputSize} onApply={settings=>{setCanvasSettings(settings);setZoom(100);setModal(null);notify(settings?`${settings.width} × ${settings.height} 像素`:'已跟随素材')}}/></Modal>}
    {modal==='export'&&<Modal title="导出作品" onClose={()=>{if(!exporting)setModal(null)}}><div className="export-size-summary"><span>导出尺寸</span><strong>{exportSize.width} × {exportSize.height}<small>像素</small></strong><button disabled={exporting} onClick={()=>setModal('canvas')}>修改</button></div><label className="field-label">导出格式</label><div className="format-grid">{['PNG','JPEG','SVG','PDF','GIF','MP4'].map(format=><button className={exportFormat===format?'selected':''} key={format} disabled={exporting||(format==='MP4'&&typeof VideoEncoder==='undefined')} onClick={()=>setExportFormat(format)}><strong>{format}</strong>{['GIF','MP4'].includes(format)&&<span>{format==='GIF'?'动图':'无声视频'}</span>}{exportFormat===format&&<Check size={15}/>}</button>)}</div>{['GIF','MP4'].includes(exportFormat)&&<div className="export-settings"><label>动画时长<select disabled={exporting} value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[3,5,10].map(n=><option value={n} key={n}>{n} 秒</option>)}</select></label><label>导出帧率<select value={exportFormat==='GIF'?15:fps} disabled={exporting||exportFormat==='GIF'} onChange={e=>setFps(Number(e.target.value))}>{[15,24,30].map(n=><option value={n} key={n}>{n} 帧 / 秒</option>)}</select></label></div>}{exportNote&&<div className="export-notes"><Info size={16}/><p>{exportNote}</p></div>}{exporting&&<div className="export-progress" role="progressbar" aria-valuenow={Math.round(progress*100)} aria-valuemin={0} aria-valuemax={100}><span style={{transform:`scaleX(${progress})`}}/><p>正在生成作品 {Math.round(progress*100)}%</p></div>}<button className="button primary export-confirm" disabled={exporting||loading} onClick={()=>void doExport()}><DownloadSimple size={18}/>{exporting?'正在导出…':`导出 ${exportFormat} 作品`}</button></Modal>}
  </>
}

function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000) }
function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  if(Math.abs(video.currentTime-time)<.001 && video.readyState>=2) return Promise.resolve()
  return new Promise((resolve,reject)=>{ const timer=setTimeout(()=>{cleanup();reject(new Error('视频读取超时，请缩短时长或换用其他视频。'))},10000); const done=()=>{cleanup();resolve()};const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',done)}; video.addEventListener('seeked',done,{once:true});video.currentTime=time })
}
