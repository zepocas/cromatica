// Base hue: an adjustment over the palette's original colors (D27).
import type { Page } from '@playwright/test';
import { expect, openApp, openMore, readHexes, test } from './support/app';

async function setup(page: Page) {
  await openApp(page);
  await openMore(page, 'colors');
  return {
    original: await readHexes(page),
    read: () => readHexes(page),
    status: page.getByRole('status').filter({ hasText: '~' }),
    fixBaseHue: page.getByRole('button', { name: 'Fix base hue' }),
    baseHue: page.getByLabel('Base hue', { exact: true }),
  };
}

test('base hue: turning it moves the palette; switching it off undoes the turn', async ({ page }) => {
  const { original, read, status, fixBaseHue, baseHue } = await setup(page);
  await fixBaseHue.click();
  const start = Number(await baseHue.inputValue());
  await baseHue.fill(String((start + 120) % 360));
  await expect.poll(read).not.toEqual(original);
  await expect(status).toContainText('hue +120°');
  await fixBaseHue.click();
  await expect.poll(read).toEqual(original);
});

test('reset brings back the original colors and the base hue with them', async ({ page }) => {
  const { original, read, status, fixBaseHue, baseHue } = await setup(page);
  await fixBaseHue.click();
  const start = Number(await baseHue.inputValue());
  await baseHue.fill(String((start + 60) % 360));
  await page.getByRole('button', { name: 'Reset adjustments' }).click();
  await expect.poll(read).toEqual(original);
  await expect(baseHue).toHaveValue(String(start));
  await expect(status).toHaveCount(0);
});

test('a hand edit bakes the adjustment in', async ({ page }) => {
  const { read, status, fixBaseHue, baseHue } = await setup(page);
  await fixBaseHue.click();
  const start = Number(await baseHue.inputValue());
  await baseHue.fill(String((start + 60) % 360));
  await expect(status).toContainText('hue +60°');
  const first = page.locator('li input.hex').first();
  await first.fill('#336699');
  await first.press('Enter');
  await expect(status).toHaveCount(0);
  expect((await read())[0]).toBe('#336699');
});
