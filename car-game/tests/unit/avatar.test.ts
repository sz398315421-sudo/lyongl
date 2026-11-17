import { describe, expect, it } from 'vitest';
import { removeEdgeBackground } from '../../client/avatar/avatar';

function makePixels(width: number, height: number, color: [number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    pixels[index * 4] = color[0];
    pixels[index * 4 + 1] = color[1];
    pixels[index * 4 + 2] = color[2];
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

describe('avatar background processing', () => {
  it('removes edge-connected background while preserving the centered subject', () => {
    const width = 32, height = 32;
    const pixels = makePixels(width, height, [38, 126, 172]);
    for (let y = 10; y < 22; y++) {
      for (let x = 10; x < 22; x++) {
        const offset = (y * width + x) * 4;
        pixels[offset] = 245; pixels[offset + 1] = 220; pixels[offset + 2] = 160;
      }
    }

    expect(removeEdgeBackground(width, height, pixels)).toBeGreaterThan(0);
    expect(pixels[3]).toBe(0);
    expect(pixels[(16 * width + 16) * 4 + 3]).toBe(255);
  });

  it('does not process tiny placeholder images', () => {
    const pixels = makePixels(2, 2, [255, 0, 0]);
    expect(removeEdgeBackground(2, 2, pixels)).toBe(0);
    expect(pixels[3]).toBe(255);
  });
});
