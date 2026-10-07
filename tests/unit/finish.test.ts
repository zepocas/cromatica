import { describe, expect, it } from 'vitest';
import { noFinish } from '../../src/design/design';
import { bandLevel, prepareFinish, VIGNETTE_INNER, vignetteFactor } from '../../src/engine/finish';

const frame = { width: 1600, height: 900 };
const corner: [number, number] = [1600 / 900 / 2, 0.5];

describe('vignette', () => {
  it('is exactly 1 everywhere when off', () => {
    const f = prepareFinish({ ...noFinish, vignette: 0, bands: 0, bandEdge: 0, print: 0 }, frame);
    expect(vignetteFactor(f, ...corner)).toBe(1);
    expect(prepareFinish(undefined, frame).vignette).toBe(0);
  });

  it('leaves the middle alone and darkens the corners by up to 75%', () => {
    const f = prepareFinish({ ...noFinish, vignette: 1, bands: 0, bandEdge: 0, print: 0 }, frame);
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
    const f = prepareFinish({ ...noFinish, vignette: 0, bands: 0, bandEdge: 0, print: 0 }, frame);
    for (const t of [0, 0.123, 0.5, 1]) expect(bandLevel(f, t)).toBe(t);
  });

  it('steps the ramp, keeping both ends exact', () => {
    for (const bands of [0.01, 0.5, 1]) {
      const f = prepareFinish({ ...noFinish, vignette: 0, bands, bandEdge: 0, print: 0 }, frame);
      expect(bandLevel(f, 0)).toBe(0);
      expect(bandLevel(f, 1)).toBe(1);
      const levels = new Set<number>();
      for (let i = 0; i <= 1000; i++) levels.add(bandLevel(f, i / 1000));
      expect(levels.size).toBe(f.bandSteps);
    }
    expect(prepareFinish({ ...noFinish, vignette: 0, bands: 0.01, bandEdge: 0, print: 0 }, frame).bandSteps).toBe(24);
    expect(prepareFinish({ ...noFinish, vignette: 0, bands: 1, bandEdge: 0, print: 0 }, frame).bandSteps).toBe(3);
  });

  it('a soft edge rises smoothly into the next step, still flat inside and exact at the ends', () => {
    const f = prepareFinish({ ...noFinish, vignette: 0, bands: 0.5, bandEdge: 0.4, print: 0 }, frame);
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

describe('print', () => {
  it('is off at 0, fades in, and goes from litho ink texture to a xerox screen', () => {
    const at = (print: number) => prepareFinish({ ...noFinish, vignette: 0, bands: 0, bandEdge: 0, print }, frame);
    expect(at(0).printMix).toBe(0);
    expect(at(0.1).printMix).toBeGreaterThan(0);
    expect(at(0.1).printMix).toBeLessThan(1);
    expect(at(0.5).printMix).toBe(1);
    expect(at(0.3).printScreen).toBe(0);
    expect(at(1).printScreen).toBe(1);
    expect(at(1).printInk).toBeGreaterThan(at(0.3).printInk);
    expect(at(1).printSpeckle).toBeGreaterThan(at(0.3).printSpeckle);
  });
});
