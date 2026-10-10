// Noise is a few pixels fine, so dragging its amount slider must not drop the preview resolution.
import { choose, expect, openApp, openMore, test } from './support/app';

for (const type of ['lithograph', 'xerox', 'halftone', 'grain']) {
  test(`${type} noise slider keeps the preview at full resolution while dragging`, async ({ page }) => {
    await openApp(page);
    await openMore(page, 'adjust');
    await choose(page.getByRole('combobox', { name: 'Noise type' }), type);
    const canvas = page.getByTestId('preview-canvas');
    await expect(canvas).toHaveAttribute('data-settled', 'true');
    const width = () => canvas.evaluate((c: HTMLCanvasElement) => c.width);
    const full = await width();
    const slider = page.getByLabel('Noise amount', { exact: true });
    for (let i = 1; i <= 8; i++) {
      await slider.fill(String(i / 10));
      expect(await width()).toBe(full);
    }
  });
}
