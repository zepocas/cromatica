import type { Page } from '@playwright/test';
import { choose, expect, openApp, test } from './support/app';

const rootScale = (page: Page) => page.evaluate(() => document.documentElement.dataset.uiScale);

test.describe('ui size (D111)', () => {
  test('a laptop-sized window stays at 1', async ({ page }) => {
    await openApp(page);
    expect(await rootScale(page)).toBe('1');
  });

  test('a 4K-wide window scales up by itself', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2000 });
    await openApp(page);
    expect(await rootScale(page)).toBe('1.5');
    const panel = await page.locator('aside').boundingBox();
    expect(panel?.width).toBeCloseTo(450, 0);
  });

  test('a picked size applies at once, is remembered, and keeps the list on its button', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openApp(page);
    const size = page.getByRole('combobox', { name: 'UI size' });
    await choose(size, { label: '200%' });
    expect(await rootScale(page)).toBe('2');

    await size.click();
    const button = (await size.boundingBox())!;
    const list = (await page.getByRole('listbox').boundingBox())!;
    expect(list.x).toBeCloseTo(button.x, 0);
    // The bar is at the bottom, so the list opens upward.
    expect(list.y + list.height).toBeCloseTo(button.y, 0);
    await page.keyboard.press('Escape');

    await page.reload();
    expect(await rootScale(page)).toBe('2');
  });

  test('the preview keeps a sharp buffer at a scale', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openApp(page);
    await choose(page.getByRole('combobox', { name: 'UI size' }), { label: '150%' });
    const canvas = page.getByTestId('preview-canvas');
    await expect
      .poll(async () => {
        const box = (await canvas.boundingBox())!;
        const width = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
        return Math.abs(width - box.width);
      })
      .toBeLessThanOrEqual(1);
  });
});

test('75% shrinks the panel and the preview still fills the rest', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openApp(page);
  await choose(page.getByRole('combobox', { name: 'UI size' }), { label: '75%' });
  expect(await page.evaluate(() => document.documentElement.dataset.uiScale)).toBe('0.75');
  expect((await page.locator('aside').boundingBox())?.width).toBeCloseTo(225, 0);
});
