// The noise and cells patterns: they share the ramp's stops and add scale and a new variation.
import { choose, expect, openApp, previewProbe, test } from './support/app';

for (const kind of ['noise', 'cells']) {
  test(`${kind}: keeps the stop strip, has scale and new variation, no angle`, async ({ page }) => {
    await openApp(page);
    const { settled, expectPreviewChanged } = previewProbe(page);
    let before = await settled();
    await choose(page.getByLabel('Gradient', { exact: true }), kind);
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

test('noise: style switches between contour and ridged', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'noise');
  const style = page.getByRole('group', { name: 'Noise style' });
  await expect(style.getByRole('button', { name: '[contour]' })).toHaveAttribute('aria-pressed', 'true');
  const before = await settled();
  await style.getByRole('button', { name: 'ridged' }).click();
  await expectPreviewChanged(before);
  await expect(style.getByRole('button', { name: '[ridged]' })).toHaveAttribute('aria-pressed', 'true');
});
