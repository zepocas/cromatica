// Palette from image (D25): the picker and drag-and-drop.
import { expect, openApp, readHexes, test } from './support/app';
import { twoTonePng } from './support/images';

test('palette from image: picker and drop set the colors, laid out like the image', async ({ page }) => {
  await openApp(page);
  const png = twoTonePng();

  // Mesh: one point per color, largest area first, at its place in the image.
  await page.getByLabel('Image file').setInputFiles({ name: 'two-tone.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('li input.hex')).toHaveCount(2);
  expect(await readHexes(page)).toEqual(['#DC2828', '#1E3CC8']);
  await expect(page.getByLabel('Harmony', { exact: true })).toHaveValue('');
  const handles = page.getByLabel(/^Point \d$/);
  await expect(handles).toHaveCount(2);
  const [red, blue] = await Promise.all([handles.nth(0).boundingBox(), handles.nth(1).boundingBox()]);
  expect(red!.x).toBeLessThan(blue!.x);

  // Linear, by drop: stops follow the image left to right (default angle 30°).
  await page.getByLabel('Gradient', { exact: true }).selectOption('linear');
  const dataTransfer = await page.evaluateHandle(
    (bytes) => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(bytes)], 'two-tone.png', { type: 'image/png' }));
      return d;
    },
    [...png],
  );
  await page.dispatchEvent('body', 'drop', { dataTransfer });
  await expect.poll(() => readHexes(page)).toEqual(['#DC2828', '#1E3CC8']);
});
