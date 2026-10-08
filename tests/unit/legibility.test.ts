import { describe, expect, it } from 'vitest';
import { assessZone, luminanceMap } from '../../src/context/legibility';

const SIZE = 128;
const WHOLE = { x: 0, y: 0, w: 1, h: 1 };

function image(gray: (x: number, y: number) => number) {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = Math.round(gray(x / SIZE, y / SIZE) * 255);
      rgba.set([v, v, v, 255], (y * SIZE + x) * 4);
    }
  }
  return luminanceMap(rgba, SIZE, SIZE);
}
const flat = (gray: number) => image(() => gray);

describe('legibility', () => {
  it('stays quiet on a calm dark area and picks white text', () => {
    const z = assessZone(flat(0.15), WHOLE)!;
    expect(z.midtone).toBe(false);
    expect(z.text).toBe('white');
  });

  it('stays quiet on a slow gradient', () => {
    const gradient = image((_, y) => 0.8 + 0.2 * y);
    expect(assessZone(gradient, WHOLE)!.midtone).toBe(false);
  });

  it('flags a mid-tone mix that fails with both white and black text', () => {
    const mix = image((x) => (x < 0.5 ? 0.3 : 0.65));
    expect(assessZone(mix, WHOLE)!.midtone).toBe(true);
  });

  it('holds large text to a lower bar', () => {
    const mix = image((x) => (x < 0.5 ? 0.3 : 0.5));
    expect(assessZone(mix, WHOLE)!.midtone).toBe(true);
    expect(assessZone(mix, WHOLE, true)!.midtone).toBe(false);
  });

  it('judges a light zone with dark worst pixels by those pixels', () => {
    const speckled = image((x, y) => ((x * 37 + y * 53) % 1 < 0.2 ? 0.45 : 0.95));
    expect(assessZone(speckled, WHOLE)!.contrast).toBeLessThan(assessZone(flat(0.95), WHOLE)!.contrast);
  });

  it('reads only the zone', () => {
    const half = image((x) => (x < 0.5 ? 0.05 : x < 0.75 ? 0.3 : 0.65));
    expect(assessZone(half, { x: 0, y: 0, w: 0.45, h: 1 })!.midtone).toBe(false);
    expect(assessZone(half, { x: 0.55, y: 0, w: 0.45, h: 1 })!.midtone).toBe(true);
  });

  it('ignores zones too small to measure', () => {
    expect(assessZone(flat(0.5), { x: 0.5, y: 0.5, w: 0.001, h: 0.001 })).toBeNull();
  });
});
