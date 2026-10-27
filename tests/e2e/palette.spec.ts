// Palette steering and edits: harmony rule, keep, value key, linked, order.
import { hexToOklch, oklchToHex } from '../../src/color/hex';
import { KEY_BANDS } from '../../src/color/harmony';
import { shortestTurn } from '../../src/math';
import { choose, expect, openApp, openMore, readHexes, readLightness, test, valueOf } from './support/app';

/** Hex rounding and spacing nudges let lightness stray a little past a key's band. */
const BAND_SLACK = 0.07;

test('harmony: picking a rule regenerates, keep pins it, unpinned is fully random', async ({ page }) => {
  await openApp(page);
  const harmony = page.getByLabel('Harmony', { exact: true });
  const read = () => readHexes(page);
  const shuffleColors = page.getByRole('button', { name: 'Shuffle colors' });

  // A generated palette names the rule it was built with.
  await shuffleColors.click();
  await expect(harmony).toHaveAttribute(
    'data-value',
    /^(monochrome|analogous|complementary|split-complementary|triadic|tetradic)$/,
  );
  // Picking the rule already shown would fire no change.
  if ((await valueOf(harmony)) === 'monochrome') await choose(harmony, 'analogous');

  // Picking a rule gives a palette in that rule right away.
  await openMore(page, 'colors');
  await page.getByRole('button', { name: 'Fix base hue' }).click();
  await page.getByLabel('Base hue', { exact: true }).fill('250');
  let before = await read();
  await choose(harmony, 'monochrome');
  await expect.poll(read).not.toEqual(before);
  await choose(page.getByLabel('Mood', { exact: true }), 'vivid');
  await expect(harmony).toHaveAttribute('data-value', 'monochrome');

  // Kept: ⟳ stays monochrome vivid around 250° (every colorful swatch is a blue).
  await page.getByRole('button', { name: 'Keep harmony' }).click();
  await page.getByRole('button', { name: 'Keep mood' }).click();
  for (let i = 0; i < 3; i++) {
    before = await read();
    await shuffleColors.click();
    await expect.poll(read).not.toEqual(before);
    await expect(harmony).toHaveAttribute('data-value', 'monochrome');
    await expect(page.getByLabel('Mood', { exact: true })).toHaveAttribute('data-value', 'vivid');
    const colorful = (await read()).map(hexToOklch).filter(([, c]) => c > 0.045);
    expect(colorful.length).toBeGreaterThan(0);
    for (const [, , h] of colorful) expect(Math.abs(shortestTurn(250, h))).toBeLessThanOrEqual(30);
  }

  // Not kept: rules vary again.
  await page.getByRole('button', { name: 'Keep harmony' }).click();
  const rules = new Set<string>();
  for (let i = 0; i < 12; i++) {
    await shuffleColors.click();
    rules.add(await valueOf(harmony));
  }
  expect(rules.size).toBeGreaterThan(1);
});

test('H locks and unlocks the harmony rule, and the padlock shows it', async ({ page }) => {
  await openApp(page);
  const lock = page.getByRole('button', { name: 'Keep harmony' });
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await expect(lock).toHaveAttribute('title', /\(H; ⇧H/);
  await page.keyboard.press('h');
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await expect(lock).toHaveClass(/glow/);
  await page.keyboard.press('h');
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
});

test('Shift+H locks the rule, mood and key together, and again lets them all go', async ({ page }) => {
  await openApp(page);
  await openMore(page, 'colors');
  const locks = ['Keep harmony', 'Keep mood', 'Keep key'].map((name) => page.getByRole('button', { name }));
  await page.keyboard.press('Shift+H');
  for (const lock of locks) await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+H');
  for (const lock of locks) await expect(lock).toHaveAttribute('aria-pressed', 'false');
  // Plain H is the harmony lock alone.
  await page.keyboard.press('h');
  await expect(locks[0]).toHaveAttribute('aria-pressed', 'true');
  await expect(locks[1]).toHaveAttribute('aria-pressed', 'false');
});

test('value key: picking one regenerates in that key, keep pins it', async ({ page }) => {
  await openApp(page);
  await openMore(page, 'colors');
  const key = page.getByLabel('Value key');
  const low = KEY_BANDS.low[1] + BAND_SLACK;
  const high = KEY_BANDS.high[0] - BAND_SLACK;

  await choose(key, 'low');
  await expect(key).toHaveAttribute('data-value', 'low');
  for (const l of await readLightness(page)) expect(l).toBeLessThan(low);

  await page.getByRole('button', { name: 'Keep key' }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Shuffle colors' }).click();
    await expect(key).toHaveAttribute('data-value', 'low');
    for (const l of await readLightness(page)) expect(l).toBeLessThan(low);
  }

  await choose(key, 'high');
  await expect(key).toHaveAttribute('data-value', 'high');
  for (const l of await readLightness(page)) expect(l).toBeGreaterThan(high);
});

test('linked editing moves the whole palette; free edits one color', async ({ page }) => {
  await openApp(page);
  const read = () => readHexes(page);
  await openMore(page, 'colors');
  // Edit color 1 through its hex field, keeping lightness and chroma and turning the hue.
  const hue = {
    fill: async (deg: string) => {
      const [l, c] = hexToOklch((await read())[0]);
      const field = page.getByLabel('Hex of color 1');
      await field.fill(oklchToHex([l, c, Number(deg)]));
      await field.press('Enter');
    },
  };

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
});

test('shuffle color order keeps the colors and swaps where they go', async ({ page }) => {
  await openApp(page);
  for (const pattern of ['mesh', 'linear']) {
    await choose(page.getByLabel('Gradient', { exact: true }), pattern);
    const before = await readHexes(page);
    await page.getByRole('button', { name: 'Shuffle color order' }).click();
    await expect.poll(() => readHexes(page)).not.toEqual(before);
    expect([...(await readHexes(page))].sort()).toEqual([...before].sort());
  }
});

test('"+ add" sits after the last color, under the hex values, and adds one', async ({ page }) => {
  await openApp(page);
  const rows = page.locator('li input.hex');
  const add = page.getByRole('button', { name: 'Add color' });
  const count = await rows.count();
  const last = (await rows.last().boundingBox())!;
  const box = (await add.boundingBox())!;
  expect(box.y).toBeGreaterThan(last.y);
  // Its text starts under the hex value, not under the swatch.
  expect(box.x + box.width / 2).toBeGreaterThan(last.x - 20);
  await add.click();
  await expect(rows).toHaveCount(count + 1);
});

test('switching mood or key away and back restores the colors', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Shuffle colors' }).click();
  await openMore(page, 'colors');
  const mood = page.getByLabel('Mood', { exact: true });
  const key = page.getByLabel('Value key');
  const original = await readHexes(page);
  const startMood = await valueOf(mood);
  const startKey = await valueOf(key);

  await choose(mood, startMood === 'vivid' ? 'natural' : 'vivid');
  await expect.poll(() => readHexes(page)).not.toEqual(original);
  await choose(mood, startMood);
  await expect.poll(() => readHexes(page)).toEqual(original);

  await choose(key, startKey === 'low' ? 'high' : 'low');
  await expect.poll(() => readHexes(page)).not.toEqual(original);
  await choose(key, startKey);
  await expect.poll(() => readHexes(page)).toEqual(original);
});

test('every mood can be picked and regenerates the palette in it', async ({ page }) => {
  await openApp(page);
  await openMore(page, 'colors');
  const mood = page.getByLabel('Mood', { exact: true });
  for (const m of ['muted', 'earthy', 'pastel', 'neon', 'vivid', 'natural']) {
    const before = await readHexes(page);
    await choose(mood, m);
    await expect(mood).toHaveAttribute('data-value', m);
    await expect.poll(() => readHexes(page)).not.toEqual(before);
  }
});

test('brightness and contrast grade the whole palette; reset brings the originals back', async ({ page }) => {
  await openApp(page);
  await openMore(page, 'colors');
  const before = await readLightness(page);
  await page.getByLabel('Brightness', { exact: true }).fill('0.6');
  await expect.poll(() => readLightness(page)).not.toEqual(before);
  (await readLightness(page)).forEach((l, i) => expect(l).toBeGreaterThan(before[i]));
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'bri +60' })).toBeVisible();
  await page.getByLabel('Contrast', { exact: true }).fill('0.5');
  await page.getByRole('button', { name: 'Reset adjustments' }).click();
  await expect.poll(() => readLightness(page)).toEqual(before);
});
