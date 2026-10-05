import { describe, expect, it } from 'vitest';
import type { RampGradient } from '../../src/design/design';
import { prepareRampShape, rampT } from '../../src/engine/ramp-shape';

const ramp = (kind: RampGradient['kind'], angle = 0): RampGradient => ({ kind, angle, stops: [] });
const frame = { width: 1600, height: 900 };
const half = 1600 / 900 / 2;

describe('rampT', () => {
  it('linear spans the frame along its direction', () => {
    const r = prepareRampShape(ramp('linear', 0), frame, undefined);
    expect(rampT(r, -half, 0)).toBeCloseTo(0, 9);
    expect(rampT(r, 0, 0.3)).toBeCloseTo(0.5, 9);
    expect(rampT(r, half, 0)).toBeCloseTo(1, 9);
  });

  it('radial runs from the center to the corners', () => {
    const r = prepareRampShape(ramp('radial'), frame, undefined);
    expect(rampT(r, 0, 0)).toBe(0);
    expect(rampT(r, half, 0.5)).toBeCloseTo(1, 9);
    expect(rampT(r, -half, -0.5)).toBeCloseTo(1, 9);
    expect(rampT(r, 0, 0.25)).toBeCloseTo(0.25 / Math.hypot(half, 0.5), 9);
  });

  it('conic sweeps from its start direction to the opposite one, with no seam', () => {
    const r = prepareRampShape(ramp('conic', 90), frame, undefined);
    expect(rampT(r, 0, 0.3)).toBeCloseTo(0, 9);
    expect(rampT(r, 0, -0.3)).toBeCloseTo(1, 9);
    expect(rampT(r, 0.3, 0)).toBeCloseTo(0.5, 9);
    expect(rampT(r, 0, 0)).toBe(0.5);
    // Walking round the circle never jumps.
    let prev = rampT(r, 0.3, 0);
    for (let i = 1; i <= 720; i++) {
      const a = (i / 720) * 2 * Math.PI;
      const t = rampT(r, 0.3 * Math.cos(a), 0.3 * Math.sin(a));
      expect(Math.abs(t - prev)).toBeLessThan(0.01);
      prev = t;
    }
  });
});

describe('noise and cells', () => {
  const field = (kind: 'noise' | 'cells', seed = 3, scale = 0.4): RampGradient => ({
    kind,
    angle: 0,
    stops: [],
    seed,
    scale,
  });
  const sample = (r: ReturnType<typeof prepareRampShape>) =>
    Array.from({ length: 4000 }, (_, i) => rampT(r, ((i % 80) / 80) * 1.7 - 0.85, Math.floor(i / 80) / 50 - 0.5));

  it('ridged noise differs from contour noise', () => {
    const contour = sample(prepareRampShape(field('noise'), frame, undefined));
    const ridgedT = sample(prepareRampShape({ ...field('noise'), noiseStyle: 'ridged' }, frame, undefined));
    expect(ridgedT).not.toEqual(contour);
    expect(Math.max(...ridgedT) - Math.min(...ridgedT)).toBeGreaterThan(0.6);
  });

  for (const kind of ['noise', 'cells'] as const) {
    it(`${kind} covers much of the ramp, stays in [0, 1] and follows the seed`, () => {
      const t = sample(prepareRampShape(field(kind), frame, undefined));
      expect(Math.min(...t)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...t)).toBeLessThanOrEqual(1);
      expect(Math.max(...t) - Math.min(...t)).toBeGreaterThan(0.6);
      expect(sample(prepareRampShape(field(kind, 4), frame, undefined))).not.toEqual(t);
      expect(sample(prepareRampShape(field(kind), frame, undefined))).toEqual(t);
    });
  }

  it('noise is continuous', () => {
    const r = prepareRampShape(field('noise'), frame, undefined);
    for (let i = 0; i < 1000; i++) {
      expect(Math.abs(rampT(r, i * 1e-3, 0.1) - rampT(r, (i + 1) * 1e-3, 0.1))).toBeLessThan(0.05);
    }
  });

  it('a larger scale means smaller features', () => {
    const big = prepareRampShape(field('cells', 3, 0), frame, undefined);
    const small = prepareRampShape(field('cells', 3, 1), frame, undefined);
    expect(small.freq).toBeCloseTo(10 * big.freq, 9);
  });
});
