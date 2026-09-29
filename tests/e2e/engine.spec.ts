import { expect, test, type Page } from '@playwright/test';
import type { Design, Rgb } from '../../src/design/design';
import type { EngineHarness } from './harness/engine';

declare global {
  interface Window {
    engineHarness: EngineHarness;
  }
}

function linear(angle: number, stops: [number, Rgb][]): Design {
  return {
    engineVersion: 0,
    base: { kind: 'linear', angle, stops: stops.map(([position, color]) => ({ position, color })) },
  };
}

const threeStops = (angle: number) =>
  linear(angle, [
    [0, [0.09, 0.05, 0.3]],
    [0.4, [0.85, 0.2, 0.55]],
    [1, [1, 0.75, 0.35]],
  ]);

async function openHarness(page: Page) {
  await page.goto('/tests/e2e/harness/engine.html');
  await page.waitForFunction(() => window.engineHarness !== undefined);
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test.describe('tile independence', () => {
  for (const angle of [30, 135]) {
    test(`1531×917 single pass equals 256 px tiles (angle ${angle})`, async ({ page }) => {
      const r = await page.evaluate(
        ([d]) => window.engineHarness.compareTiled(d, 1531, 917, 256),
        [threeStops(angle)] as const,
      );
      console.log(`1531×917 @${angle}°: ${r.tiles} tiles, single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(24);
    });
  }

  test('5120×2880 single pass equals 2048 px tiles', async ({ page }) => {
    const r = await page.evaluate(
      ([d]) => window.engineHarness.compareTiled(d, 5120, 2880, 2048),
      [threeStops(17)] as const,
    );
    console.log(`5120×2880: ${r.tiles} tiles, single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`);
    expect(r.first).toBeNull();
    expect(r.identical).toBe(true);
    expect(r.tiles).toBe(6);
  });

  test('worker OffscreenCanvas tiles equal main-thread single pass', async ({ page }) => {
    const r = await page.evaluate(
      ([d]) => window.engineHarness.compareWorker(d, 1531, 917, 300),
      [threeStops(250)] as const,
    );
    expect(r.first).toBeNull();
    expect(r.identical).toBe(true);
  });
});

test.describe('correctness vs CPU reference', () => {
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
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('hard edge, clamped ends and max stops', async ({ page }) => {
    const d = linear(
      63,
      Array.from({ length: 8 }, (_, i): [number, Rgb] => [
        // Stops start at 0.1 and end at 0.9 so both clamped ends are exercised;
        // stops 3 and 4 share a position (hard edge).
        [0.1, 0.2, 0.3, 0.45, 0.45, 0.6, 0.8, 0.9][i],
        [(i * 37) % 256 / 255, (i * 91) % 256 / 255, 1 - i / 7],
      ]),
    );
    const r = await page.evaluate(
      ([d]) => window.engineHarness.compareReference(d, 801, 503),
      [d] as const,
    );
    expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
  });
});

test.describe('aspect behavior', () => {
  const twoStops = linear(0, [
    [0, [1, 0, 0]],
    [1, [0, 0, 1]],
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
