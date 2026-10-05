// The noise and cells patterns: they share the ramp's stops and add scale and a new variation.
import { expect, openApp, previewProbe, test } from './support/app';

for (const kind of ['noise', 'cells']) {
  test(`${kind}: keeps the stop strip, has scale and new variation, no angle`, async ({ page }) => {
    await openApp(page);
    const { settled, expectPreviewChanged } = previewProbe(page);
    let before = await settled();
    await page.getByLabel('Gradient', { exact: true }).selectOption(kind);
    await expectPreviewChanged(before);
    await expect(page.getByTestId('stop-strip')).toHaveCount(1);
    await expect(page.getByLabel('Angle')).toHaveCount(0);

    before = await settled();
    await page.getByLabel('Scale').fill('0.8');
    await expectPreviewChanged(before);

    const variation = page.getByRole('button', { name: 'New pattern variation' });
    const seed = await variation.getAttribute('data-seed');
    before = await settled();
    await variation.click();
    await expect(variation).not.toHaveAttribute('data-seed', seed!);
    await expectPreviewChanged(before);
  });
}
