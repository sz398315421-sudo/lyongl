const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 512;
const BACKGROUND_SOFT_DISTANCE = 44 ** 2;
const BACKGROUND_HARD_DISTANCE = 88 ** 2;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function pixelOffset(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function colorDistanceSquared(pixels: Uint8ClampedArray, offset: number, color: Rgb) {
  const red = pixels[offset] - color.r;
  const green = pixels[offset + 1] - color.g;
  const blue = pixels[offset + 2] - color.b;
  return red * red + green * green + blue * blue;
}

function cornerColors(width: number, height: number, pixels: Uint8ClampedArray): Rgb[] {
  const patch = Math.max(1, Math.min(12, Math.floor(Math.min(width, height) / 6)));
  const origins = [[0, 0], [width - patch, 0], [0, height - patch], [width - patch, height - patch]];
  return origins.map(([originX, originY]) => {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = originY; y < originY + patch; y++) {
      for (let x = originX; x < originX + patch; x++) {
        const offset = pixelOffset(width, x, y);
        r += pixels[offset]; g += pixels[offset + 1]; b += pixels[offset + 2]; count++;
      }
    }
    return { r: r / count, g: g / count, b: b / count };
  });
}

function nearestBackgroundDistance(pixels: Uint8ClampedArray, offset: number, colors: Rgb[]) {
  let nearest = Number.POSITIVE_INFINITY;
  for (const color of colors) nearest = Math.min(nearest, colorDistanceSquared(pixels, offset, color));
  return nearest;
}

/** Removes only background-color regions connected to the image edge. */
export function removeEdgeBackground(width: number, height: number, pixels: Uint8ClampedArray): number {
  if (width < 4 || height < 4) return 0;
  const colors = cornerColors(width, height, pixels);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0, removed = 0;

  const visit = (x: number, y: number) => {
    const index = y * width + x;
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    if (nearestBackgroundDistance(pixels, offset, colors) <= BACKGROUND_HARD_DISTANCE) queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { visit(0, y); visit(width - 1, y); }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width, y = Math.floor(index / width), offset = index * 4;
    const distance = nearestBackgroundDistance(pixels, offset, colors);
    const alpha = distance <= BACKGROUND_SOFT_DISTANCE
      ? 0
      : Math.round(255 * (distance - BACKGROUND_SOFT_DISTANCE) / (BACKGROUND_HARD_DISTANCE - BACKGROUND_SOFT_DISTANCE));
    if (alpha < pixels[offset + 3]) { pixels[offset + 3] = alpha; removed++; }
    if (distance > BACKGROUND_HARD_DISTANCE) continue;
    if (x > 0) visit(x - 1, y);
    if (x + 1 < width) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y + 1 < height) visit(x, y + 1);
  }
  return removed;
}

export async function cropAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  if (file.size > MAX_AVATAR_BYTES) throw new Error('图片不能超过 5 MB。');

  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败，请换一张图片。'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('图片格式无法读取，请换一张图片。'));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理头像。');

  const cropSize = Math.min(source.naturalWidth, source.naturalHeight);
  const sourceX = (source.naturalWidth - cropSize) / 2;
  const sourceY = (source.naturalHeight - cropSize) / 2;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  // Normalize front-camera portraits once so the menu preview and the driver
  // sticker share the same human-facing left/right orientation.
  context.save();
  context.translate(AVATAR_SIZE, 0);
  context.scale(-1, 1);
  context.drawImage(source, sourceX, sourceY, cropSize, cropSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.restore();
  if (source.naturalWidth > 8 && source.naturalHeight > 8) {
    const imageData = context.getImageData(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    removeEdgeBackground(AVATAR_SIZE, AVATAR_SIZE, imageData.data);
    context.putImageData(imageData, 0, 0);
  }
  return canvas.toDataURL('image/png');
}
