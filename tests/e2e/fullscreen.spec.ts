// Full screen shows the preview alone; the × and F leave it, and so does the browser (Esc).
import { expect, openApp, test } from './support/app';

test('full screen: F hides the panel and handles, × and F leave', async ({ page }) => {
  await openApp(page);
  const panel = page.locator('aside.panel');
  const canvas = page.getByTestId('preview-canvas');
  const docked = (await canvas.boundingBox())!;
  const isFullscreen = () => page.evaluate(() => !!document.fullscreenElement);

  await page.keyboard.press('f');
  await expect.poll(isFullscreen).toBe(true);
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-point]')).toHaveCount(0);
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(docked.width);

  // The × shows once the pointer moves.
  await page.mouse.move(200, 200);
  const exit = page.getByRole('button', { name: 'Exit full screen' });
  await expect(exit).toBeVisible();
  await exit.click();
  await expect.poll(isFullscreen).toBe(false);
  await expect(panel).toBeVisible();

  // F toggles, and the browser leaving full screen (Esc) brings the panel back.
  await page.keyboard.press('f');
  await expect.poll(isFullscreen).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(panel).toBeVisible();
});

test('full screen: the header button works, also with the panel collapsed', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
});
