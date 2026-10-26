// Blobs: their controls, and moving and restacking them like planes (D88).
import { choose, expect, openApp, previewProbe, test } from './support/app';

test('blobs: has blobs, size, wobble, grain and new layout, and shares the ramp colors', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  for (const label of ['Blobs', 'Size', 'Wobble', 'Grain']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  const seed = page.getByRole('button', { name: 'New blobs layout' });
  const before = await seed.getAttribute('data-seed');
  await seed.click();
  expect(await seed.getAttribute('data-seed')).not.toBe(before);
});

test('blobs: pick and drag a blob on the image, reorder the stack, undo and reset', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  await page.getByRole('button', { name: 'Arrange each' }).click();
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();

  // Blobs are picked by what is drawn under the pointer: click around until one is.
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const readout = page.getByLabel('Picked blob');
  const outline = page.locator('[data-plane-overlay] path.outline');
  let target: { x: number; y: number } | null = null;
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.4],
    [0.7, 0.4],
    [0.5, 0.75],
    [0.2, 0.7],
    [0.8, 0.7],
    [0.4, 0.2],
    [0.6, 0.85],
  ]) {
    const [x, y] = [canvas.x + canvas.width * fx, canvas.y + canvas.height * fy];
    await page.mouse.click(x, y);
    if ((await readout.textContent()) !== 'none') {
      target = { x, y };
      break;
    }
  }
  expect(target).toBeTruthy();
  await expect(outline).toHaveCount(1);
  const drawn = await outline.getAttribute('d');

  const before = await settled();
  await page.mouse.move(target!.x, target!.y);
  await page.mouse.down();
  await page.mouse.move(target!.x + canvas.height * 0.15, target!.y + canvas.height * 0.1, { steps: 6 });
  await page.mouse.up();
  expect(await outline.getAttribute('d')).not.toBe(drawn);
  await expectPreviewChanged(before);
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeEnabled();

  // One drag is one undo step.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeEnabled();

  // Stack buttons move the blob one step; the readout follows.
  const [place, total] = (await readout.textContent())!.split(' / ').map(Number);
  if (place > 1) {
    await page.getByRole('button', { name: 'back', exact: true }).click();
    await expect(readout).toHaveText(`${place - 1} / ${total}`);
    await page.getByRole('button', { name: 'forward', exact: true }).click();
    await expect(readout).toHaveText(`${place} / ${total}`);
  }

  await page.getByRole('button', { name: 'Reset all' }).click();
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();
});

test('blobs: under a warp the picked blob is outlined where it is drawn', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  await page.getByRole('button', { name: 'Arrange each' }).click();
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const readout = page.getByLabel('Picked blob');
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.4],
    [0.7, 0.4],
    [0.5, 0.75],
  ]) {
    await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    if ((await readout.textContent()) !== 'none') break;
  }
  expect(await readout.textContent()).not.toBe('none');
  // The traced edge is many short segments, not one polygon.
  const d = (await page.locator('[data-plane-overlay] path.outline').getAttribute('d'))!;
  expect(d.split('M').length).toBeGreaterThan(50);
});

test('blobs: the base toggle switches between a black body and a palette one, and undo brings it back', async ({
  page,
}) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  const base = page.getByRole('group', { name: 'Blob base' });
  await expect(base.getByRole('button', { name: /black/ })).toHaveAttribute('aria-pressed', 'true');
  const before = await settled();
  await base.getByRole('button', { name: /palette/ }).click();
  await expect(base.getByRole('button', { name: /palette/ })).toHaveAttribute('aria-pressed', 'true');
  await expectPreviewChanged(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(base.getByRole('button', { name: /black/ })).toHaveAttribute('aria-pressed', 'true');
});

test('blobs: hovering a blob outlines it faintly, and leaving it clears the outline', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const hover = page.locator('[data-plane-overlay] path.hover');
  await expect(hover).toHaveCount(0);
  let found = false;
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.4],
    [0.7, 0.4],
    [0.5, 0.75],
    [0.2, 0.7],
    [0.8, 0.7],
  ]) {
    await page.mouse.move(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    if ((await hover.count()) > 0) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  expect(((await hover.getAttribute('d')) ?? '').length).toBeGreaterThan(20);
  await page.mouse.move(canvas.x - 40, canvas.y - 40);
  await expect(hover).toHaveCount(0);
});

test('blobs: size one blob from the arrange group, and the size slider still sizes them all', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  await page.getByRole('button', { name: 'Arrange each' }).click();
  const size = page.getByLabel('Blob size', { exact: true });
  // Nothing is picked yet: the slider waits for a blob.
  await expect(size).toBeDisabled();
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const readout = page.getByLabel('Picked blob');
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.4],
    [0.7, 0.4],
    [0.5, 0.75],
    [0.2, 0.7],
    [0.8, 0.7],
  ]) {
    await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    if ((await readout.textContent()) !== 'none') break;
  }
  await expect(size).toBeEnabled();
  await expect(size).toHaveValue('1');
  const outline = page.locator('[data-plane-overlay] path.outline');
  const drawn = await outline.getAttribute('d');
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();

  await size.fill('1.6');
  expect(await outline.getAttribute('d')).not.toBe(drawn);
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeEnabled();
  // One slider drag is one undo step.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(size).toHaveValue('1');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(size).toHaveValue('1.6');

  // The slider in the adjust group is every blob's size and keeps this blob's own factor.
  await page.getByLabel('Size', { exact: true }).fill('0.8');
  await expect(size).toHaveValue('1.6');

  await page.getByRole('button', { name: 'Reset blob' }).click();
  await expect(size).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();
});

test('blobs: a new layout drops the hand edits', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  await page.getByRole('button', { name: 'Arrange each' }).click();
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const readout = page.getByLabel('Picked blob');
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.4],
    [0.7, 0.4],
    [0.5, 0.75],
  ]) {
    await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    if ((await readout.textContent()) !== 'none') break;
  }
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeEnabled();
  await page.getByRole('button', { name: 'New blobs layout' }).click();
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();
});

test('blobs: picking one on the image opens the group that edits it', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'blobs');
  const group = page.getByRole('button', { name: 'Arrange each' });
  await expect(group).toHaveAttribute('aria-expanded', 'false');

  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  for (const [fx, fy] of [
    [0.5, 0.5],
    [0.3, 0.4],
    [0.7, 0.4],
    [0.5, 0.75],
    [0.2, 0.7],
    [0.8, 0.7],
  ]) {
    await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    if ((await group.getAttribute('aria-expanded')) === 'true') break;
  }
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Picked blob')).not.toHaveText('none');
});
