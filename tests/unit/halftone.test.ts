import { describe, expect, it } from 'vitest';
import { linearSrgbToOklab, oklabToLinearSrgb } from '../../src/color/oklab';
import type { Rgb } from '../../src/color/types';
import { noFinish } from '../../src/design/design';
import { applyHalftone, halftoneContrast } from '../../src/engine/halftone';

const contrast = (amount: number) => halftoneContrast({ ...noFinish, halftone: amount });
const PIXEL = 1 / 1080;
const Y = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('halftone', () => {
  it('is off at 0', () => {
    expect(contrast(0)).toBe(0);
  });

  it('keeps white white and black black', () => {
    applyHalftone(contrast(1), [1, 1, 1], 0.01, 0.02, PIXEL).forEach((c) => expect(c).toBeCloseTo(1, 6));
    applyHalftone(contrast(1), [0, 0, 0], 0.01, 0.02, PIXEL).forEach((c) => expect(c).toBeCloseTo(0, 6));
  });

  it('holds the tone on average: ink and paper mix back to the luminance', () => {
    for (const L of [0.3, 0.6, 0.85]) {
      const gray = oklabToLinearSrgb([L, 0, 0]);
      let sum = 0;
      const n = 200;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) sum += Y(applyHalftone(contrast(1), gray, i * PIXEL, j * PIXEL, PIXEL));
      }
      expect(Math.abs(sum / (n * n) - Y(gray))).toBeLessThan(0.015);
    }
  });

  it('is ink or paper away from the dot edges', () => {
    // At 4320 px high a dot spans ~15 px, so most pixels are clear of an edge.
    const fine = 1 / 4320;
    const k = contrast(1);
    const color: Rgb = [0.2, 0.3, 0.5];
    const [L] = linearSrgbToOklab(color);
    const lightness = new Set<number>();
    for (let i = 0; i < 400; i++) {
      lightness.add(Math.round(linearSrgbToOklab(applyHalftone(k, color, i * fine, 0.1, fine))[0] * 100));
    }
    expect(lightness.has(Math.round(L * (1 - k) * 100))).toBe(true);
    expect(lightness.has(Math.round((L + k * (1 - L)) * 100))).toBe(true);
  });
});
