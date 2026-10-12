// Pins on the image: pick the mesh colors by dragging pins in a window that shows the source image.
import { choose, expect, openApp, readHexes, test } from './support/app';
import { twoTonePng } from './support/images';

test('pins pick colors from the image: drag, add, remove, undo', async ({ page }) => {
  await openApp(page);
  const pickButton = page.getByRole('button', { name: 'Pick colors on the image' });
  // Nothing to pick on, and no button or window, until an image has been imported.
  await expect(pickButton).toHaveCount(0);
  await expect(page.getByTestId('image-pins')).toHaveCount(0);

  await page
    .getByLabel('Image file')
    .setInputFiles({ name: 'two-tone.png', mimeType: 'image/png', buffer: twoTonePng() });
  await expect.poll(() => readHexes(page)).toEqual(['#DC2828', '#1E3CC8']);
  // The window opens with the import, and the button is there to bring it back.
  await expect(page.getByTestId('image-pins')).toBeVisible();
  await expect(pickButton).toHaveAttribute('aria-pressed', 'true');

  const pins = page.getByLabel(/^Pin \d$/);
  await expect(pins).toHaveCount(2);
  // The design's own handles stay on the canvas beside the window.
  await expect(page.getByLabel(/^Point \d$/)).toHaveCount(2);
  const area = (await page.getByLabel('Pins on the image').boundingBox())!;
  const at = (fx: number, fy: number): [number, number] => [area.x + area.width * fx, area.y + area.height * fy];

  // The red pin dragged into the blue part takes the blue.
  const red = (await pins.nth(0).boundingBox())!;
  await page.mouse.move(red.x + red.width / 2, red.y + red.height / 2);
  await page.mouse.down();
  await page.mouse.move(...at(0.92, 0.5), { steps: 4 });
  await page.mouse.up();
  expect(await readHexes(page)).toEqual(['#1E3CC8', '#1E3CC8']);

  // Pressing on the bare image adds a pin in the color there.
  await page.mouse.click(...at(0.05, 0.5));
  await expect(pins).toHaveCount(3);
  expect(await readHexes(page)).toEqual(['#1E3CC8', '#1E3CC8', '#DC2828']);

  // Right-clicking a pin takes it away again; one undo brings it back.
  await pins.nth(2).click({ button: 'right' });
  await expect(pins).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pins).toHaveCount(3);

  // Ctrl+click is a right-click on a Mac: on the bare image it adds nothing.
  await page.keyboard.down('Control');
  await page.mouse.click(...at(0.5, 0.5));
  await page.keyboard.up('Control');
  await expect(pins).toHaveCount(3);

  // Done closes the window; the handles were there all along, and the button brings it back.
  await page.getByRole('button', { name: 'Done picking' }).click();
  await expect(page.getByTestId('image-pins')).toHaveCount(0);
  await pickButton.click();
  await expect(page.getByTestId('image-pins')).toBeVisible();
  await pickButton.click();
  await expect(page.getByTestId('image-pins')).toHaveCount(0);
  await expect(page.getByLabel(/^Point \d$/)).toHaveCount(3);
});

test('pins pick colors on a gradient too: drag, add, remove', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'linear');
  await page
    .getByLabel('Image file')
    .setInputFiles({ name: 'two-tone.png', mimeType: 'image/png', buffer: twoTonePng() });
  await expect.poll(() => readHexes(page)).toEqual(['#DC2828', '#1E3CC8']);
  await expect(page.getByTestId('image-pins')).toBeVisible();

  // One pin per stop, where its color was found in the image.
  const pins = page.getByLabel(/^Pin \d$/);
  await expect(pins).toHaveCount(2);
  const area = (await page.getByLabel('Pins on the image').boundingBox())!;
  const at = (fx: number, fy: number): [number, number] => [area.x + area.width * fx, area.y + area.height * fy];
  expect(Number(await pins.nth(0).getAttribute('data-u'))).toBeLessThan(0.6);
  expect(Number(await pins.nth(1).getAttribute('data-u'))).toBeGreaterThan(0.7);

  // The red stop's pin dragged onto the blue takes the blue.
  const red = (await pins.nth(0).boundingBox())!;
  await page.mouse.move(red.x + red.width / 2, red.y + red.height / 2);
  await page.mouse.down();
  await page.mouse.move(...at(0.92, 0.5), { steps: 4 });
  await page.mouse.up();
  expect(await readHexes(page)).toEqual(['#1E3CC8', '#1E3CC8']);

  // Pressing on the bare image adds a stop in the color there; right-clicking its pin takes it away.
  await page.mouse.click(...at(0.05, 0.5));
  await expect(pins).toHaveCount(3);
  expect((await readHexes(page)).filter((h) => h === '#DC2828')).toHaveLength(1);
  await pins.nth(2).click({ button: 'right' });
  await expect(pins).toHaveCount(2);
  expect(await readHexes(page)).toEqual(['#1E3CC8', '#1E3CC8']);
});

test('on the net the pins pick the node colors; rows and columns add or remove them', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'grid');
  await page
    .getByLabel('Image file')
    .setInputFiles({ name: 'two-tone.png', mimeType: 'image/png', buffer: twoTonePng() });
  await expect.poll(async () => (await readHexes(page)).length).toBeGreaterThan(3);
  const before = await readHexes(page);
  await expect(page.getByTestId('image-pins')).toBeVisible();

  const pins = page.getByLabel(/^Pin \d+$/);
  await expect(pins).toHaveCount(before.length);
  const area = (await page.getByLabel('Pins on the image').boundingBox())!;
  const at = (fx: number, fy: number): [number, number] => [area.x + area.width * fx, area.y + area.height * fy];

  // More rows or columns add colors, each with a pin.
  const moreRows = page.getByRole('button', { name: 'More rows' });
  await moreRows.click();
  await expect.poll(() => pins.count()).toBeGreaterThan(before.length);
  const grown = await pins.count();
  expect((await readHexes(page)).length).toBe(grown);
  await page.getByRole('button', { name: 'Fewer rows' }).click();
  await expect(pins).toHaveCount(before.length);
  // Resizing re-evaluates the node colors, so what follows compares against the net as it is now.
  const base = await readHexes(page);

  const blue = (hexes: string[]) => hexes.filter((h) => h === '#1E3CC8').length;
  const us = await pins.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-u'))));
  const i = us.findIndex((u) => u < 0.5);
  expect(i).toBeGreaterThanOrEqual(0);
  const box = (await pins.nth(i).boundingBox())!;

  // A node whose pin is on the red, dragged onto the blue, turns blue.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(...at(0.92, 0.5), { steps: 4 });
  await page.mouse.up();
  expect(blue(await readHexes(page))).toBe(blue(base) + 1);

  // A net can't grow by a click, so a click on the bare image replaces the selected color instead.
  const reds = (await readHexes(page)).filter((h) => h === '#DC2828').length;
  await page.mouse.click(...at(0.05, 0.9));
  await expect(pins).toHaveCount(before.length);
  expect(blue(await readHexes(page))).toBe(blue(base));
  expect((await readHexes(page)).filter((h) => h === '#DC2828')).toHaveLength(reds + 1);

  // A net can't lose nodes, so right-clicking one of its pins does nothing.
  await pins.nth(0).click({ button: 'right' });
  await expect(pins).toHaveCount(before.length);
});
