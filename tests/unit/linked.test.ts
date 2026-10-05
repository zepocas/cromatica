import { describe, expect, it } from 'vitest';
import { maxChroma } from '../../src/color/gamut';
import type { Oklch } from '../../src/color/types';
import { createRng } from '../../src/design/random';
import { relinkPalette, remixShift, shiftPalette } from '../../src/color/linked';

// A muted triadic: hues 250 / 10 / 130, moderate chroma so caps don't interfere.
const palette: Oklch[] = [
  [0.35, 0.08, 250],
  [0.6, 0.07, 10],
  [0.8, 0.06, 130],
  [0.95, 0.01, 90], // near-neutral cream
];

const gap = (a: number, b: number) => (((b - a) % 360) + 360) % 360;

describe('relinkPalette', () => {
  it('keeps the edited color exactly as given', () => {
    const next: Oklch = [0.42, 0.1, 275];
    expect(relinkPalette(palette, 0, next)[0]).toEqual(next);
  });

  it('rotating one hue rotates every hue by the same angle (harmony kept)', () => {
    const out = relinkPalette(palette, 0, [0.35, 0.08, 290]);
    expect(gap(out[0][2], out[1][2])).toBeCloseTo(gap(palette[0][2], palette[1][2]), 9);
    expect(gap(out[0][2], out[2][2])).toBeCloseTo(gap(palette[0][2], palette[2][2]), 9);
    expect(out[1][2]).toBeCloseTo(50, 9);
  });

  it('wraps hue the short way round', () => {
    const out = relinkPalette(palette, 1, [0.6, 0.07, 350]);
    expect(out[0][2]).toBeCloseTo(230, 9);
  });

  it('lightness keeps the order and stays inside (0, 1)', () => {
    for (const target of [0.02, 0.2, 0.7, 0.99]) {
      const out = relinkPalette(palette, 1, [target, 0.07, 10]);
      const ls = out.map((c) => c[0]);
      expect([...ls].sort((a, b) => a - b)).toEqual([ls[0], ls[1], ls[2], ls[3]]);
      for (const l of ls) expect(l > 0 && l < 1).toBe(true);
    }
  });

  it('chroma scales by the same ratio and stays in gamut', () => {
    const out = relinkPalette(palette, 0, [0.35, 0.04, 250]);
    expect(out[1][1]).toBeCloseTo(0.035, 9);
    expect(out[2][1]).toBeCloseTo(0.03, 9);
    const loud = relinkPalette(palette, 0, [0.35, 0.3, 250]);
    // The others stay displayable (the edited color itself is taken as given).
    for (const c of loud.slice(1)) expect(c[1]).toBeLessThanOrEqual(maxChroma(c[0], c[2]) + 1e-12);
  });

  it('dragging away and back restores the palette', () => {
    let p = palette.map((c) => [...c] as Oklch);
    for (const step of [
      [0.5, 0.09, 270],
      [0.25, 0.05, 220],
      [0.35, 0.08, 250],
    ] as Oklch[])
      p = relinkPalette(p, 0, step);
    p.forEach((c, i) => c.forEach((v, k) => expect(v).toBeCloseTo(palette[i][k], 9)));
  });

  it('near-neutral creams and near-blacks keep their chroma when the others get louder', () => {
    const anchored: Oklch[] = [[0.22, 0.03, 250], ...palette.slice(0, 3), [0.95, 0.03, 90]];
    const out = relinkPalette(anchored, 1, [0.35, 0.24, 250]);
    expect(out[0][1]).toBe(0.03);
    expect(out[4][1]).toBe(0.03);
    expect(out[2][1]).toBeCloseTo(0.21, 9);
  });

  it('a gray changing hue does not swing the other colors', () => {
    const out = relinkPalette(palette, 3, [0.95, 0.01, 200]);
    expect(out[0][2]).toBe(250);
  });
});

describe('remix', () => {
  it('moves the palette but keeps its hue gaps and lightness order', () => {
    for (let seed = 0; seed < 50; seed++) {
      const out = shiftPalette(palette, remixShift(createRng(seed)));
      expect(out).not.toEqual(palette);
      expect(gap(out[0][2], out[1][2])).toBeCloseTo(gap(palette[0][2], palette[1][2]), 9);
      const ls = out.map((c) => c[0]);
      expect(ls[0] < ls[1] && ls[1] < ls[2] && ls[2] < ls[3]).toBe(true);
    }
  });
});
