import type { ParticleParams } from '@/types'
import { sampleParticleField, type ParticleField } from './particle-model'

type ParticleSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement

export function createParticleEngine(ctx: CanvasRenderingContext2D, source: ParticleSource, width: number, height: number) {
  const sampler = document.createElement('canvas')
  const sampleCtx = sampler.getContext('2d',{willReadFrequently:true})!
  const sprites = new Map<string,HTMLCanvasElement>()
  let field: ParticleField = {points:[],links:[]}
  let positions = new Float32Array(0), lastKey='', lastVideoTick=-1

  function sample(params: ParticleParams) {
    const budget=400+Math.max(0,Math.min(100,params.density))*85
    const ratio=width/height
    sampler.width=Math.max(2,Math.round(Math.sqrt(budget*ratio)))
    sampler.height=Math.max(2,Math.round(Math.sqrt(budget/ratio)))
    sampleCtx.clearRect(0,0,sampler.width,sampler.height)
    sampleCtx.drawImage(source,0,0,sampler.width,sampler.height)
    field=sampleParticleField(sampleCtx.getImageData(0,0,sampler.width,sampler.height).data,sampler.width,sampler.height,params.threshold)
    positions=new Float32Array(field.points.length*2)
  }
  function glowSprite(color: string) {
    const cached=sprites.get(color); if(cached) return cached
    const sprite=document.createElement('canvas'); sprite.width=32;sprite.height=32
    const c=sprite.getContext('2d')!
    const gradient=c.createRadialGradient(16,16,0,16,16,16)
    gradient.addColorStop(0,'#ffffff');gradient.addColorStop(.12,color);gradient.addColorStop(.4,color);gradient.addColorStop(1,'transparent')
    c.fillStyle=gradient;c.beginPath();c.arc(16,16,16,0,Math.PI*2);c.fill()
    sprites.set(color,sprite)
    return sprite
  }
  return {
    draw(params: ParticleParams, seconds: number, video = false) {
      const key=`${params.density}:${params.threshold}`
      const videoTick=Math.floor(seconds*30)
      if(lastKey!==key || (video&&videoTick!==lastVideoTick)) {sample(params);lastKey=key;lastVideoTick=videoTick}
      const time=params.animated?seconds*params.speed:0
      const scale=Math.min(width,height)/700
      const drift=params.drift/100*Math.min(width,height)*.035
      const glow=params.glow/100
      ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over'
      ctx.fillStyle=params.bgColor;ctx.fillRect(0,0,width,height)
      if(params.grid) {
        const step=Math.max(8,Math.min(width,height)/16)
        ctx.strokeStyle=params.color;ctx.globalAlpha=.055;ctx.lineWidth=Math.max(.5,scale*.5);ctx.beginPath()
        for(let x=step;x<width;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,height)}
        for(let y=step;y<height;y+=step){ctx.moveTo(0,y);ctx.lineTo(width,y)}
        ctx.stroke()
      }
      for(let i=0;i<field.points.length;i++) {
        const p=field.points[i], amount=params.animated?drift*(.4+p.light):0
        positions[i*2]=p.x*width+Math.sin(time*.8+p.phase)*amount
        positions[i*2+1]=p.y*height+Math.cos(time*.65+p.phase*1.3)*amount*.7
      }
      ctx.globalCompositeOperation='screen'
      if(params.connections>0) {
        ctx.strokeStyle=params.color;ctx.globalAlpha=.06+params.connections/100*.24;ctx.lineWidth=Math.max(.35,scale*.6)
        ctx.beginPath()
        for(let i=0;i<field.links.length;i++) {
          if((Math.imul(i+1,2654435761)>>>0)%100>=params.connections) continue
          const [a,b]=field.links[i]
          ctx.moveTo(positions[a*2],positions[a*2+1]);ctx.lineTo(positions[b*2],positions[b*2+1])
        }
        ctx.stroke()
      }
      const scanY=((time*.14+.27)%1.3-.15)*height
      const scanWidth=height*.055
      for(let i=0;i<field.points.length;i++) {
        const p=field.points[i], x=positions[i*2],y=positions[i*2+1]
        const scan=params.scan ? Math.exp(-Math.pow((y-scanY)/scanWidth,2)) : 0
        const flicker=params.animated ? .88+.12*Math.sin(time*1.6+p.phase) : 1
        const radius=Math.max(.3,params.size*scale*(.4+p.light*.85))
        const alpha=(.3+Math.sqrt(p.light)*.7)*flicker
        const color=params.originalColors?p.color:params.color
        if(glow>0) {
          const diameter=radius*(3+glow*7+scan*3)
          ctx.globalAlpha=alpha*glow*.42
          ctx.drawImage(glowSprite(color),x-diameter/2,y-diameter/2,diameter,diameter)
        }
        ctx.globalAlpha=Math.min(1,alpha+scan*.55)
        ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,radius*(1+scan*.45),0,Math.PI*2);ctx.fill()
        if(p.light>.6||scan>.55) {
          ctx.fillStyle='#e7fbff';ctx.globalAlpha=alpha*.8;ctx.fillRect(x-radius*.3,y-radius*.3,radius*.6,radius*.6)
        }
      }
      if(params.scan) {
        ctx.strokeStyle=params.color;ctx.globalAlpha=.22;ctx.lineWidth=Math.max(.5,scale*.8)
        ctx.beginPath();ctx.moveTo(0,scanY);ctx.lineTo(width,scanY);ctx.stroke()
      }
      ctx.restore()
    },
    destroy() {sprites.clear();field={points:[],links:[]};positions=new Float32Array(0);sampler.width=0;sampler.height=0},
  }
}
