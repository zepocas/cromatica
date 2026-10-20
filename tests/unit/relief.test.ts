import { describe, expect, it } from 'vitest';
import type { Rgb } from '../../src/color/types';
import { noFinish, type ReliefStyle } from '../../src/design/design';
import { applyRelief, prepareRelief } from '../../src/engine/relief';

const relief = (strength: number, style: ReliefStyle = 'satin', light = 135) =>
  prepareRelief({ ...noFinish, relief: strength, reliefStyle: style, reliefLight: light });

// Lightness rising to the right: a slope facing left.
const ramp = (u: number): Rgb => {
  const y = (0.3 + 0.4 * u) ** 3;
  return [y, y, y];
};

describe('relief', () => {
  it('is off at 0 and starts gently', () => {
    expect(relief(0).depth).toBe(0);
    expect(relief(0.5).depth).toBeLessThan(relief(1).depth / 3);
  });

  it('leaves flat color untouched, for both surfaces', () => {
    const flat = (): Rgb => [0.2, 0.5, 0.1];
    for (const style of ['satin', 'glass'] as const) {
      expect(applyRelief(relief(1, style), flat, 0.1, 0.2, flat())).toEqual(flat());
    }
  });

  it('lights slopes that face the light and shades the others', () => {
    const at = (light: number) => applyRelief(relief(1, 'satin', light), ramp, 0, 0, ramp(0))[0];
    // The surface rises to the right, so it faces left (180°).
    expect(at(180)).toBeGreaterThan(ramp(0)[0]);
    expect(at(0)).toBeLessThan(ramp(0)[0]);
  });

  it('refracts no further than the room before an edge', () => {
    const glass = relief(1, 'glass');
    const colors = (u: number): Rgb => (u < 0 ? [0.9, 0.9, 0.9] : ramp(u));
    const roomy = applyRelief(glass, colors, 0.001, 0, colors(0.001), ramp, () => 1e9);
    const none = applyRelief(glass, colors, 0.001, 0, colors(0.001), ramp, () => 0);
    const unrefracted = applyRelief(glass, () => colors(0.001), 0.001, 0, colors(0.001), ramp);
    expect(none).toEqual(unrefracted);
    expect(roomy).not.toEqual(none);
  });
});
