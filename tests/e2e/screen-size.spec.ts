// The canvas starts at this screen's own pixels (D114); `?default` keeps the fixed size for tests.
import { choose, expect, openApp, test, valueOf } from './support/app';

test('starts at this screen, listed first, and the preset list stays short', async ({ page }) => {
  await openApp(page, { shuffled: true });
  const size = page.getByLabel('Size preset');
  expect(await valueOf(size)).toBe('screen');
  const screenPixels = await page.evaluate(() => ({
    w: Math.round(screen.width * devicePixelRatio),
    h: Math.round(screen.height * devicePixelRatio),
  }));
  await expect(size).toContainText(`this screen (${screenPixels.w} × ${screenPixels.h})`);

  await size.click();
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.first()).toHaveAttribute('data-value', 'screen');
  // this screen, six presets and custom.
  await expect(options).toHaveCount(8);
  await page.keyboard.press('Escape');

  await choose(size, '5120x2880');
  await choose(size, 'screen');
  expect(await valueOf(size)).toBe('screen');
});

test('?default has no screen option and starts at 5120 × 2880', async ({ page }) => {
  await openApp(page);
  const size = page.getByLabel('Size preset');
  expect(await valueOf(size)).toBe('5120x2880');
  await size.click();
  await expect(page.getByRole('listbox').locator('[data-value="screen"]')).toHaveCount(0);
});
