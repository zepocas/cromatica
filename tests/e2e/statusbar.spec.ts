// The bottom bar on narrow windows (#61): it scrolls sideways instead of overflowing the page.
import type { Page } from '@playwright/test';
import { expect, openApp, test } from './support/app';

const bar = (page: Page) => page.getByRole('contentinfo', { name: 'Status bar' });
const scroller = (page: Page) => bar(page).locator('.scroll');

test('the bar fits at a wide window and scrolls at a narrow one', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await openApp(page);
  const fits = () => scroller(page).evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(await fits()).toBe(true);

  await page.setViewportSize({ width: 700, height: 800 });
  expect(await fits()).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the full screen button is reachable by scrolling the bar with the wheel', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await openApp(page);
  const fullscreen = bar(page).getByRole('button', { name: 'Full screen' });
  await bar(page).hover();
  await page.mouse.wheel(0, 2000);
  await expect(fullscreen).toBeInViewport();
});

test('the monitors popover is not clipped by the scrolling bar', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await openApp(page);
  await bar(page).getByRole('button', { name: 'Monitors', exact: true }).click();
  await expect(page.getByTestId('monitors-panel')).toBeInViewport({ ratio: 1 });
});

test('share link, format and download sit in the status bar, not in the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await openApp(page);
  const status = bar(page);
  const panel = page.locator('aside.panel');
  for (const name of ['Copy share link', 'Download', 'Format']) {
    await expect(status.getByRole(name === 'Format' ? 'combobox' : 'button', { name })).toBeVisible();
    await expect(panel.getByRole(name === 'Format' ? 'combobox' : 'button', { name })).toHaveCount(0);
  }
  await expect(panel.getByRole('button', { name: 'Shuffle', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'More like this' })).toBeVisible();

  // Format and download are neighbors; share link follows them.
  const x = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.x;
  const share = await x(status.getByRole('button', { name: 'Copy share link' }));
  const format = await x(status.getByRole('combobox', { name: 'Format' }));
  const download = await x(status.getByRole('button', { name: 'Download' }));
  expect(format).toBeLessThan(download);
  expect(download).toBeLessThan(share);
});
