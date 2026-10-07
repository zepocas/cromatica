// Renderer: relief (M8, D46) — off is exact, tiling, and the CPU reference.
import { expect, test } from '@playwright/test';
import { type Design, noFinish, type ReliefStyle } from '../../src/design/design';
import { mesh16, planesDesign, threeStops, warp, withLook } from './support/designs';
import { bench, engineHarness, openEngineHarness, logBench } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

const withRelief = (d: Design, relief: number, reliefStyle: ReliefStyle, reliefLight = 135, bands = 0): Design => ({
  ...d,
  finish: { ...noFinish, relief, reliefStyle, reliefLight, bands, bandEdge: 0.6 },
});

const STYLES: ReliefStyle[] = ['satin', 'glass'];

test('relief 0 is bit-identical to no relief, whatever the surface and light', async ({ page }) => {
  for (const d of [threeStops(30), mesh16, planesDesign(0.5, 0.5)]) {
    const plain = { ...d, finish: { ...noFinish } };
    const r = await engineHarness(page, 'compareDesigns', plain, withRelief(d, 0, 'glass', 300), 640, 360);
    expect(r.identical).toBe(true);
  }
});

test('relief changes the image', async ({ page }) => {
  for (const style of STYLES) {
    const r = await engineHarness(page, 'compareDesigns', mesh16, withRelief(mesh16, 1, style), 320, 180);
    expect(r.identical).toBe(false);
  }
});

test.describe('relief tile independence', () => {
  for (const style of STYLES) {
    test(`${style}: 1531×917 single pass equals 256 px tiles`, async ({ page }) => {
      const d = withRelief(withLook(threeStops(30), warp('domain', 0.4, 0.4)), 0.8, style, 135, 0.5);
      const r = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, true);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });

    test(`${style}: worker tiles equal main-thread single pass`, async ({ page }) => {
      const d = withRelief(planesDesign(0.5, 0.7), 0.7, style, 40);
      const r = await engineHarness(page, 'compareWorker', d, 1001, 777, 300, true);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }
});

test.describe('relief vs CPU reference (dither off)', () => {
  for (const style of STYLES) {
    test(`${style}: smooth mesh`, async ({ page }) => {
      const r = await engineHarness(page, 'compareReference', withRelief(mesh16, 1, style, 60), 640, 360);
      logBench(`relief ${style} mesh: max ${r.maxDiff}, >1: ${r.over}`);
      expect(r.alphaOk).toBe(true);
      expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(2);
    });

    test(`${style}: banded ramp`, async ({ page }) => {
      const r = await engineHarness(
        page,
        'compareReference',
        withRelief(threeStops(30), 0.8, style, 135, 0.5),
        640,
        360,
      );
      logBench(`relief ${style} bands: max ${r.maxDiff}, max (half-float ramp) ${r.maxDiffHalf}, >1: ${r.over}`);
      expect(r.maxDiffHalf ?? r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(2);
    });

    test(`${style}: planes`, async ({ page }) => {
      const r = await engineHarness(page, 'compareReference', withRelief(planesDesign(0.4, 0), 0.8, style), 640, 360);
      logBench(`relief ${style} planes: max ${r.maxDiff}, >1: ${r.over}`);
      // Hard plane edges: fp32 neighbour reads can land on the other side of an edge in a few pixels.
      expect(r.over).toBeLessThan(0.002 * 640 * 360);
    });
  }
});

test('relief render time at 1920×1080 (timing only)', async ({ page }) => {
  test.skip(!bench, 'timing only: set BENCH=1');
  const lines: string[] = [];
  for (const [label, d] of [
    ['mesh16', mesh16],
    ['mesh16 · marble', withLook(mesh16, warp('marble', 0.5, 0.4))],
  ] as const) {
    for (const [name, relief, style] of [
      ['off', 0, 'satin'],
      ['satin', 0.7, 'satin'],
      ['glass', 0.7, 'glass'],
    ] as const) {
      const ms = await engineHarness(page, 'timeRender', withRelief(d, relief, style), 1920, 1080, 3);
      lines.push(`${label} ${name} ${ms.toFixed(0)} ms`);
    }
  }
  logBench(`relief timings 1920×1080 (SwiftShader): ${lines.join(', ')}`);
});
