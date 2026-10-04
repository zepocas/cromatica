/// <reference types="node" />
// Visual sheets for tuning by eye, not tests: they only run with SHEETS=1
// and write PNGs to $SHEETS_DIR (default /tmp).
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultGrain, type Design, type Warp, WARP_SHAPES, type WarpShape } from '../../src/design/design';
import { previewProbe } from './support/app';
import { meshDefault, warp, withLook } from './support/designs';
import { engineHarness, openEngineHarness } from './support/harness';

const DIR = process.env.SHEETS_DIR ?? '/tmp';

test.skip(!process.env.SHEETS, 'visual sheets: set SHEETS=1');

test.describe('warp contact sheets', () => {
  const sheetBase: Design = { ...meshDefault, grain: defaultGrain };
  const sheets: [string, string[], (shape: WarpShape, i: number) => Warp][] = [
    ['warps-amount.png', ['amount 0.2', 'amount 0.5', 'amount 0.8'], (s, i) => warp(s, [0.2, 0.5, 0.8][i], 0.35, 1)],
    ['warps-size.png', ['size 0.1', 'size 0.5', 'size 0.9'], (s, i) => warp(s, 0.4, [0.1, 0.5, 0.9][i], 1)],
  ];
  for (const [file, columns, make] of sheets) {
    test(file, async ({ page }) => {
      await openEngineHarness(page);
      const rows = WARP_SHAPES.map((shape) => ({
        label: shape,
        designs: columns.map((_, i) => withLook(sheetBase, make(shape, i), defaultGrain)),
      }));
      const png = await engineHarness(page, 'contactSheet', rows, columns, 480, 270);
      writeFileSync(join(DIR, file), Buffer.from(png, 'base64'));
    });
  }
});

test('six shuffles in a row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const { settled } = previewProbe(page);
  await settled();
  await page.screenshot({ path: join(DIR, 'panel.png') });
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await page.keyboard.press('h');
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
    await settled();
    await page.screenshot({ path: join(DIR, `shuffle-${i}.png`) });
  }
});
