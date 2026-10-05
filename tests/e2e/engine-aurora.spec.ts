// Renderer: aurora — CPU reference and tiling.
import { expect, test } from '@playwright/test';
import type { Design } from '../../src/design/design';
import { noGrain, noWarp } from '../../src/design/design';
import { warp, withLook } from './support/designs';
import { engineHarness, openEngineHarness } from './support/harness';

const aurora = (count: number, glow: number, blend: number): Design => ({
  engineVersion: 1,
  warp: noWarp,
  grain: noGrain,
  base: {
    kind: 'aurora',
    colors: [
      [0.15, 0.03, 260],
      [0.8, 0.17, 150],
      [0.65, 0.15, 190],
      [0.6, 0.2, 320],
    ],
    count,
    glow,
    blend,
    seed: 5,
  },
});

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

for (const [count, glow, blend] of [
  [0, 0.2, 0],
  [1, 0.9, 1],
]) {
  test(`aurora count ${count}, glow ${glow}, blend ${blend}: CPU reference and tiles`, async ({ page }) => {
    const d = aurora(count, glow, blend);
    for (const [w, h] of [
      [640, 360],
      [479, 777],
    ]) {
      const r = await engineHarness(page, 'compareReference', d, w, h);
      expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
    }
    for (const dither of [true, false]) {
      const t = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, dither);
      expect(t.identical).toBe(true);
    }
  });
}

test('aurora with a warp matches the CPU reference', async ({ page }) => {
  const r = await engineHarness(
    page,
    'compareWarpReference',
    withLook(aurora(0.5, 0.5, 0.35), warp('domain', 0.4, 0.4)),
    640,
    360,
    2,
  );
  expect(r.maxDiff, JSON.stringify(r.worstAny)).toBeLessThanOrEqual(2);
});
