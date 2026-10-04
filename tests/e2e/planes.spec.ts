// The planes pattern: its controls and the colors it shares with the ramp.
import { expect, openApp, previewProbe, readHexes, test } from './support/app';

test('planes: shares the ramp colors, has count, torn and new layout, no bands or stop strip', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  await gradient.selectOption('linear');
  const rampColors = await readHexes(page);

  let before = await settled();
  await gradient.selectOption('planes');
  await expectPreviewChanged(before);
  expect(await readHexes(page)).toEqual(rampColors);
  await expect(page.getByLabel('Bands')).toHaveCount(0);
  await expect(page.getByLabel('Angle')).toHaveCount(0);
  await expect(page.getByTestId('stop-strip')).toHaveCount(0);

  before = await settled();
  await page.getByLabel('Planes').fill('1');
  await expectPreviewChanged(before);

  before = await settled();
  await page.getByLabel('Torn').fill('0');
  await expectPreviewChanged(before);

  const layout = page.getByRole('button', { name: 'New layout' });
  const seed = await layout.getAttribute('data-seed');
  before = await settled();
  await layout.click();
  await expect(layout).not.toHaveAttribute('data-seed', seed!);
  await expectPreviewChanged(before);

  before = await settled();
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  await expectPreviewChanged(before);
  await expect(gradient).toHaveValue('planes');
});
