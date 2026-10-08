import { describe, expect, it } from 'vitest';
import { visibleCrops } from '../../src/context/crops';

describe('crop frames', () => {
  it('draws only the narrower ratios, as fractions of the frame width', () => {
    const crops = visibleCrops(16 / 9);
    expect(crops.map((c) => c.label)).toEqual(['16:10', 'tablet', 'phone']);
    expect(crops[0].width).toBeCloseTo(1512 / 982 / (16 / 9), 6);
  });

  it('skips a ratio that matches the frame', () => {
    expect(visibleCrops(16 / 9).some((c) => c.label === '16:9')).toBe(false);
  });

  it('has nothing to draw on the narrowest frame', () => {
    expect(visibleCrops(0.4)).toEqual([]);
  });
});
