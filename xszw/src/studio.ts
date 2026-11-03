import type { AsciiParams, GlitchParams, MarbleParams, FlowParams, ParticleParams, EffectType } from '@/types'
import { DEFAULT_ASCII_PARAMS } from '@/presets/ascii-presets'
import { DEFAULT_GLITCH_PARAMS } from '@/presets/glitch-presets'
import { DEFAULT_MARBLE_PARAMS } from '@/presets/marble-presets'
import { DEFAULT_FLOW_PARAMS } from '@/presets/flow-presets'
import type { CanvasSettings } from './canvas-settings'
import { DEFAULT_PARTICLE_PARAMS } from '@/presets/particle-presets'

export interface Params { ascii: AsciiParams; glitch: GlitchParams; marble: MarbleParams; flow: FlowParams; particles: ParticleParams }
export const DEFAULTS: Params = {
  ascii: { ...DEFAULT_ASCII_PARAMS, fontSize: 10, charOpacity: 90, bgOpacity: 25, animated: true, colorTint: '#b7f26b', colorTintOpacity: 32, colorTintBlend: 'color' },
  glitch: { ...DEFAULT_GLITCH_PARAMS, rgbSplit: 12, displacement: 7, stripeDensity: 16, corruption: 2 },
  marble: { ...DEFAULT_MARBLE_PARAMS },
  flow: { ...DEFAULT_FLOW_PARAMS, amplitude: .08, yStart: .8, maskAngle: 0, waveAngle: 90 },
  particles: { ...DEFAULT_PARTICLE_PARAMS },
}
export const EFFECTS: { id: EffectType; name: string; short: string; description: string; number: string }[] = [
  { id: 'glitch', name: '故障艺术', short: '故障', description: '打破秩序，让意外成为风格。', number: '01' },
  { id: 'ascii', name: '字符成像', short: '字符', description: '把每一束光，写成字符。', number: '02' },
  { id: 'marble', name: '液态纹理', short: '液态', description: '色彩交融，灵感自由生长。', number: '03' },
  { id: 'flow', name: '自然流动', short: '流动', description: '让静止的画面，开始呼吸。', number: '04' },
  { id: 'particles', name: '科技粒子', short: '粒子', description: '光点相连，重构数字世界。', number: '05' },
]
export interface StylePreset { id: string; name: string; note: string; image: string; patch: Record<string, unknown> }
export const PRESETS: Record<EffectType, StylePreset[]> = {
  glitch: [
    { id: 'g1', name: '失真雕塑', note: '色散 · 微故障', image: '/presets/glitch-03.webp', patch: { rgbSplit: 12, displacement: 7, stripeDensity: 16, corruption: 2 } },
    { id: 'g2', name: '红色迷雾', note: '扫描线 · 复古', image: '/presets/glitch-05.jpg', patch: { rgbSplit: 20, stripeDensity: 28, displacement: 4, scanlines: true, corruption: 12 } },
    { id: 'g3', name: '绿隧独行', note: '高对比 · 动态', image: '/presets/glitch-06.jpg', patch: { rgbSplit: 12, stripeDensity: 28, displacement: 18, corruption: 15, rgbSplitDirection: 196 } },
    { id: 'g4', name: '旧日信号', note: '颗粒 · 模拟电视', image: '/presets/glitch-04.webp', patch: { rgbSplit: 5, displacement: 4, stripeDensity: 30, scanlines: true, dotSize: 2, dotOpacity: .2 } },
    { id: 'g5', name: '霓虹回声', note: '色彩分离 · 强烈', image: '/presets/glitch-02.jpg', patch: { rgbSplit: 25, displacement: 15, stripeDensity: 12, rgbSplitDirection: 90 } },
    { id: 'g6', name: '像素偏移', note: '条纹 · 实验', image: '/presets/glitch-01.jpg', patch: { rgbSplit: 8, displacement: 18, stripeDensity: 38, corruption: 25 } },
  ],
  ascii: [
    { id: 'a1', name: '数字雕塑', note: '密集字符', image: '/presets/glitch-03.webp', patch: {} },
    { id: 'a2', name: '蓝色花语', note: '经典字符', image: '/presets/ascii-06.jpg', patch: { charSet: 'classic', colorTintOpacity: 0, fontSize: 8 } },
    { id: 'a3', name: '赛博街景', note: '数字矩阵', image: '/presets/ascii-07.jpg', patch: { charSet: 'binary', fontSize: 12, bgOpacity: 10 } },
    { id: 'a4', name: '星际密语', note: '黑白反转', image: '/presets/ascii-04.jpg', patch: { charSet: 'binary', invert: true, colorTintOpacity: 0 } },
    { id: 'a5', name: '方块记忆', note: '复古像素', image: '/presets/glitch-04.webp', patch: { charSet: 'retro', fontSize: 16, colorTintOpacity: 0 } },
    { id: 'a6', name: '汉字诗篇', note: '自定义字符', image: '/presets/flow-01.jpg', patch: { charSet: 'custom', customChars: '山海日月星河光影 ', fontSize: 16, colorTintOpacity: 0 } },
  ],
  marble: [
    { id: 'm1', name: '冰川蓝调', note: '冷调 · 流体', image: '', patch: {} },
    { id: 'm2', name: '落日熔金', note: '暖调 · 金属', image: '', patch: { colorMain: '#ffbb6b', colorLow: '#922814', colorMid: '#ed6a23', colorHigh: '#fff4c5', veinColor: '#ffa333' } },
    { id: 'm3', name: '薄荷星云', note: '清新 · 玉石', image: '', patch: { colorMain: '#9bffd2', colorLow: '#105c4d', colorMid: '#3aad75', colorHigh: '#e6ffe0', veinColor: '#c6f66c' } },
    { id: 'm4', name: '紫色梦境', note: '梦幻 · 色彩', image: '', patch: { colorMain: '#db9dff', colorLow: '#49226e', colorMid: '#a35dea', colorHigh: '#ffe6fc', veinColor: '#ff87da' } },
    { id: 'm5', name: '朱砂涌动', note: '炽热 · 纹脉', image: '', patch: { colorMain: '#f57462', colorLow: '#571e28', colorMid: '#cf343c', colorHigh: '#ffddd1', veinColor: '#ffad92', veinIntensity: .8 } },
    { id: 'm6', name: '月下银墨', note: '黑白 · 极简', image: '', patch: { colorMain: '#c5c5c5', colorLow: '#242424', colorMid: '#707070', colorHigh: '#ffffff', veinColor: '#e1e1e1' } },
  ],
  flow: [
    { id: 'f1', name: '星球涌动', note: '柔和波浪', image: '/presets/flow-01.jpg', patch: {} },
    { id: 'f2', name: '蓝调浮动', note: '自然波动', image: '/presets/flow-02.jpg', patch: { amplitude: .14, frequency: 12 } },
    { id: 'f3', name: '暖光涟漪', note: '细密涟漪', image: '/presets/flow-03.jpg', patch: { amplitude: .05, frequency: 38, yStart: .5 } },
    { id: 'f4', name: '时间褶皱', note: '强烈扭曲', image: '/presets/flow-04.jpg', patch: { amplitude: .25, frequency: 18, complexity: 2 } },
    { id: 'f5', name: '风的形状', note: '斜向流动', image: '/presets/flow-05.jpg', patch: { amplitude: .1, waveAngle: 45, frequency: 26 } },
    { id: 'f6', name: '静物新生', note: '雕塑实验', image: '/presets/glitch-03.webp', patch: { amplitude: .08, frequency: 22, yStart: .9 } },
  ],
  particles: [
    { id: 'p1', name: '全息雕塑', note: '蓝色光点 · 全息', image: '/presets/glitch-03.webp', patch: {} },
    { id: 'p2', name: '神经网络', note: '密集连线 · 拓扑', image: '/presets/glitch-04.webp', patch: { connections: 86, density: 82, size: .8, glow: 35, drift: 14, color: '#86bbff' } },
    { id: 'p3', name: '赛博霓虹', note: '霓虹光晕 · 城市', image: '/presets/ascii-07.jpg', patch: { color: '#ff6cde', density: 72, threshold: 18, glow: 80, connections: 24 } },
    { id: 'p4', name: '星际信号', note: '星光 · 扫描', image: '/presets/flow-01.jpg', patch: { color: '#b4edff', density: 48, size: 1.6, connections: 24, glow: 80, drift: 35 } },
    { id: 'p5', name: '绿光矩阵', note: '矩阵网格 · 绿光', image: '/presets/glitch-06.jpg', patch: { color: '#75ffa3', threshold: 8, density: 80, connections: 64, drift: 12 } },
    { id: 'p6', name: '金色星尘', note: '柔光 · 自由漂浮', image: '/presets/glitch-03.webp', patch: { color: '#ffd084', density: 55, size: 1.8, connections: 0, glow: 68, drift: 55, grid: false, scan: false } },
  ],
}

export interface SavedDesign { id: string; name: string; effect: EffectType; params: Params; thumbnail: string; source: string; sourceName: string; created: number; canvasSettings?: CanvasSettings | null }
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => {
  const request = indexedDB.open('xiangsu-zaowu', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('designs', { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
}) }
export async function designStore(action: 'list' | 'save' | 'delete', design?: SavedDesign | string): Promise<SavedDesign[]> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('designs', action === 'list' ? 'readonly' : 'readwrite')
    const store = tx.objectStore('designs')
    if (action === 'save') store.put(design)
    if (action === 'delete') store.delete(design as string)
    const req = store.getAll()
    let result: SavedDesign[] = []
    req.onsuccess = () => { result = req.result }
    tx.oncomplete = () => { db.close(); resolve(result.sort((a,b) => b.created-a.created)) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
