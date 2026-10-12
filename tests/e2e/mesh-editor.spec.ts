// Mesh points on the canvas: handles, drag, nudge, add, delete, visibility.
import { centerOf, choose, expect, openApp, previewProbe, test, toComposition } from './support/app';

test('mesh editor: drag, add, delete, switch pattern and hide handles', async ({ page }) => {
  await openApp(page);
  const { canvas, settled, expectPreviewChanged } = previewProbe(page);
  const overlay = page.getByTestId('mesh-overlay');
  const points = page.getByRole('button', { name: /^Point \d+$/ });
  const stored = async (i: number) => {
    const h = page.locator(`[data-point="${i}"]`);
    return [Number(await h.getAttribute('data-x')), Number(await h.getAttribute('data-y'))];
  };

  // Starts on the mesh with the default points.
  await expect(page.getByLabel('Gradient', { exact: true })).toHaveAttribute('data-value', 'mesh');
  await expect(points).toHaveCount(5);

  // The overlay covers the canvas exactly.
  const cb = (await canvas.boundingBox())!;
  const ob = (await overlay.boundingBox())!;
  expect(ob.x).toBeCloseTo(cb.x, 0);
  expect(ob.y).toBeCloseTo(cb.y, 0);
  expect(ob.width).toBeCloseTo(cb.width, 0);
  expect(ob.height).toBeCloseTo(cb.height, 0);

  // A handle sits where the composition convention puts its point.
  const [x0, y0] = await stored(1);
  const [hx, hy] = await centerOf(points.nth(1));
  const [ux, uy] = await toComposition(page, hx, hy);
  expect(ux).toBeCloseTo(x0, 2);
  expect(uy).toBeCloseTo(y0, 2);

  // Drag right and down: x grows, y shrinks (+y is up), the image changes.
  let before = await settled();
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + cb.height * 0.2, hy + cb.height * 0.1, { steps: 6 });
  await page.mouse.up();
  const [x1, y1] = await stored(1);
  expect(x1 - x0).toBeCloseTo(0.2, 1);
  expect(y1 - y0).toBeCloseTo(-0.1, 1);
  await expect(points.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expectPreviewChanged(before);

  // Arrow keys nudge the focused point (the screenshot hid the overlay, which dropped its focus).
  await points.nth(1).focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await stored(1))[1]).toBeCloseTo(y1 + 0.01, 3);

  // Double-clicking empty canvas adds a selected point there.
  before = await settled();
  const ax = cb.x + cb.width * 0.3;
  const ay = cb.y + cb.height * 0.75;
  await page.mouse.dblclick(ax, ay);
  await expect(points).toHaveCount(6);
  await expect(points.nth(5)).toHaveAttribute('aria-pressed', 'true');
  const [nx, ny] = await stored(5);
  const [wantX, wantY] = await toComposition(page, ax, ay);
  expect(nx).toBeCloseTo(wantX, 2);
  expect(ny).toBeCloseTo(wantY, 2);
  await expect(page.getByRole('button', { name: 'Edit color 6' })).toHaveAttribute('aria-pressed', 'true');

  // Editing the selected point's color changes the image.
  await page.getByLabel('Color 6', { exact: true }).fill('#00ff80');
  await expectPreviewChanged(before);

  // "+ add point" adds one inside the frame.
  await page.getByRole('button', { name: 'Add color' }).click();
  await expect(points).toHaveCount(7);
  await expect(points.nth(6)).not.toHaveClass(/outside/);
  await points.nth(6).focus();

  // Delete and Backspace remove the selected point.
  await page.keyboard.press('Delete');
  await expect(points).toHaveCount(6);
  await page.keyboard.press('Backspace');
  await expect(points).toHaveCount(5);
  const edited = await stored(1);

  // Switching to linear and back keeps the mesh edits.
  await choose(page.getByLabel('Gradient', { exact: true }), 'linear');
  await expect(points).toHaveCount(0);
  await expect(page.getByTestId('stop-strip')).toBeVisible();
  await choose(page.getByLabel('Gradient', { exact: true }), 'mesh');
  await expect(points).toHaveCount(5);
  expect(await stored(1)).toEqual(edited);

  // H hides the handles without changing the image; H again shows them.
  before = await settled();
  await page.keyboard.press('h');
  await expect(points).toHaveCount(0);
  expect((await settled()).equals(before)).toBe(true);
  await page.keyboard.press('h');
  await expect(points).toHaveCount(5);
  // The bottom bar toggle, without opening "+ more".
  await choose(page.getByLabel('Mesh points'), 'off');
  await expect(points).toHaveCount(0);
  await choose(page.getByLabel('Mesh points'), 'on');
  await expect(points).toHaveCount(5);
});
