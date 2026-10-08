// Renderer: warp shapes.
import { expect, test } from '@playwright/test';
import { type Design, WARP_SHAPES, noWarp } from '../../src/design/design';
import {
  threeStops,
  meshDefault,
  mesh16,
  defaultNoise,
  primaries,
  gray,
  SHAPES,
  STEPPED,
  warp,
  withLook,
  bases,
} from './support/designs';
import { engineHarness, openEngineHarness, logBench, bench } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

test.describe('warp tile independence (dither + noise on)', () => {
  for (const shape of WARP_SHAPES) {
    for (const [name, base] of bases) {
      test(`${shape} × ${name}: 1531×917 single pass equals 256 px tiles`, async ({ page }) => {
        const r = await engineHarness(
          page,
          'compareTiled',
          withLook(base, warp(shape), defaultNoise),
          1531,
          917,
          256,
          true,
        );
        expect(r.first).toBeNull();
        expect(r.identical).toBe(true);
        expect(r.tiles).toBe(24);
      });
    }
  }

  for (const shape of ['domain', 'curl', 'voronoi'] as const) {
    test(`${shape} mesh 5120×2880 single pass equals 2048 px tiles`, async ({ page }) => {
      const r = await engineHarness(
        page,
        'compareTiled',
        withLook(mesh16, warp(shape, 0.6, 0.4, 0xdeadbeef), { type: 'xerox', amount: 0.8 }),
        5120,
        2880,
        2048,
        true,
      );
      logBench(`${shape} 5120×2880: single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(6);
    });
  }

  test('worker tiles equal main-thread single pass (domain, noise)', async ({ page }) => {
    const r = await engineHarness(
      page,
      'compareWorker',
      withLook(primaries, warp('domain'), defaultNoise),
      1001,
      777,
      300,
      true,
    );
    expect(r.first).toBeNull();
    expect(r.identical).toBe(true);
  });
});

test.describe('warp vs CPU reference (dither + noise off)', () => {
  for (const shape of SHAPES) {
    for (const [name, base] of [
      ['mesh', meshDefault],
      ['linear', threeStops(60)],
    ] as const) {
      test(`${shape} × ${name}`, async ({ page }) => {
        const stepped = STEPPED.includes(shape);
        for (const w of [warp(shape, 0.5, 0.35, 1), warp(shape, 0.9, 0.8, 0x9e3779b9)]) {
          const r = await engineHarness(page, 'compareWarpReference', withLook(base, w), 640, 360, 2);
          logBench(
            `warp ref ${shape} × ${name} a=${w.amount} s=${w.size}: max ${r.maxDiff}, off-step max ${r.maxDiffOffStep}, ` +
              `>2: ${r.over} (${r.overOffStep} off-step), step px ${r.stepPixels}`,
          );
          if (stepped) {
            expect(r.overOffStep, JSON.stringify(r.worst)).toBe(0);
          } else if (shape === 'curl') {
            // 8 integrated steps amplify fp32 error where the flow stretches
            // hardest: a handful of pixels may reach ±3-4.
            expect(r.maxDiff, JSON.stringify(r.worstAny)).toBeLessThanOrEqual(4);
            expect(r.over).toBeLessThanOrEqual(640 * 360 * 1e-4);
          } else {
            expect(r.maxDiff, JSON.stringify(r.worstAny)).toBeLessThanOrEqual(2);
          }
        }
      });
    }
  }
});

test.describe('warp identities', () => {
  for (const shape of SHAPES) {
    test(`${shape}: amount 0 is bit-identical to no warp; seeds differ`, async ({ page }) => {
      const zero = await engineHarness(
        page,
        'compareDesigns',
        meshDefault,
        withLook(meshDefault, warp(shape, 0)),
        480,
        270,
      );
      const seeds = await engineHarness(
        page,
        'compareDesigns',
        withLook(meshDefault, warp(shape, 0.5, 0.5, 1)),
        withLook(meshDefault, warp(shape, 0.5, 0.5, 2)),
        480,
        270,
      );
      expect(zero.identical).toBe(true);
      expect(seeds.mismatches).toBeGreaterThan(1000);
    });
  }

  test('noise amount 0 is bit-identical to no noise', async ({ page }) => {
    const r = await engineHarness(
      page,
      'compareDesigns',
      withLook(mesh16, warp('fbm')),
      withLook(mesh16, warp('fbm'), { type: 'xerox', amount: 0 }),
      480,
      270,
    );
    expect(r.identical).toBe(true);
  });
});

test.describe('grain', () => {
  const grainy = (d: Design, amount: number) => withLook(d, noWarp, { type: 'grain', amount });

  test('is unbiased, grows with amount, and is correlated over a pixel or two', async ({ page }) => {
    const stats: Record<number, { meanDiff: number[]; sigma: number; autocorr: number[] }> = {};
    for (const amount of [0.15, 0.35, 1]) {
      const r = await engineHarness(page, 'grainStats', grainy(gray(0.6), amount), 1024, 512);
      stats[amount] = r;
      logBench(
        `grain a=${amount}: mean ${r.meanDiff.map((m) => m.toFixed(3))}, σ ${r.sigma.toFixed(2)} LSB, ` +
          `autocorr ${r.autocorr.map((c) => c.toFixed(2))}`,
      );
      for (const m of r.meanDiff) expect(Math.abs(m)).toBeLessThan(0.2);
    }
    expect(stats[0.35].sigma).toBeGreaterThan(stats[0.15].sigma * 1.8);
    expect(stats[1].sigma).toBeGreaterThan(stats[0.35].sigma * 2.2);
    // Fine, but not white: neighbouring pixels are a little alike (clumps), and the clumps die out within a few pixels.
    expect(stats[0.35].autocorr[0]).toBeGreaterThan(0.15);
    expect(stats[0.35].autocorr[3]).toBeLessThan(stats[0.35].autocorr[0]);
  });

  test('draws the same grain for the same amount and fresh grain for the next notch (D60)', async ({ page }) => {
    const same = await engineHarness(page, 'compareDesigns', grainy(gray(0.6), 0.5), grainy(gray(0.6), 0.5), 400, 300);
    expect(same.identical).toBe(true);
    // A rescaled copy of one pattern would leave most pixels within a level of each other.
    const next = await engineHarness(page, 'compareDesigns', grainy(gray(0.6), 0.5), grainy(gray(0.6), 0.51), 400, 300);
    expect(next.mismatches).toBeGreaterThan(400 * 300 * 0.6);
  });

  test('leaves pure black and white exact', async ({ page }) => {
    const d3 = threeStops(0);
    for (const d of [gray(0), gray(1), d3]) {
      const r = await engineHarness(
        page,
        'grainStats',
        withLook(d, warp('domain'), { type: 'grain', amount: 1 }),
        800,
        450,
      );
      // Pure black and white stay exact; channels that only round to 0/255 may move by a few levels (grain plus dither), never a speck.
      expect(r.maxChangeAtEnds).toBeLessThanOrEqual(3);
      if (d !== d3) expect(r.changedAtEnds).toBe(0);
    }
  });
});

test('warp render time at 5120×2880 (mesh, 16 points, noise on)', async ({ page }) => {
  test.skip(!bench, 'timing only: set BENCH=1');
  const lines: string[] = [];
  for (const shape of WARP_SHAPES) {
    const ms = await engineHarness(page, 'timeRender', withLook(mesh16, warp(shape), defaultNoise), 5120, 2880, 3);
    lines.push(`${shape} ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThan(0);
  }
  logBench(`warp timings 5120×2880: ${lines.join(', ')}`);
});
