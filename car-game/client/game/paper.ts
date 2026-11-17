import * as pc from 'playcanvas';

export type Point = readonly [number, number];
export const PAPER_COLORS = {
  white: '#fff9df', ink: '#314b56', edge: '#bf9670', grass: '#abc778',
  mint: '#61ad94', pine: '#39897a', blue: '#71b8cc', road: '#7eabc0',
  coral: '#eb7156', gold: '#f2c459', sky: '#dfeadf', peach: '#edc49a',
} as const;
export type PaperColor = keyof typeof PAPER_COLORS;

/** Small shared textures and extruded cutouts; no external art or engine-side UI. */
export class PaperWorkshop {
  private materials: pc.StandardMaterial[] = [];
  private meshes: pc.Mesh[] = [];
  private textures: pc.Texture[] = [];
  readonly palette: Record<PaperColor, pc.StandardMaterial>;

  constructor(private app: pc.AppBase) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f7f3e9'; ctx.fillRect(0, 0, 256, 256);
    let seed = 51;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 4200; i++) {
      const x = random() * 256, y = random() * 256;
      ctx.strokeStyle = random() > 0.4 ? 'rgba(114,91,62,.12)' : 'rgba(255,255,255,.6)';
      ctx.lineWidth = 0.5 + random() * 0.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 3, y + random()); ctx.stroke();
    }
    const grain = this.texture(canvas);
    this.palette = Object.fromEntries(Object.entries(PAPER_COLORS).map(([key, color]) => {
      const mat = this.material(color);
      mat.diffuseMap = grain;
      mat.update();
      return [key, mat];
    })) as Record<PaperColor, pc.StandardMaterial>;
  }

  private material(color: string) {
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color().fromString(color);
    mat.specular = new pc.Color(0, 0, 0);
    mat.gloss = 0; mat.metalness = 0;
    mat.update();
    this.materials.push(mat);
    return mat;
  }

  private texture(source: HTMLCanvasElement | HTMLImageElement) {
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const texture = new pc.Texture(this.app.graphicsDevice, { width, height, mipmaps: true });
    texture.setSource(source);
    this.textures.push(texture);
    return texture;
  }

  box(name: string, position: number[], scale: number[], color: PaperColor, parent: pc.Entity, type = 'box') {
    const entity = new pc.Entity(name);
    entity.addComponent('render', { type, material: this.palette[color], castShadows: true, receiveShadows: true });
    entity.setLocalPosition(position[0], position[1], position[2]);
    entity.setLocalScale(scale[0], scale[1], scale[2]);
    parent.addChild(entity);
    return entity;
  }

  mesh(name: string, positions: number[], indices: number[], mat: pc.StandardMaterial, parent: pc.Entity, uvs?: number[]) {
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(pc.calculateNormals(positions, indices));
    if (uvs) mesh.setUvs(0, uvs);
    mesh.setIndices(indices); mesh.update();
    this.meshes.push(mesh);
    const entity = new pc.Entity(name);
    entity.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: true, receiveShadows: true });
    parent.addChild(entity);
    return entity;
  }

  private slab(name: string, points: readonly Point[], depth: number, color: PaperColor, parent: pc.Entity) {
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
    const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
    for (const side of [-1, 1]) {
      const offset = positions.length / 3;
      positions.push(cx, cy, side * depth / 2); uvs.push(cx / 3, cy / 3);
      for (const p of points) { positions.push(p[0], p[1], side * depth / 2); uvs.push(p[0] / 3, p[1] / 3); }
      for (let i = 0; i < points.length; i++) {
        const a = offset + 1 + i, b = offset + 1 + (i + 1) % points.length;
        indices.push(offset, side > 0 ? a : b, side > 0 ? b : a);
      }
    }
    this.mesh(name + ' faces', positions, indices, this.palette[color], parent, uvs);
    const edge: number[] = [], triangles: number[] = [], edgeUvs: number[] = [];
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length], n = edge.length / 3;
      edge.push(p[0], p[1], -depth / 2, q[0], q[1], -depth / 2, q[0], q[1], depth / 2, p[0], p[1], depth / 2);
      triangles.push(n, n + 1, n + 2, n, n + 2, n + 3);
      edgeUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    });
    this.mesh(name + ' cardboard edge', edge, triangles, this.palette.edge, parent, edgeUvs);
  }

  card(name: string, points: readonly Point[], color: PaperColor, parent: pc.Entity, depth = 0.13, border = 0.08) {
    const card = new pc.Entity(name);
    parent.addChild(card);
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
    const outer = points.map(([x, y]) => {
      const length = Math.hypot(x - cx, y - cy) || 1;
      return [x + (x - cx) / length * border, y + (y - cy) / length * border] as Point;
    });
    this.slab(name + ' cutout', outer, depth, 'white', card);
    this.slab(name + ' colored paper', points, depth + 0.018, color, card);
    return card;
  }

  stroke(points: readonly Point[], parent: pc.Entity, z: number, color: PaperColor = 'ink', width = 0.035) {
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i - 1], [ex, ey] = points[i];
      const line = this.box('Hand-drawn stroke', [(x + ex) / 2, (y + ey) / 2, z], [Math.hypot(ex - x, ey - y), width, 0.012], color, parent);
      line.setLocalEulerAngles(0, 0, Math.atan2(ey - y, ex - x) * pc.math.RAD_TO_DEG);
      line.render!.castShadows = false;
    }
  }

  label(text: string, width: number, height: number, parent: pc.Entity, background: PaperColor = 'white', ink: PaperColor = 'ink') {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.max(64, Math.round(512 * height / width));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = PAPER_COLORS[background]; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = PAPER_COLORS[ink]; ctx.lineWidth = 3;
    ctx.strokeRect(9, 8, canvas.width - 18, canvas.height - 16);
    ctx.fillStyle = PAPER_COLORS[ink];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + Math.floor(canvas.height * 0.52) + 'px "Trebuchet MS", "Microsoft YaHei", sans-serif';
    ctx.fillText(text, 256, canvas.height / 2 + 2, 470);
    const mat = this.material('#ffffff');
    mat.diffuseMap = this.texture(canvas);
    // Labels are viewed from either side on the diorama (banner, signs and rear number).
    // Keep the back face readable instead of turning it into a black rectangle.
    mat.cull = pc.CULLFACE_NONE;
    mat.useLighting = false;
    mat.update();
    const positions = [-width / 2, -height / 2, 0, width / 2, -height / 2, 0, width / 2, height / 2, 0, -width / 2, height / 2, 0];
    const label = this.mesh(text, positions, [0, 1, 2, 0, 2, 3, 2, 1, 0, 3, 2, 0], mat, parent, [0, 1, 1, 1, 1, 0, 0, 0]);
    label.render!.castShadows = false;
    return label;
  }

  imageCard(
    name: string,
    points: readonly Point[],
    parent: pc.Entity,
    source: string,
    fallback: PaperColor,
    fallbackText: string,
    depth = 0.14,
    border = 0.08,
  ) {
    const card = this.card(name, points, 'white', parent, depth, border);
    const inner = points.map(([x, y]) => [x * 0.9, y * 0.9] as Point);
    const material = this.material(PAPER_COLORS[fallback]);
    material.cull = pc.CULLFACE_BACK;
    material.useLighting = false;
    material.update();
    const faceDepth = depth / 2 + 0.035;
    const positions = [
      ...inner.flatMap(([x, y]) => [x, y, faceDepth]),
      ...inner.flatMap(([x, y]) => [x, y, -faceDepth]),
    ];
    const indices: number[] = [];
    for (let i = 1; i < inner.length - 1; i++) {
      indices.push(0, i, i + 1);
      indices.push(inner.length, inner.length + i + 1, inner.length + i);
    }
    const xs = inner.map(point => point[0]), ys = inner.map(point => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const faceUvs = inner.map(([x, y]) => [(x - minX) / (maxX - minX), (y - minY) / (maxY - minY)] as const);
    const uvs = [
      ...faceUvs.flatMap(([u, v]) => [u, v]),
      // Reverse both axes on the rear face so the portrait keeps its original
      // orientation when viewed from behind the kart.
      ...faceUvs.flatMap(([u, v]) => [1 - u, 1 - v]),
    ];
    const surface = this.mesh(name + ' two-sided portrait', positions, indices, material, card, uvs);
    surface.render!.castShadows = false;
    this.applyImage(material, source, fallback, fallbackText);
    return { card, material, faceCount: 2 };
  }

  applyImage(material: pc.StandardMaterial, source: string, fallback: PaperColor, fallbackText: string) {
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = fallbackCanvas.height = 256;
    const fallbackContext = fallbackCanvas.getContext('2d')!;
    fallbackContext.fillStyle = PAPER_COLORS[fallback];
    fallbackContext.fillRect(0, 0, 256, 256);
    fallbackContext.fillStyle = PAPER_COLORS.ink;
    fallbackContext.textAlign = 'center';
    fallbackContext.textBaseline = 'middle';
    fallbackContext.font = '900 144px Georgia, serif';
    fallbackContext.fillText(fallbackText, 128, 134);
    const applyTexture = (texture: pc.Texture) => {
      material.diffuseMap = texture;
      material.opacityMap = texture;
      material.opacityMapChannel = 'a';
      material.blendType = pc.BLEND_NORMAL;
      material.depthWrite = false;
      material.update();
    };
    applyTexture(this.texture(fallbackCanvas));
    if (!source.startsWith('data:image/') && !/^https:\/\//i.test(source)) return;
    const image = new Image();
    image.onload = () => {
      applyTexture(this.texture(image));
    };
    if (/^https:\/\//i.test(source)) image.crossOrigin = 'anonymous';
    image.src = source;
  }

  dispose() {
    for (const mesh of this.meshes) mesh.destroy();
    for (const mat of this.materials) mat.destroy();
    for (const texture of this.textures) texture.destroy();
  }
}

export function roundCutout(radius: number, lobes = 0, segments = 16): Point[] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = i / segments * Math.PI * 2;
    const r = radius * (1 + (lobes ? Math.sin(angle * lobes) * 0.09 : 0));
    return [Math.cos(angle) * r, Math.sin(angle) * r] as Point;
  });
}
