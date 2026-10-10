// Renderer: linear gradients — tiling, CPU reference, dither, aspect.
import { expect, test } from '@playwright/test';
import { type Design, noFinish, type RampGradient } from '../../src/design/design';
import { linear, meshDefault, threeStops, midTones, type StopSpec } from './support/designs';
import { engineHarness, openEngineHarness, logBench } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

test.describe('tile independence', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    for (const angle of [30, 135]) {
      test(`1531×917 single pass equals 256 px tiles (angle ${angle}, ${label})`, async ({ page }) => {
        const r = await engineHarness(page, 'compareTiled', threeStops(angle), 1531, 917, 256, dither);
        expect(r.first).toBeNull();
        expect(r.identical).toBe(true);
        expect(r.tiles).toBe(24);
      });
    }

    test(`5120×2880 single pass equals 2048 px tiles (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'compareTiled', threeStops(17), 5120, 2880, 2048, dither);
      logBench(
        `5120×2880 ${label}: ${r.tiles} tiles, single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`,
      );
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(6);
    });

    test(`worker OffscreenCanvas tiles equal main-thread single pass (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'compareWorker', threeStops(250), 1531, 917, 300, dither);
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
        const r = await engineHarness(page, 'compareReference', threeStops(angle), w, h);
        logBench(`reference angle ${angle} ${w}×${h}: max ${r.maxDiff} (f16 model ${r.maxDiffHalf})`);
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('hard edge, clamped ends and max stops', async ({ page }) => {
    const d = linear(
      63,
      Array.from({ length: 8 }, (_, i): StopSpec => [
        // Stops start at 0.1 and end at 0.9 so both clamped ends are exercised;
        // stops 3 and 4 share a position (hard edge).
        [0.1, 0.2, 0.3, 0.45, 0.45, 0.6, 0.8, 0.9][i],
        [0.25 + i * 0.09, 0.04 + (i % 3) * 0.05, (i * 47) % 360],
      ]),
    );
    const r = await engineHarness(page, 'compareReference', d, 801, 503);
    logBench(`reference 8 stops: max ${r.maxDiff} (f16 model ${r.maxDiffHalf})`);
    expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
  });
});

test('cached ramp follows stop changes', async ({ page }) => {
  const r = await engineHarness(page, 'rampCache', threeStops(10), midTones, 320, 200);
  expect(r).toEqual([true, true, true, true]);
});

test.describe('dither', () => {
  test('stays within ±2 of dither off and is unbiased', async ({ page }) => {
    const r = await engineHarness(page, 'ditherStats', midTones, 1600, 1000);
    logBench(`dither: ${JSON.stringify(r)}`);
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
    const r = await engineHarness(page, 'banding', dark, 3840, 256, 16);
    logBench(`banding: ${JSON.stringify(r)}`);
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
      const r = await engineHarness(page, 'edgeColumns', twoStops, w, h);
      expect(r.left).toBeLessThanOrEqual(1);
      expect(r.right).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('radial and conic gradients', () => {
  for (const kind of ['radial', 'conic'] as const) {
    const design = (angle: number): Design => {
      const d = threeStops(angle);
      return { ...d, base: { ...(d.base as RampGradient), kind } };
    };
    test(`${kind}: matches the CPU reference`, async ({ page }) => {
      for (const [w, h] of [
        [640, 360],
        [480, 777],
      ]) {
        const r = await engineHarness(page, 'compareReference', design(40), w, h);
        expect(r.maxDiff, `${w}×${h} ${JSON.stringify(r.worst)}`).toBeLessThanOrEqual(1);
      }
    });

    test(`${kind}: single pass equals 256 px tiles`, async ({ page }) => {
      const r = await engineHarness(page, 'compareTiled', design(110), 1531, 917, 256, true);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }
});

test.describe('finish: vignette and bands', () => {
  const withFinish = (d: Design, vignette: number, bands: number, bandEdge = 0, print = 0): Design => ({
    ...d,
    finish: { ...noFinish, vignette, bands, bandEdge, noise: { type: 'lithograph', amount: print } },
  });

  test('vignette matches the CPU reference on linear and mesh', async ({ page }) => {
    for (const d of [threeStops(30), meshDefault]) {
      const r = await engineHarness(page, 'compareReference', withFinish(d, 0.8, 0), 640, 360);
      expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
    }
  });

  test('bands, crisp and soft, match the CPU reference on linear and mesh', async ({ page }) => {
    for (const d of [threeStops(30), meshDefault]) {
      for (const edge of [0, 0.5]) {
        const r = await engineHarness(page, 'compareReference', withFinish(d, 0, 0.6, edge), 640, 360);
        expect(r.maxDiff, `edge ${edge} ${JSON.stringify(r.worst)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('single pass equals 256 px tiles with both on', async ({ page }) => {
    for (const d of [threeStops(75), meshDefault]) {
      const r = await engineHarness(page, 'compareTiled', withFinish(d, 0.7, 0.5, 0.3, 0.8), 1531, 917, 256, true);
      expect(r.identical).toBe(true);
    }
  });

  test('zero is bit-identical to no finish', async ({ page }) => {
    for (const d of [threeStops(30), meshDefault]) {
      const r = await engineHarness(page, 'compareDesigns', d, withFinish(d, 0, 0, 0.5, 0), 480, 270);
      expect(r.identical).toBe(true);
    }
  });

  test('print texture changes the image', async ({ page }) => {
    const d = threeStops(30);
    const r = await engineHarness(page, 'compareDesigns', d, withFinish(d, 0, 0, 0, 0.6), 480, 270);
    expect(r.identical).toBe(false);
  });
});

test.describe('noise and cells', () => {
  const field = (kind: 'noise' | 'cells', scale: number, seed = 9): Design => {
    const d = threeStops(0);
    return { ...d, base: { ...(d.base as RampGradient), kind, scale, seed } };
  };
  test('ridged noise matches the CPU reference', async ({ page }) => {
    const d = field('noise', 0.4);
    const r = await engineHarness(
      page,
      'compareReference',
      { ...d, base: { ...(d.base as RampGradient), noiseStyle: 'ridged' } },
      640,
      360,
    );
    expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
  });

  for (const kind of ['noise', 'cells'] as const) {
    for (const scale of [0.1, 0.7]) {
      test(`${kind} scale ${scale} matches the CPU reference and tiles`, async ({ page }) => {
        const d = field(kind, scale);
        const r = await engineHarness(page, 'compareReference', d, 640, 360);
        logBench(`${kind} ${scale} reference: max ${r.maxDiff}`);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
        const t = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, true);
        expect(t.identical).toBe(true);
      });
    }
  }
});
