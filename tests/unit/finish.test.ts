import { describe, expect, it } from 'vitest';
import { noFinish } from '../../src/design/design';
import { prepareGrain } from '../../src/engine/grain';
import { bandLevel, prepareFinish, stepLightness, VIGNETTE_INNER, vignetteFactor } from '../../src/engine/finish';

const frame = { width: 1600, height: 900 };
const corner: [number, number] = [1600 / 900 / 2, 0.5];

describe('vignette', () => {
  it('is exactly 1 everywhere when off', () => {
    const f = prepareFinish({ ...noFinish, vignette: 0, bands: 0, bandEdge: 0 }, frame);
    expect(vignetteFactor(f, ...corner)).toBe(1);
    expect(prepareFinish(undefined, frame).vignette).toBe(0);
  });

  it('leaves the middle alone and darkens the corners by up to 75%', () => {
    const f = prepareFinish({ ...noFinish, vignette: 1, bands: 0, bandEdge: 0 }, frame);
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
    const f = prepareFinish({ ...noFinish, vignette: 0, bands: 0, bandEdge: 0 }, frame);
    for (const t of [0, 0.123, 0.5, 1]) expect(bandLevel(f, t)).toBe(t);
  });

  it('steps the ramp, keeping both ends exact', () => {
    for (const bands of [0.01, 0.5, 1]) {
      const f = prepareFinish({ ...noFinish, vignette: 0, bands, bandEdge: 0 }, frame);
      expect(bandLevel(f, 0)).toBe(0);
      expect(bandLevel(f, 1)).toBe(1);
      const levels = new Set<number>();
      for (let i = 0; i <= 1000; i++) levels.add(bandLevel(f, i / 1000));
      expect(levels.size).toBe(f.bandSteps);
    }
    expect(prepareFinish({ ...noFinish, vignette: 0, bands: 0.01, bandEdge: 0 }, frame).bandSteps).toBe(24);
    expect(prepareFinish({ ...noFinish, vignette: 0, bands: 1, bandEdge: 0 }, frame).bandSteps).toBe(3);
  });

  it('a soft edge rises smoothly into the next step, still flat inside and exact at the ends', () => {
    const f = prepareFinish({ ...noFinish, vignette: 0, bands: 0.5, bandEdge: 0.4 }, frame);
    const n = f.bandSteps;
    expect(bandLevel(f, 0)).toBe(0);
    expect(bandLevel(f, 1)).toBe(1);
    // Flat in the first 60% of a step.
    expect(bandLevel(f, 1.1 / n)).toBe(1 / (n - 1));
    expect(bandLevel(f, 1.5 / n)).toBe(1 / (n - 1));
    // No jumps: small steps in x give small steps in level.
    let prev = 0;
    for (let i = 1; i <= 2000; i++) {
      const v = bandLevel(f, i / 2000);
      expect(v - prev).toBeLessThan(0.02);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('noise', () => {
  const at = (type: 'lithograph' | 'xerox' | 'halftone', amount: number) =>
    prepareFinish({ ...noFinish, noise: { type, amount } }, frame);

  it('is off at 0 and for halftone, which is not a print texture', () => {
    expect(at('lithograph', 0).printMix).toBe(0);
    expect(at('xerox', 0).printMix).toBe(0);
    expect(at('halftone', 1).printMix).toBe(0);
  });

  it('lithograph fades in and never blends the xerox screen', () => {
    expect(at('lithograph', 0.1).printMix).toBeGreaterThan(0);
    expect(at('lithograph', 0.1).printMix).toBeLessThan(1);
    expect(at('lithograph', 0.7).printMix).toBe(1);
    expect(at('lithograph', 1).printScreen).toBe(0);
  });

  it('xerox adds the thresholded screen and grows with its amount', () => {
    expect(at('xerox', 1).printScreen).toBe(1);
    expect(at('xerox', 0.3).printScreen).toBeGreaterThan(0);
    expect(at('xerox', 1).printInk).toBeGreaterThan(at('xerox', 0.3).printInk);
    expect(at('xerox', 1).printSpeckle).toBeGreaterThan(at('xerox', 0.3).printSpeckle);
  });

  it('lithograph tops out where the old print slider started to turn xerox', () => {
    expect(at('lithograph', 1).printInk).toBeCloseTo(at('xerox', 0.7).printInk, 10);
  });
});

describe('grain', () => {
  const seed = (amount: number) => prepareGrain({ type: 'grain', amount }).seed;

  it('is off for the other noise types and at 0', () => {
    expect(prepareGrain({ type: 'xerox', amount: 1 }).sigma).toBe(0);
    expect(prepareGrain({ type: 'grain', amount: 0 }).sigma).toBe(0);
    expect(prepareGrain(undefined).sigma).toBe(0);
  });

  it('gets a different pattern at every notch of the amount, and the same one for the same amount', () => {
    expect(seed(0.5)).toBe(seed(0.5));
    expect(seed(0.5)).not.toBe(seed(0.51));
    expect(new Set(Array.from({ length: 101 }, (_, i) => seed(i / 100))).size).toBe(101);
  });
});

describe('stepLightness (mesh band style layers)', () => {
  it('is the identity when off', () => {
    const f = prepareFinish({ ...noFinish, bands: 0 }, frame);
    for (const l of [0, 0.123, 0.5, 1]) expect(stepLightness(f, l)).toBe(l);
  });

  it('snaps to band centers, so the mean lightness holds, and stays in [0, 1]', () => {
    const f = prepareFinish({ ...noFinish, bands: 1, bandEdge: 0 }, frame);
    const n = f.bandSteps;
    expect(stepLightness(f, 0)).toBeCloseTo(0.5 / n, 12);
    expect(stepLightness(f, 1)).toBeLessThanOrEqual(1);
    const levels = new Set<number>();
    let sum = 0;
    for (let i = 0; i <= 1000; i++) {
      const v = stepLightness(f, i / 1000);
      levels.add(v);
      sum += v - i / 1000;
    }
    expect(levels.size).toBe(n + 1);
    expect(Math.abs(sum / 1001)).toBeLessThan(0.06);
  });

  it('rises into the next step over the edge, never going backward', () => {
    const f = prepareFinish({ ...noFinish, bands: 0.5, bandEdge: 0.6 }, frame);
    let prev = -1;
    for (let i = 0; i <= 2000; i++) {
      const v = stepLightness(f, i / 2000);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
