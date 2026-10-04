// Renderer: planes — tiling and the CPU reference.
import { expect, test } from '@playwright/test';
import type { Design } from '../../src/design/design';
import { planesDesign, warp, withLook } from './support/designs';
import { engineHarness, openEngineHarness, logBench } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

test.describe('planes tile independence', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    test(`1531×917 single pass equals 256 px tiles (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'compareTiled', planesDesign(1, 1), 1531, 917, 256, dither);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });

    test(`worker tiles equal main-thread single pass (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'compareWorker', planesDesign(0.5, 0.7), 1001, 777, 300, dither);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }
});

test.describe('planes vs CPU reference (dither off)', () => {
  const cases: [string, Design][] = [
    ['clean', planesDesign(0.4, 0)],
    ['torn', planesDesign(0.4, 1)],
    ['many, torn', planesDesign(1, 0.6)],
    ['blended', planesDesign(0.6, 0.5, 0.7)],
  ];
  for (const [name, d] of cases) {
    for (const [w, h] of [
      [640, 360],
      [479, 777],
    ]) {
      test(`${name}, ${w}×${h}`, async ({ page }) => {
        const r = await engineHarness(page, 'compareReference', d, w, h);
        logBench(`planes reference ${name} ${w}×${h}: max ${r.maxDiff}`);
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('warped', async ({ page }) => {
    const d = withLook(planesDesign(0.5, 0.5), warp('domain', 0.4, 0.4));
    const r = await engineHarness(page, 'compareWarpReference', d, 640, 360, 1);
    logBench(`planes warped: max ${r.maxDiff}, >1: ${r.over}`);
    // fp32 warp coords shift the hard edges slightly: a few antialiased edge pixels differ by a little.
    expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(6);
    expect(r.over).toBeLessThan(0.005 * 640 * 360);
  });
});
