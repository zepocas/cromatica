// Renderer: halftone (M8) — off is exact, tiling, and the CPU reference.
import { expect, test } from '@playwright/test';
import { type Design, type Finish, noFinish } from '../../src/design/design';
import { mesh16, planesDesign, threeStops, warp, withLook } from './support/designs';
import { engineHarness, openEngineHarness, logBench } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

const withHalftone = (d: Design, halftone: number, extra: Partial<Finish> = {}): Design => ({
  ...d,
  finish: { ...noFinish, halftone, ...extra },
});

test('halftone 0 is bit-identical to no halftone', async ({ page }) => {
  for (const d of [threeStops(30), mesh16, planesDesign(0.5, 0.5)]) {
    const plain = { ...d, finish: { ...noFinish } };
    const r = await engineHarness(page, 'compareDesigns', plain, withHalftone(d, 0), 640, 360);
    expect(r.identical).toBe(true);
  }
});

test('1531×917 single pass equals 256 px tiles (with relief and vignette)', async ({ page }) => {
  const d = withHalftone(withLook(threeStops(30), warp('domain', 0.4, 0.4)), 0.8, { relief: 0.5, vignette: 0.5 });
  const r = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, true);
  expect(r.first).toBeNull();
  expect(r.identical).toBe(true);
});

test('worker tiles equal main-thread single pass', async ({ page }) => {
  const r = await engineHarness(page, 'compareWorker', withHalftone(planesDesign(0.5, 0.7), 0.6), 1001, 777, 300, true);
  expect(r.first).toBeNull();
  expect(r.identical).toBe(true);
});

test.describe('halftone vs CPU reference (dither off)', () => {
  for (const [name, d] of [
    ['mesh', mesh16],
    ['ramp', threeStops(30)],
  ] as const) {
    test(name, async ({ page }) => {
      const r = await engineHarness(page, 'compareReference', withHalftone(d, 0.7, { vignette: 0.4 }), 640, 360);
      logBench(`halftone ${name}: max ${r.maxDiff}, >1: ${r.over}`);
      expect(r.alphaOk).toBe(true);
      // Dot edges: fp32 vs double can move an anti-aliased edge pixel a little.
      expect(r.over, JSON.stringify(r.worst)).toBeLessThan(0.002 * 640 * 360);
    });
  }
});
