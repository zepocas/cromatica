// Renderer: warp shapes and film grain.
import { expect, test } from '@playwright/test';
import { defaultGrain, WARP_SHAPES, noWarp } from '../../src/design/design';
import {
  threeStops,
  meshDefault,
  mesh16,
  primaries,
  SHAPES,
  STEPPED,
  warp,
  withLook,
  bases,
  gray,
} from './support/designs';
import { engineHarness, openEngineHarness, logBench, bench } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

test.describe('warp tile independence (dither + grain on)', () => {
  for (const shape of WARP_SHAPES) {
    for (const [name, base] of bases) {
      test(`${shape} × ${name}: 1531×917 single pass equals 256 px tiles`, async ({ page }) => {
        const r = await engineHarness(
          page,
          'compareTiled',
          withLook(base, warp(shape), defaultGrain),
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
        withLook(mesh16, warp(shape, 0.6, 0.4, 0xdeadbeef), { amount: 0.8, size: 0.6 }),
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

  test('worker tiles equal main-thread single pass (domain, grain)', async ({ page }) => {
    const r = await engineHarness(
      page,
      'compareWorker',
      withLook(primaries, warp('domain'), defaultGrain),
      1001,
      777,
      300,
      true,
    );
    expect(r.first).toBeNull();
    expect(r.identical).toBe(true);
  });
});

test.describe('warp vs CPU reference (dither + grain off)', () => {
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

  test('grain amount 0 is bit-identical to no grain', async ({ page }) => {
    const r = await engineHarness(
      page,
      'compareDesigns',
      withLook(mesh16, warp('fbm')),
      withLook(mesh16, warp('fbm'), { amount: 0, size: 0.7 }),
      480,
      270,
    );
    expect(r.identical).toBe(true);
  });
});

test.describe('grain', () => {
  test('is unbiased, grows with amount, and size sets its correlation length', async ({ page }) => {
    const stats: Record<string, { meanDiff: number[]; sigma: number; autocorr: number[] }> = {};
    for (const amount of [0.15, 0.35, 1]) {
      for (const size of [0, 0.5, 1]) {
        const r = await engineHarness(page, 'grainStats', withLook(gray(0.6), noWarp, { amount, size }), 1024, 512);
        stats[`${amount}/${size}`] = r;
        logBench(
          `grain a=${amount} s=${size}: mean ${r.meanDiff.map((m) => m.toFixed(3))}, σ ${r.sigma.toFixed(2)} LSB, ` +
            `autocorr ${r.autocorr.map((c) => c.toFixed(2))}`,
        );
        for (const m of r.meanDiff) expect(Math.abs(m)).toBeLessThan(0.2);
      }
    }
    for (const size of ['0', '0.5', '1']) {
      expect(stats[`0.35/${size}`].sigma).toBeGreaterThan(stats[`0.15/${size}`].sigma * 1.8);
      expect(stats[`1/${size}`].sigma).toBeGreaterThan(stats[`0.35/${size}`].sigma * 2.2);
    }
    // Size 0 is white per pixel; coarser grain stays correlated over more pixels.
    expect(Math.abs(stats['0.35/0'].autocorr[0])).toBeLessThan(0.05);
    expect(stats['0.35/0.5'].autocorr[0]).toBeGreaterThan(0.3);
    expect(stats['0.35/1'].autocorr[1]).toBeGreaterThan(stats['0.35/0.5'].autocorr[1] + 0.1);
  });

  test('leaves pure black and white exact', async ({ page }) => {
    const d3 = threeStops(0);
    for (const d of [gray(0), gray(1), d3]) {
      const r = await engineHarness(
        page,
        'grainStats',
        withLook(d, warp('domain'), { amount: 1, size: 0.3 }),
        800,
        450,
      );
      // Channels that only round to 0/255 may move by 1 LSB; never a speck.
      expect(r.maxChangeAtEnds).toBeLessThanOrEqual(1);
      if (d !== d3) expect(r.changedAtEnds).toBe(0);
    }
    const r = await engineHarness(page, 'grainStats', withLook(gray(0), noWarp, { amount: 1, size: 0 }), 800, 450);
    expect(r.ends).toBe(800 * 450 * 3);
    expect(r.changedAtEnds).toBe(0);
  });
});

test('warp render time at 5120×2880 (mesh, 16 points, grain on)', async ({ page }) => {
  test.skip(!bench, 'timing only: set BENCH=1');
  const lines: string[] = [];
  for (const shape of WARP_SHAPES) {
    const ms = await engineHarness(page, 'timeRender', withLook(mesh16, warp(shape), defaultGrain), 5120, 2880, 3);
    lines.push(`${shape} ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThan(0);
  }
  logBench(`warp timings 5120×2880: ${lines.join(', ')}`);
});
