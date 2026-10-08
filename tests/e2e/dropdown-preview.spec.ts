// Lists that change how the image looks preview each option as the arrow keys move through it (D63).
// (Pixel comparisons can't be used on an open list: a screenshot takes focus away and closes it.)
import { expect, openApp, test } from './support/app';

test('size preset: arrowing previews the frame shape, Escape puts it back', async ({ page }) => {
  await openApp(page);
  const canvas = page.getByTestId('preview-canvas');
  const ratio = async () => canvas.evaluate((c: HTMLCanvasElement) => c.width / c.height);
  const before = await ratio();
  const size = page.getByRole('combobox', { name: 'Size preset' });
  await size.focus();
  await page.keyboard.press('ArrowDown');
  const seen = new Set<number>();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowDown');
    await expect(canvas).toHaveAttribute('data-settled', 'true');
    seen.add(Math.round((await ratio()) * 100));
  }
  expect(seen.size).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await expect.poll(async () => Math.round((await ratio()) * 100)).toBe(Math.round(before * 100));
});
