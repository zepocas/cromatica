// Renderer: the grid mesh — CPU reference and tiling.
import { expect, test } from '@playwright/test';
import { gridColors, gridDesign } from './support/designs';
import { engineHarness, logBench, openEngineHarness } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

const cases: [string, number, number, number][] = [
  ['2×2 rest', 2, 2, 0],
  ['3×3 bent', 3, 3, 1],
  ['5×4 bent', 4, 5, 1],
];

for (const [name, rows, cols, bend] of cases) {
  test(`grid ${name}: CPU reference and tiles`, async ({ page }) => {
    const d = gridDesign(rows, cols, bend, gridColors);
    for (const [w, h] of [
      [640, 360],
      [479, 777],
    ]) {
      const r = await engineHarness(page, 'compareReference', d, w, h);
      logBench(`grid ${name} ${w}×${h}: max ${r.maxDiff}`);
      expect(r.alphaOk).toBe(true);
      expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
    }
    const t = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, true);
    expect(t.identical).toBe(true);
  });
}

test('a folded grid still renders the same in tiles, with no NaN specks', async ({ page }) => {
  // Folds are prevented in the editor; here the pull-back has no single answer, so only
  // tile independence and finite output are required, not a match with the CPU.
  const d = gridDesign(4, 5, 2.5, gridColors);
  for (const dither of [true, false]) {
    const t = await engineHarness(page, 'compareTiled', d, 1531, 917, 256, dither);
    expect(t.identical).toBe(true);
  }
  const r = await engineHarness(page, 'imageStats', d, 800, 450, false);
  expect(r.alphaOk).toBe(true);
});
