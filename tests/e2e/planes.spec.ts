// Planes and aurora: their controls and the colors they share with the ramp.
import { choose, expect, openApp, previewProbe, readHexes, test } from './support/app';

test('planes: shares the ramp colors, has count, torn and new layout, no bands or stop strip', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  await choose(gradient, 'linear');
  const rampColors = await readHexes(page);

  let before = await settled();
  await choose(gradient, 'planes');
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

  // With the pattern kept, shuffle stays on planes.
  await page.getByRole('button', { name: 'Lock pattern' }).click();
  before = await settled();
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  await expectPreviewChanged(before);
  await expect(gradient).toHaveAttribute('data-value', 'planes');
});

test('aurora: shares the ramp colors, has ribbons, glow and new layout', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  await choose(gradient, 'linear');
  const rampColors = await readHexes(page);
  let before = await settled();
  await choose(gradient, 'aurora');
  await expectPreviewChanged(before);
  expect(await readHexes(page)).toEqual(rampColors);
  await expect(page.getByTestId('stop-strip')).toHaveCount(0);
  await expect(page.getByLabel('Bands')).toHaveCount(0);

  before = await settled();
  await page.getByLabel('Ribbons').fill('1');
  await expectPreviewChanged(before);
  before = await settled();
  await page.getByLabel('Glow').fill('0.9');
  await expectPreviewChanged(before);
  const layout = page.getByRole('button', { name: 'New aurora layout' });
  const seed = await layout.getAttribute('data-seed');
  before = await settled();
  await layout.click();
  await expect(layout).not.toHaveAttribute('data-seed', seed!);
  await expectPreviewChanged(before);
});
