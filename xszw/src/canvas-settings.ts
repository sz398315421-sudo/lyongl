import type { EffectType } from '@/types'

export interface CanvasSize { width: number; height: number }
export interface CanvasSettings extends CanvasSize {
  fit: 'contain' | 'cover' | 'stretch'
  locked: boolean
}
export const MIN_CANVAS_SIDE = 64
export const MAX_CANVAS_SIDE = 4096
export const CANVAS_PRESETS = [
  { name: '方形', ratio: '1:1', width: 1080, height: 1080 },
  { name: '竖版图文', ratio: '3:4', width: 1080, height: 1440 },
  { name: '手机竖屏', ratio: '9:16', width: 1080, height: 1920 },
  { name: '横版视频', ratio: '16:9', width: 1920, height: 1080 },
  { name: '横版封面', ratio: '约 1.91:1', width: 1200, height: 628 },
  { name: '高清横版', ratio: '16:9', width: 2560, height: 1440 },
] as const

export function validCanvasSize(width: number, height: number): boolean {
  return [width, height].every(side => Number.isInteger(side) && side >= MIN_CANVAS_SIDE && side <= MAX_CANVAS_SIDE)
}
export function getCanvasSize(settings: CanvasSettings | null, source: CanvasSize | null, effect: EffectType): CanvasSize {
  if (settings) return { width: settings.width, height: settings.height }
  if (effect === 'marble') return { width: 1000, height: 1000 }
  return fitWithin(source || { width: 800, height: 1200 }, 1200)
}
export function fitWithin(size: CanvasSize, limit: number): CanvasSize {
  const scale = Math.min(1, limit / Math.max(size.width, size.height))
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }
}
export function getExportSize(size: CanvasSize, format: string, custom: boolean): CanvasSize {
  const output = !custom && format === 'GIF' ? fitWithin(size, 520) : { ...size }
  // H.264 encoders require even dimensions. Preserve the picture and add one edge pixel if needed.
  if (format === 'MP4') return { width: output.width + output.width % 2, height: output.height + output.height % 2 }
  return output
}
export function getFitRect(source: CanvasSize, target: CanvasSize, fit: CanvasSettings['fit']) {
  if (fit === 'stretch') return { x: 0, y: 0, ...target }
  const scale = (fit === 'cover' ? Math.max : Math.min)(target.width/source.width, target.height/source.height)
  const width = source.width*scale, height = source.height*scale
  return { x: (target.width-width)/2, y: (target.height-height)/2, width, height }
}
