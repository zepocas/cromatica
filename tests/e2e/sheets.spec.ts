/// <reference types="node" />
// Visual sheets for tuning by eye, not tests: they only run with SHEETS=1
// and write PNGs to $SHEETS_DIR (default /tmp).
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Oklch } from '../../src/color/types';
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

test.describe('planes contact sheets', () => {
  // Earthy, muted, vivid and dark palettes.
  const palettes: [string, Oklch[]][] = [
    [
      'earthy',
      [
        [0.42, 0.07, 45],
        [0.68, 0.09, 70],
        [0.85, 0.04, 90],
        [0.35, 0.04, 150],
        [0.58, 0.11, 35],
      ],
    ],
    [
      'muted',
      [
        [0.75, 0.03, 230],
        [0.55, 0.05, 250],
        [0.88, 0.02, 80],
        [0.3, 0.03, 260],
      ],
    ],
    [
      'vivid',
      [
        [0.63, 0.22, 30],
        [0.86, 0.17, 95],
        [0.5, 0.2, 265],
        [0.95, 0.02, 90],
      ],
    ],
    [
      'dark',
      [
        [0.2, 0.02, 250],
        [0.3, 0.05, 30],
        [0.45, 0.06, 60],
        [0.85, 0.03, 85],
      ],
    ],
  ];
  const planes = (colors: Oklch[], count: number, roughness: number, seed: number, blend = 0): Design => ({
    ...meshDefault,
    grain: defaultGrain,
    base: { kind: 'planes', colors, count, roughness, blend, seed },
  });
  const sheets: [string, string[], (colors: Oklch[], i: number, row: number) => Design][] = [
    ['planes-count.png', ['count 0', 'count 0.4', 'count 1'], (c, i, r) => planes(c, [0, 0.4, 1][i], 0.5, r + 1)],
    [
      'planes-blend.png',
      ['blend 0.3', 'blend 0.6', 'blend 1'],
      (c, i, r) => planes(c, 0.4, 0.5, r + 1, [0.3, 0.6, 1][i]),
    ],
    ['planes-torn.png', ['torn 0', 'torn 0.5', 'torn 1'], (c, i, r) => planes(c, 0.4, [0, 0.5, 1][i], r + 11)],
  ];
  for (const [file, columns, make] of sheets) {
    test(file, async ({ page }) => {
      await openEngineHarness(page);
      const rows = palettes.map(([label, colors], r) => ({
        label,
        designs: columns.map((_, i) => make(colors, i, r)),
      }));
      const png = await engineHarness(page, 'contactSheet', rows, columns, 640, 360);
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
