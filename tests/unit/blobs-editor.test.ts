import { describe, expect, it } from 'vitest';
import { EditorState } from '../../src/ui/state/editor.svelte';

const blobsEditor = (warp: 'domain' | 'none' = 'none') => {
  const e = new EditorState({ shuffle: false });
  e.kind = 'blobs';
  e.blobs.count = 0.5;
  e.warp = { shape: warp, amount: 0.3, size: 0.35, seed: 7 };
  return e;
};

describe('blob sizes in the editor', () => {
  it('starts at 1 and stores nothing until a size is set', () => {
    const e = blobsEditor();
    expect(e.blobScale(2)).toBe(1);
    expect(e.hasShapeEdits).toBe(false);
  });

  it('sets, clamps, and stores a size as an edit that undo and the save carry', () => {
    const e = blobsEditor();
    e.setBlobScale(2, 1.5);
    expect(e.blobScale(2)).toBe(1.5);
    expect(e.hasShapeEdits).toBe(true);
    expect(e.design.base.kind === 'blobs' && e.design.base.edits?.scales).toEqual([1, 1, 1.5]);
    e.setBlobScale(2, 100);
    expect(e.blobScale(2)).toBe(2.5);
    e.setBlobScale(2, 0);
    expect(e.blobScale(2)).toBe(0.25);
  });

  it('keeps sizes through moving and restacking, and resets one blob or all', () => {
    const e = blobsEditor();
    e.setBlobScale(1, 2);
    e.setPlaneShift(1, 0.1, 0);
    e.restack(1, 'front');
    expect(e.blobScale(1)).toBe(2);
    expect(e.planeShift(1)).toEqual([0.1, 0]);
    e.resetPlane(1);
    expect(e.blobScale(1)).toBe(1);
    expect(e.planeShift(1)).toEqual([0, 0]);
    e.setBlobScale(3, 1.2);
    e.clearPlaneEdits();
    expect(e.blobScale(3)).toBe(1);
    expect(e.hasShapeEdits).toBe(false);
  });

  it('a new layout or a different blob count drops the sizes', () => {
    const e = blobsEditor();
    e.setBlobScale(1, 2);
    e.newBlobsLayout();
    expect(e.blobScale(1)).toBe(1);
    e.setBlobScale(1, 2);
    e.setBlobsCount(1);
    expect(e.blobScale(1)).toBe(1);
  });

  it('a bigger blob is picked further from its centre', () => {
    const e = blobsEditor();
    const id = e.planeStack.at(-1)!;
    const base = e.design.base;
    if (base.kind !== 'blobs') throw new Error('not blobs');
    const outline = e.blobOutlinePath(id);
    // The topmost blob's centre: the mean of the points of its analytic outline (no warp, no transform).
    const pts = [...outline.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), -Number(m[2])]);
    const cx = pts.reduce((a, [x]) => a + x, 0) / pts.length;
    const cy = pts.reduce((a, [, y]) => a + y, 0) / pts.length;
    expect(e.blobAt(cx, cy)).toBe(id);
    const extent = () => {
      let t = 0;
      while (t < 3 && e.blobAt(cx + t, cy) === id) t += 0.005;
      return t;
    };
    const before = extent();
    e.setBlobScale(id, 2);
    expect(extent()).toBeGreaterThan(before * 1.4);
  });
});

describe('the traced outline under a warp', () => {
  it('is many segments, the same on a repeat, and follows a move', () => {
    const e = blobsEditor('domain');
    const id = e.planeStack.at(-1)!;
    const a = e.blobOutlinePath(id);
    expect(a.split('M').length).toBeGreaterThan(30);
    expect(e.blobOutlinePath(id)).toBe(a);
    e.setPlaneShift(id, 0.05, 0.02);
    expect(e.blobOutlinePath(id)).not.toBe(a);
  });

  it('follows a bigger size', () => {
    const e = blobsEditor('domain');
    const id = e.planeStack.at(-1)!;
    const before = e.blobOutlinePath(id);
    e.setBlobScale(id, 1.8);
    expect(e.blobOutlinePath(id)).not.toBe(before);
  });
});
