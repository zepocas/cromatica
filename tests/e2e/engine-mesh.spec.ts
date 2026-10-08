// Renderer: the color-point mesh — tiling, CPU reference, gamut clip, robustness.
import { expect, test } from '@playwright/test';
import { BAND_STYLES, type Design, defaultMesh, noFinish } from '../../src/design/design';
import { threeStops, meshDefault, mesh16, primaries, farAway, extreme } from './support/designs';
import { engineHarness, openEngineHarness, logBench, bench } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

test.describe('mesh tile independence', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    test(`1531×917 single pass equals 256 px tiles (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'compareTiled', mesh16, 1531, 917, 256, dither);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(24);
    });

    test(`5120×2880 single pass equals 2048 px tiles (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'compareTiled', mesh16, 5120, 2880, 2048, dither);
      logBench(
        `mesh 5120×2880 ${label}: ${r.tiles} tiles, single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`,
      );
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(6);
    });

    test(`worker tiles equal main-thread single pass (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'compareWorker', primaries, 1001, 777, 300, dither);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }
});

test.describe('mesh vs CPU reference (dither off)', () => {
  const cases: [string, Design][] = [
    ['default', meshDefault],
    ['default haze', { ...meshDefault, base: { ...defaultMesh, sharpness: 0 } }],
    ['default blobby', { ...meshDefault, base: { ...defaultMesh, sharpness: 1 } }],
    ['16 points', mesh16],
    ['primaries', primaries],
    ['far away', farAway(0.5)],
    ['extreme', extreme],
  ];
  for (const [name, d] of cases) {
    for (const [w, h] of [
      [640, 360],
      [479, 777],
    ]) {
      test(`${name}, ${w}×${h}`, async ({ page }) => {
        const r = await engineHarness(page, 'compareReference', d, w, h);
        logBench(`mesh reference ${name} ${w}×${h}: max ${r.maxDiff}`);
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }

  for (const [name, d] of [
    ['primaries', primaries],
    ['16 points', mesh16],
  ] as const) {
    test(`gamut clip stays within ΔE_OK 0.02 of CSS gamut mapping (${name})`, async ({ page }) => {
      const r = await engineHarness(page, 'meshGamutVsCss', d, 480, 270);
      logBench(`mesh gamut ${name}: ${JSON.stringify(r)}`);
      expect(r.outOfGamut).toBeGreaterThan(0);
      expect(r.clip).toBeLessThanOrEqual(0.02);
      expect(r.gpu).toBeLessThanOrEqual(0.02);
    });
  }
});

test.describe('mesh band styles vs CPU reference (dither off)', () => {
  for (const style of BAND_STYLES) {
    for (const [name, d] of [
      ['default', meshDefault],
      ['16 points', mesh16],
    ] as const) {
      test(`${style}, ${name}`, async ({ page }) => {
        const banded: Design = { ...d, finish: { ...noFinish, bands: 0.5, bandEdge: 0.6, bandStyle: style } };
        const r = await engineHarness(page, 'compareReference', banded, 640, 360);
        logBench(`mesh bands ${style} ${name}: max ${r.maxDiff}`);
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }
});

test.describe('mesh robustness', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    for (const s of [0, 1]) {
      test(`points far outside the frame give a smooth image (sharpness ${s}, ${label})`, async ({ page }) => {
        const r = await engineHarness(page, 'imageStats', farAway(s), 1600, 900, dither);
        logBench(`mesh far away s=${s} ${label}: ${JSON.stringify(r)}`);
        expect(r.alphaOk).toBe(true);
        expect(r.black).toBe(0);
        expect(r.min).toBeGreaterThan(10);
        expect(r.maxStep).toBeLessThanOrEqual(dither ? 3 : 1);
      });
    }

    test(`degenerate radii and positions produce no NaN specks (${label})`, async ({ page }) => {
      const r = await engineHarness(page, 'imageStats', extreme, 1600, 900, dither);
      logBench(`mesh extreme ${label}: ${JSON.stringify(r)}`);
      expect(r.alphaOk).toBe(true);
      expect(r.black).toBe(0);
      expect(r.min).toBeGreaterThan(10);
      expect(r.max).toBeLessThanOrEqual(255);
    });
  }
});

test('mesh render time, 16 points', async ({ page }) => {
  test.skip(!bench, 'timing only: set BENCH=1');
  for (const [w, h] of [
    [3456, 2234],
    [5120, 2880],
  ]) {
    const ms = await engineHarness(page, 'timeRender', mesh16, w, h, 3);
    const linearMs = await engineHarness(page, 'timeRender', threeStops(30), w, h, 3);
    logBench(`mesh 16 points ${w}×${h}: ${ms.toFixed(0)} ms (linear ${linearMs.toFixed(0)} ms)`);
    expect(ms).toBeGreaterThan(0);
  }
});
