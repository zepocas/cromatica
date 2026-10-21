import { describe, expect, it } from 'vitest';
import { defaultDesign, noFinish, type BlobsPattern, type Design } from '../../src/design/design';
import { editingScale, keepsFullResolution } from '../../src/preview/core';

describe('editingScale', () => {
  it('stays at full resolution while a full frame fits the budget', () => {
    expect(editingScale(4)).toBe(1);
    expect(editingScale(20)).toBe(1);
  });

  it('drops gradually as frames get dearer, in eighths', () => {
    // sqrt(16 / 25) = 0.8 -> 0.75; sqrt(16 / 40) = 0.63 -> 0.625
    expect(editingScale(25)).toBe(0.75);
    expect(editingScale(40)).toBe(0.625);
  });

  it('never goes below half, and treats an unmeasured cost as expensive', () => {
    expect(editingScale(500)).toBe(0.5);
    expect(editingScale(Infinity)).toBe(0.5);
  });
});

describe('keepsFullResolution', () => {
  const blobs = (grain: number): Design => {
    const base: BlobsPattern = {
      kind: 'blobs',
      colors: [
        [0.9, 0.05, 90],
        [0.5, 0.15, 20],
      ],
      count: 0.5,
      size: 0.5,
      wobble: 0.5,
      grain,
      seed: 1,
    };
    return { ...defaultDesign, base };
  };
  const noisy = (amount: number): Design => ({
    ...defaultDesign,
    finish: { ...noFinish, noise: { type: 'grain', amount } },
  });

  it('keeps full resolution while the blobs are stippled, and for edits to the grain', () => {
    expect(
      keepsFullResolution(blobs(0.6), { ...blobs(0.6), base: { ...blobs(0.6).base, size: 0.7 } as BlobsPattern }),
    ).toBe(true);
    expect(keepsFullResolution(blobs(0), blobs(0.6))).toBe(true);
    expect(keepsFullResolution(blobs(0.6), blobs(0))).toBe(true);
  });

  it('may drop resolution for blobs without grain, and for edits that touch no texture', () => {
    expect(keepsFullResolution(blobs(0), { ...blobs(0), base: { ...blobs(0).base, size: 0.7 } as BlobsPattern })).toBe(
      false,
    );
    expect(keepsFullResolution(defaultDesign, { ...defaultDesign, warp: { ...defaultDesign.warp, amount: 0.5 } })).toBe(
      false,
    );
  });

  it('treats the noise as before', () => {
    expect(keepsFullResolution(noisy(0), noisy(0.5))).toBe(true);
    expect(keepsFullResolution(noisy(0.5), { ...noisy(0.5), warp: { ...noisy(0.5).warp, amount: 0.5 } })).toBe(true);
    expect(keepsFullResolution(noisy(0), { ...noisy(0), warp: { ...noisy(0).warp, amount: 0.5 } })).toBe(false);
  });
});
