import { describe, expect, it } from 'vitest';
import { defaultDesign, defaultMesh, type Design } from '../../src/design/design';
import { mutateDesign } from '../../src/design/mutate';
import { createRng } from '../../src/design/random';
import { saveDesign } from '../../src/design/schema';
import { shuffleDesign } from '../../src/design/shuffle';
import { swatchesOf } from '../../src/ui/favourites.svelte';

function* shuffled(n: number): Generator<Design> {
  let d: Design = { ...defaultDesign, base: defaultMesh };
  for (let seed = 1; seed <= n; seed++) {
    d = shuffleDesign(d, { colors: true, layout: true, style: true, seed }).design;
    yield d;
  }
}

describe('mutateDesign', () => {
  it('stays a valid design of the same kind, palette, finish and transform, and differs', () => {
    const kinds = new Set<string>();
    for (const d of shuffled(200)) {
      kinds.add(d.base.kind);
      for (const strength of [0.3, 1]) {
        const m = mutateDesign(d, createRng(7), strength);
        expect(() => saveDesign(m), d.base.kind).not.toThrow();
        expect(m.base.kind).toBe(d.base.kind);
        expect(swatchesOf(m)).toEqual(swatchesOf(d));
        expect(m.finish).toEqual(d.finish);
        expect(m.transform).toEqual(d.transform);
        expect(m).not.toEqual(d);
      }
    }
    expect(kinds.size).toBe(9);
  });

  it('changes the warp shape often in bold variations and rarely in gentle ones', () => {
    const [d] = shuffled(1);
    const changed = (s: number) =>
      Array.from({ length: 400 }, (_, seed) => mutateDesign(d, createRng(seed), s)).filter(
        (m) => m.warp.shape !== d.warp.shape,
      ).length;
    expect(changed(0.35)).toBeLessThan(40);
    expect(changed(1)).toBeGreaterThan(160);
  });

  it('is deterministic for a seed and leaves the input alone', () => {
    const [d] = shuffled(1);
    const copy = structuredClone(d);
    expect(mutateDesign(d, createRng(3), 0.5)).toEqual(mutateDesign(d, createRng(3), 0.5));
    expect(d).toEqual(copy);
  });

  it('moves mesh points further at higher strength', () => {
    const d: Design = { ...defaultDesign, base: defaultMesh };
    const spread = (s: number) => {
      let total = 0;
      for (let seed = 0; seed < 50; seed++) {
        const m = mutateDesign(d, createRng(seed), s);
        if (m.base.kind !== 'mesh') throw new Error('kind changed');
        m.base.points.forEach((p, i) => (total += Math.abs(p.x - defaultMesh.points[i].x)));
      }
      return total;
    };
    expect(spread(1)).toBeGreaterThan(2 * spread(0.3));
  });
});
