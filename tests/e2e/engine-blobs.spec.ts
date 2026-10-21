// Renderer: blobs — CPU reference (stipple and the smooth height the lighting reads) and tiling.
// A stipple dot is a hard threshold, so where float32 and doubles round differently (a dot cell edge,
// a warped or refracted sample) a dot can flip between ink and black (the outline's atan and cos are float32 on the GPU, which moves a blob's depth and so its dots' density a little). Those are compared as a
// share of the frame, not by the largest difference.
import { expect, test } from '@playwright/test';
import type { BlobsPattern, Design } from '../../src/design/design';
import { noFinish, noWarp } from '../../src/design/design';
import { warp, withLook } from './support/designs';
import { engineHarness, openEngineHarness } from './support/harness';

/** At most this share of pixels may differ by more than the tolerance. */
const FLIPPED = 0.02;
/** Glass lighting reads the pattern where the surface tilt shifts it, so a fine stipple flips more dots there. */
const FLIPPED_GLASS = 0.06;
/** A warp is float32 on the GPU too, so it moves a sample by rounding error and flips a few more dots. */
const FLIPPED_WARPED = 0.03;
const flipped = (over: number, w: number, h: number) => over / (w * h);

const blobs = (count: number, wobble: number, grain: number): Design => ({
  engineVersion: 1,
  warp: noWarp,
  base: {
    kind: 'blobs',
    colors: [
      [0.95, 0.02, 90],
      [0.8, 0.17, 85],
      [0.6, 0.2, 30],
      [0.55, 0.1, 250],
    ],
    count,
    size: 0.6,
    wobble,
    grain,
    seed: 5,
  },
});

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

for (const [count, wobble, grain] of [
  [0, 0, 0],
  [1, 1, 0.93],
]) {
  test(`blobs count ${count}, wobble ${wobble}, grain ${grain}: CPU reference and tiles`, async ({ page }) => {
    const d = blobs(count, wobble, grain);
    for (const [w, h] of [
      [640, 360],
      [479, 777],
    ]) {
      const r = await engineHarness(page, 'compareReference', d, w, h);
      expect(flipped(r.over, w, h), JSON.stringify(r.worst)).toBeLessThanOrEqual(FLIPPED);
    }
    for (const dither of [true, false]) {
      const t = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, dither);
      expect(t.identical).toBe(true);
    }
  });
}

for (const reliefStyle of ['satin', 'glass'] as const) {
  test(`blobs with ${reliefStyle} lighting read the smooth height, not the dots`, async ({ page }) => {
    const d: Design = { ...blobs(0.5, 0.5, 0.4), finish: { ...noFinish, relief: 0.6, reliefStyle, reliefLight: 135 } };
    const r = await engineHarness(page, 'compareReference', d, 640, 360);
    expect(flipped(r.over, 640, 360), JSON.stringify(r.worst)).toBeLessThanOrEqual(
      reliefStyle === 'glass' ? FLIPPED_GLASS : FLIPPED,
    );
  });
}

test('blobs with a warp match the CPU reference', async ({ page }) => {
  const r = await engineHarness(
    page,
    'compareWarpReference',
    withLook(blobs(0.5, 0.5, 0.4), warp('domain', 0.4, 0.4)),
    640,
    360,
    2,
  );
  expect(flipped(r.over, 640, 360), JSON.stringify(r.worstAny)).toBeLessThanOrEqual(FLIPPED_WARPED);
});

test('blobs with edits (moved, restacked, resized) match the CPU reference', async ({ page }) => {
  const base = blobs(0.5, 0.5, 0.4);
  const d: Design = {
    ...base,
    base: {
      ...(base.base as BlobsPattern),
      edits: {
        order: [3, 0, 1, 2, 4, 5],
        shifts: [
          [0.1, 0],
          [0, 0],
          [-0.08, 0.05],
        ],
        scales: [1, 1.6, 0.6, 1, 2],
      },
    },
  };
  const r = await engineHarness(page, 'compareReference', d, 640, 360);
  expect(flipped(r.over, 640, 360), JSON.stringify(r.worst)).toBeLessThanOrEqual(FLIPPED);
});

for (const grain of [0, 0.5]) {
  test(`blobs with a palette base, grain ${grain}, match the CPU reference and tiles`, async ({ page }) => {
    const base = blobs(0.5, 0.65, grain);
    const d: Design = {
      ...base,
      base: {
        ...(base.base as BlobsPattern),
        base: 'palette',
        // Light and dark inks, so black and white dots both appear.
        colors: [
          [0.96, 0.02, 90],
          [0.85, 0.15, 85],
          [0.55, 0.2, 28],
          [0.35, 0.1, 255],
        ],
      },
    };
    const r = await engineHarness(page, 'compareReference', d, 640, 360);
    expect(flipped(r.over, 640, 360), JSON.stringify(r.worst)).toBeLessThanOrEqual(FLIPPED);
    const t = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, true);
    expect(t.identical).toBe(true);
  });
}
