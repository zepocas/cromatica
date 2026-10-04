import { describe, expect, it } from 'vitest';
import { bandT, prepareFinish, VIGNETTE_INNER, vignetteFactor } from '../../src/engine/finish';

const frame = { width: 1600, height: 900 };
const corner: [number, number] = [1600 / 900 / 2, 0.5];

describe('vignette', () => {
  it('is exactly 1 everywhere when off', () => {
    const f = prepareFinish({ vignette: 0, bands: 0 }, frame);
    expect(vignetteFactor(f, ...corner)).toBe(1);
    expect(prepareFinish(undefined, frame).vignette).toBe(0);
  });

  it('leaves the middle alone and darkens the corners by up to 75%', () => {
    const f = prepareFinish({ vignette: 1, bands: 0 }, frame);
    expect(vignetteFactor(f, 0, 0)).toBe(1);
    const inner = VIGNETTE_INNER * Math.hypot(...corner);
    expect(vignetteFactor(f, inner * 0.99, 0)).toBe(1);
    expect(vignetteFactor(f, ...corner)).toBeCloseTo(0.25, 9);
    // Darker the further out.
    expect(vignetteFactor(f, 0.6, 0.3)).toBeLessThan(vignetteFactor(f, 0.4, 0.2));
  });
});

describe('bands', () => {
  it('is the identity when off', () => {
    const f = prepareFinish({ vignette: 0, bands: 0 }, frame);
    for (const t of [0, 0.123, 0.5, 1]) expect(bandT(f, t)).toBe(t);
  });

  it('steps the ramp, keeping both ends exact', () => {
    for (const bands of [0.01, 0.5, 1]) {
      const f = prepareFinish({ vignette: 0, bands }, frame);
      expect(bandT(f, 0)).toBe(0);
      expect(bandT(f, 1)).toBe(1);
      const levels = new Set<number>();
      for (let i = 0; i <= 1000; i++) levels.add(bandT(f, i / 1000));
      expect(levels.size).toBe(f.bandSteps);
    }
    expect(prepareFinish({ vignette: 0, bands: 0.01 }, frame).bandSteps).toBe(24);
    expect(prepareFinish({ vignette: 0, bands: 1 }, frame).bandSteps).toBe(3);
  });
});
