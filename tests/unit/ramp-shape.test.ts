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
