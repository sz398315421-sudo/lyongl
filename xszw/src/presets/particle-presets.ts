import type { ParticleParams } from '@/types'

export const DEFAULT_PARTICLE_PARAMS: ParticleParams = {
  density: 62, size: 1.2, threshold: 12, glow: 58, connections: 42,
  drift: 24, speed: .8, color: '#54dfff', originalColors: false,
  scan: true, grid: true, animated: true, bgColor: '#02070d',
}
export function randomizeParticleParams(): ParticleParams {
  const colors = ['#54dfff','#75ffb5','#c5a4ff','#ff69d4','#ffbd64','#a3e9ff']
  return { ...DEFAULT_PARTICLE_PARAMS,
    density: 35+Math.round(Math.random()*55), size: .6+Math.round(Math.random()*16)/10,
    threshold: 5+Math.round(Math.random()*25), glow: 25+Math.round(Math.random()*65),
    connections: Math.round(Math.random()*90), drift: 10+Math.round(Math.random()*60),
    speed: .3+Math.round(Math.random()*14)/10, color: colors[Math.floor(Math.random()*colors.length)],
    originalColors: Math.random()>.75, scan: Math.random()>.3, grid: Math.random()>.25,
  }
}
