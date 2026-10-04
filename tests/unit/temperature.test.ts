import { describe, expect, it } from 'vitest';
import { inSrgbGamut } from '../../src/color/oklab';
import { applyTemperature, COOL_HUE, MAX_HUE_SHIFT, temperatureDeltas, WARM_HUE } from '../../src/color/temperature';
import type { Oklch } from '../../src/design/design';

const hueDist = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

// Dark to light, hues well away from both targets.
const palette: Oklch[] = [
  [0.25, 0.08, 160],
  [0.45, 0.1, 20],
  [0.6, 0.1, 200],
  [0.75, 0.08, 330],
  [0.9, 0.05, 180],
];

/** How far the color moved toward a target hue. */
const gain = (i: number, d: number[], target: number) =>
  hueDist(palette[i][2], target) - hueDist(palette[i][2] + d[i], target);

describe('temperatureDeltas', () => {
  it('warm: the lightest turns toward amber, the darkest toward blue-violet', () => {
    const d = temperatureDeltas(palette, 'warm');
    expect(gain(4, d, WARM_HUE)).toBeCloseTo(MAX_HUE_SHIFT, 9);
    expect(gain(0, d, COOL_HUE)).toBeCloseTo(MAX_HUE_SHIFT, 9);
  });

  it('cool: the lightest turns toward blue-violet, the darkest toward amber', () => {
    const d = temperatureDeltas(palette, 'cool');
    expect(gain(4, d, COOL_HUE)).toBeCloseTo(MAX_HUE_SHIFT, 9);
    expect(gain(0, d, WARM_HUE)).toBeCloseTo(MAX_HUE_SHIFT, 9);
  });

  it('is zero when off, for the mid-tone, neutrals and a flat palette', () => {
    expect(temperatureDeltas(palette, 'off')).toEqual([0, 0, 0, 0, 0]);
    const mid: Oklch[] = [[0.2, 0.1, 30], [0.5, 0.1, 30], [0.8, 0.1, 30]];
    expect(temperatureDeltas(mid, 'warm')[1]).toBeCloseTo(0, 9);
    expect(temperatureDeltas([[0.2, 0.005, 30], [0.9, 0, 0]], 'warm')).toEqual([0, 0]);
    expect(temperatureDeltas([[0.5, 0.1, 30], [0.5, 0.1, 200]], 'warm')).toEqual([0, 0]);
  });

  it('never turns past its target', () => {
    expect(temperatureDeltas([[0.2, 0.1, 265], [0.9, 0.1, 80]], 'warm')).toEqual([10, -5]);
  });
});

describe('applyTemperature', () => {
  it('keeps lightness and stays in gamut', () => {
    for (const t of ['warm', 'cool'] as const) {
      applyTemperature(palette, t).forEach((c, i) => {
        expect(c[0]).toBe(palette[i][0]);
        expect(inSrgbGamut(c, 1e-6)).toBe(true);
      });
    }
  });

  it('returns the palette unchanged when off', () => {
    expect(applyTemperature(palette, 'off')).toEqual(palette);
  });
});
