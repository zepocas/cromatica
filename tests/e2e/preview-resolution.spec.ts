// Grain, print and halftone are a few pixels fine, so dragging their sliders must not drop the preview resolution.
import { expect, openApp, openMore, test } from './support/app';

for (const label of ['Print', 'Noise', 'Halftone']) {
  test(`${label} slider keeps the preview at full resolution while dragging`, async ({ page }) => {
    await openApp(page);
    await openMore(page, 'adjust');
    const canvas = page.getByTestId('preview-canvas');
    await expect(canvas).toHaveAttribute('data-settled', 'true');
    const width = () => canvas.evaluate((c: HTMLCanvasElement) => c.width);
    const full = await width();
    const slider = page.getByLabel(label, { exact: true });
    for (let i = 1; i <= 8; i++) {
      await slider.fill(String(i / 10));
      expect(await width()).toBe(full);
    }
  });
}
