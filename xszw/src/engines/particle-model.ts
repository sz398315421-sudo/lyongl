export interface ParticlePoint { x: number; y: number; light: number; phase: number; color: string }
export interface ParticleField { points: ParticlePoint[]; links: [number,number][] }

export function sampleParticleField(pixels: Uint8ClampedArray, cols: number, rows: number, threshold: number): ParticleField {
  const points: ParticlePoint[] = [], links: [number,number][] = []
  const indices = new Int32Array(cols*rows).fill(-1)
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
    const cell=y*cols+x, offset=cell*4
    const light=(pixels[offset]*.2126+pixels[offset+1]*.7152+pixels[offset+2]*.0722)/255*(pixels[offset+3]/255)
    if(light<=Math.max(.005,threshold/100)) continue
    const id=points.length; indices[cell]=id
    const phase=((Math.imul(cell+1,1597334677)>>>0)%65536)/65536*Math.PI*2
    const color=`rgb(${[pixels[offset],pixels[offset+1],pixels[offset+2]].map(c=>Math.round(c/51)*51).join(',')})`
    points.push({x:(x+.5)/cols,y:(y+.5)/rows,light,phase,color})
    // Grid neighbours keep link building linear in the number of sampled pixels.
    for(const [dx,dy] of [[-1,0],[-1,-1],[0,-1],[1,-1]]) {
      const nx=x+dx, ny=y+dy
      if(nx<0||nx>=cols||ny<0) continue
      const other=indices[ny*cols+nx]
      if(other>=0) links.push([id,other])
    }
  }
  return {points,links}
}
