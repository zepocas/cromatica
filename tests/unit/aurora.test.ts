import { describe, expect, it } from 'vitest';
import type { Oklch } from '../../src/color/types';
import type { AuroraPattern } from '../../src/design/design';
import { evaluateAurora, MAX_RIBBONS, prepareAurora, ribbonCount } from '../../src/engine/aurora';

const colors: Oklch[] = [
  [0.8, 0.17, 150],
  [0.15, 0.03, 260],
  [0.6, 0.2, 320],
];
const aurora = (over: Partial<AuroraPattern> = {}): AuroraPattern => ({
  kind: 'aurora',
  colors,
  count: 0.5,
  glow: 0.5,
  blend: 0.6,
  seed: 7,
  ...over,
});

describe('aurora', () => {
  it('maps the ribbons slider to 2..6 ribbons', () => {
    expect(ribbonCount(0)).toBe(2);
    expect(ribbonCount(1)).toBe(MAX_RIBBONS);
    expect(prepareAurora(aurora({ count: 1 })).count).toBe(MAX_RIBBONS);
  });

  it('blend runs from crisp edges and deep rays to soft ones, through the look from before it at 0.6', () => {
    const crisp = prepareAurora(aurora({ blend: 0 }));
    const legacy = prepareAurora(aurora({ blend: 0.6 }));
    const soft = prepareAurora(aurora({ blend: 1 }));
    expect(legacy.down / legacy.up).toBeCloseTo(0.25, 12);
    expect(legacy.rays).toBeCloseTo(0.45, 12);
    expect(crisp.down).toBeLessThan(legacy.down);
    expect(crisp.rays).toBeGreaterThan(legacy.rays);
    expect(soft.down).toBeGreaterThan(legacy.down);
    expect(soft.rays).toBeLessThan(legacy.rays);
  });

  it('uses the darkest color, dimmed, as the sky', () => {
    const p = prepareAurora(aurora());
    expect(Math.max(...p.sky)).toBeLessThan(0.02);
    // Far below every ribbon only the sky shows.
    const below = evaluateAurora(p, 0, -5);
    for (let c = 0; c < 3; c++) expect(below[c]).toBeCloseTo(p.sky[c], 6);
  });

  it('stays in [0, 1] and brightens the sky where ribbons are', () => {
    const p = prepareAurora(aurora({ count: 1, glow: 1 }));
    let brightest = 0;
    for (let i = 0; i < 2000; i++) {
      const rgb = evaluateAurora(p, (i % 50) / 25 - 1, Math.floor(i / 50) / 40 - 0.5);
      for (const c of rgb) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      brightest = Math.max(brightest, ...rgb);
    }
    expect(brightest).toBeGreaterThan(0.2);
  });

  it('is deterministic per seed', () => {
    expect(prepareAurora(aurora())).toEqual(prepareAurora(aurora()));
    expect(prepareAurora(aurora({ seed: 8 })).lines).not.toEqual(prepareAurora(aurora()).lines);
  });

  it('rejects an empty palette', () => {
    expect(() => prepareAurora(aurora({ colors: [] }))).toThrow(RangeError);
  });
});
