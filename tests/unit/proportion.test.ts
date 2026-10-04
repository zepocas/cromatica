import { describe, expect, it } from 'vitest';
import { meshAreaShares } from '../../src/color/mesh';
import type { Oklch } from '../../src/color/types';
import { defaultMesh, type PointMesh } from '../../src/design/design';
import { fitRadii, frameSamples, proportionTargets } from '../../src/design/proportion';

const colors: Oklch[] = [
  [0.3, 0.05, 250], // dark, muted: calmest
  [0.7, 0.2, 40], // vivid orange: accent
  [0.6, 0.1, 150],
  [0.8, 0.06, 90],
];

describe('proportionTargets', () => {
  it('gives the calmest color 60%, the most vivid 10%, the rest 30% together', () => {
    const t = proportionTargets(colors);
    expect(t[0]).toBeCloseTo(0.6, 9);
    expect(t[1]).toBeCloseTo(0.1, 9);
    expect(t[2]).toBeCloseTo(0.15, 9);
    expect(t[3]).toBeCloseTo(0.15, 9);
    expect(t.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('handles one and two colors', () => {
    expect(proportionTargets([colors[0]])).toEqual([1]);
    const pair = proportionTargets([colors[1], colors[0]]);
    expect(pair[1]).toBeCloseTo(0.7, 9);
    expect(pair[0]).toBeCloseTo(0.3, 9);
  });
});

describe('fitRadii', () => {
  const samples = frameSamples(16 / 9);
  for (const sharpness of [0.1, 0.35, 0.7]) {
    it(`brings each point's share close to its target (sharpness ${sharpness})`, () => {
      const mesh: PointMesh = { ...defaultMesh, sharpness };
      const targets = proportionTargets(mesh.points.map((p) => p.color));
      const radii = fitRadii(mesh, targets, samples, [0.02, 3]);
      const shares = meshAreaShares(
        { ...mesh, points: mesh.points.map((p, i) => ({ ...p, radius: radii[i] })) },
        samples,
      );
      const before = meshAreaShares(mesh, samples);
      console.log(
        sharpness,
        targets.map((t) => t.toFixed(2)).join(' '),
        '|',
        before.map((s) => s.toFixed(2)).join(' '),
        '→',
        shares.map((s) => s.toFixed(2)).join(' '),
      );
      shares.forEach((s, i) => expect(Math.abs(s - targets[i])).toBeLessThan(0.05));
    });
  }

  it('keeps positions and stays within the limits', () => {
    const radii = fitRadii(defaultMesh, [0.96, 0.01, 0.01, 0.01, 0.01], samples, [0.1, 0.5]);
    for (const r of radii) {
      expect(r).toBeGreaterThanOrEqual(0.1);
      expect(r).toBeLessThanOrEqual(0.5);
    }
  });
});
