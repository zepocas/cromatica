import { describe, expect, it } from 'vitest';
import { shuffleDesign } from '../../src/design/shuffle';
import { EditorState } from '../../src/ui/state/editor.svelte';

const shuffled = (kind: 'planes' | 'aurora' | 'blobs', arrange: boolean) => {
  const e = new EditorState({ shuffle: false });
  e.kind = kind;
  const before = e.design;
  const opts = { colors: false, layout: false, style: false, seed: 11, arrange };
  return { before, after: shuffleDesign(before, opts).design };
};

describe('arrange: a kept pattern is dealt a new arrangement', () => {
  for (const kind of ['planes', 'aurora', 'blobs'] as const) {
    it(`${kind}: new seed, same kind and settings`, () => {
      const { before, after } = shuffled(kind, true);
      expect(after.base).toEqual({ ...before.base, seed: (after.base as { seed: number }).seed });
      expect((after.base as { seed: number }).seed).not.toBe((before.base as { seed: number }).seed);
    });

    it(`${kind}: nothing changes without it`, () => {
      const { before, after } = shuffled(kind, false);
      expect(after.base).toEqual(before.base);
    });
  }

  it('drops hand edits with the new arrangement', () => {
    const e = new EditorState({ shuffle: false });
    e.kind = 'planes';
    e.setPlaneScale(0, 1.5);
    const after = shuffleDesign(e.design, { colors: false, layout: false, style: false, seed: 3, arrange: true });
    expect(after.design.base.kind === 'planes' && after.design.base.edits).toBeUndefined();
  });
});

describe('the shuffle with the pattern locked', () => {
  const run = (colorsLocked: boolean, adjustLocked: boolean) => {
    const e = new EditorState({ shuffle: false });
    e.kind = 'blobs';
    e.patternLocked = true;
    e.colorsLocked = colorsLocked;
    e.adjustLocked = adjustLocked;
    const seed = e.blobs.seed;
    const count = e.blobs.count;
    e.shuffle();
    return { moved: e.blobs.seed !== seed, kept: e.blobs.count === count, kind: e.kind };
  };

  it('rearranges the blobs and keeps the kind and the count', () => {
    expect(run(false, false)).toEqual({ moved: true, kept: true, kind: 'blobs' });
  });

  it('leaves the arrangement alone when colors are locked too: finishes only (D64)', () => {
    expect(run(true, false).moved).toBe(false);
  });
});
