// Temperature and base hue: adjustments over the palette's original colors (D27).
import type { Page } from '@playwright/test';
import { expect, openApp, openMore, readHexes, test } from './support/app';

async function setup(page: Page) {
  await openApp(page);
  await openMore(page, 'colors');
  const temp = page.getByRole('group', { name: 'Temperature' });
  return {
    original: await readHexes(page),
    read: () => readHexes(page),
    status: page.getByRole('status').filter({ hasText: '~' }),
    temp,
    pickTemp: (t: 'off' | 'warm' | 'cool') => temp.getByRole('button', { name: t }).click(),
    fixBaseHue: page.getByRole('button', { name: 'Fix base hue' }),
    baseHue: page.getByLabel('Base hue', { exact: true }),
  };
}

test('temperature: warm and cool each change the palette; off restores it', async ({ page }) => {
  const { original, read, status, temp, pickTemp } = await setup(page);
  await expect(temp.getByRole('button', { name: 'off' })).toHaveAttribute('aria-pressed', 'true');
  await pickTemp('warm');
  await expect.poll(read).not.toEqual(original);
  const warm = await read();
  await expect(status).toContainText('temp warm');
  await pickTemp('cool');
  await expect.poll(read).not.toEqual(warm);
  expect(await read()).not.toEqual(original);
  await pickTemp('off');
  await expect.poll(read).toEqual(original);
  await expect(status).toHaveCount(0);
});

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
  const { original, read, status, pickTemp, fixBaseHue, baseHue } = await setup(page);
  await fixBaseHue.click();
  const start = Number(await baseHue.inputValue());
  await baseHue.fill(String((start + 60) % 360));
  await pickTemp('warm');
  await page.getByRole('button', { name: 'Reset adjustments' }).click();
  await expect.poll(read).toEqual(original);
  await expect(baseHue).toHaveValue(String(start));
  await expect(status).toHaveCount(0);
});

test('a hand edit bakes the adjustment in; temperature carries over to a new palette', async ({ page }) => {
  const { read, status, temp, pickTemp } = await setup(page);
  await pickTemp('warm');
  const first = page.locator('li input.hex').first();
  await first.fill('#336699');
  await first.press('Enter');
  await expect(status).toHaveCount(0);
  await expect(temp.getByRole('button', { name: 'off' })).toHaveAttribute('aria-pressed', 'true');
  expect((await read())[0]).toBe('#336699');

  await pickTemp('cool');
  await page.getByRole('button', { name: 'Shuffle colors' }).click();
  await expect(status).toContainText('temp cool');
});
