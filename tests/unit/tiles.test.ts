import { describe, expect, it } from 'vitest';
import { planTiles } from '../../src/export/tiles';

/** Returns a list of invariant violations (empty when the plan is valid). */
function planErrors(width: number, height: number, tileSize: number): string[] {
  const errors: string[] = [];
  const fail = (msg: string) => errors.push(`${width}x${height}@${tileSize}: ${msg}`);
  const bands = planTiles({ width, height }, tileSize);
  if (bands.length !== Math.ceil(height / tileSize)) fail(`band count ${bands.length}`);
  let expectedY = 0;
  for (const band of bands) {
    if (band.length !== Math.ceil(width / tileSize)) fail(`tiles per band ${band.length}`);
    const { y, height: h } = band[0];
    if (y !== expectedY) fail(`band y ${y} != ${expectedY}`);
    let expectedX = 0;
    for (const t of band) {
      if (t.y !== y || t.height !== h) fail('band tiles differ in y/height');
      if (t.x !== expectedX) fail(`tile x ${t.x} != ${expectedX}`);
      if (t.width <= 0 || t.width > tileSize || t.height <= 0 || t.height > tileSize) {
        fail(`bad tile size ${t.width}x${t.height}`);
      }
      expectedX += t.width;
    }
    if (expectedX !== width) fail(`band width ${expectedX}`);
    expectedY += h;
  }
  if (expectedY !== height) fail(`total height ${expectedY}`);

  // Pixel-level check for small sizes: every pixel covered exactly once.
  if (width * height <= 1 << 20) {
    const covered = new Uint8Array(width * height);
    for (const t of bands.flat()) {
      for (let py = t.y; py < t.y + t.height; py++) {
        for (let px = t.x; px < t.x + t.width; px++) covered[py * width + px]++;
      }
    }
    if (!covered.every((c) => c === 1)) fail('pixel covered zero or multiple times');
  }
  return errors;
}

function checkPlan(width: number, height: number, tileSize: number): void {
  expect(planErrors(width, height, tileSize)).toEqual([]);
}

describe('planTiles', () => {
  it('covers the output exactly for many sizes', () => {
    const errors: string[] = [];
    const dims = [1, 2, 3, 7, 16, 17, 31, 32, 33, 100, 255, 256, 257];
    for (const tileSize of [1, 5, 16, 32, 64]) {
      for (const w of dims) {
        for (const h of dims) errors.push(...planErrors(w, h, tileSize));
      }
    }
    expect(errors).toEqual([]);
  });

  it('handles 1×1, smaller than tile, and exact multiples', () => {
    expect(planTiles({ width: 1, height: 1 }, 2048)).toEqual([[{ x: 0, y: 0, width: 1, height: 1 }]]);
    expect(planTiles({ width: 300, height: 200 }, 2048)).toEqual([
      [{ x: 0, y: 0, width: 300, height: 200 }],
    ]);
    const exact = planTiles({ width: 4096, height: 2048 }, 1024);
    expect(exact.length).toBe(2);
    expect(exact.flat().every((t) => t.width === 1024 && t.height === 1024)).toBe(true);
    checkPlan(4096, 2048, 1024);
  });

  it('plans 6016×3384 at 2048 with smaller edge tiles', () => {
    const bands = planTiles({ width: 6016, height: 3384 }, 2048);
    expect(bands.map((b) => b.map((t) => [t.x, t.y, t.width, t.height]))).toEqual([
      [
        [0, 0, 2048, 2048],
        [2048, 0, 2048, 2048],
        [4096, 0, 1920, 2048],
      ],
      [
        [0, 2048, 2048, 1336],
        [2048, 2048, 2048, 1336],
        [4096, 2048, 1920, 1336],
      ],
    ]);
    checkPlan(6016, 3384, 2048);
    checkPlan(5120, 2880, 2048);
    checkPlan(7680, 4320, 1024);
  });

  it('rejects bad input', () => {
    const bad = [0, -1, 1.5, NaN, Infinity];
    for (const v of bad) {
      expect(() => planTiles({ width: v, height: 10 }, 16)).toThrow(RangeError);
      expect(() => planTiles({ width: 10, height: v }, 16)).toThrow(RangeError);
      expect(() => planTiles({ width: 10, height: 10 }, v)).toThrow(RangeError);
    }
  });
});
