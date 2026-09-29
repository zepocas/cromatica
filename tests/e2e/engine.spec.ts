import { expect, test, type Page } from '@playwright/test';
import type { BlendMode, Design, Oklch } from '../../src/design/design';
import type { EngineHarness } from './harness/engine';

declare global {
  interface Window {
    engineHarness: EngineHarness;
  }
}

type StopSpec = [position: number, color: Oklch, blend?: BlendMode];

function linear(angle: number, stops: StopSpec[]): Design {
  return {
    engineVersion: 1,
    base: {
      kind: 'linear',
      angle,
      stops: stops.map(([position, color, blend = 'oklab']) => ({ position, color, blend })),
    },
  };
}

const threeStops = (angle: number) =>
  linear(angle, [
    [0, [0.3, 0.12, 280], 'oklab'],
    [0.4, [0.62, 0.2, 350], 'oklch-short'],
    [1, [0.86, 0.13, 77]],
  ]);

// Mid-tone gradient whose channels stay away from 0 and 255, so the dither is never clipped.
const midTones = linear(20, [
  [0, [0.5, 0.08, 250]],
  [0.5, [0.62, 0.09, 150], 'oklab-chroma'],
  [1, [0.72, 0.08, 40]],
]);

async function openHarness(page: Page) {
  await page.goto('/tests/e2e/harness/engine.html');
  await page.waitForFunction(() => window.engineHarness !== undefined);
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test.describe('tile independence', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    for (const angle of [30, 135]) {
      test(`1531×917 single pass equals 256 px tiles (angle ${angle}, ${label})`, async ({ page }) => {
        const r = await page.evaluate(
          ([d, dither]) => window.engineHarness.compareTiled(d, 1531, 917, 256, dither),
          [threeStops(angle), dither] as const,
        );
        expect(r.first).toBeNull();
        expect(r.identical).toBe(true);
        expect(r.tiles).toBe(24);
      });
    }

    test(`5120×2880 single pass equals 2048 px tiles (${label})`, async ({ page }) => {
      const r = await page.evaluate(
        ([d, dither]) => window.engineHarness.compareTiled(d, 5120, 2880, 2048, dither),
        [threeStops(17), dither] as const,
      );
      console.log(
        `5120×2880 ${label}: ${r.tiles} tiles, single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`,
      );
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(6);
    });

    test(`worker OffscreenCanvas tiles equal main-thread single pass (${label})`, async ({ page }) => {
      const r = await page.evaluate(
        ([d, dither]) => window.engineHarness.compareWorker(d, 1531, 917, 300, dither),
        [threeStops(250), dither] as const,
      );
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }
});

test.describe('correctness vs CPU reference (dither off)', () => {
  for (const angle of [0, 45, 90, 180, 300]) {
    for (const [w, h] of [
      [640, 360],
      [480, 777],
    ]) {
      test(`angle ${angle}, ${w}×${h}`, async ({ page }) => {
        const r = await page.evaluate(
          ([d, w, h]) => window.engineHarness.compareReference(d, w, h),
          [threeStops(angle), w, h] as const,
        );
        console.log(`reference angle ${angle} ${w}×${h}: max ${r.maxDiff} (f16 model ${r.maxDiffHalf})`);
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('hard edge, clamped ends and max stops', async ({ page }) => {
    const blends: BlendMode[] = ['oklab', 'oklab-chroma', 'oklch-short', 'oklch-long'];
    const d = linear(
      63,
      Array.from({ length: 8 }, (_, i): StopSpec => [
        // Stops start at 0.1 and end at 0.9 so both clamped ends are exercised;
        // stops 3 and 4 share a position (hard edge).
        [0.1, 0.2, 0.3, 0.45, 0.45, 0.6, 0.8, 0.9][i],
        [0.25 + i * 0.09, 0.04 + (i % 3) * 0.05, (i * 47) % 360],
        blends[i % 4],
      ]),
    );
    const r = await page.evaluate(
      ([d]) => window.engineHarness.compareReference(d, 801, 503),
      [d] as const,
    );
    console.log(`reference 8 stops: max ${r.maxDiff} (f16 model ${r.maxDiffHalf})`);
    expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
  });
});

test('cached ramp follows stop changes', async ({ page }) => {
  const r = await page.evaluate(
    ([a, b]) => window.engineHarness.rampCache(a, b, 320, 200),
    [threeStops(10), midTones] as const,
  );
  expect(r).toEqual([true, true, true, true]);
});

test.describe('dither', () => {
  test('stays within ±2 of dither off and is unbiased', async ({ page }) => {
    const r = await page.evaluate(
      ([d]) => window.engineHarness.ditherStats(d, 1600, 1000),
      [midTones] as const,
    );
    console.log(`dither: ${JSON.stringify(r)}`);
    expect(r.range[0]).toBeGreaterThan(2);
    expect(r.range[1]).toBeLessThan(253);
    expect(r.maxDiff).toBeLessThanOrEqual(2);
    for (const b of r.meanBias) expect(Math.abs(b)).toBeLessThanOrEqual(0.1);
    for (const b of r.meanBiasIdeal) expect(Math.abs(b)).toBeLessThanOrEqual(0.1);
  });

  test('removes banding from a dark, shallow gradient', async ({ page }) => {
    const dark = linear(0, [
      [0, [0.1, 0.01, 250]],
      [1, [0.14, 0.01, 250]],
    ]);
    const r = await page.evaluate(
      ([d]) => window.engineHarness.banding(d, 3840, 256, 16),
      [dark] as const,
    );
    console.log(`banding: ${JSON.stringify(r)}`);
    // Dither off: a handful of flat bands hundreds of pixels wide.
    expect(Math.max(...r.off.longestRun)).toBeGreaterThan(200);
    // Dither on: flat runs are over an order of magnitude shorter than the
    // bands (the longest happen where the ideal value sits on an integer,
    // since |TPDF| < 0.5 LSB 75% of the time), and 16×16 block averages
    // follow the continuous ramp far more closely.
    expect(Math.max(...r.on.longestRun)).toBeLessThanOrEqual(32);
    expect(r.on.block.rms).toBeLessThan(r.off.block.rms / 3);
    expect(r.on.block.max).toBeLessThan(0.25);
  });
});

test.describe('aspect behavior', () => {
  // Oklch of sRGB #ff0000 and #0000ff.
  const twoStops = linear(0, [
    [0, [0.628, 0.2577, 29.23]],
    [1, [0.452, 0.3132, 264.05]],
  ]);
  for (const [w, h] of [
    [1600, 900],
    [900, 1600],
    [700, 700],
    [2100, 300],
    [301, 1999],
  ]) {
    test(`angle 0 spans the frame at ${w}×${h}`, async ({ page }) => {
      const r = await page.evaluate(
        ([d, w, h]) => window.engineHarness.edgeColumns(d, w, h),
        [twoStops, w, h] as const,
      );
      expect(r.left).toBeLessThanOrEqual(1);
      expect(r.right).toBeLessThanOrEqual(1);
    });
  }
});
