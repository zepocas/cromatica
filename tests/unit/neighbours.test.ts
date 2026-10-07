import { describe, expect, it } from 'vitest';
import { srgbDecode } from '../../src/color/oklab';
import type { Rgb } from '../../src/color/types';
import { heightOf, heightSlope } from '../../src/engine/neighbours';

const gray = (l: number): Rgb => [l, l, l];

describe('height', () => {
  it('is Oklab lightness: 0 for black, 1 for white', () => {
    expect(heightOf(gray(0))).toBeCloseTo(0, 9);
    expect(heightOf(gray(1))).toBeCloseTo(1, 9);
    expect(heightOf(gray(srgbDecode(0.5)))).toBeGreaterThan(0.5);
  });
});

describe('heightSlope', () => {
  it('is zero on a flat color', () => {
    expect(heightSlope(() => [0.2, 0.4, 0.1], 0.3, -0.1)).toEqual([0, 0]);
  });

  it('recovers the slope of a field linear in lightness', () => {
    // Gray with Oklab L = 0.5 + 0.2u - 0.1v; for grays L = cbrt(Y).
    const field = (u: number, v: number) => gray((0.5 + 0.2 * u - 0.1 * v) ** 3);
    const [dx, dy] = heightSlope(field, 0.1, 0.2);
    expect(dx).toBeCloseTo(0.2, 6);
    expect(dy).toBeCloseTo(-0.1, 6);
  });

  it('rises toward the lighter side of an edge', () => {
    const edge = (u: number): Rgb => (u < 0 ? gray(0.05) : gray(0.8));
    expect(heightSlope(edge, 0, 0)[0]).toBeGreaterThan(0);
    expect(heightSlope(edge, 0.5, 0)).toEqual([0, 0]);
  });
});
