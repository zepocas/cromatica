// Palette steering and edits: harmony rule, keep, value key, linked, remix, order.
import { hexToOklch } from '../../src/color/hex';
import { KEY_BANDS } from '../../src/color/harmony';
import { shortestTurn } from '../../src/math';
import { expect, openApp, openMore, readHexes, readLightness, test } from './support/app';

/** Hex rounding and spacing nudges let lightness stray a little past a key's band. */
const BAND_SLACK = 0.07;

test('harmony: picking a rule regenerates, keep pins it, unpinned is fully random', async ({ page }) => {
  await openApp(page);
  const harmony = page.getByLabel('Harmony', { exact: true });
  const read = () => readHexes(page);
  const shuffleColors = page.getByRole('button', { name: 'Shuffle colors' });

  // A generated palette names the rule it was built with.
  await shuffleColors.click();
  await expect(harmony).toHaveValue(/^(monochrome|analogous|complementary|split-complementary|triadic|tetradic)$/);
  // Picking the rule already shown would fire no change.
  if ((await harmony.inputValue()) === 'monochrome') await harmony.selectOption('analogous');

  // Picking a rule gives a palette in that rule right away.
  await openMore(page, 'colors');
  await page.getByRole('button', { name: 'Fix base hue' }).click();
  await page.getByLabel('Base hue', { exact: true }).fill('250');
  let before = await read();
  await harmony.selectOption('monochrome');
  await expect.poll(read).not.toEqual(before);
  await page.getByLabel('Mood').selectOption('vivid');
  await expect(harmony).toHaveValue('monochrome');

  // Kept: ⟳ stays monochrome vivid around 250° (every colorful swatch is a blue).
  await page.getByRole('button', { name: 'Keep harmony' }).click();
  for (let i = 0; i < 3; i++) {
    before = await read();
    await shuffleColors.click();
    await expect.poll(read).not.toEqual(before);
    await expect(harmony).toHaveValue('monochrome');
    await expect(page.getByLabel('Mood')).toHaveValue('vivid');
    const colorful = (await read()).map(hexToOklch).filter(([, c]) => c > 0.045);
    expect(colorful.length).toBeGreaterThan(0);
    for (const [, , h] of colorful) expect(Math.abs(shortestTurn(250, h))).toBeLessThanOrEqual(30);
  }

  // Not kept: rules vary again.
  await page.getByRole('button', { name: 'Keep harmony' }).click();
  const rules = new Set<string>();
  for (let i = 0; i < 12; i++) {
    await shuffleColors.click();
    rules.add(await harmony.inputValue());
  }
  expect(rules.size).toBeGreaterThan(1);
});

test('value key: picking one regenerates in that key, keep pins it', async ({ page }) => {
  await openApp(page);
  await openMore(page, 'colors');
  const key = page.getByLabel('Value key');
  const low = KEY_BANDS.low[1] + BAND_SLACK;
  const high = KEY_BANDS.high[0] - BAND_SLACK;

  await key.selectOption('low');
  await expect(key).toHaveValue('low');
  for (const l of await readLightness(page)) expect(l).toBeLessThan(low);

  await page.getByRole('button', { name: 'Keep harmony' }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Shuffle colors' }).click();
    await expect(key).toHaveValue('low');
    for (const l of await readLightness(page)) expect(l).toBeLessThan(low);
  }

  await key.selectOption('high');
  await expect(key).toHaveValue('high');
  for (const l of await readLightness(page)) expect(l).toBeGreaterThan(high);
});

test('linked editing moves the whole palette; free edits one color; remix shifts all', async ({ page }) => {
  await openApp(page);
  const read = () => readHexes(page);
  await openMore(page, 'colors');
  const hue = page.getByLabel('Hue', { exact: true });

  // Free (default): only the selected color changes.
  let before = await read();
  await hue.fill('120');
  await expect.poll(read).not.toEqual(before);
  let after = await read();
  expect(after[0]).not.toBe(before[0]);
  expect(after.slice(1)).toEqual(before.slice(1));

  // Linked: every colorful swatch turns with it, and the hue gaps are kept.
  await page.getByRole('button', { name: 'Link colors' }).click();
  before = await read();
  await hue.fill('200');
  await expect.poll(read).not.toEqual(before);
  after = await read();
  expect(after.filter((h, i) => h !== before[i]).length).toBeGreaterThanOrEqual(after.length - 1);
  const h = (hex: string) => hexToOklch(hex)[2];
  const gap = (a: number, b: number) => (((b - a) % 360) + 360) % 360;
  // Hex rounding moves hues a few degrees, so compare to the nearest 10°.
  expect(gap(h(after[0]), h(after[1]))).toBeCloseTo(gap(h(before[0]), h(before[1])), -1);

  // Remix changes all of them.
  before = await read();
  await page.getByRole('button', { name: 'Remix colors' }).click();
  await expect.poll(read).not.toEqual(before);
  after = await read();
  expect(after.every((x, i) => x !== before[i])).toBe(true);
});

test('shuffle color order keeps the colors and swaps where they go', async ({ page }) => {
  await openApp(page);
  for (const pattern of ['mesh', 'linear']) {
    await page.getByLabel('Gradient', { exact: true }).selectOption(pattern);
    const before = await readHexes(page);
    await page.getByRole('button', { name: 'Shuffle color order' }).click();
    await expect.poll(() => readHexes(page)).not.toEqual(before);
    expect([...(await readHexes(page))].sort()).toEqual([...before].sort());
  }
});

test('"+ add" sits after the last color and adds one', async ({ page }) => {
  await openApp(page);
  const rows = page.locator('li input.hex');
  const add = page.getByRole('button', { name: 'Add color' });
  const count = await rows.count();
  const last = (await rows.last().boundingBox())!;
  expect((await add.boundingBox())!.y).toBeGreaterThan(last.y);
  await add.click();
  await expect(rows).toHaveCount(count + 1);
});

test('switching mood or key away and back restores the colors', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Shuffle colors' }).click();
  await openMore(page, 'colors');
  const mood = page.getByLabel('Mood');
  const key = page.getByLabel('Value key');
  const original = await readHexes(page);
  const startMood = await mood.inputValue();
  const startKey = await key.inputValue();

  await mood.selectOption(startMood === 'vivid' ? 'natural' : 'vivid');
  await expect.poll(() => readHexes(page)).not.toEqual(original);
  await mood.selectOption(startMood);
  await expect.poll(() => readHexes(page)).toEqual(original);

  await key.selectOption(startKey === 'low' ? 'high' : 'low');
  await expect.poll(() => readHexes(page)).not.toEqual(original);
  await key.selectOption(startKey);
  await expect.poll(() => readHexes(page)).toEqual(original);
});

test('proportion 60-30-10 resizes the mesh points; even puts them back', async ({ page }) => {
  await openApp(page);
  await openMore(page, 'colors');
  const radii = () => page.locator('[data-point]').evaluateAll((els) => els.map((el) => el.getAttribute('data-r')));
  const group = page.getByRole('group', { name: 'Proportion' });
  const before = await radii();
  await group.getByRole('button', { name: '60-30-10' }).click();
  await expect.poll(radii).not.toEqual(before);
  await group.getByRole('button', { name: 'even' }).click();
  await expect.poll(radii).toEqual(before);
  // Mesh only.
  await page.getByLabel('Gradient', { exact: true }).selectOption('linear');
  await expect(group).toHaveCount(0);
});
