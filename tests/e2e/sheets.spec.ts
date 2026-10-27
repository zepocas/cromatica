/// <reference types="node" />
// Visual sheets for tuning by eye, not tests: they only run with SHEETS=1
// and write PNGs to $SHEETS_DIR (default /tmp).
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Oklch } from '../../src/color/types';
import {
  AURORA_BLEND,
  type Design,
  noFinish,
  type Noise,
  type RampGradient,
  type ReliefStyle,
  type Warp,
  WARP_SHAPES,
  type WarpShape,
} from '../../src/design/design';
import { mutateDesign } from '../../src/design/mutate';
import { createRng } from '../../src/design/random';
import { LEGACY_AURORA_BLEND } from '../../src/design/schema';
import {
  isSurpriseSeed,
  KIND_PROFILE,
  shuffleDesign,
  STYLE_SHUFFLE,
  WARP_SHUFFLE_TABLE,
} from '../../src/design/shuffle';
import { previewProbe } from './support/app';
import {
  defaultNoise,
  gridColors,
  gridDesign,
  linear,
  meshDefault,
  midTones,
  planesDesign,
  threeStops,
  warp,
  withLook,
  withNoise,
} from './support/designs';

const midTonesFive = linear(0, [
  [0, [0.3, 0.06, 250]],
  [0.25, [0.5, 0.09, 200]],
  [0.5, [0.75, 0.08, 150]],
  [0.75, [0.88, 0.07, 90]],
  [1, [0.62, 0.14, 40]],
]);
import { engineHarness, openEngineHarness } from './support/harness';

const DIR = process.env.SHEETS_DIR ?? '/tmp';
// Tile width of the numbered shuffle sheets; the scorer slideshow wants them large.
const cellW = Number(process.env.SHEET_CELL_W ?? 480);

test.skip(!process.env.SHEETS, 'visual sheets: set SHEETS=1');

test.describe('warp contact sheets', () => {
  const sheetBase: Design = withNoise(meshDefault, defaultNoise);
  const sheets: [string, string[], (shape: WarpShape, i: number) => Warp][] = [
    ['warps-amount.png', ['amount 0.2', 'amount 0.5', 'amount 0.8'], (s, i) => warp(s, [0.2, 0.5, 0.8][i], 0.35, 1)],
    ['warps-size.png', ['size 0.1', 'size 0.5', 'size 0.9'], (s, i) => warp(s, 0.4, [0.1, 0.5, 0.9][i], 1)],
  ];
  for (const [file, columns, make] of sheets) {
    test(file, async ({ page }) => {
      await openEngineHarness(page);
      const rows = WARP_SHAPES.map((shape) => ({
        label: shape,
        designs: columns.map((_, i) => withLook(sheetBase, make(shape, i), defaultNoise)),
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

test('noise-cells.png', async ({ page }) => {
  await openEngineHarness(page);
  const cols = ['scale 0.1', 'scale 0.35', 'scale 0.7'];
  const field = (kind: 'noise' | 'cells', stops: Design, scale: number, seed: number): Design => ({
    ...stops,
    base: { ...(stops.base as RampGradient), kind, scale, seed },
  });
  const ridged = (d: Design): Design => ({ ...d, base: { ...(d.base as RampGradient), noiseStyle: 'ridged' } });
  const rows = [
    { label: 'contour', designs: [0.1, 0.35, 0.7].map((s) => field('noise', threeStops(0), s, 4)) },
    { label: 'ridged', designs: [0.1, 0.35, 0.7].map((s) => ridged(field('noise', midTonesFive, s, 8))) },
    { label: 'cells', designs: [0.1, 0.35, 0.7].map((s) => field('cells', threeStops(0), s, 4)) },
    { label: 'cells 2', designs: [0.1, 0.35, 0.7].map((s) => field('cells', midTonesFive, s, 8)) },
  ];
  const png = await engineHarness(page, 'contactSheet', rows, cols, 640, 360);
  writeFileSync(join(DIR, 'noise-cells.png'), Buffer.from(png, 'base64'));
});

test('aurora.png', async ({ page }) => {
  await openEngineHarness(page);
  const cols = ['glow 0.2', 'glow 0.5', 'glow 0.9'];
  const palettes: [string, Oklch[]][] = [
    [
      'night',
      [
        [0.15, 0.03, 260],
        [0.8, 0.17, 150],
        [0.65, 0.15, 190],
        [0.6, 0.2, 320],
      ],
    ],
    [
      'warm',
      [
        [0.2, 0.04, 30],
        [0.75, 0.15, 60],
        [0.65, 0.2, 20],
        [0.9, 0.1, 95],
      ],
    ],
    [
      'pastel',
      [
        [0.35, 0.05, 280],
        [0.85, 0.08, 200],
        [0.88, 0.07, 340],
        [0.92, 0.06, 100],
      ],
    ],
  ];
  const rows = palettes.map(([label, colors], r) => ({
    label,
    designs: [0.2, 0.5, 0.9].map((glow): Design => ({
      ...meshDefault,
      base: { kind: 'aurora', colors, count: 0.5, glow, blend: AURORA_BLEND, seed: r + 3 },
    })),
  }));
  const png = await engineHarness(page, 'contactSheet', rows, cols, 640, 360);
  writeFileSync(join(DIR, 'aurora.png'), Buffer.from(png, 'base64'));

  // Blend: 0.6 is the look before the slider, AURORA_BLEND the new default.
  const blends = [0, AURORA_BLEND, LEGACY_AURORA_BLEND, 1];
  const blendRows = palettes.map(([label, colors], r) => ({
    label,
    designs: blends.map((blend): Design => ({
      ...meshDefault,
      base: { kind: 'aurora', colors, count: 0.5, glow: 0.5, blend, seed: r + 3 },
    })),
  }));
  const blendCols = blends.map(
    (b) => `blend ${b}${b === LEGACY_AURORA_BLEND ? ' (before)' : b === AURORA_BLEND ? ' (new default)' : ''}`,
  );
  const blendPng = await engineHarness(page, 'contactSheet', blendRows, blendCols, 640, 360);
  writeFileSync(join(DIR, 'aurora-blend.png'), Buffer.from(blendPng, 'base64'));
});

test('grid.png', async ({ page }) => {
  await openEngineHarness(page);
  const cols = ['bend 0', 'bend 1', 'bend 2.5'];
  const rows = (
    [
      ['3×3', 3, 3],
      ['4×5', 4, 5],
    ] as const
  ).map(([label, r, c]) => ({
    label,
    designs: [0, 1, 2.5].map((bend) => withNoise(gridDesign(r, c, bend, gridColors), defaultNoise)),
  }));
  const png = await engineHarness(page, 'contactSheet', rows, cols, 640, 360);
  writeFileSync(join(DIR, 'grid.png'), Buffer.from(png, 'base64'));
});

test('six shuffles in a row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('cromatica.tips', 'dismissed'));
  await page.goto('/');
  const { settled } = previewProbe(page);
  await settled();
  await page.screenshot({ path: join(DIR, 'panel.png') });
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await page.keyboard.press('n');
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
    await settled();
    await page.screenshot({ path: join(DIR, `shuffle-${i}.png`) });
  }
});

test('print.png', async ({ page }) => {
  await openEngineHarness(page);
  const looksOfNoise: Noise[] = [
    { type: 'lithograph', amount: 0.3 },
    { type: 'lithograph', amount: 0.7 },
    { type: 'lithograph', amount: 1 },
    { type: 'xerox', amount: 0.5 },
    { type: 'xerox', amount: 1 },
  ];
  const cols = looksOfNoise.map((n) => `${n.type} ${n.amount}`);
  const looks: [string, Design][] = [
    ['planes', planesDesign(0.4, 0.5)],
    ['mesh', meshDefault],
    ['mid tones', midTones],
  ];
  const rows = looks.map(([label, d]) => ({ label, designs: looksOfNoise.map((noise) => withNoise(d, noise)) }));
  const png = await engineHarness(page, 'contactSheet', rows, cols, 800, 450);
  writeFileSync(join(DIR, process.env.PRINT_SHEET ?? 'print.png'), Buffer.from(png, 'base64'));
});

test('brushed.png', async ({ page }) => {
  await openEngineHarness(page);
  const sizes = [0, 0.5, 1];
  const cols = sizes.map((s) => `size ${s}`);
  const looks: [string, Design][] = [
    ['mesh', meshDefault],
    ['planes', planesDesign(0.4, 0.5)],
    ['mid tones', midTones],
  ];
  const rows = looks.map(([label, d]) => ({
    label,
    designs: sizes.map((size) => withLook(d, warp('bristle', 0.5, size, 3), defaultNoise)),
  }));
  const png = await engineHarness(page, 'contactSheet', rows, cols, 800, 450);
  writeFileSync(join(DIR, process.env.BRUSHED_SHEET ?? 'brushed.png'), Buffer.from(png, 'base64'));
});

test('variations.png', async ({ page }) => {
  await openEngineHarness(page);
  // As the more-like-this grid: gentle → bold, after the original.
  const strengths = [0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1];
  const cols = ['original', ...strengths.map((s) => `${s}`)];
  const rows = [];
  let d: Design = withNoise(meshDefault, defaultNoise);
  for (let seed = 11; rows.length < 6; seed++) {
    d = shuffleDesign(d, { colors: true, layout: true, style: true, seed }).design;
    const base = d;
    rows.push({
      label: `${base.base.kind} · ${base.warp.shape}`,
      designs: [base, ...strengths.map((s, i) => mutateDesign(base, createRng(seed * 31 + i), s))],
    });
  }
  const png = await engineHarness(page, 'contactSheet', rows, cols, 320, 180);
  writeFileSync(join(DIR, 'variations.png'), Buffer.from(png, 'base64'));
});

// Shuffle tuning (M16, D76): numbered sheets of real shuffles from the app's own tables, plus a JSON sidecar
// with what each one drew, to score by eye and count. SHUFFLE_SHEET_SEED shifts the seeds between rounds.
test('shuffle-sheets', async ({ page }) => {
  await openEngineHarness(page);
  const first = Number(process.env.SHUFFLE_SHEET_SEED ?? 1000);
  const perSheet = 30;
  const cols = 5;
  const meta: Record<string, unknown>[] = [];
  const kindOnly = process.env.SHUFFLE_SHEET_KIND;
  const shuffleOne = (seed: number) =>
    shuffleDesign(
      withNoise(meshDefault, defaultNoise),
      { colors: true, palette: { mood: 'any', key: 'any' }, layout: true, style: true, seed },
      16 / 9,
    );
  for (let sheet = 0; sheet < 2; sheet++) {
    const rows = [];
    for (let r = 0; r < perSheet / cols; r++) {
      const designs: Design[] = [];
      for (let c = 0; c < cols; c++) {
        const n = sheet * perSheet + r * cols + c + 1;
        // SHUFFLE_SHEET_KIND=planes (or mesh, ...) shows only shuffles that drew that kind, to judge one kind on its own.
        let seed = first + n;
        let drawn = shuffleOne(seed);
        while (kindOnly && drawn.design.base.kind !== kindOnly) drawn = shuffleOne((seed += 1000));
        const { design, palette } = drawn;
        designs.push(design);
        meta.push({
          n,
          seed,
          kind: design.base.kind,
          warp: design.warp.shape,
          palette,
          warpAmount: design.warp.amount,
          warpSize: design.warp.size,
          scale: (design.base as { scale?: number }).scale ?? null,
          surprise: isSurpriseSeed(seed),
          bands: design.finish?.bands ?? 0,
          noise: design.finish?.noise.type,
          noiseAmount: design.finish?.noise.amount ?? 0,
          relief: design.finish?.relief ?? 0,
          vignette: design.finish?.vignette ?? 0,
        });
      }
      const n0 = sheet * perSheet + r * cols + 1;
      rows.push({ label: `#${n0}-${n0 + cols - 1}`, designs });
    }
    const png = await engineHarness(
      page,
      'contactSheet',
      rows,
      ['+0', '+1', '+2', '+3', '+4'],
      cellW,
      Math.round((cellW * 9) / 16),
    );
    writeFileSync(join(DIR, `shuffle-sheet-${sheet + 1}.png`), Buffer.from(png, 'base64'));
  }
  writeFileSync(join(DIR, 'shuffle-sheet.json'), JSON.stringify(meta, null, 1));
});

// Stratified per-kind tuning: 60 shuffles of one kind (SHEET_KIND), where each warp family is shown equally often
// and the finishes are switched on and off in balance, so every effect can be scored on its own. The sheets and
// the JSON sidecar keep the names and layout of shuffle-sheets, so the same scorer reads them.
const WARP_FAMILIES: Record<string, WarpShape[]> = {
  smooth: ['domain', 'fbm', 'simplex', 'curl', 'waves'],
  directional: ['rows', 'columns', 'circular', 'oval', 'bristle'],
  cellular: ['worley', 'voronoi'],
  'hard-cut': ['ridged', 'marble'],
};
test('kind-sheets', async ({ page }) => {
  const kind = process.env.SHEET_KIND;
  test.skip(!kind, 'kind-sheets: set SHEET_KIND (mesh, grid, linear, ...)');
  await openEngineHarness(page);
  const first = Number(process.env.SHUFFLE_SHEET_SEED ?? 2000);
  const perSheet = 30;
  const cols = 5;
  const families = Object.keys(WARP_FAMILIES);
  // Aurora is flat already: no bands, so three finishes (8 combinations) instead of four (16).
  const finishes = ['grain', 'lighting', 'vignette', ...(kind === 'aurora' ? [] : ['bands'])] as const;
  const combos = 1 << finishes.length;
  // Per family, the combinations in a seeded order, each family leaving out another one when 15 don't divide into 16.
  const orders = families.map((_, f) => {
    const rng = createRng(first * 7 + f);
    const order = Array.from({ length: combos }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  });
  const meta: Record<string, unknown>[] = [];
  const s = STYLE_SHUFFLE;
  for (let sheet = 0; sheet < 2; sheet++) {
    const rows = [];
    for (let r = 0; r < perSheet / cols; r++) {
      const designs: Design[] = [];
      for (let c = 0; c < cols; c++) {
        const n = sheet * perSheet + r * cols + c + 1;
        const f = (n - 1) % families.length;
        const k = Math.floor((n - 1) / families.length);
        const family = families[f];
        // Shapes the kind's profile has dropped (weight 0) are not shown, so no tile is spent on a warp it never draws.
        const shapes = WARP_FAMILIES[family].filter((w) => KIND_PROFILE[kind as Design['base']['kind']]?.warp[w] !== 0);
        const shape = shapes[k % shapes.length];
        const combo = orders[f][k % combos];
        const on = (name: (typeof finishes)[number]) => (combo & (1 << finishes.indexOf(name))) !== 0;
        let seed = first + n;
        const draw = (sd: number) =>
          shuffleDesign(
            withNoise(meshDefault, defaultNoise),
            { colors: true, palette: { mood: 'any', key: 'any' }, layout: true, style: true, seed: sd },
            16 / 9,
          );
        let drawn = draw(seed);
        while (drawn.design.base.kind !== kind || isSurpriseSeed(seed)) drawn = draw((seed += 1000));
        const rng = createRng(seed ^ 0x5bd1e995);
        const t = WARP_SHUFFLE_TABLE[shape];
        const amount = (rng.range(...t.amount) * 100) | 0;
        const size = (rng.range(...t.size) * 100) | 0;
        const value = (range: [number, number]) => Math.round(rng.range(...range) * 1e4) / 1e4;
        const finish = {
          ...noFinish,
          vignette: on('vignette') ? value(s.vignette.range) : 0,
          noise: { type: 'lithograph' as const, amount: on('grain') ? value(s.print.range) : 0 },
          bands: finishes.includes('bands' as never) && on('bands' as never) ? value(s.bands.range) : 0,
          relief: on('lighting') ? value(s.relief.range) : 0,
          reliefStyle: rng.next() < 0.5 ? ('satin' as const) : ('glass' as const),
          reliefLight: Math.round(rng.range(...s.relief.light)),
        };
        const design: Design = {
          ...drawn.design,
          warp: { shape, amount: amount / 100, size: size / 100, seed: rng.uint32() },
          finish,
        };
        designs.push(design);
        meta.push({
          n,
          seed,
          kind,
          family,
          warp: shape,
          palette: drawn.palette,
          warpAmount: design.warp.amount,
          warpSize: design.warp.size,
          scale: (design.base as { scale?: number }).scale ?? null,
          surprise: isSurpriseSeed(seed),
          bands: finish.bands,
          noise: finish.noise.type,
          noiseAmount: finish.noise.amount,
          relief: finish.relief,
          vignette: finish.vignette,
        });
      }
      const n0 = sheet * perSheet + r * cols + 1;
      rows.push({ label: `#${n0}-${n0 + cols - 1}`, designs });
    }
    const png = await engineHarness(
      page,
      'contactSheet',
      rows,
      ['+0', '+1', '+2', '+3', '+4'],
      cellW,
      Math.round((cellW * 9) / 16),
    );
    writeFileSync(join(DIR, `shuffle-sheet-${sheet + 1}.png`), Buffer.from(png, 'base64'));
  }
  writeFileSync(join(DIR, 'shuffle-sheet.json'), JSON.stringify(meta, null, 1));
});

// Chosen warps (SHEETS_FORCE_WARP, e.g. rows,columns or circular,voronoi,none) forced on every kind (60 tiles, kinds
// interleaved), at the same three amounts and with no finishes, to find which kinds they are not compatible with.
// Same sheet and sidecar names as kind-sheets.
test('forced-warp-sheets', async ({ page }) => {
  const shapes = (process.env.SHEETS_FORCE_WARP ?? '').split(',').filter(Boolean) as WarpShape[];
  test.skip(!shapes.length, 'forced-warp-sheets: set SHEETS_FORCE_WARP (rows,columns or circular,voronoi,none)');
  await openEngineHarness(page);
  const first = Number(process.env.SHUFFLE_SHEET_SEED ?? 3000);
  const kinds = Object.keys(STYLE_SHUFFLE.kinds) as Design['base']['kind'][];
  const amounts = [0.2, 0.5, 0.85];
  // SHEETS_SIZE_RANGE=0,0.3 draws the warp size from that range instead of the shuffle's own.
  const override = process.env.SHEETS_SIZE_RANGE?.split(',').map(Number);
  const sizeRange = (shape: WarpShape): [number, number] =>
    override?.length === 2 ? [override[0], override[1]] : WARP_SHUFFLE_TABLE[shape].size;
  const perSheet = 30;
  const cols = 5;
  const meta: Record<string, unknown>[] = [];
  for (let sheet = 0; sheet < 2; sheet++) {
    const rows = [];
    for (let r = 0; r < perSheet / cols; r++) {
      const designs: Design[] = [];
      for (let c = 0; c < cols; c++) {
        const n = sheet * perSheet + r * cols + c + 1;
        const kind = kinds[(n - 1) % kinds.length];
        const k = Math.floor((n - 1) / kinds.length);
        const shape = shapes[k % shapes.length];
        // With as many shapes as amounts, a shape would always land on the same amount; SHEETS_ROTATE_AMOUNTS shifts it.
        const turn = process.env.SHEETS_ROTATE_AMOUNTS ? k % shapes.length : 0;
        const amount = shape === 'none' ? 0 : amounts[(Math.floor(k / shapes.length) + turn) % amounts.length];
        let seed = first + n;
        const draw = (sd: number) =>
          shuffleDesign(
            withNoise(meshDefault, defaultNoise),
            { colors: true, palette: { mood: 'any', key: 'any' }, layout: true, style: true, seed: sd },
            16 / 9,
          );
        let drawn = draw(seed);
        while (drawn.design.base.kind !== kind || isSurpriseSeed(seed)) drawn = draw((seed += 1000));
        const rng = createRng(seed ^ 0x5bd1e995);
        const size = Math.round(rng.range(...sizeRange(shape)) * 100) / 100;
        designs.push({ ...drawn.design, warp: { shape, amount, size, seed: rng.uint32() }, finish: noFinish });
        meta.push({ n, seed, kind, family: 'forced', warp: shape, amount, size, palette: drawn.palette });
      }
      const n0 = sheet * perSheet + r * cols + 1;
      rows.push({ label: `#${n0}-${n0 + cols - 1}`, designs });
    }
    const png = await engineHarness(
      page,
      'contactSheet',
      rows,
      ['+0', '+1', '+2', '+3', '+4'],
      cellW,
      Math.round((cellW * 9) / 16),
    );
    writeFileSync(join(DIR, `shuffle-sheet-${sheet + 1}.png`), Buffer.from(png, 'base64'));
  }
  writeFileSync(join(DIR, 'shuffle-sheet.json'), JSON.stringify(meta, null, 1));
});

// Base noise on its own (D83): the noise kind with no warp and no finishes, the two styles crossed with six scale
// bins, five tiles per cell in a seeded order. Scored on form: is the base noise too small, and where?
test('noise-base-sheets', async ({ page }) => {
  await openEngineHarness(page);
  const first = Number(process.env.SHUFFLE_SHEET_SEED ?? 4000);
  const styles = ['contour', 'ridged'] as const;
  const centers = [0.02, 0.1, 0.18, 0.26, 0.34, 0.45];
  const cells = styles.flatMap((style) =>
    centers.flatMap((center) => Array.from({ length: 5 }, () => ({ style, center }))),
  );
  const order = createRng(first * 3 + 1);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = order.int(i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const perSheet = 30;
  const cols = 5;
  const meta: Record<string, unknown>[] = [];
  for (let sheet = 0; sheet < 2; sheet++) {
    const rows = [];
    for (let r = 0; r < perSheet / cols; r++) {
      const designs: Design[] = [];
      for (let c = 0; c < cols; c++) {
        const n = sheet * perSheet + r * cols + c + 1;
        const { style, center } = cells[n - 1];
        let seed = first + n;
        const draw = (sd: number) =>
          shuffleDesign(
            withNoise(meshDefault, defaultNoise),
            { colors: true, palette: { mood: 'any', key: 'any' }, layout: true, style: true, seed: sd },
            16 / 9,
          );
        let drawn = draw(seed);
        while (drawn.design.base.kind !== 'noise' || isSurpriseSeed(seed)) drawn = draw((seed += 1000));
        const rng = createRng(seed ^ 0x5bd1e995);
        const scale = Math.round(Math.max(0, center + rng.range(-0.04, 0.04)) * 1e4) / 1e4;
        designs.push({
          ...drawn.design,
          base: { ...(drawn.design.base as RampGradient), scale, noiseStyle: style },
          warp: { shape: 'none', amount: 0, size: 0.5, seed: rng.uint32() },
          finish: noFinish,
        });
        meta.push({
          n,
          seed,
          kind: 'noise',
          family: 'base',
          warp: 'none',
          style,
          scale,
          bin: center,
          palette: drawn.palette,
        });
      }
      const n0 = sheet * perSheet + r * cols + 1;
      rows.push({ label: `#${n0}-${n0 + cols - 1}`, designs });
    }
    const png = await engineHarness(
      page,
      'contactSheet',
      rows,
      ['+0', '+1', '+2', '+3', '+4'],
      cellW,
      Math.round((cellW * 9) / 16),
    );
    writeFileSync(join(DIR, `shuffle-sheet-${sheet + 1}.png`), Buffer.from(png, 'base64'));
  }
  writeFileSync(join(DIR, 'shuffle-sheet.json'), JSON.stringify(meta, null, 1));
});

test('relief.png', async ({ page }) => {
  await openEngineHarness(page);
  const looks: [string, Design][] = [
    ['bands', { ...threeStops(30), finish: { ...noFinish, bands: 0.5, bandEdge: 0.6 } }],
    ['mesh', meshDefault],
    ['mesh · marble', withLook(meshDefault, warp('marble', 0.5, 0.4, 3))],
    ['planes', planesDesign(0.4, 0.5)],
    [
      'cells',
      { ...threeStops(0), base: { ...(threeStops(0).base as RampGradient), kind: 'cells', scale: 0.35, seed: 4 } },
    ],
    [
      'contour',
      { ...midTonesFive, base: { ...(midTonesFive.base as RampGradient), kind: 'noise', scale: 0.35, seed: 8 } },
    ],
    [
      'aurora',
      {
        ...meshDefault,
        base: {
          kind: 'aurora',
          colors: [
            [0.15, 0.03, 260],
            [0.8, 0.17, 150],
            [0.65, 0.15, 190],
            [0.6, 0.2, 320],
          ],
          count: 0.5,
          glow: 0.5,
          blend: AURORA_BLEND,
          seed: 3,
        },
      },
    ],
    ['grid', gridDesign(4, 5, 1, gridColors)],
  ];
  const settings: [string, ReliefStyle, number][] = [
    ['off', 'satin', 0],
    ...[0.35, 0.7, 1].map((s): [string, ReliefStyle, number] => [`satin ${s}`, 'satin', s]),
    ...[0.35, 0.7, 1].map((s): [string, ReliefStyle, number] => [`glass ${s}`, 'glass', s]),
  ];
  const rows = looks.map(([label, d]) => ({
    label,
    designs: settings.map(([, reliefStyle, relief]) => ({
      ...d,
      finish: { ...noFinish, ...d.finish, relief, reliefStyle },
    })),
  }));
  const png = await engineHarness(
    page,
    'contactSheet',
    rows,
    settings.map(([label]) => label),
    480,
    270,
  );
  writeFileSync(join(DIR, process.env.RELIEF_SHEET ?? 'relief.png'), Buffer.from(png, 'base64'));
});

test('relief-light.png', async ({ page }) => {
  await openEngineHarness(page);
  const lights = [0, 45, 135, 225, 315];
  const contour: Design = {
    ...midTonesFive,
    base: { ...(midTonesFive.base as RampGradient), kind: 'noise', scale: 0.35, seed: 8 },
  };
  const looks: [string, Design, ReliefStyle][] = [
    ['contour · satin', contour, 'satin'],
    ['marble · satin', withLook(meshDefault, warp('marble', 0.5, 0.4, 3)), 'satin'],
    ['mesh · glass', meshDefault, 'glass'],
  ];
  const rows = looks.map(([label, d, reliefStyle]) => ({
    label,
    designs: lights.map((reliefLight) => ({
      ...d,
      finish: { ...noFinish, relief: 0.7, reliefStyle, reliefLight },
    })),
  }));
  const cols = lights.map((l) => `light ${l}°`);
  const png = await engineHarness(page, 'contactSheet', rows, cols, 480, 270);
  writeFileSync(join(DIR, 'relief-light.png'), Buffer.from(png, 'base64'));
});

test('halftone.png', async ({ page }) => {
  await openEngineHarness(page);
  const contour: Design = {
    ...midTonesFive,
    base: { ...(midTonesFive.base as RampGradient), kind: 'noise', scale: 0.35, seed: 8 },
  };
  const looks: [string, Design][] = [
    ['mesh', meshDefault],
    ['bands', { ...threeStops(30), finish: { ...noFinish, bands: 0.5, bandEdge: 0.6 } }],
    ['planes', planesDesign(0.4, 0.5)],
    ['contour', contour],
    ['grid', gridDesign(4, 5, 1, gridColors)],
  ];
  const amounts = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const rows = looks.map(([label, d]) => ({
    label,
    designs: amounts.map((halftone) => ({
      ...d,
      finish: { ...noFinish, ...d.finish, noise: { type: 'halftone' as const, amount: halftone } },
    })),
  }));
  const cols = amounts.map((a) => (a === 0 ? 'off' : `halftone ${a}`));
  // Whole images, then 1:1 crops of a 1920×1080 export, where the dots are their real size.
  const whole = await engineHarness(page, 'contactSheet', rows, cols, 480, 270);
  writeFileSync(join(DIR, 'halftone.png'), Buffer.from(whole, 'base64'));
  const crop = await engineHarness(page, 'contactSheet', rows, cols, 400, 300, { width: 1920, height: 1080 });
  writeFileSync(join(DIR, 'halftone-1080p-crops.png'), Buffer.from(crop, 'base64'));
});
