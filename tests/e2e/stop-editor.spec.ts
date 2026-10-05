// Linear gradient stops: the strip, the colors list and the blend modes.
import { choose, expect, openApp, openMore, previewProbe, test } from './support/app';

test('stop editor: add, drag, blend mode and delete update the preview', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const strip = page.getByTestId('stop-strip');
  const handles = page.getByRole('slider', { name: /^Stop \d+$/ });
  await choose(page.getByLabel('Gradient', { exact: true }), 'linear');
  await expect(handles).toHaveCount(3);

  // Clicking the empty strip at 25% adds a selected stop there.
  await settled();
  const box = (await strip.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + 6);
  await expect(handles).toHaveCount(4);
  const added = page.getByRole('slider', { name: 'Stop 4' });
  await expect(added).toHaveAttribute('aria-valuenow', '25');
  await expect(added).toBeFocused();

  // Dragging a handle moves the stop and changes the image.
  let before = await settled();
  const mid = page.getByRole('slider', { name: 'Stop 2' });
  const hb = (await mid.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, hb.y + hb.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(mid).toHaveAttribute('aria-valuenow', '80');
  await expectPreviewChanged(before);

  // Arrows nudge the focused stop.
  await mid.focus();
  await mid.press('ArrowLeft');
  await expect(mid).toHaveAttribute('aria-valuenow', '79');

  // Blend mode of the selected stop's segment.
  before = await settled();
  await openMore(page, 'colors');
  await choose(page.getByLabel('Blend to next stop'), { label: 'hue, long way' });
  await expectPreviewChanged(before);

  // The selected row's swatch updates the stop.
  before = await settled();
  await page.getByLabel('Color 2', { exact: true }).fill('#00ff80');
  await expectPreviewChanged(before);

  // So does typing a hex; junk is reverted.
  const hex = page.getByLabel('Hex of color 2');
  before = await settled();
  await hex.fill('#3366cc');
  await hex.press('Enter');
  await expect(hex).toHaveValue('#3366CC');
  await expectPreviewChanged(before);
  await hex.fill('nope');
  await hex.press('Enter');
  await expect(hex).toHaveValue('#3366CC');

  // "+ add stop" adds one in the widest gap.
  await page.getByRole('button', { name: 'Add color' }).click();
  await expect(handles).toHaveCount(5);

  // Delete removes stops, but never below 2.
  const first = page.getByRole('slider', { name: 'Stop 1' });
  for (let i = 0; i < 5; i++) {
    await first.focus();
    await first.press('Delete');
  }
  await expect(handles).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Remove color 1' })).toBeDisabled();
});

test('radial and conic share the stops with linear; radial has no angle', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  const handles = page.getByRole('slider', { name: /^Stop \d+$/ });
  await choose(gradient, 'linear');
  await expect(handles).toHaveCount(3);
  const stops = await handles.evaluateAll((els) => els.map((el) => el.getAttribute('aria-valuenow')));

  for (const kind of ['radial', 'conic']) {
    const before = await settled();
    await choose(gradient, kind);
    await expectPreviewChanged(before);
    await expect(handles).toHaveCount(3);
    expect(await handles.evaluateAll((els) => els.map((el) => el.getAttribute('aria-valuenow')))).toEqual(stops);
    await expect(page.getByLabel('Angle')).toHaveCount(kind === 'radial' ? 0 : 1);
  }

  // Shuffling with the layout kept keeps the shape.
  await page.getByRole('button', { name: 'Lock layout' }).click();
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  await expect(gradient).toHaveAttribute('data-value', 'conic');
});
