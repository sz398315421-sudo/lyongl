import { renderAscii } from '@/engines/ascii'
import { renderGlitch } from '@/engines/glitch'
import { createMarbleEngine } from '@/engines/marble'
import { createFlowEngine } from '@/engines/flow'
import { createParticleEngine } from '@/engines/particles'
import type { EffectType } from '@/types'
import type { Params } from './studio'
import { getFitRect, type CanvasSettings } from './canvas-settings'

export type SourceElement = HTMLImageElement | HTMLVideoElement
export function makeRenderer(canvas: HTMLCanvasElement, effect: EffectType, source: SourceElement | null, settings: CanvasSettings | null = null) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('浏览器无法创建画布，请换用新版浏览器。')
  const marble = effect === 'marble' ? createMarbleEngine() : null
  const flow = effect === 'flow' ? createFlowEngine() : null
  if ((effect === 'marble' && !marble) || (effect === 'flow' && !flow)) throw new Error('此设备暂不支持该效果所需的图形加速，请尝试字符成像或故障艺术。')
  marble?.resize(canvas.width, canvas.height)
  flow?.resize(canvas.width, canvas.height)
  const fitted = settings && source && effect !== 'marble' ? document.createElement('canvas') : null
  const fittedCtx = fitted?.getContext('2d')
  if (fitted) { fitted.width = canvas.width; fitted.height = canvas.height }
  const renderSource = fitted || source
  function updateFittedSource() {
    if (!fitted || !fittedCtx || !source || !settings) return
    const sourceSize = source instanceof HTMLVideoElement ? {width:source.videoWidth,height:source.videoHeight} : {width:source.naturalWidth,height:source.naturalHeight}
    const rect = getFitRect(sourceSize,canvas,settings.fit)
    fittedCtx.fillStyle = '#000000'
    fittedCtx.fillRect(0,0,fitted.width,fitted.height)
    fittedCtx.drawImage(source,rect.x,rect.y,rect.width,rect.height)
  }
  updateFittedSource()
  if (flow && renderSource) flow.setTexture(renderSource)
  const particles = effect === 'particles' && renderSource ? createParticleEngine(ctx,renderSource,canvas.width,canvas.height) : null
  return {
    draw(params: Params, frame: number, fps = 30, original = false) {
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      if (source instanceof HTMLVideoElement) updateFittedSource()
      if (original && renderSource && effect !== 'marble') {
        ctx.drawImage(renderSource, 0, 0, w, h)
      } else if (effect === 'ascii' && renderSource) renderAscii(ctx, renderSource, params.ascii, w, h, frame)
      else if (effect === 'glitch' && renderSource) renderGlitch(ctx, renderSource, params.glitch, w, h, frame)
      else if (particles) particles.draw(params.particles,frame/fps,source instanceof HTMLVideoElement)
      else if (marble) {
        marble.setTime(params.marble.animated ? frame / fps * params.marble.speed * .85 : 0)
        marble.render(params.marble, false)
        marble.copyTo2D(ctx, 0, 0, w, h)
      } else if (flow) {
        if (source instanceof HTMLVideoElement && renderSource) flow.setTexture(renderSource)
        flow.setTime(frame / fps * params.flow.speed)
        flow.render(params.flow, false)
        flow.copyTo2D(ctx, 0, 0, w, h)
      }
    },
    destroy() { marble?.destroy(); flow?.destroy(); particles?.destroy() },
  }
}
